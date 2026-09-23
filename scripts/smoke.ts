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
import { chromium, webkit } from 'playwright';
import { apply, initialState } from '../src/lib/rules/engine';
import { legalActions } from '../src/lib/rules/legal';
import type { PlayerAction as PlayerActionS } from '../src/lib/rules/types';
import { defaultConfig } from '../src/lib/rules/sazby';
import { view } from '../src/lib/rules/view';
import { claimPlan } from '../src/lib/rules/claim';
import { think } from '../src/lib/ai/think';
import { VERSION as SAVE_VERSION } from '../src/lib/match/persist';
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
/*
 * Výjimky uvnitř aplikace. Řetěz překreslování je chytá vlastním `catch`
 * a jen je vypíše, takže se do `pageerror` nedostanou — francouzské
 * vyúčtování takhle padalo a smoke prošel. Cokoli, co vypadá jako výjimka,
 * je proto chyba testu; CSP hlášky jsou jediná povolená výjimka (test si
 * injektáž skriptu vyvolává sám).
 */
const appErrors: string[] = [];
const isCspNoise = (t: string): boolean =>
  /content security policy|refused to (load|execute|connect|create)/i.test(t);
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  console.log('CONSOLE ERROR:', text);
  if (isCspNoise(text)) {
    cspViolations.push(text);
    return;
  }
  if (/\b(Error|TypeError|RangeError|ReferenceError|SyntaxError)\b|is not a function|undefined is not|cannot read/i.test(text)) {
    appErrors.push(text);
  }
});
/*
 * Výjimka na stránce je CHYBA testu, ne poznámka do logu. Francouzské
 * vyúčtování padalo na `compLabel` a smoke to jen vypsal a prošel.
 */
const pageErrors: string[] = [];
page.on('pageerror', (e) => {
  console.log('PAGE ERROR:', e.message);
  pageErrors.push(e.message);
});

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

/**
 * Jazyk je od té doby, co se vlajky schovaly do dropdownu, dvoukrokový:
 * otevřít trigger a teprve pak kliknout na vlajku. Playwright na skrytý
 * prvek nekliká, takže tenhle helper zároveň hlídá, že dropdown funguje.
 */
async function setLang(code: string): Promise<void> {
  await page.click('#btn-lang');
  await page.waitForSelector('#lang-list:not([hidden])', { timeout: 2000 });
  await page.click(`.langpill button[data-lang="${code}"]`);
  await page.waitForTimeout(120);
  if ((await page.locator('#lang-list:not([hidden])').count()) > 0) {
    console.error('CHYBA: výběr vlajky nezavřel dropdown jazyků');
    await browser.close();
    process.exit(1);
  }
}

/*
 * Nastavení: Esc ho musí zavřít. Panel je modální (překrývá stůl), takže
 * kdyby Esc nefungoval a křížek se někdy ztratil, hráč uvízne.
 */
await page.click('#btn-settings');
await page.waitForSelector('#settings-float:not([hidden])', { timeout: 2000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
if ((await page.locator('#settings-float:not([hidden])').count()) > 0) {
  console.error('CHYBA: Esc nezavřel panel nastavení');
  await browser.close();
  process.exit(1);
}

// Rozdat — tenhle klik je zároveň gesto, které odemyká zvuk
await page.click('#actions .action-btn.primary');
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, 'smoke-1-deal.png'), clip: await tableClip() });

/*
 * IQ za běhu: přepnutí obtížnosti v nastavení nesmí shodit rozehraný zápas.
 * Rozlišující pozorování je RUKA a stav stolu — dřív UI založilo nový zápas
 * a spadlo na úvodní obrazovku, takže hráč o rozehranou hru přišel.
 */
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });
{
  const handBefore = await page.locator('#hand .card-btn img').evaluateAll(
    (els) => els.map((e) => (e as HTMLImageElement).src).join('|'),
  );
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-float:not([hidden])', { timeout: 2000 });
  await page.selectOption('#set-difficulty', 'hard');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if ((await page.locator('#table.idle').count()) > 0) {
    console.error('CHYBA: přepnutí IQ shodilo rozehranou hru na úvodní obrazovku');
    await browser.close();
    process.exit(1);
  }
  const handAfter = await page.locator('#hand .card-btn img').evaluateAll(
    (els) => els.map((e) => (e as HTMLImageElement).src).join('|'),
  );
  if (handAfter !== handBefore || handAfter.length === 0) {
    console.error('CHYBA: přepnutí IQ změnilo ruku hráče (zápas se přerozdal)');
    await browser.close();
    process.exit(1);
  }
}

/*
 * „Vynulovat konto" zakládá nový zápas, takže by rozehranou hru zahodilo bez
 * zúčtování. Musí se proto nejdřív zeptat — a dokud hráč nepotvrdí, nesmí se
 * na stole nic změnit.
 */
{
  const handBefore = await page.locator('#hand .card-btn img').evaluateAll(
    (els) => els.map((e) => (e as HTMLImageElement).src).join('|'),
  );
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-float:not([hidden])', { timeout: 2000 });
  await page.click('#settings-reset');
  const warn = page.locator('#center-float .felt-panel.warn');
  try {
    await warn.waitFor({ timeout: 2000 });
  } catch {
    console.error('CHYBA: „Vynulovat konto" zahodilo rozehranou hru bez dotazu');
    await browser.close();
    process.exit(1);
  }
  await page.click('[data-act="cancel"]');
  await page.waitForTimeout(200);
  const handAfter = await page.locator('#hand .card-btn img').evaluateAll(
    (els) => els.map((e) => (e as HTMLImageElement).src).join('|'),
  );
  if (handAfter !== handBefore || handAfter.length === 0) {
    console.error('CHYBA: zamítnuté vynulování konta přesto změnilo rozehranou hru');
    await browser.close();
    process.exit(1);
  }
}

/*
 * i3: přepnutí jazyka hned po rozdání (historie má délku 1) nesmí znovu
 * přehrát animaci rozdávání — výjimka pro nový zápas nesmí obejít ochranu
 * proti překreslení TÝMŽ stavem.
 */
