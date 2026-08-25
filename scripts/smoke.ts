/**
 * smoke.ts — browser smoke test hry (Playwright)
 *
 * Otevře preview, odehraje kus hry klikáním (karty + primární tlačítka)
 * a průběžně ukládá screenshoty. Použití:
 *   npm run preview &   # port 8083
 *   npx tsx scripts/smoke.ts [url] [outDir]
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

// Pevný seed: smoke musí být reprodukovatelný. Se seedem 10 vede odhoz, který
// smoke volí (první a poslední karta v ruce), na varovný popup — bez toho by
// kontrola „popup přežije přepnutí jazyka" nemusela vůbec proběhnout.
const url = process.argv[2] ?? 'http://127.0.0.1:8083/?seed=10';
const outDir = process.argv[3] ?? 'docs';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(8000); // kliky mohou čekat na konec animací
page.on('dialog', (d) => void d.dismiss());
// CSP porušení hlásí prohlížeč jako console error — blokovaný worker by jinak
// jen tiše spadl do fallbacku na hlavním vlákně a test by prošel
const cspViolations: string[] = [];
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  console.log('CONSOLE ERROR:', text);
  if (/content security policy|refused to (load|execute|connect|create)/i.test(text)) {
    cspViolations.push(text);
  }
});
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

await page.goto(url);
await page.waitForTimeout(500);

// Rozdat
await page.click('#actions .action-btn.primary');
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, 'smoke-1-deal.png'), clip: await tableClip() });

/*
 * i3: přepnutí jazyka hned po rozdání (historie má délku 1) nesmí znovu
 * přehrát animaci rozdávání — výjimka pro nový zápas nesmí obejít ochranu
 * proti překreslení TÝMŽ stavem.
 */
// Počkej, až animace rozdávání SKUTEČNĚ skončí (porovnávat s „baseline" nejde:
// když animace ještě běží, je 1 před i po a kontrola by tiše nic nehlídala).
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });
await page.click('.langpill button[data-lang="de"]');
await page.waitForTimeout(200);
if ((await page.locator('#table.animating').count()) > 0) {
  console.error('CHYBA: přepnutí jazyka po rozdání znovu spustilo animaci rozdávání');
  await browser.close();
  process.exit(1);
}
await page.click('.langpill button[data-lang="cs"]');
await page.waitForTimeout(200);

// hraj: klikej na primární tlačítka a hratelné karty, dokud se hra hýbe
let shots = 2;
let reachedSettlement = false;
let confirmedWarnings = 0;
let marriageChoices = 0;
let popupSurvivedLang = false;
let fromPeopleCancelled = false;
for (let i = 0; i < 200; i += 1) {
  await page.waitForTimeout(350);

  const status = await page.textContent('#status');
  const phaseShot = async (name: string) => {
    if (shots <= 4) {
      await page.screenshot({ path: join(outDir, `smoke-${shots}-${name}.png`), clip: await tableClip() });
      shots += 1;
    }
  };

  // popup na stole je potřeba potvrdit, ne ho brát za konec hry.
  // U volby hlášky se střídá „ohlásit" a „bez hlášky", ať se odzkouší obě větve.
  if ((await page.locator('.felt-panel.warn').count()) > 0) {
    /*
     * Přepnutí jazyka překresluje stůl TÝMŽ stavem — otevřený popup i s
     * čekající volbou to nesmí zahodit (jinak hráč klikl a nic se nestalo).
     * Ověř to na prvním popupu, který v běhu nastane.
     */
    if (!popupSurvivedLang) {
      await page.click('.langpill button[data-lang="en"]');
      await page.waitForTimeout(250);
      const stillThere = await page.locator('.felt-panel.warn').count();
      if (stillThere === 0) {
        console.error('CHYBA: přepnutí jazyka zahodilo otevřený popup i s čekající volbou');
        await browser.close();
        process.exit(1);
      }
      await page.click('.langpill button[data-lang="cs"]');
      await page.waitForTimeout(250);
      if ((await page.locator('.felt-panel.warn').count()) === 0) {
        console.error('CHYBA: popup nepřežil přepnutí jazyka zpět');
        await browser.close();
        process.exit(1);
      }
      popupSurvivedLang = true;
    }
    const confirm = page.locator('[data-act="confirm"]');
    if ((await confirm.count()) > 0) {
      await confirm.click();
      confirmedWarnings += 1;
    } else {
      const decline = marriageChoices % 2 === 1;
      await page.locator(decline ? '[data-act="secondary"]' : '[data-act="primary"]').click();
      marriageChoices += 1;
    }
    continue;
  }

  // výsledková obrazovka (panel na stole) → konec smoke testu
  if ((await page.locator('.felt-panel:not(.warn)').count()) > 0) {
    await page.screenshot({ path: join(outDir, 'smoke-5-result.png'), clip: await tableClip() });
    reachedSettlement = true;
    console.log('OK: dohráno až k zúčtování');
    break;
  }

  // hratelná karta?
  const card = page.locator('#hand .card-btn:not(:disabled)').first();
  const actionBtn = page.locator('#actions .action-btn:not(:disabled)').first();

  if ((await card.count()) > 0) {
    const cnt = await page.locator('#hand .card-btn:not(:disabled)').count();
    // discard: vyber dvě, potvrď
    if ((await page.locator('#discard-confirm').count()) > 0) {
      await page.locator('#hand .card-btn:not(:disabled)').nth(0).click();
      await page.locator('#hand .card-btn:not(:disabled)').nth(cnt - 1).click();
      await phaseShot('discard');
      await page.click('#discard-confirm');
      continue;
    }
    await phaseShot('hand');
    await card.click();
    continue;
  }
  if ((await actionBtn.count()) > 0) {
    await actionBtn.click();
    continue;
  }
  void status;
}

