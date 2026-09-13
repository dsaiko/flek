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
import { TALK_TABLES } from '../src/lib/ui/tableTalk';

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

/*
 * Zvuky (§5.7): obalíme AudioContext ještě před načtením stránky a počítáme,
 * co se opravdu rozezvučelo. Bez toho by smoke „zvuky zapnuté" nijak neověřil
 * — zvuk v headless prohlížeči není slyšet a chybějící zvuk nic nezaloguje.
 */
/*
 * Pozor: init skript se předává jako ŘETĚZEC, ne jako funkce. Funkci by tsx
 * přeložil esbuildem a do jejího zdroje by propašoval pomocníka `__name`,
 * který v prohlížeči neexistuje (`__name is not defined`).
 */
await page.addInitScript({
  content: `(() => {
    const Real = window.AudioContext;
    if (!Real) return;
    const stats = { created: 0, resumed: 0, started: 0 };
    window.__audio = stats;
    const count = (node) => {
      const start = node.start.bind(node);
      node.start = (...a) => { stats.started += 1; return start(...a); };
      return node;
    };
    window.AudioContext = function () {
      const ctx = new Real();
      stats.created += 1;
      const resume = ctx.resume.bind(ctx);
      ctx.resume = () => { stats.resumed += 1; return resume(); };
      const buf = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = () => count(buf());
      const osc = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = () => count(osc());
      return ctx;
    };
  })()`,
});

await page.goto(url);
await page.waitForTimeout(500);

const audioBeforeGesture = await page.evaluate(
  () => (window as unknown as { __audio?: { started: number } }).__audio?.started ?? 0,
);
if (audioBeforeGesture !== 0) {
  console.error('CHYBA: zvuk se ozval ještě před gestem uživatele (autoplay policy)');
  await browser.close();
  process.exit(1);
}

/*
 * i13/i19: CSP doručené stránky. Smoke dosud sbíral jen PORUŠENÍ politiky,
 * takže odhalil politiku příliš striktní, ale nikdy příliš volnou — kdyby
 * post-build krok tiše neproběhl, šlo by do produkce `script-src` s
 * 'unsafe-inline' a `make all` by byl zelený.
 *
 * Kontrolujeme obojí: (a) co v doručené stránce stojí, (b) že to prohlížeč
 * opravdu vynucuje — injektovaný inline skript se NESMÍ provést.
 */
const shippedPolicy = await page.evaluate(() => {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  return meta?.getAttribute('content') ?? null;
});
if (!shippedPolicy) {
  console.error('CHYBA: doručená stránka nemá CSP meta');
  await browser.close();
  process.exit(1);
}
const shippedScriptSrc = shippedPolicy.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
if (shippedScriptSrc.includes("'unsafe-inline'") || !/'sha256-/.test(shippedScriptSrc)) {
  console.error(
    `CHYBA: doručený script-src není zpevněný (post-build krok neproběhl?): ${shippedScriptSrc}`,
  );
  await browser.close();
  process.exit(1);
}

const injected = await page.evaluate(() => {
  try {
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = true';
    document.head.appendChild(s);
  } catch {
    /* politika může hodit i výjimku */
  }
  return (window as unknown as { __pwned?: boolean }).__pwned === true;
});
if (injected) {
  console.error('CHYBA: CSP nezablokovala injektovaný inline skript — script-src je bezzubá');
  await browser.close();
  process.exit(1);
}
// blokovaná injektáž se zaloguje jako CSP porušení — to je tady ŽÁDOUCÍ
cspViolations.length = 0;