// Počkej, až animace rozdávání SKUTEČNĚ skončí (porovnávat s „baseline" nejde:
// když animace ještě běží, je 1 před i po a kontrola by tiše nic nehlídala).
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 5000 });
await setLang('fr');
await setLang('de');
if ((await page.locator('#table.animating').count()) > 0) {
  console.error('CHYBA: přepnutí jazyka po rozdání znovu spustilo animaci rozdávání');
  await browser.close();
  process.exit(1);
}
await setLang('cs');

// hraj: klikej na primární tlačítka a hratelné karty, dokud se hra hýbe
let shots = 2;
let reachedSettlement = false;
let confirmedWarnings = 0;
let marriageChoices = 0;
let popupSurvivedLang = false;
let trickShot = false;
let trumpAsideSeen = false;
let trumpBackInHand = false;
let asideCardAlt: string | null = null;
let concedeSurvivedAi = false;
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


  /*
   * Zvolený trumf leží stranou na stole (ČSM Čl. VII/1) a ve VĚJÍŘI v tu dobu
   * není — přesně proto, že hráč při odhazování do talonu kouká do karet
   * a text nad stolem nevnímá. Na začátku sehrávky si ho aktér bere zpět.
   *
   * Kontrola sedí na odhazování: smlouva ještě není, badge aktéra je prázdný,
   * trumf hlásí jen pilulka. Ruka má v tu chvíli 12 karet, takže vějíř musí
   * ukazovat 11 — a ta dvanáctá musí ležet stranou.
   */
  if ((await page.locator('#discard-confirm').count()) > 0 && /Trumfy:/.test(status ?? '')) {
    const asideImg = page.locator('#trump-aside:not([hidden]) img');
    if ((await asideImg.count()) === 0) {
      console.error('CHYBA: trumf je zvolený, ale neleží stranou na stole');
      await browser.close();
      process.exit(1);
    }
    asideCardAlt = await asideImg.getAttribute('alt');
    if (asideCardAlt === null || asideCardAlt === '') {
      console.error('CHYBA: vlastní odložený trumf leží lícem dolů (má ležet lícem nahoru)');
      await browser.close();
      process.exit(1);
    }
    const handAlts = await page.locator('#hand .card-btn img').evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).alt),
    );
    if (handAlts.length !== 11) {
      console.error(`CHYBA: při odhazování má vějíř ukazovat 11 karet (dvanáctá leží stranou), ukazuje ${handAlts.length}`);
      await browser.close();
      process.exit(1);
    }
    if (handAlts.includes(asideCardAlt)) {
      console.error(`CHYBA: „${asideCardAlt}" leží stranou a zároveň je ve vějíři`);
      await browser.close();
      process.exit(1);
    }
    trumpAsideSeen = true;
  }

  /*
   * Sehrávka: stranou už neleží nic a karta je zpátky v ruce. Rozlišující
   * okamžik je první překreslení, kdy je box skrytý a ruka má plných 10 karet.
   */
  if (asideCardAlt !== null && !trumpBackInHand
      && (await page.locator('#trump-aside:not([hidden])').count()) === 0) {
    const handAlts = await page.locator('#hand .card-btn img').evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).alt),
    );
    if (handAlts.length === 10) {
      if (!handAlts.includes(asideCardAlt)) {
        console.error(`CHYBA: „${asideCardAlt}" se po odložení nevrátil do ruky — karta se ztratila`);
        await browser.close();
        process.exit(1);
      }
      trumpBackInHand = true;
    }
  }
  /*
   * Rozehraný štych je jediný okamžik, kdy se odhozené karty a ruka perou
   * o místo — bez snímku se posun vrstev nedá posoudit jinak než ručně.
   */
  if (!trickShot && (await page.locator('#trick .played').count()) >= 2) {
    await page.screenshot({ path: join(outDir, 'smoke-trick.png'), clip: await tableClip() });
    trickShot = true;
  }
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
      await setLang('en');
      const stillThere = await page.locator('#center-float .felt-panel.warn').count();
      if (stillThere === 0) {
        console.error('CHYBA: přepnutí jazyka zahodilo otevřený popup i s čekající volbou');
        await browser.close();
        process.exit(1);
      }
      await setLang('cs');
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
    /*
     * Vyúčtování ve VŠECH jazycích: popisky komponent se skládají per jazyk
     * a chybějící jazyk shodí celý panel (a s ním hru). Kontroluje se, že
     * panel pořád existuje a má text — a `pageErrors` na konci hlídá výjimku.
     */
    for (const lang of ['en', 'de', 'fr', 'cs'] as const) {
      await setLang(lang);
      const panel = page.locator('#center-float .felt-panel:not(.warn)');
      if ((await panel.count()) === 0) {
        console.error(`CHYBA: vyúčtování zmizelo po přepnutí na ${lang}`);
        await browser.close();
        process.exit(1);
      }
      const text = ((await panel.first().innerText()) ?? '').trim();
      // nadpis v daném jazyce: kdyby render uprostřed spadl, zůstane tu
      // text předchozího jazyka a panel by „existoval" dál
      const heading = { cs: 'Vyúčtování', en: 'Settlement', de: 'Abrechnung', fr: 'Décompte' }[lang];
      if (!text.includes(heading)) {
        console.error(`CHYBA: vyúčtování se nepřekreslilo do jazyka ${lang} (chybí „${heading}")`);
        await browser.close();
        process.exit(1);
      }
    }
    // po zúčtování už se nehraje — trumf stranou nesmí zůstat viset přes výsledek
    if ((await page.locator('#trump-aside:not([hidden])').count()) > 0) {
      console.error('CHYBA: odložený trumf zůstal na stole i po zúčtování');
      await browser.close();
      process.exit(1);
    }
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

  /*
   * Sem se dostaneme jen když člověk nemá co dělat = táhne AI. Přesně tady
   * dřív mizel dotaz „opravdu ukončit hru?": překreslení jiným stavem ho
   * zahodilo a hráč klikl do prázdna. Dotaz se otevře a musí přežít tah AI.
   */
  if (!concedeSurvivedAi && (await page.locator('#table.idle').count()) === 0) {
    const before = await page.locator('#status').innerText();
    await page.click('#btn-new');
    await page.waitForSelector('#center-float .felt-panel.warn', { timeout: 2000 });
    let moved = false;
    for (let k = 0; k < 20 && !moved; k += 1) {
      await page.waitForTimeout(200);
      moved = (await page.locator('#status').innerText()) !== before;
    }
    if (moved) {
      if ((await page.locator('#center-float .felt-panel.warn').count()) === 0) {
        console.error('CHYBA: dotaz na ukončení hry zmizel, když mezitím táhla AI');
        await browser.close();
        process.exit(1);
      }
      concedeSurvivedAi = true;
    }
    const cancel = page.locator('[data-act="cancel"]');
    if ((await cancel.count()) > 0) await cancel.click();
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
  /*
   * Rozehranou hru tlačítko nejdřív UKONČÍ (potvrzení + zúčtování jako prohra)
   * a teprve pak se z něj stane „Nová hra".
   */
  if ((await page.locator('#center-float .felt-panel.warn').count()) > 0) {
    await page.click('[data-act="confirm"]');
    await page.waitForTimeout(500);
    await page.click('#btn-new');
  }
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
/*
 * „Z lidu" nabízí jen forhont, a rozdávající se od té doby, co „Nová hra"
 * pokračuje ve stejném zápase, POSOUVÁ — člověk je tedy forhont až každé
 * třetí rozdání. Zkusíme proto až tři rozdání, než kontrolu vzdáme.
 */
const fromPeople = page.getByRole('button', { name: /lidu|people|Volk/i });
for (let attempt = 0; attempt < 3 && (await fromPeople.count()) === 0; attempt += 1) {
  await newGame();
  await page.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
}
if ((await fromPeople.count()) > 0) {
  await fromPeople.first().click();
  await page.waitForTimeout(150); // odhalení „z lidu" právě běží (1,8 s)

  /*
   * Otočená karta nesmí ležet přes akční lištu. Kontrola je na GEOMETRII, ne
   * na CSS: karta i tlačítka se škálují z výšky sukna, takže „o kousek výš"
   * je při jiném poměru okna zase málo. Tohle nahlásil uživatel.
   */
  {
    const flip = await page.locator('#trick .played').first().boundingBox();
    if (flip === null) {
      console.error('CHYBA: „z lidu" neukázalo otočenou kartu');
      await browser.close();
      process.exit(1);
    }
    await page.screenshot({ path: join(outDir, 'smoke-frompeople.png'), clip: await tableClip() });
    for (const btn of await page.locator('#actions .action-btn').all()) {
      const b = await btn.boundingBox();
      if (b === null) continue;
      const overlapX = Math.min(flip.x + flip.width, b.x + b.width) - Math.max(flip.x, b.x);
      const overlapY = Math.min(flip.y + flip.height, b.y + b.height) - Math.max(flip.y, b.y);
      if (overlapX > 0 && overlapY > 0) {
        console.error(
          `CHYBA: otočená karta „z lidu" překrývá tlačítko „${(await btn.innerText()).trim()}"` +
            ` (${Math.round(overlapX)}×${Math.round(overlapY)} px)`,
        );
        await browser.close();
        process.exit(1);
      }
    }
  }
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
 * i16 (přepsáno). Původní podoba — dva rychlé kliky na „Nový zápas" — už nic
 * neověřovala: od zavedení „Ukončit hru" první klik jen otevře dotaz, jehož
 * tlačítka jsou během animace nekliknutelná
 * (`#table.animating .action-btn { pointer-events: none }`). Dvě rozdání se
 * přes UI nepřekryjí a kontrola procházela vždycky.
 *
 * Co zůstává ověřitelné: klik na „Nová hra" UPROSTŘED rozdávání nesmí řetěz
 * překreslování zaseknout — dotaz se objeví, po doběhnutí animace zafunguje
 * a nové rozdání doběhne v čase jednoho rozdávání, ne dvou. Samotné rušení
 * opuštěných animací hlídá kontrola „z lidu" výš, kde odhalení `animating`
 * nenastavuje a překryv je skutečný.
 */
await newGame();
await page.waitForTimeout(120);
if ((await page.locator('#table.animating').count()) === 0) {
  console.error('CHYBA: rozdávání neběželo — kontrola restartu za běhu animace by nic neověřila');
  await browser.close();
  process.exit(1);
}
await page.click('#btn-new'); // za běhu animace: dotaz se otevře, tlačítka zatím nereagují
await page.waitForSelector('#center-float .felt-panel.warn', { timeout: 3000 });
const restartStart = Date.now();
await page.click('[data-act="confirm"]'); // Playwright počká, až tlačítko ožije
// potvrzení hru vyúčtuje jako prohru → na úvodní obrazovku vede až další klik
await page.waitForSelector('#center-float .felt-panel:not(.warn)', { timeout: 4000 });
await page.click('#btn-new');
await page.waitForSelector('#intro-panel', { state: 'visible', timeout: 4000 });

/*
 * Úvodní obrazovka je vstup do KAŽDÉ hry, ne začátek nového zápasu: konto
 * i řádek „Minule" musí přechod přežít. Kdyby „Nová hra" zakládala nový
 * zápas, banka by nikdy nevznikla a shrnutí by bylo vždycky prázdné.
 */
{
  const last = ((await page.locator('#intro-last').innerText()) ?? '').trim();
  if (last.length === 0) {
    console.error('CHYBA: úvodní obrazovka zapomněla minulou hru (řádek „Minule" je prázdný)');
    await browser.close();
    process.exit(1);
  }
  // právě jsme hru vzdali, takže konto člověka nesmí být nulové
  const money = ((await page.locator('#seat-me .seat-meta, .me-meta').first().innerText()) ?? '').trim();
  if (/^0[,.]00/.test(money) || !/[1-9]/.test(money)) {
    console.error(`CHYBA: „Nová hra" vynulovala konto (u hráče stojí „${money}")`);
    await browser.close();
    process.exit(1);
  }

  /*
   * A totéž musí přežít RELOAD. Uložený idle stav nese jen konto a odehrané
   * hry, takže se přebírá bez ptaní — kdyby ho obnova odmítala (jako každý
   * jiný idle sav), byl by zápis kvůli bance mrtvý kód a refresh na úvodní
   * obrazovce by konto smazal.
   */
  await page.reload();
  await page.waitForSelector('#intro-panel', { state: 'visible', timeout: 5000 });
  const moneyAfterReload = ((await page.locator('#seat-me .seat-meta, .me-meta').first().innerText()) ?? '').trim();
  if (/^0[,.]00/.test(moneyAfterReload) || !/[1-9]/.test(moneyAfterReload)) {
    console.error(`CHYBA: reload úvodní obrazovky smazal konto (u hráče stojí „${moneyAfterReload}")`);
    await browser.close();
    process.exit(1);
  }
  const lastAfterReload = ((await page.locator('#intro-last').innerText()) ?? '').trim();
  if (lastAfterReload.length === 0) {
    console.error('CHYBA: reload smazal shrnutí minulé hry');
    await browser.close();
    process.exit(1);
  }
}

/*
 * Přepínání varianty na úvodní obrazovce zakládá idle zápas znovu — a nesmí
 * u toho POSUNOUT rozdávajícího. Ten se posouvá po odehrané hře, ne po
 * každém kliknutí do výběru; jinak by pár přepnutí přeskočilo celé kolo.
 */
{
  const dealerRow = async (): Promise<string> =>
    (await page.locator('.seat-meta, .me-meta').allTextContents()).join('|');
  const before = await dealerRow();
  const cards = page.locator('.variant-card');
  if ((await cards.count()) < 2) {
    console.error('CHYBA: úvodní obrazovka nenabízí obě varianty');
    await browser.close();
    process.exit(1);
  }
  await cards.nth(1).click();
  await page.waitForTimeout(250);
  await cards.nth(0).click();
  await page.waitForTimeout(250);
  const after = await dealerRow();
  if (after !== before) {
    console.error(`CHYBA: přepnutí varianty posunulo rozdávajícího\n  před: ${before}\n  po:   ${after}`);
    await browser.close();
    process.exit(1);
  }
}


await page.click('#actions .action-btn.primary');
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
const restartMs = Date.now() - restartStart;
if ((await page.locator('#hand .card-btn').count()) === 0) {
  console.error('CHYBA: po restartu uprostřed rozdávání se nerozdalo');
  await browser.close();
  process.exit(1);
}
/*
 * Jedno rozdávání ≈ 1,3 s; kdyby nové čekalo za opuštěným, přibyly by ~2,5 s.
 * Kontrola hlídá ZADRHNUTÝ řetěz, ne absolutní výkon — na sdíleném CI runneru
 * je stroj pomalejší, a tak jde mez zvednout přes `SMOKE_RESTART_MS`. I volná
 * mez zadrhnutí pozná, protože to přidá celé další rozdávání.
 */
const restartLimitMs = Number(process.env.SMOKE_RESTART_MS ?? 4500);
if (restartMs > restartLimitMs) {
  console.error(`CHYBA: restart uprostřed rozdávání trval ${restartMs} ms (mez ${restartLimitMs}) — řetěz se zadrhl`);
  await browser.close();
  process.exit(1);
}
console.log(`Restart uprostřed rozdávání: ${restartMs} ms`);

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

if (!concedeSurvivedAi) {
  console.error('CHYBA: nepodařilo se ověřit, že dotaz na ukončení hry přežije tah AI');
  process.exit(1);
}

if (!fromPeopleCancelled) {
  console.error('CHYBA: nenašlo se tlačítko „z lidu" — kontrola zrušení odhalení neproběhla');
  process.exit(1);
}

/*
 * Nápověda: otazník vlevo v liště ji otevře, Esc zavře. Jazykové bloky leží
 * v DOM všechny čtyři vedle sebe, takže rozbité přepínání by je ukázalo pod
 * sebou — kontroluje se proto, že vidět je právě jeden a ten správný.
 */
{
  await page.click('#btn-help');
  await page.waitForSelector('#help-float:not([hidden])', { timeout: 3000 });
  const visibleBlocks = await page.locator('#help-body > div:visible').count();
  // `innerText` vrací text tak, jak se VYKRESLÍ — nadpisy mají text-transform,
  // takže se porovnává bez ohledu na velikost písmen
  const helpCs = (await page.locator('#help-body').innerText()).trim().toLowerCase();
  await setLang('en');
  const helpEn = (await page.locator('#help-body').innerText()).trim().toLowerCase();
  await setLang('cs');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = (await page.locator('#help-float:not([hidden])').count()) === 0;
  const problems: string[] = [];
  if (visibleBlocks !== 1) problems.push(`viditelných jazykových bloků ${visibleBlocks}, má být 1`);
  for (const must of ['jak se hraje', 'volený', 'licitovaný', 'pivoňka', 'saikovi', 'kratochvíl']) {
    if (!helpCs.includes(must)) problems.push(`v české nápovědě chybí „${must}"`);
  }
  if (!helpEn.includes('how it is played')) problems.push('anglická nápověda se nepřepnula');
  if (helpEn.includes('jak se hraje')) problems.push('v anglické nápovědě zůstal český text');
  if (!closed) problems.push('Esc nápovědu nezavřel');

  /*
   * Nápověda a nastavení se vylučují V OBOU SMĚRECH. Nápověda leží uvnitř
   * #table, kdežto ozubené kolo je jeho soused — otevřená nápověda ho tedy
   * nepřekrývá a kliknout na něj jde. Oba panely mají stejný z-index, takže
   * kdyby se nezavřel ten druhý, prosvítaly by přes sebe a nešly by číst.
   */
  await page.click('#btn-help');
  await page.waitForSelector('#help-float:not([hidden])', { timeout: 3000 });
  await page.click('#btn-settings');
  await page.waitForTimeout(150);
  if ((await page.locator('#settings-float:not([hidden])').count()) !== 1) {
    problems.push('ozubené kolo přes otevřenou nápovědu nastavení neotevřelo');
  }
  if ((await page.locator('#help-float:not([hidden])').count()) !== 0) {
    problems.push('otevřené nastavení nezavřelo nápovědu (dva panely přes sebe)');
  }
  // a opačně: otazník přes otevřené nastavení
  await page.click('#btn-help');
  await page.waitForTimeout(150);
  if ((await page.locator('#help-float:not([hidden])').count()) !== 1) {
    problems.push('otazník přes otevřené nastavení nápovědu neotevřel');
  }
  if ((await page.locator('#settings-float:not([hidden])').count()) !== 0) {
    problems.push('otevřená nápověda nezavřela nastavení');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  if (problems.length > 0) {
    console.error(`CHYBA: nápověda — ${problems.join('; ')}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`Nápověda: otevře se, přepíná jazyk (${helpCs.length} znaků česky), Esc ji zavře a s nastavením se vylučují oboustranně`);
}

/*
 * Stůl se musí vejít do okna BEZ scrollování. Rám má pevný poměr 1400/900, tak
 * že v širokém okně roste i do výšky — 1440×900 (MacBook s prohlížečem přes
 * celou obrazovku) je přesně ten případ, kdy spodek stolu utekl pod okraj.
 */
{
  const fit = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fit.goto(url);
  await fit.waitForTimeout(600);
  const page1440 = await fit.evaluate(() => ({
    content: document.documentElement.scrollHeight,
    window: window.innerHeight,
  }));
  await fit.close();
  if (page1440.content > page1440.window + 1) {
    console.error(
      `CHYBA: v okně 1440×900 stránka scrolluje (obsah ${page1440.content} px, okno ${page1440.window} px) — stůl se nevejde`,
    );
    await browser.close();
    process.exit(1);
  }
  console.log(`Stůl se vejde do 1440×900 bez scrollování (obsah ${page1440.content} px)`);
}

const thrown = [...pageErrors, ...appErrors];
if (thrown.length > 0) {
  console.error(`CHYBA: stránka vyhodila ${thrown.length} výjimek:`);
  for (const e of thrown) console.error(`  ${e.split('\n')[0]}`);
  process.exit(1);
}

if (cspViolations.length > 0) {
  console.error(`CHYBA: CSP zablokovala ${cspViolations.length} zdroj(ů):`);
  for (const v of cspViolations) console.error(`  ${v}`);
  process.exit(1);
}

/*
 * Odložený trumf u SOUPEŘE: ve stavu leží pořád v jeho ruce (`handCounts` ho
 * počítá), takže kdo kreslí cizí vějíř, musí ho odečíst — jinak má forhont
 * o rub víc a při sehrávce mu jedna karta nevysvětlitelně zmizí. Čistou funkci
 * `opponentBacks()` hlídá verify; tohle je o tom, že ji `renderOpponents` taky
 * VOLÁ.
 *
 * Stav se staví deterministicky a podává stránce savem — čekat, až na tenhle
 * případ dojde herní smyčka, nejde: člověk je v pozorovaném rozdání forhont,
 * takže odložená karta patří jemu. (Ověřeno: s kontrolou uvnitř smyčky nenastal
 * ten případ ani jednou, a mrtvá kontrola je horší než žádná.)
 */
{
  const seeded = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seeded.on('dialog', (d) => void d.accept());
  await seeded.goto(url);
  await seeded.evaluate((payload) => localStorage.setItem('flek.match.v1', payload), asideSave());
  await seeded.reload();
  /*
   * Čekat na PODMÍNKU, ne na hodiny: mezi `reload()` a čtením musí stihnout
   * naběhnout bundle, worker, potvrzovací dialog o obnovení a překreslení.
   * Na vytíženém runneru (viz SMOKE_RESTART_MS) by pevná prodleva vypršela
   * dřív a test by spadl na „počítá se dvakrát", i když se jen nestihl obnovit.
   */
  try {
    await seeded.waitForSelector('#trump-aside:not([hidden]) img', { timeout: 15000 });
    await seeded.waitForFunction(
      () => (document.querySelectorAll('#seat-left .backs img').length > 0),
      undefined, { timeout: 15000 },
    );
  } catch {
    console.error('CHYBA: stav se neobnovil — odložený trumf se u soupeře vůbec neobjevil');
    await seeded.close();
    await browser.close();
    process.exit(1);
  }
  await seeded.waitForTimeout(150); // dokreslení zbylých rubů
  const backs = [
    await seeded.locator('#seat-left .backs img').count(),
    await seeded.locator('#seat-right .backs img').count(),
  ];
  const asideShown = await seeded.locator('#trump-aside:not([hidden])').count();
  await seeded.close();
  // forhont je soupeř vlevo (sedadlo 1): 9 rubů + karta stranou = 10 v ruce
  if (asideShown !== 1 || backs[0] !== 9 || backs[1] !== 10) {
    console.error(
      `CHYBA: soupeřův odložený trumf se počítá dvakrát — ruby ${backs.join(' a ')}, karta stranou ${asideShown}; čekáno 9 a 10 s kartou stranou`,
    );
    await browser.close();
    process.exit(1);
  }
  console.log(`Soupeřův odložený trumf: ${backs[0]} rubů + karta stranou (ruka má ${backs[1]})`);
}

/*
 * Akční lišta nesmí ležet přes jmenovku hráče ani přes jeho hromádku.
 *
 * Tohle nahlásil uživatel snímkem z licitovaného: devět nabídek se zalomilo do
 * dvou řad a spodní řada skončila na „Ty". Kontrola je proto na GEOMETRII, ne
 * na tom, že lišta má nějaký `margin` — zalomení závisí na ŠÍŘCE POPISKŮ, a ta
 * se s jazykem mění (německy je „Hundert und Sieben" o půl řádku delší než
 * „sto a sedma"). Jede se přes všechny jazyky, co sada popisků nabízí.
 *
 * Stav se podává savem: devítinabídka vyžaduje konkrétní ruku (obě sedmy a sto
 * v barvě), na kterou by se herní smyčka načekala.
 */
{
  const payload = auctionSave();
  const worst: string[] = [];
  for (const lang of ['cs', 'en', 'de', 'fr']) {
    const bid = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    bid.on('dialog', (d) => void d.accept());
    const langUrl = new URL(url);
    langUrl.searchParams.set('lang', lang);
    await bid.goto(langUrl.toString());
    /*
     * Se savem se seedují i NASTAVENÍ: aplikace si variantu bere z nich, ne ze
     * savu, a s výchozím „voleným" by se licitovaný sav zahodil a nabídka by
     * se vůbec neobjevila (na tohle už jsem jednou naletěl).
     */
    await bid.evaluate(([match, settings]) => {
      localStorage.setItem('flek.match.v1', match);
      localStorage.setItem('flek.settings.v1', settings);
    }, [payload, JSON.stringify({ variant: 'licitovany', sounds: false })]);
    await bid.reload();
    try {
      // `button`, ne `.action-btn`: žebřík licitace (§40) skládá nabídku
      // z dlaždic `.bid-chip`, jen „Dobrá (pas)" zůstala obyčejným tlačítkem
      await bid.waitForFunction(
        () => document.querySelectorAll('#actions button').length >= 9,
        undefined, { timeout: 15000 },
      );
    } catch {
      const n = await bid.locator('#actions button').count();
      console.error(`CHYBA: licitovaný sav se neobnovil — nabídka má ${n} tlačítek místo devíti (${lang})`);
      await bid.close();
      await browser.close();
      process.exit(1);
    }
    await bid.waitForTimeout(120); // dosazení popisků a případné zalomení

    /*
     * Bez pojmenovaných pomocníků uvnitř `evaluate`: tsx je přeloží esbuildem
     * a propašuje do nich `__name`, který v prohlížeči neexistuje (stejná past
     * jako u `addInitScript` nahoře).
     */
    const boxes = await bid.evaluate(() => ({
      buttons: [...document.querySelectorAll('#actions button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { label: (b.textContent ?? '').trim(), x: r.x, y: r.y, w: r.width, h: r.height };
      }),
      meta: [...document.querySelectorAll('.me-meta')].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })[0] ?? null,
      pile: [...document.querySelectorAll('#pile-me')].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })[0] ?? null,
    }));
    /*
     * Nabídka se musí vejít na JEDEN řádek.
     *
     * Do §40 tohle netvrdilo nic a nešlo: devět plnotextových tlačítek se
     * v angličtině a němčině zalomilo na dva řádky a jediné, co je drželo mimo
     * jmenovku, byl pruh z §37. Po zúžení na dlaždice je řada tak malá, že na
     * jmenovku nedosáhne ani bez pruhu — kontrola překryvu tím ztratila zuby.
     * Tohle je to, co redesign doopravdy slibuje, a co se zase pokazí, jakmile
     * se popisky natáhnou.
     */
    const tops = new Set(boxes.buttons.map((b) => Math.round(b.y)));
    if (tops.size > 1) {
      worst.push(`${lang}: nabídka se zalomila na ${tops.size} řádky`);
    }
    for (const [name, target] of [['jmenovku', boxes.meta], ['hromádku', boxes.pile]] as const) {
      if (target === null || target.w === 0) continue; // prvek se v téhle fázi nekreslí
      for (const b of boxes.buttons) {
        const ox = Math.min(b.x + b.w, target.x + target.w) - Math.max(b.x, target.x);
        const oy = Math.min(b.y + b.h, target.y + target.h) - Math.max(b.y, target.y);
        if (ox > 0 && oy > 0) {
          worst.push(`${lang}: „${b.label}" přes ${name} (${Math.round(ox)}×${Math.round(oy)} px)`);
        }
      }
    }
    if (lang === 'cs') {
      await bid.screenshot({ path: join(outDir, 'smoke-auction.png') });
    }
    await bid.close();
  }
  if (worst.length > 0) {
    console.error(`CHYBA: nabídka licitace překrývá hráčovy prvky:\n  ${worst.join('\n  ')}`);
    await browser.close();
    process.exit(1);
  }
  console.log('Nabídka licitace (9 tlačítek) je ve všech čtyřech jazycích na jednom řádku a vyhne se jmenovce i hromádce');
}

/*
 * „Vše za mnou" (§39): tlačítko se v sehrávce ukáže, kliknutí dohraje zbytek
 * bez dalšího klikání a hra dojde k zúčtování. Na geometrii ani na pravidla
 * to není — ta drží verify; tohle je o tom, že je to napojené: `claimPlan`
 * v UI, `claimRest()` v controlleru a smyčka, která sama posílá karty.
 */
{
  const claim = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  claim.on('dialog', (d) => void d.accept());
  await claim.goto(url);
  await claim.evaluate(([match, settings]) => {
    localStorage.setItem('flek.match.v1', match);
    localStorage.setItem('flek.settings.v1', settings);
    /*
     * `difficulty: 'easy'` — `playPolicy` bez hledání. Na tom, co se testuje
     * (tlačítko dohraje zbytek), to nic nemění, ale ubere z dohrávky vteřiny
     * hledání ISMCTS na každou odpověď soupeře.
     */
  }, [claimSave(), JSON.stringify({ variant: 'licitovany', difficulty: 'easy', sounds: false })]);
  await claim.reload();

  const button = claim.locator('#actions .action-btn', { hasText: /Vše za mnou/i });
  try {
    await button.waitFor({ timeout: 15000 });
  } catch {
    const shown = (await claim.locator('#actions').innerText()).replace(/\s+/g, ' ').trim();
    console.error(`CHYBA: tlačítko „Vše za mnou" se neukázalo (v liště je: „${shown}")`);
    await claim.close();
    await browser.close();
    process.exit(1);
  }
  const handBefore = await claim.locator('#hand .card-btn').count();
  await button.click();
  try {
    // zúčtování: bez jediného dalšího kliknutí
    await claim.waitForSelector('#center-float .felt-panel:not(.warn)', { timeout: 20000 });
  } catch {
    const left = await claim.locator('#hand .card-btn').count();
    console.error(`CHYBA: „Vše za mnou" hru nedohrálo — v ruce zbývá ${left} z ${handBefore} karet`);
    await claim.screenshot({ path: join(outDir, 'smoke-claim-fail.png') });
    await claim.close();
    await browser.close();
    process.exit(1);
  }
  await claim.close();
  console.log(`Vše za mnou: tlačítko dohrálo ${handBefore} karet bez dalšího kliknutí`);
}

/*
 * „Nic za mnou" v betlu (§43): tlačítko se ukáže UPROSTŘED štychu (aktér
 * v betlu přiznává barvu), má jiný nápis a controller plán přepočítává na
 * každém tahu. Na konci se ze savu ověří, že betl je opravdu vyhraný.
 */
{
  const betl = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  betl.on('dialog', (d) => void d.accept());
  await betl.goto(url);
  await betl.evaluate(([match, settings]) => {
    localStorage.setItem('flek.match.v1', match);
    localStorage.setItem('flek.settings.v1', settings);
  }, [betlClaimSave(), JSON.stringify({ variant: 'licitovany', difficulty: 'easy', sounds: false })]);
  await betl.reload();
  const fail = async (msg: string): Promise<never> => {
    console.error(`CHYBA: „Nic za mnou" — ${msg}`);
    await betl.screenshot({ path: join(outDir, 'smoke-betl-claim-fail.png') });
    await browser.close();
    process.exit(1);
  };
  const button = betl.locator('#actions .action-btn', { hasText: /Nic za mnou/i });
  try {
    await button.waitFor({ timeout: 15000 });
  } catch {
    await fail(`tlačítko se neukázalo (v liště je: „${(await betl.locator('#actions').innerText()).replace(/\s+/g, ' ').trim()}")`);
  }
  const handBefore = await betl.locator('#hand .card-btn').count();
  await button.click();
  try {
    await betl.waitForSelector('#center-float .felt-panel:not(.warn)', { timeout: 20000 });
  } catch {
    await fail(`hru nedohrálo — v ruce zbývá ${await betl.locator('#hand .card-btn').count()} z ${handBefore} karet`);
  }
  const saved = await betl.evaluate(() => localStorage.getItem('flek.match.v1'));
  const results = saved === null ? [] : (JSON.parse(saved) as { state: { handResults: { delta: number[] }[] } }).state.handResults;
  const delta = results[results.length - 1]?.delta[0];
  if (delta === undefined || delta <= 0) await fail(`betl po dohrání není vyhraný (delta aktéra ${String(delta)})`);
  await betl.close();
  console.log(`Nic za mnou: betl uprostřed štychu dohrán (${handBefore} karet), vyhraný`);
}

await browser.close();

// vyčerpání smyčky NENÍ úspěch — jinak by test procházel, i když hra uvízne
if (!reachedSettlement) {
  console.error('CHYBA: hra nedošla k zúčtování (smyčka vyčerpána)');
  process.exit(1);
}

// kdyby se v celém běhu barevná hra nehrála, kontrola trumfu stranou by tiše
// neproběhla a test by procházel i s rozbitým `#trump-aside`
if (!trumpAsideSeen) {
  console.error('CHYBA: v běhu jsem neodhazoval do talonu — trumf stranou nebyl ověřen');
  process.exit(1);
}
if (!trumpBackInHand) {
  console.error('CHYBA: návrat odložené karty do ruky nebyl ověřen');
  process.exit(1);
}

/*
 * Úvodní obrazovka ve WebKitu (= Safari). Dvě věci, které Chromium NEODHALÍ:
 *
 *  1. `max-height: 100 %` na obrázku ve flex položce Safari přetáhne přes
 *     kartu a figura se ořízne. Kontrola je na geometrii, ne na CSS.
 *  2. Poměry z mockupu musí platit i ve fullscreenu — sazba stolu se proto
 *     počítá z výšky sukna (cqh), ne z šířky okna.
 */
{
  const wk = await webkit.launch();
  const wkPage = await wk.newPage({ viewport: { width: 1440, height: 1000 } });
  await wkPage.goto(url);
  await wkPage.waitForSelector('.variant-card .variant-figure img', { timeout: 5000 });
  await wkPage.waitForTimeout(400);

  const proportions = async (label: string): Promise<number> => {
    const felt = await wkPage.locator('#table').boundingBox();
    const card = await wkPage.locator('.variant-card').first().boundingBox();
    const img = await wkPage.locator('.variant-card .variant-figure img').first().boundingBox();
    if (!felt || !card || !img) {
      console.error(`CHYBA: úvodní obrazovka (${label}) se ve WebKitu nevykreslila`);
      await wk.close();
      await browser.close();
      process.exit(1);
    }
    // všechny čtyři hrany: ořez zprava i zleva vypadá stejně špatně
    const overflow = Math.max(
      img.y + img.height - (card.y + card.height),
      card.y - img.y,
      img.x + img.width - (card.x + card.width),
      card.x - img.x,
    );
    if (overflow > 1) {
      console.error(`CHYBA: figura varianty přetéká kartu o ${Math.round(overflow)} px (${label})`);
      await wk.close();
      await browser.close();
      process.exit(1);
    }
    return (100 * card.height) / felt.height;
  };

  const windowed = await proportions('okno');
  await wkPage.evaluate(() => document.querySelector('.game-section')?.classList.add('fs-fallback'));
  await wkPage.waitForTimeout(400);
  const full = await proportions('fullscreen');
  if (Math.abs(windowed - full) > 2) {
    console.error(
      `CHYBA: fullscreen rozhodil poměry úvodní obrazovky (karta varianty ${windowed.toFixed(1)} % → ${full.toFixed(1)} % výšky sukna)`,
    );
    await wk.close();
    await browser.close();
    process.exit(1);
  }
  console.log(
    `WebKit: úvodní obrazovka drží poměry (karta varianty ${windowed.toFixed(1)} % / ${full.toFixed(1)} % výšky sukna)`,
  );
  await wk.close();
}

/**
 * Sav s rozehranou hrou, kde trumf volil SOUPEŘ (forhont = sedadlo 1, tedy
 * vlevo od člověka) a odložená karta tak leží v jeho ruce. Staví se enginem,
 * ne klikáním — jen tak je stav v každém běhu stejný.
 */
function asideSave(): string {
  // dealer 0 → forhont 1, tedy soupeř VLEVO: trumf volí on a karta zůstává jemu
  let st = apply(initialState(defaultConfig('voleny'), 0), { type: 'deal', seed: 1 });
  const acts = (): ReturnType<typeof legalActions> => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };
  let guard = 0;
  while (st.phase.name !== 'fleks' && st.phase.name !== 'scored' && (guard += 1) < 60) {
    const a = acts();
    st = apply(st,
      a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
      // talon bez es a desítek, jinak aktérovi zbude jen betl/durch (C/13)
      a.find((x) => x.type === 'discard' && x.cards.every((c) => c % 8 !== 3 && c % 8 !== 7)) ??
      a.find((x) => x.type === 'declare' && x.mode === 'hra') ??
      a.find((x) => x.type === 'takeover' && x.claim === 'good') ?? a[0]);
  }
  if (st.phase.name !== 'fleks' || st.contract?.mode !== 'hra' || st.contract.declarer !== 1) {
    throw new Error('scénář pro odložený trumf neskončil barevnou hrou soupeře vlevo');
  }
  return JSON.stringify({ v: SAVE_VERSION, state: st });
}