console.log(
  `Screenshoty v ${outDir}/ (potvrzených varování: ${confirmedWarnings}, voleb hlášky: ${marriageChoices})`,
);

/*
 * i27: „nový zápas" musí zrušit i DELŠÍ přechody, ne jen rozdávání — odhalení
 * karty „z lidu" drží stůl 1,8 s.
 *
 * Rozlišující pozorování je RUKA: po rozdání nového zápasu je na tahu člověk
 * (volba trumfu), takže se stůl sám od sebe nemění. Když opuštěná animace
 * doběhne a dokreslí stav mrtvého zápasu, ruka se přepíše jeho kartami.
 */
const handFingerprint = async (): Promise<string> =>
  (await page.locator('#hand .card-btn img').evaluateAll(
    (imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src') ?? '').join('|'),
  ));

await page.click('#btn-new');
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });
const fromPeople = page.getByRole('button', { name: /lidu|people|Volk/i });
if ((await fromPeople.count()) > 0) {
  await fromPeople.first().click();
  await page.waitForTimeout(150); // odhalení „z lidu" právě běží (1,8 s)
  await page.click('#btn-new');
  await page.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
  const afterNewMatch = await handFingerprint();
  await page.waitForTimeout(2500); // delší než opuštěné odhalení + jeho dokreslení
  const later = await handFingerprint();
  const animating = await page.locator('#table.animating').count();
  if (afterNewMatch === '' || later !== afterNewMatch || animating > 0) {
    console.error(
      'CHYBA: opuštěná animace „z lidu" dokreslila mrtvý zápas přes nový\n' +
        `  ruka po rozdání: ${afterNewMatch.slice(0, 120)}\n` +
        `  ruka o 2,5 s později: ${later.slice(0, 120)} (animuje: ${animating})`,
    );
    await browser.close();
    process.exit(1);
  }
  fromPeopleCancelled = true;
}

/*
 * i16: dva rychlé kliky na „Nový zápas" nesmí zařadit nový zápas do fronty za
 * animacemi opuštěných — bez zrušení by se čekalo ~2,5 s místo ~1,3 s.
 */
await page.click('#btn-new');
await page.waitForTimeout(50);
await page.click('#btn-new');
await page.waitForTimeout(1800);
const dealtAfterRestarts = await page.locator('#hand .card-btn').count();
const stillAnimating = await page.locator('#table.animating').count();
if (dealtAfterRestarts === 0 || stillAnimating > 0) {
  console.error(
    `CHYBA: nový zápas uvízl za animacemi opuštěných (karet: ${dealtAfterRestarts}, animuje: ${stillAnimating})`,
  );
  await browser.close();
  process.exit(1);
}

if (!popupSurvivedLang) {
  console.error('CHYBA: v běhu nenastal žádný popup — kontrola přepnutí jazyka neproběhla');
  process.exit(1);
}

if (!fromPeopleCancelled) {
  console.error('CHYBA: nenašlo se tlačítko „z lidu" — kontrola zrušení odhalení neproběhla');
  process.exit(1);
}

if (cspViolations.length > 0) {
  console.error(`CHYBA: CSP zablokovala ${cspViolations.length} zdroj(ů):`);
  for (const v of cspViolations) console.error(`  ${v}`);
  process.exit(1);
}

await browser.close();

// vyčerpání smyčky NENÍ úspěch — jinak by test procházel, i když hra uvízne
if (!reachedSettlement) {
  console.error('CHYBA: hra nedošla k zúčtování (smyčka vyčerpána)');
  process.exit(1);
}

async function tableClip(): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#game-section').boundingBox();
  return box ?? { x: 0, y: 0, width: 1200, height: 900 };
}
