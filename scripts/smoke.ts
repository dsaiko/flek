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
import sharp from 'sharp';
import { apply, initialState } from '../src/lib/rules/engine';
import { legalActions } from '../src/lib/rules/legal';
import type { PlayerAction as PlayerActionS } from '../src/lib/rules/types';
import { defaultConfig } from '../src/lib/rules/sazby';
import { view } from '../src/lib/rules/view';
import { claimPlan } from '../src/lib/rules/claim';
import { think } from '../src/lib/ai/think';
import { VERSION as SAVE_VERSION } from '../src/lib/match/persist';
import { TALK_TABLES } from '../src/lib/ui/tableTalk';
import { discardWarnings } from '../src/lib/ui/discardWarnings';

// Pevný seed: smoke musí být reprodukovatelný. Se seedem 10 vede odhoz, který
// smoke volí (první a poslední karta v ruce), na varovný popup — bez toho by
// kontrola „popup přežije přepnutí jazyka" nemusela vůbec proběhnout.
const url = process.argv[2] ?? 'http://127.0.0.1:8083/?seed=10';
const outDir = process.argv[3] ?? 'docs';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
// vlastní kontext (ne browser.newPage): kontrola konta po reloadu v něm otevírá druhou záložku
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage();
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
const TALK_LANGS = ['cs', 'en', 'de', 'fr'] as const;
/** Všechny folklórní hlášky — pro kontrolu, že dva soupeři neřeknou totéž. */
const ALL_TALK = new Set<string>(
  [TALK_TABLES.POLITE, TALK_TABLES.PUB].flatMap((table) =>
    Object.values(table as Record<string, Record<string, readonly string[]>>).flatMap((lines) =>
      TALK_LANGS.flatMap((lang) => [...(lines[lang] ?? [])]),
    ),
  ),
);
/** Hlášky „přemýšlím" ve všech jazycích a sadách — nesmí přežít soupeřův tah. */
const THINKING = new Set<string>(
  [TALK_TABLES.POLITE.thinking, TALK_TABLES.PUB.thinking].flatMap((t) =>
    t === undefined ? [] : TALK_LANGS.flatMap((lang) => [...(t[lang] ?? [])]),
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
// kontroly konta a varianty níž se do měření restartu nepočítají (mají vlastní
// čekání); stránka se u nich ale NESMÍ načíst znovu — reload by opuštěný
// řetěz animací zahodil a měření by zadrhnutí nemělo jak uvidět
const checksStart = Date.now();

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
   * obrazovce by konto smazal. Načítá se v druhé záložce téhož kontextu
   * (sdílí localStorage), ať první stránka o svůj stav nepřijde.
   */
  const twin = await page.context().newPage();
  await twin.goto(url);
  await twin.waitForSelector('#intro-panel', { state: 'visible', timeout: 5000 });
  const moneyAfterReload = ((await twin.locator('#seat-me .seat-meta, .me-meta').first().innerText()) ?? '').trim();
  if (/^0[,.]00/.test(moneyAfterReload) || !/[1-9]/.test(moneyAfterReload)) {
    console.error(`CHYBA: reload úvodní obrazovky smazal konto (u hráče stojí „${moneyAfterReload}")`);
    await browser.close();
    process.exit(1);
  }
  const lastAfterReload = ((await twin.locator('#intro-last').innerText()) ?? '').trim();
  await twin.close();
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


const checksMs = Date.now() - checksStart;
await page.click('#actions .action-btn.primary');
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
const restartMs = Date.now() - restartStart - checksMs;
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
const heard = [...bubblesSeen].filter((b) => ALL_TALK.has(b));
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
  /*
   * Dva žebříky, táž slibovaná vlastnost: licitace (§40) a hlášení závazku
   * (§45, čtyři barvy po „Hra · 7 · 100 · 100+7" plus betl a durch — nejširší
   * nabídka, jaká se u stolu objeví).
   */
  const ladders: [string, string, number, string][] = [
    ['licitace', auctionSave(), 9, 'smoke-auction.png'],
    ['hlášení', declareSave(), 14, 'smoke-declare.png'],
  ];
  for (const [ladderName, payload, need, shot] of ladders) {
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
        (min) => document.querySelectorAll('#actions button').length >= min,
        need, { timeout: 15000 },
      );
    } catch {
      const n = await bid.locator('#actions button').count();
      console.error(`CHYBA: licitovaný sav (${ladderName}) se neobnovil — nabídka má ${n} tlačítek místo ${need} (${lang})`);
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
      await bid.screenshot({ path: join(outDir, shot) });
    }
    await bid.close();
  }
  if (worst.length > 0) {
    console.error(`CHYBA: nabídka (${ladderName}) překrývá hráčovy prvky:\n  ${worst.join('\n  ')}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`Nabídka (${ladderName}, ${need} tlačítek) je ve všech čtyřech jazycích na jednom řádku a vyhne se jmenovce i hromádce`);
  }
}

/*
 * Zvednutí talonu v licitovaném. Uživatel hlásil, že „najednou skočí další dvě
 * karty a celá ruka se posune": vějíř se přeskládal v jediném snímku, protože
 * tlačítka se recyklovala podle pořadí a obrázek dostala vždycky jiná karta.
 * Teď si karta drží svůj prvek, dosavadní karty dojedou na nové místo a obě
 * z talonu se zjeví. Měří se po snímcích (requestAnimationFrame), ne screenshotem.
 */
{
  const pick = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  pick.on('dialog', (d) => void d.accept());
  await pick.goto(url);
  await pick.evaluate(([match, settings]) => {
    localStorage.setItem('flek.match.v1', match);
    localStorage.setItem('flek.settings.v1', settings);
  }, [auctionSave(), JSON.stringify({ variant: 'licitovany', sounds: false })]);
  await pick.reload();
  await pick.locator('.bid-chip').last().waitFor({ timeout: 15000 });
  // vzorkovač jako řetězec: tsx by do pojmenované funkce vložil `__name`, který stránka nezná
  await pick.evaluate(`(() => {
    window.__frames = [];
    const t0 = performance.now();
    function tick() {
      const btns = [...document.querySelectorAll('#hand .card-btn')];
      window.__frames.push({
        n: btns.length,
        keys: btns.map((b) => b.dataset.card ?? ''),
        xs: btns.map((b) => b.getBoundingClientRect().left),
        op: btns.map((b) => Number(getComputedStyle(b).opacity)),
      });
      if (performance.now() - t0 < 15000 && window.__frames.filter((f) => f.n === 12).length < 90) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })()`);
  // durch je nejvyšší nabídka, nikdo ho nepřebije — talon zvedne člověk určitě
  await pick.locator('.bid-chip').last().click();
  for (let i = 0; i < 300 && (await pick.locator('#hand .card-btn').count()) !== 12; i += 1) await pick.waitForTimeout(50);
  await pick.waitForTimeout(1500);
  type Frame = { n: number; keys: string[]; xs: number[]; op: number[] };
  const frames = (await pick.evaluate('window.__frames')) as Frame[];
  await pick.close();
  const at = frames.findIndex((f) => f.n === 12);
  const fail = (msg: string): never => {
    console.error(`CHYBA: zvednutí talonu — ${msg}`);
    process.exit(1);
  };
  if (at < 1 || frames[at - 1].n !== 10) fail(`ruka nešla z 10 na 12 karet (snímků ${frames.length}, přechod na ${at})`);
  const was = frames[at - 1];
  const first = frames[at];
  const last = frames[frames.length - 1];
  const oldX = new Map(was.keys.map((k, i) => [k, was.xs[i]]));
  // 1) žádný skok: v prvním snímku po změně stojí dosavadní karty tam, kde byly
  const jumped = first.keys
    .map((k, i) => ({ k, dx: oldX.has(k) ? Math.abs(first.xs[i] - (oldX.get(k) ?? 0)) : 0 }))
    .filter((d) => d.dx > 3);
  if (jumped.length > 0) fail(`${jumped.length} karet skočilo v jediném snímku (nejvíc o ${Math.max(...jumped.map((d) => d.dx)).toFixed(0)} px)`);
  // 2) nové karty (ty z talonu) se zjevují, nejsou tam hned celé
  const fresh = first.keys.map((k, i) => ({ k, op: first.op[i] })).filter((c) => !oldX.has(c.k));
  if (fresh.length !== 2) fail(`čekal jsem dvě nové karty, přibylo ${fresh.length}`);
  if (fresh.some((c) => c.op > 0.5)) fail(`karty z talonu jsou v prvním snímku hned vidět (průhlednost ${fresh.map((c) => c.op.toFixed(2)).join(', ')})`);
  // 3) a nezamrzlo to: na konci karty opravdu dojely a všechny jsou vidět
  const moved = last.keys.filter((k, i) => oldX.has(k) && Math.abs(last.xs[i] - (oldX.get(k) ?? 0)) > 20).length;
  if (moved === 0) fail('dosavadní karty zůstaly na starých místech — vějíř se nepřeskládal');
  if (last.op.some((o) => o < 0.99)) fail('na konci nejsou všechny karty plně vidět');
  console.log(`Zvednutí talonu: 10 karet dojelo bez skoku (${moved} se posunulo), 2 z talonu se zjevily`);
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

/*
 * Odhoz do talonu: tři chyby, které našlo review 2026-09-25 (§47).
 *  1. Dvojklik na „Odhodit" — po odhozu se nic neanimuje, nová tlačítka
 *     vzniknou pod kurzorem a druhé kliknutí zmáčklo „Betl" (převzetí).
 *  2. Varování drželo vybraný pár z doby otevření, ale ruka pod ním dál
 *     reagovala: potvrzení pak odhodilo jiné karty, než byly zvednuté.
 *  3. Po přepnutí jazyka zůstal text varování v původním jazyce.
 * A k tomu dlaždice licitace, které zámek během animace nebral.
 */
{
  const { payload, warnPair, calmPair } = discardScene();
  const dp = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  dp.on('dialog', (d) => void d.accept());
  const fail = async (msg: string): Promise<never> => {
    console.error(`CHYBA: odhoz — ${msg}`);
    await browser.close();
    process.exit(1);
  };
  const load = async (): Promise<void> => {
    await dp.goto(url);
    await dp.evaluate(([match, settings]) => {
      localStorage.setItem('flek.match.v1', match);
      localStorage.setItem('flek.settings.v1', settings);
    }, [payload, JSON.stringify({ variant: 'voleny', sounds: false, lang: 'cs' })]);
    await dp.reload();
    await dp.waitForSelector('#discard-confirm', { timeout: 10000 });
    await dp.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
  };
  const history = async (): Promise<PlayerActionS[]> => {
    const raw = await dp.evaluate(() => localStorage.getItem('flek.match.v1'));
    return raw === null ? [] : (JSON.parse(raw) as { state: { history: PlayerActionS[] } }).state.history;
  };
  const selected = async (): Promise<number[]> =>
    (await dp.locator('#hand .card-btn.selected').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.card))))
      .sort((a, b) => a - b);
  const pick = async (cards: readonly number[]): Promise<void> => {
    for (const c of cards) await dp.click(`#hand .card-btn[data-card="${c}"]`);
  };

  // 1. dvojklik: z odhozu smí vzniknout právě jedna akce
  await load();
  await pick(calmPair);
  const before = (await history()).length;
  await dp.dblclick('#discard-confirm');
  await dp.waitForTimeout(600);
  const added = (await history()).slice(before);
  if (added.length !== 1 || added[0].type !== 'discard') {
    await fail(`dvojklik na „Odhodit" udělal ${added.length} akcí: ${added.map((a) => a.type).join(', ')}`);
  }

  // 2. + 3. varování: ruka pod ním nereaguje, text se přeloží, odhodí se zvednutý pár
  await load();
  await pick(warnPair);
  await dp.click('#discard-confirm');
  await dp.waitForSelector('#center-float .felt-panel.warn', { timeout: 3000 });
  const other = (await dp.locator('#hand .card-btn').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.card))))
    .find((c) => !warnPair.includes(c));
  await dp.click(`#hand .card-btn[data-card="${other}"]`, { force: true });
  await dp.click(`#hand .card-btn[data-card="${warnPair[0]}"]`, { force: true });
  const sel = await selected();
  if (sel.join() !== [...warnPair].sort((a, b) => a - b).join()) {
    await fail(`ruka pod varováním reagovala (zvednuté ${sel.join()}, varování je o ${warnPair.join()})`);
  }
  await dp.click('#btn-lang');
  await dp.click('.langpill button[data-lang="en"]');
  const warnText = (await dp.locator('#center-float .felt-panel.warn').innerText()).replace(/\s+/g, ' ');
  if (!/Careful/.test(warnText) || !/Discard/.test(warnText) || /Pozor|Odhodit/.test(warnText)) {
    await fail(`varování po přepnutí do angličtiny zní „${warnText}"`);
  }
  const mark = (await history()).length;
  await dp.click('#center-float [data-act="confirm"]');
  await dp.waitForTimeout(400);
  const done = (await history()).slice(mark)[0];
  if (done?.type !== 'discard' || [...done.cards].sort((a, b) => a - b).join() !== [...warnPair].sort((a, b) => a - b).join()) {
    await fail(`potvrzené varování odhodilo ${done?.type === 'discard' ? done.cards.join() : String(done?.type)} místo ${warnPair.join()}`);
  }
  await dp.close();

  // 4. dlaždice licitace musí zámek animace brát stejně jako tlačítka
  const lp = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  lp.on('dialog', (d) => void d.accept());
  await lp.goto(url);
  await lp.evaluate(([match, settings]) => {
    localStorage.setItem('flek.match.v1', match);
    localStorage.setItem('flek.settings.v1', settings);
  }, [auctionSave(), JSON.stringify({ variant: 'licitovany', sounds: false })]);
  await lp.reload();
  await lp.waitForSelector('#actions .bid-chip', { timeout: 15000 });
  const lockedChip = await lp.evaluate(`(() => {
    document.getElementById('table').classList.add('animating');
    const r = getComputedStyle(document.querySelector('#actions .bid-chip')).pointerEvents;
    document.getElementById('table').classList.remove('animating');
    return r;
  })()`);
  if (lockedChip !== 'none') await fail(`dlaždice licitace během animace berou kliknutí (pointer-events: ${String(lockedChip)})`);
  await lp.close();
  console.log('Odhoz: dvojklik udělá jednu akci, varování drží zvednutý pár a mluví jazykem stolu; dlaždice mají zámek');
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