/**
 * Sav s licitovaným, kde je člověk na tahu a nabídka má DEVĚT tlačítek —
 * tolik, co se jich vejde na obrazovku uživatele, který hlásil překryv.
 *
 * Seed 514 není náhoda: devítinabídka (obě sedmy i sto, a obojí v barvě)
 * vypadne z rozdání jen občas, tak je vybraný hledáním. Kdyby ho úprava
 * licitace rozbila, kontrola to řekne rovnou — proto ta kontrola na devět.
 */
function auctionSave(): string {
  let st = apply(initialState(defaultConfig('licitovany'), 0), { type: 'deal', seed: 514 });
  let guard = 0;
  while (st.phase.name !== 'bidding' && (guard += 1) < 40) {
    const next = ([0, 1, 2] as const)
      .map((s) => legalActions(view(st, s)))
      .find((a) => a.length > 0);
    if (next === undefined) break;
    st = apply(st, next[0]);
  }
  const offer = legalActions(view(st, 0));
  if (st.phase.name !== 'bidding' || (st.phase as { toAct: number }).toAct !== 0 || offer.length < 9) {
    throw new Error(`scénář pro nabídku licitace nedal devět možností (fáze ${st.phase.name}, ${offer.length})`);
  }
  return JSON.stringify({ v: SAVE_VERSION, state: st });
}