// Rozdat — tenhle klik je zároveň gesto, které odemyká zvuk
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
/** Texty bublin viděné během hry — hlášky (§5.8) musí být opravdu vidět. */
const bubblesSeen = new Set<string>();
/** Všechny folklórní hlášky — pro kontrolu, že dva soupeři neřeknou totéž. */
const ALL_TALK = new Set<string>(
  [TALK_TABLES.POLITE, TALK_TABLES.PUB].flatMap((table) =>
    Object.values(table as Record<string, Record<string, readonly string[]>>).flatMap((lines) =>
      (['cs', 'en', 'de'] as const).flatMap((lang) => [...(lines[lang] ?? [])]),
    ),
  ),
);
/** Hlášky „přemýšlím" ve všech jazycích a sadách — nesmí přežít soupeřův tah. */
const THINKING = new Set<string>(
  [TALK_TABLES.POLITE.thinking, TALK_TABLES.PUB.thinking].flatMap((t) =>
    t === undefined ? [] : (['cs', 'en', 'de'] as const).flatMap((lang) => [...(t[lang] ?? [])]),
  ),
);
let fromPeopleCancelled = false;
for (let i = 0; i < 400; i += 1) {
  await page.waitForTimeout(160);

  const visibleBubbles = (await page.locator('.bubble.show').allTextContents())
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  for (const text of visibleBubbles) bubblesSeen.add(text);

  /*
   * Dva soupeři nesmí mít na stole tutéž hlášku zároveň — „Dobrá, ale koukej
   * hrát" dvakrát vedle sebe vypadá jako porucha, ne jako hospoda.
   */
  const folkloreNow = visibleBubbles.filter((b) => ALL_TALK.has(b));
  if (new Set(folkloreNow).size !== folkloreNow.length) {
    console.error(`CHYBA: dva soupeři říkají totéž: ${folkloreNow.join(' | ')}`);
    await browser.close();
    process.exit(1);
  }

  /*
   * „Momentíček…" nesmí viset během animace dohraného štychu: ta začne, až
   * všichni tři zahráli, takže v tu chvíli nikdo nepřemýšlí. Přesně tohle je
   * ten případ, kdy hláška „přemýšlím" visí nad hráčem, který už zahrál.
   */
  if ((await page.locator('#table.animating').count()) > 0) {
    const stale = visibleBubbles.filter((b) => THINKING.has(b));
    if (stale.length > 0) {
      console.error(`CHYBA: „${stale[0]}" visí, i když už je štych dohraný`);
      await browser.close();
      process.exit(1);
    }
  }

  const status = await page.textContent('#status');
  const phaseShot = async (name: string) => {
    if (shots <= 4) {
      await page.screenshot({ path: join(outDir, `smoke-${shots}-${name}.png`), clip: await tableClip() });
      shots += 1;
    }
  };

  // POZOR na selektory: `.felt-panel` má i (skrytý) panel nastavení, a
  // `count()` nevidí viditelnost — proto se hledá jen v `#center-float`.
  // popup na stole je potřeba potvrdit, ne ho brát za konec hry.
  // U volby hlášky se střídá „ohlásit" a „bez hlášky", ať se odzkouší obě větve.
  if ((await page.locator('#center-float .felt-panel.warn').count()) > 0) {
    /*
     * Přepnutí jazyka překresluje stůl TÝMŽ stavem — otevřený popup i s
     * čekající volbou to nesmí zahodit (jinak hráč klikl a nic se nestalo).
     * Ověř to na prvním popupu, který v běhu nastane.
     */
    if (!popupSurvivedLang) {
      await page.click('.langpill button[data-lang="en"]');
      await page.waitForTimeout(250);
      const stillThere = await page.locator('#center-float .felt-panel.warn').count();
      if (stillThere === 0) {
        console.error('CHYBA: přepnutí jazyka zahodilo otevřený popup i s čekající volbou');
        await browser.close();
        process.exit(1);
      }
      await page.click('.langpill button[data-lang="cs"]');
      await page.waitForTimeout(250);
      if ((await page.locator('#center-float .felt-panel.warn').count()) === 0) {
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
  if ((await page.locator('#center-float .felt-panel:not(.warn)').count()) > 0) {
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

/*
 * „Nová hra" vede na ÚVODNÍ obrazovku s volbou varianty — teprve „Rozdat"
 * začne hru. Smoke to musí projít stejně jako člověk.
 */
const newGame = async (): Promise<void> => {
  await page.click('#btn-new');
  await page.waitForSelector('#intro-panel', { state: 'visible', timeout: 4000 });
  await page.click('#actions .action-btn.primary');
};

await newGame();
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });

/*
 * Nový zápas se musí ROZDÁVAT, ne jen objevit.
 *
 * Klíč testu: klikáme na „Nový zápas" teď, kdy je ruka PLNÁ — karty se
 * recyklují, takže si nesou třídu `reveal` z minulého rozdání a bez restartu
 * animace by se nová hra jen probliknula na stůl. (Po zúčtování je ruka
 * prázdná, elementy vzniknou čerstvé a animace by běžela i s chybou — proto
 * tahle kontrola nesmí být hned po dohrání.) Na přítomnost třídy se spolehnout
 * nelze, ptáme se prohlížeče, jestli animace opravdu BĚŽÍ.
 */
await newGame();
await page.waitForTimeout(250);
const dealAnimations = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#hand .card-btn'))
    .flatMap((el) => el.getAnimations().map((a) => a.playState))
    .filter((state) => state === 'running').length);
if (dealAnimations === 0) {
  console.error('CHYBA: nový zápas se nerozdává po kartách (animace se nerestartovala)');
  await browser.close();
  process.exit(1);
}
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });
const fromPeople = page.getByRole('button', { name: /lidu|people|Volk/i });
if ((await fromPeople.count()) > 0) {
  await fromPeople.first().click();
  await page.waitForTimeout(150); // odhalení „z lidu" právě běží (1,8 s)
  await newGame();
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
await newGame();
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

// zvuky: po gestu se musí kontext vytvořit, odemknout a něco zahrát
const audio = await page.evaluate(
  () => (window as unknown as { __audio?: { created: number; resumed: number; started: number } }).__audio
    ?? { created: 0, resumed: 0, started: 0 },
);
/*
 * `resumed` schválně nekontrolujeme: kontext vytvořený PŘI gestu startuje
 * rovnou ve stavu 'running', takže `resume()` se nikdy nezavolá. Že se před
 * gestem nesmí ozvat nic, hlídá jednotkový test s podvrženým AudioContextem
 * (stav 'suspended'); tady jde o to, že se zvuky v reálné hře opravdu ozvou.
 */
if (audio.created === 0 || audio.started === 0) {
  console.error(
    `CHYBA: zvuky se nerozezvučely (kontextů: ${audio.created}, zvuků: ${audio.started})`,
  );
  await browser.close();
  process.exit(1);
}
console.log(`Zvuky: ${audio.started} přehraných v ${audio.created} kontextu`);

// hlášky u stolu: aspoň jedna folklórní (ne jen funkční popisek) musí padnout
const folklore = new Set<string>();
for (const table of [TALK_TABLES.POLITE, TALK_TABLES.PUB]) {
  for (const lines of Object.values(table as Record<string, Record<string, readonly string[]>>)) {
    for (const lang of ['cs', 'en', 'de'] as const) {
      for (const line of lines[lang] ?? []) folklore.add(line);
    }
  }
}
const heard = [...bubblesSeen].filter((b) => folklore.has(b));
if (heard.length === 0) {
  console.error(
    `CHYBA: během hry nepadla ani jedna hláška u stolu (bubliny: ${[...bubblesSeen].join(' | ')})`,
  );
  await browser.close();
  process.exit(1);
}
console.log(`Hlášky u stolu: ${heard.length} různých (${heard.slice(0, 3).join(' · ')}…)`);

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