/*
 * Celá obrazovka na telefonu (§46). Na iPhonu Safari Fullscreen API pro stránku
 * nemá, takže jediná cesta je web spuštěný z plochy — ten potřebuje manifest,
 * ikony a meta značky. Tlačítko na iPhonu místo fullscreenu ukáže návod a
 * v režimu z plochy (už je přes celou obrazovku) zmizí.
 */
{
  const origin = new URL(url).origin;
  // vlastní prohlížeč: sdílený je v tomhle místě smoke už zavřený (stejně jako u bloku Mobil)
  const fb = await chromium.launch();
  const fail = (msg: string): never => {
    console.error(`CHYBA: web na plochu — ${msg}`);
    process.exit(1);
  };
  const res = await fetch(`${origin}/manifest.json`);
  if (!res.ok) fail(`manifest.json vrátil ${res.status}`);
  const manifest = (await res.json()) as { display?: string; start_url?: string; icons?: { src: string; sizes: string }[] };
  if (manifest.display !== 'fullscreen' || manifest.start_url !== '/') fail(`manifest: display ${manifest.display}, start_url ${manifest.start_url}`);
  const icons = [...(manifest.icons ?? []).map((i) => ({ src: i.src, size: Number(i.sizes.split('x')[0]) })), { src: '/icons/apple-touch-icon.png', size: 180 }];
  if (!icons.some((i) => i.size >= 512)) fail('manifest nemá ikonu 512 px');
  for (const icon of icons) {
    const r = await fetch(`${origin}${icon.src}`);
    if (!r.ok) fail(`${icon.src} vrátil ${r.status}`);
    const meta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    if (meta.format !== 'png' || meta.width !== icon.size || meta.height !== icon.size) {
      fail(`${icon.src} je ${meta.format} ${meta.width}×${meta.height}, čekal jsem PNG ${icon.size}×${icon.size}`);
    }
  }

  const pageWith = async (init: string) => {
    const ctx = await fb.newContext({ viewport: { width: 812, height: 375 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(init);
    const pg = await ctx.newPage();
    await pg.goto(url);
    await pg.waitForSelector('#btn-fullscreen', { state: 'attached' });
    return { ctx, pg };
  };
  const head = await (async () => {
    const { ctx, pg } = await pageWith('');
    const h = await pg.evaluate(`({
      manifest: !!document.querySelector('link[rel="manifest"][href="/manifest.json"]'),
      touch: !!document.querySelector('link[rel="apple-touch-icon"]'),
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
    })`) as { manifest: boolean; touch: boolean; capable?: string; viewport?: string };
    await ctx.close();
    return h;
  })();
  if (!head.manifest || !head.touch || head.capable !== 'yes' || !(head.viewport ?? '').includes('viewport-fit=cover')) {
    fail(`hlavička: ${JSON.stringify(head)}`);
  }

  // iPhone v Safari: dotyk a žádné Fullscreen API → tlačítko ukáže návod
  {
    const { ctx, pg } = await pageWith(`Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });`);
    // na telefonu je tlačítko v menu pod ☰ (§48)
    await pg.click('#btn-menu');
    await pg.click('#btn-fullscreen');
    const shown = await pg.locator('#fs-hint-float').isVisible();
    const fallback = await pg.evaluate(`document.querySelector('#game-section').classList.contains('fs-fallback')`);
    await pg.screenshot({ path: join(outDir, 'smoke-fs-hint.png') });
    await ctx.close();
    if (!shown) fail('na iPhonu tlačítko celé obrazovky neukázalo návod');
    if (fallback) fail('na iPhonu se místo návodu zapnula CSS náhrada, která lišty Safari neschová');
  }
  // spuštěno z plochy: celá obrazovka už je, tlačítko pryč
  {
    const { ctx, pg } = await pageWith(`Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });`);
    // s OTEVŘENÝM menu — v zavřeném je tlačítko neviditelné vždycky a kontrola by nic neověřila
    await pg.click('#btn-menu');
    await pg.waitForSelector('#menu-sheet .sheet', { state: 'visible' });
    const hidden = await pg.locator('#btn-fullscreen').isHidden();
    await ctx.close();
    if (!hidden) fail('ve webu spuštěném z plochy tlačítko celé obrazovky zůstalo');
  }
  // …a mimo iPhone (desktop s Fullscreen API) se návod neukazuje — jinak by kontrola výš prošla i s tlačítkem, které návod ukáže vždycky
  {
    const ctx = await fb.newContext({ viewport: { width: 1400, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(url);
    await pg.click('#btn-fullscreen');
    await pg.waitForTimeout(300);
    const shown = await pg.locator('#fs-hint-float').isVisible();
    await ctx.close();
    if (shown) fail('návod k iPhonu se ukázal i na desktopu');
  }
  await fb.close();
  console.log('Web na plochu: manifest, ikony a hlavička v pořádku; na iPhonu návod, z plochy bez tlačítka');
}

/*
 * Mobil (§44). Na telefonu stůl vyplní výšku okna, ruka se vejde do šířky
 * a nic se nesráží: dřív zabíral 40 % displeje, dvanáct karet přetékalo
 * a řádek se stavem se lámal mezi jmenovkami soupeřů.
 *
 * Tři savy (volba trumfu s dvanácti kartami, flekování, licitace), dvě
 * velikosti telefonu v Chromiu a jedna ve WebKitu — na iPhonu je to Safari.
 */
{
  type Box = { l: number; r: number; t: number; b: number };
  const saves: [string, string, string][] = [
    ['volba trumfu', mobileSave('voleny', 10, 'choose-trump'), 'voleny'],
    ['flekování', mobileSave('voleny', 10, 'fleks'), 'voleny'],
    ['licitace', auctionSave(), 'licitovany'],
    // sehrávka: třetí štych a dál, dvě karty na stole — soupeř už má pakl, štych leží nad rukou
    ['sehrávka', mobileSave('voleny', 10, 'tricks', (st) => st.phase.name === 'tricks'
      && st.phase.trickNo >= 2 && st.phase.trick.length === 2
      && st.phase.played.some((tr) => tr.winner !== 0)), 'voleny'],
    // panel zúčtování: na 360 px ho dřív ořízl `min-width: 340px`
    ['zúčtování', mobileSave('voleny', 10, 'scored'), 'voleny'],
  ];
  const overlap = (a: Box, b: Box) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const runs: [string, typeof chromium, number, number][] = [
    ['Chromium 390×844', chromium, 390, 844],
    ['Chromium 360×640', chromium, 360, 640],
    ['WebKit 390×844', webkit, 390, 844],
    // na šířku zůstává desktopová sazba z výšky sukna (§30), jen rám vyplní výšku okna
    ['Chromium 844×390', chromium, 844, 390],
    // tablet na výšku: rozložení na výšku bez horní meze šířky
    ['Chromium 768×1024', chromium, 768, 1024],
  ];
  for (const [label, engine, w, h] of runs) {
    const mb = await engine.launch();
    for (const [phase, save, variant] of saves) {
      const ctx = await mb.newContext({ viewport: { width: w, height: h }, isMobile: engine === chromium, hasTouch: true });
      const pg = await ctx.newPage();
      pg.on('dialog', (d) => void d.accept());
      await pg.goto(url);
      await pg.evaluate(([match, settings]) => {
        localStorage.setItem('flek.match.v1', match);
        localStorage.setItem('flek.settings.v1', settings);
      }, [save, JSON.stringify({ variant, sounds: false, difficulty: 'easy' })]);
      await pg.reload();
      await pg.locator(phase === 'zúčtování' ? '#center-float .felt-panel' : '#hand .card-btn').first().waitFor({ timeout: 15000 });
      await pg.waitForTimeout(600);
      // řetězec, ne funkce: tsx by do ní vložil `__name`, který stránka nezná
      const m = (await pg.evaluate(`(() => {
        const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const all = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).map(box);
        const one = (s) => { const e = document.querySelector(s); return e && e.offsetParent !== null ? box(e) : null; };
        return {
          sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
          table: one('#table'), hand: all('#hand .card-btn'), buttons: all('#actions button'),
          meta: one('.me-meta'),
          // TEXT, ne box: původní chyba byl nápis přetékající z úzkého boxu mezi jmenovkami
          center: ['#status-eyebrow', '#status'].map((s) => document.querySelector(s))
            .filter((e) => e && e.textContent.trim() !== '').map((e) => { const r = document.createRange(); r.selectNodeContents(e); return box(r); }),
          seats: [...['#seat-left .seat-id', '#seat-right .seat-id'].map((s) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); return box(r); }),
            ...all('.opp-row .backs')],
          // box sedadla, ne hlavičky: na telefonu je hlavička \`display: contents\` (§48)
          heads: [one('#seat-left'), one('#seat-right')],
          status: ['#status'].map((s) => document.querySelector(s))
            .filter((e) => e && e.textContent.trim() !== '').map((e) => { const r = document.createRange(); r.selectNodeContents(e); return box(r); }),
          backs: all('.opp-row .backs'),
          trick: all('#trick .played'),
          panels: all('#center-float .felt-panel'),
          piles: all('.opp-row .pile img'),
        };
      })()`)) as { sw: number; vw: number; vh: number; table: Box; hand: Box[]; buttons: Box[]; meta: Box | null; center: Box[]; seats: Box[]; heads: (Box | null)[]; backs: Box[]; trick: Box[]; piles: Box[]; panels: Box[]; status: Box[] };
      await ctx.close();
      const where = `${label}, ${phase}`;
      const problems: string[] = [];
      if (m.sw > m.vw + 1) problems.push(`stránka se posouvá do strany (${m.sw} px na ${m.vw} px)`);
      // na šířku ubírá lišta pod stolem z nízkého okna víc
      const portrait = h > w;
      if (m.table.b - m.table.t < m.vh * (portrait ? 0.85 : 0.75)) problems.push(`stůl zabírá jen ${Math.round((100 * (m.table.b - m.table.t)) / m.vh)} % výšky okna`);
      const outside = [...m.hand, ...m.buttons].filter((b) => b.l < m.table.l - 2 || b.r > m.table.r + 2);
      if (outside.length > 0) problems.push(`${outside.length} karet nebo tlačítek přečnívá přes okraj stolu`);
      if (m.meta !== null && m.buttons.some((b) => overlap(b, m.meta as Box))) problems.push('tlačítka akcí leží přes blok „Ty"');
      if (m.center.some((c) => m.seats.some((b) => overlap(b, c)))) problems.push('řádek se stavem leží přes jmenovku nebo ruby soupeře');
      // soupeři v jedné řadě a stav až pod jejich ruby — mezi jmenovkami se nevejde (§44)
      const [hl, hr] = m.heads;
      if (hl === null || hr === null || Math.abs(hl.t - hr.t) > 2) problems.push('soupeři nestojí v jedné řadě');
      // bez rubů by kontroly níž prošly naprázdno (Math.max prázdného pole je -Infinity)
      if (m.backs.length !== 2) problems.push(`ruby soupeřů: čekal jsem dva řádky, našel ${m.backs.length}`);
      const backsBottom = Math.max(...m.backs.map((b) => b.b));
      // výzva (ne pilulka varianty — ta je na telefonu v horní liště, §48)
      if (portrait && m.status.some((c) => c.t < backsBottom - 1)) problems.push('řádek se stavem není pod ruby soupeřů');
      // štych leží nad rukou a mimo blok „Ty" a akce; pakl soupeře ve stole a mimo řádek se stavem
      const mine = [...m.hand, ...m.buttons, ...(m.meta === null ? [] : [m.meta])];
      if (m.trick.some((c) => mine.some((b) => overlap(c, b)))) problems.push('karta ve štychu leží přes ruku, akce nebo blok „Ty"');
      if (m.piles.some((p) => p.l < m.table.l - 2 || p.r > m.table.r + 2 || p.t < m.table.t)) problems.push('pakl soupeře vyčnívá ze stolu');
      if (m.piles.some((p) => m.center.some((c) => overlap(p, c)))) problems.push('pakl soupeře leží přes řádek se stavem');
      if (m.panels.some((p) => p.l < m.table.l - 1 || p.r > m.table.r + 1)) problems.push('panel zúčtování vyčnívá ze stolu');
      if (phase === 'zúčtování' && m.panels.length === 0) problems.push('panel zúčtování se neukázal');
      if (phase === 'sehrávka' && (m.trick.length !== 2 || m.piles.length === 0)) {
        problems.push(`sehrávka nemá, co měřit (štych ${m.trick.length} karet, pakl ${m.piles.length})`);
      }
      if (problems.length > 0) {
        console.error(`CHYBA: mobil (${where}) — ${problems.join('; ')}`);
        await mb.close();
        await browser.close();
        process.exit(1);
      }
    }
    await mb.close();
  }
  console.log(`Mobil: stůl přes celou výšku, ruka i nabídka v šířce, nic se nesráží (${runs.map((r) => r[0]).join(', ')})`);
}

/*
 * Vzor karet (§49): historické skeny a dvě moderní sady. Přepnutí v nastavení
 * musí přepnout karty v ruce i ruby soupeřů, a uložené „modern" z doby, kdy
 * byla moderní sada jediná, se načte jako barevná.
 */
{
  const pb = await chromium.launch();
  const ctx = await pb.newContext({ viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('dialog', (d) => void d.accept());
  const fail = async (msg: string): Promise<never> => {
    console.error(`CHYBA: vzor karet — ${msg}`);
    await pb.close();
    await browser.close();
    process.exit(1);
  };
  await pg.goto(url);
  await pg.evaluate(([match, settings]) => {
    localStorage.setItem('flek.match.v1', match);
    localStorage.setItem('flek.settings.v1', settings);
  }, [mobileSave('voleny', 10, 'tricks'), JSON.stringify({ variant: 'voleny', sounds: false, pattern: 'modern' })]);
  await pg.reload();
  await pg.locator('#hand .card-btn img').first().waitFor({ timeout: 15000 });
  const srcs = async (): Promise<{ hand: string; back: string; select: string }> => pg.evaluate(`({
    hand: document.querySelector('#hand .card-btn img').getAttribute('src'),
    back: document.querySelector('.opp-row .backs img').getAttribute('src'),
    select: document.getElementById('set-pattern').value,
  })`);
  let s1 = await srcs();
  if (s1.select !== 'barevna' || !s1.hand.includes('/modern-barevna/') || !s1.back.includes('/modern-barevna/back.svg')) {
    await fail(`uložené „modern" se nenačetlo jako barevná (${JSON.stringify(s1)})`);
  }
  for (const [value, handDir, backDir] of [['lidova', '/modern-lidova/', '/modern-lidova/'], ['history', '/history/', '/modern-lidova/'], ['barevna', '/modern-barevna/', '/modern-barevna/']] as const) {
    await pg.click('#btn-settings');
    await pg.selectOption('#set-pattern', value);
    await pg.click('#settings-close');
    await pg.waitForTimeout(150);
    s1 = await srcs();
    if (!s1.hand.includes(handDir) || !s1.back.includes(`${backDir}back.svg`)) {
      await fail(`po volbě „${value}" ukazuje ruka ${s1.hand} a rub ${s1.back}`);
    }
  }
  const saved = await pg.evaluate(`JSON.parse(localStorage.getItem('flek.settings.v1')).pattern`);
  if (saved !== 'barevna') await fail(`nastavení si vzor neuložilo (${String(saved)})`);
  await pb.close();
  console.log('Vzor karet: barevná, lidová i historická přepnou ruku i ruby; staré „modern" = barevná');
}

/*
 * Telefon jako aplikace (§48): nahoře jen ☰ a ⚙, „Nová hra", nápověda, jazyky
 * a celá obrazovka se na telefonu stěhují do spodního menu — a po přechodu
 * na širokou obrazovku zpátky do lišty. Stěhování (ne kopie) je podstatné:
 * posluchače a id zůstávají jen jednou.
 */
{
  const mb = await chromium.launch();
  const ctx = await mb.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.goto(url);
  await pg.waitForSelector('#intro-panel', { state: 'visible' });
  const fail = async (msg: string): Promise<never> => {
    console.error(`CHYBA: menu telefonu — ${msg}`);
    await mb.close();
    await browser.close();
    process.exit(1);
  };
  const visible = async (sel: string): Promise<boolean> => pg.locator(sel).isVisible();
  if (!(await visible('#btn-menu')) || !(await visible('#btn-settings'))) await fail('v horní liště chybí ☰ nebo ⚙');
  if (await visible('#btn-new')) await fail('„Nová hra" je vidět i se zavřeným menu');
  await pg.click('#btn-menu');
  for (const sel of ['#menu-sheet #btn-new', '#menu-sheet #btn-help', '#menu-sheet .langpill button[data-lang="de"]']) {
    if (!(await visible(sel))) await fail(`v otevřeném menu chybí ${sel}`);
  }
  if ((await pg.locator('#btn-new').count()) !== 1) await fail('„Nová hra" je na stránce víckrát — stěhovat, ne kopírovat');
  // volba jazyka v menu přepne stránku a menu zavře
  await pg.click('#menu-sheet .langpill button[data-lang="de"]');
  await pg.waitForTimeout(150);
  const lang = await pg.evaluate(`document.documentElement.classList.contains('lang-de')`);
  if (!lang) await fail('vlajka v menu nepřepnula jazyk');
  if (await visible('#menu-sheet .sheet')) await fail('menu po volbě jazyka zůstalo otevřené');
  // tlačítko z menu dělá svou práci (nápověda se otevře)
  await pg.click('#btn-menu');
  await pg.click('#menu-sheet #btn-help');
  if (!(await visible('#help-float'))) await fail('nápověda z menu se neotevřela');
  await pg.keyboard.press('Escape');
  // široké okno: všechno zpátky v liště, ☰ pryč
  await pg.setViewportSize({ width: 1400, height: 900 });
  await pg.waitForTimeout(200);
  if (await visible('#btn-menu')) await fail('na desktopu zůstalo ☰');
  const home = await pg.evaluate(`['btn-new', 'btn-help', 'btn-fullscreen', 'lang-list'].every((id) => document.getElementById(id).closest('.game-controls'))`);
  if (!home || !(await visible('#btn-new'))) await fail('po rozšíření okna se ovládání nevrátilo do lišty');
  await mb.close();
  console.log('Menu telefonu: ☰ a ⚙ nahoře, v menu Nová hra, nápověda a jazyky; na desktopu zpátky v liště');
}

/*
 * Zúčtování na nízkém displeji: v Safari na šířku (s lištami) zbude na hru
 * ~200 px a panel je vyšší. Uživatel hlásil, že se k „Další hra" nedá dostat —
 * panel se musí dát doscrollovat a tlačítko pak musí být celé vidět a brát klik.
 */
{
  const lb = await chromium.launch();
  const save = mobileSave('voleny', 10, 'scored');
  for (const [w, h] of [[812, 220], [360, 640]] as const) {
    const ctx = await lb.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    pg.on('dialog', (d) => void d.accept());
    await pg.goto(url);
    await pg.evaluate(([match, settings]) => {
      localStorage.setItem('flek.match.v1', match);
      localStorage.setItem('flek.settings.v1', settings);
    }, [save, JSON.stringify({ variant: 'voleny', sounds: false })]);
    await pg.reload();
    await pg.locator('#center-float .felt-panel').first().waitFor({ timeout: 15000 });
    await pg.waitForTimeout(300);
    const r = (await pg.evaluate(`(() => {
      const panel = document.querySelector('#center-float .felt-panel');
      const btn = [...panel.querySelectorAll('.felt-actions button')].pop();
      // telefon (§48): tlačítka jsou přišpendlená dole — vidět i BEZ rolování
      const b0 = btn.getBoundingClientRect(), t0 = document.querySelector('#table').getBoundingClientRect();
      const pinned = b0.top >= t0.top - 1 && b0.bottom <= t0.bottom + 1;
      panel.scrollTop = panel.scrollHeight;
      const b = btn.getBoundingClientRect(), t = document.querySelector('#table').getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { inside: b.top >= t.top - 1 && b.bottom <= t.bottom + 1, hit: hit === btn || btn.contains(hit),
        label: btn.textContent.trim(), scrolls: panel.scrollHeight > panel.clientHeight, pinned };
    })()`)) as { inside: boolean; hit: boolean; label: string; scrolls: boolean; pinned: boolean };
    await ctx.close();
    if (!r.inside || !r.hit) {
      console.error(`CHYBA: zúčtování ${w}×${h} — „${r.label}" ${r.inside ? 'nebere klik' : 'není ani po doscrollování vidět'}`);
      await lb.close();
      process.exit(1);
    }
    if (!r.pinned) {
      console.error(`CHYBA: zúčtování ${w}×${h} — „${r.label}" je vidět až po doscrollování (tlačítka mají být přišpendlená dole)`);
      await lb.close();
      process.exit(1);
    }
    if (w === 812 && !r.scrolls) {
      console.error('CHYBA: zúčtování 812×220 — panel se vešel celý, takže scroll se neověřil (scénář potřebuje nižší okno)');
      await lb.close();
      process.exit(1);
    }
  }
  await lb.close();
  console.log('Zúčtování na nízkém displeji: tlačítka jsou vidět bez rolování, panel se dá doscrollovat a „Další hra" bere klik (812×220, 360×640)');
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
 * Sav, kde člověk v licitovaném HLÁSÍ závazek a má všech čtrnáct voleb (§45):
 * čtyři barvy, v každé „Hra" a co k ní jde, plus betl a durch. Seed 1: člověk
 * vydraží sedmu, ostatní pasují, odhodí první legální dvojici.
 */
function declareSave(): string {
  let st = apply(initialState(defaultConfig('licitovany'), 2), { type: 'deal', seed: 1 });
  for (let guard = 0; guard < 80 && st.phase.name !== 'tricks'; guard += 1) {
    const actor = ([0, 1, 2] as const).find((s) => legalActions(view(st, s)).length > 0);
    if (actor === undefined) break;
    const acts = legalActions(view(st, actor));
    if (actor === 0 && st.phase.name === 'declare') {
      if (acts.length !== 14) throw new Error(`scénář hlášení nedal 14 voleb, ale ${acts.length} — posunula ho úprava pravidel`);
      return JSON.stringify({ v: SAVE_VERSION, state: st });
    }
    st = apply(st, acts.find((a) => a.type === 'good')
      ?? acts.find((a) => a.type === 'bid' && a.bid === 'pass' && actor !== 0)
      ?? acts.find((a) => a.type === 'bid' && a.bid !== 'pass' && a.bid.kind === 'sedma' && actor === 0)
      ?? acts[0]);
  }
  throw new Error('scénář hlášení: člověk se k hlášení nedostal');
}

/**
 * Volený, člověk (forhont) odhazuje do talonu. `warnPair` je legální pár
 * s esem nebo desítkou (varování), `calmPair` legální pár bez varování.
 */
function discardScene(): { payload: string; warnPair: [number, number]; calmPair: [number, number] } {
  const payload = mobileSave('voleny', 10, 'discard-talon');
  const st = (JSON.parse(payload) as { state: ReturnType<typeof initialState> }).state;
  const v = view(st, 0);
  const pairs = legalActions(v).flatMap((a) => (a.type === 'discard' ? [a.cards as unknown as [number, number]] : []));
  const warnPair = pairs.find((p) => discardWarnings(v.hand, p as never, 'hra').some((w) => w.kind === 'valuable'));
  const calmPair = pairs.find((p) => discardWarnings(v.hand, p as never, 'hra').length === 0);
  if (warnPair === undefined || calmPair === undefined) throw new Error('scénář odhozu nemá pár s varováním i bez něj');
  return { payload, warnPair, calmPair };
}

/**
 * Sav pro mobilní kontrolu: první stav, kde je člověk na tahu v dané fázi.
 * Všichni hrají první legální akci, jen trumf volí kartou (ne „z lidu") a
 * flekují, co jde — ať se flekování potká. Volený seed 10: člověk je forhont.
 */
function mobileSave(
  variant: 'voleny' | 'licitovany', seed: number, phase: string,
  also: (st: ReturnType<typeof initialState>) => boolean = () => true,
): string {
  let st = apply(initialState(defaultConfig(variant), 2), { type: 'deal', seed });
  for (let guard = 0; guard < 200 && st.phase.name !== 'scored'; guard += 1) {
    const actor = ([0, 1, 2] as const).find((s) => legalActions(view(st, s)).length > 0);
    if (actor === undefined) break;
    if (actor === 0 && st.phase.name === phase && also(st)) return JSON.stringify({ v: SAVE_VERSION, state: st });
    const acts = legalActions(view(st, actor));
    st = apply(st, acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people')
      ?? acts.find((a) => a.type === 'flek') ?? acts[0]);
  }
  // zúčtování: na tahu už nikdo není, stačí dojít na konec
  if (phase === 'scored' && st.phase.name === 'scored') return JSON.stringify({ v: SAVE_VERSION, state: st });
  throw new Error(`mobilní scénář: člověk se na tah ve fázi ${phase} nedostal (${variant}, seed ${seed})`);
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