/**
 * Sav s betlem, kde je člověk aktér a platí „Nic za mnou" (§43) — uprostřed
 * štychu, pět karet v ruce. Licitovaný, seed 55: ostatní pasují, člověk
 * odhodí dvě nejvyšší karty a ohlásí betl, pak hraje nejnižší legální kartu;
 * soupeři hrají poslední legální. Nabídka přijde v pátém štychu.
 */
function betlClaimSave(): string {
  const low = (a: PlayerActionS, b: PlayerActionS) =>
    ((a as { card: number }).card % 8) - ((b as { card: number }).card % 8);
  let st = apply(initialState(defaultConfig('licitovany'), 2), { type: 'deal', seed: 55 });
  for (let guard = 0; guard < 120 && st.phase.name !== 'scored'; guard += 1) {
    const actor = ([0, 1, 2] as const).find((s) => legalActions(view(st, s)).length > 0);
    if (actor === undefined) break;
    const acts = legalActions(view(st, actor));
    if (st.phase.name === 'tricks') {
      if (actor === 0 && claimPlan(view(st, 0)) !== null) return JSON.stringify({ v: SAVE_VERSION, state: st });
      st = apply(st, actor === 0 ? [...acts].sort(low)[0] : acts[acts.length - 1]);
      continue;
    }
    const pick = actor === 0
      ? acts.find((a) => a.type === 'declare' && a.mode === 'betl')
        ?? [...acts.filter((a) => a.type === 'discard')].sort((a, b) => {
          const sum = (x: PlayerActionS) => (x as { cards: number[] }).cards.reduce((t, c) => t + (c % 8), 0);
          return sum(b) - sum(a);
        })[0]
        ?? acts.find((a) => a.type === 'good') ?? acts[0]
      : acts.find((a) => (a.type === 'bid' && a.bid === 'pass') || a.type === 'good') ?? acts[0];
    st = apply(st, pick);
  }
  throw new Error(`scénář „nic za mnou" se nepotkal (fáze ${st.phase.name}) — úprava AI nebo pravidel ho posunula`);
}

/**
 * Sav, kde je na tahu ČLOVĚK a platí nabídka „Vše za mnou" (§39).
 *
 * Staví se enginem se stejnou AI, jaká hraje v prohlížeči (pevný počet
 * iterací, ne časový rozpočet — jinak by stav vycházel pokaždé jinak).
 * Licitovaný, seed 5: člověku zbývají čtyři karty a nikdo mu je nevezme.
 */
function claimSave(): string {
  let st = apply(initialState(defaultConfig('licitovany'), 2), { type: 'deal', seed: 5 });
  let moveNo = 0;
  let guard = 0;
  while (st.phase.name !== 'scored' && (guard += 1) < 200) {
    const plan = claimPlan(view(st, 0));
    /*
     * Horní mez je podstatná: čekání níž je pevných 20 s, ale cena dohrávky
     * roste s každou kartou (odklad + dvě odpovědi AI + dokreslení štychu).
     * Bez ní by stačila změna heuristiky, scénář by se překlopil na šest karet
     * a smoke by spadl hláškou „nedohrálo", i když by to jen ještě hrálo.
     */
    if (plan !== null && plan.length >= 3 && plan.length <= 4) {
      return JSON.stringify({ v: SAVE_VERSION, state: st });
    }
    const actor = ([0, 1, 2] as const).find((s) => legalActions(view(st, s)).length > 0);
    if (actor === undefined) break;
    st = apply(st, think({
      view: view(st, actor), difficulty: 'normal', seed: 5000 + (moveNo += 1), budgetMs: 5000, iterations: 40,
    }).action);
  }
  throw new Error('scénář pro „vše za mnou" nenastal');
}

async function tableClip(): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#game-section').boundingBox();
  return box ?? { x: 0, y: 0, width: 1200, height: 900 };
}
