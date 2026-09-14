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
}

await page.click('#actions .action-btn.primary');
await page.waitForSelector('#table.animating', { state: 'detached', timeout: 6000 });
const restartMs = Date.now() - restartStart;
if ((await page.locator('#hand .card-btn').count()) === 0) {
  console.error('CHYBA: po restartu uprostřed rozdávání se nerozdalo');
  await browser.close();
  process.exit(1);
}
// jedno rozdávání ≈ 1,3 s; kdyby nové čekalo za opuštěným, přibyly by ~2,5 s
if (restartMs > 4500) {
  console.error(`CHYBA: restart uprostřed rozdávání trval ${restartMs} ms — řetěz se zadrhl`);
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

await browser.close();

// vyčerpání smyčky NENÍ úspěch — jinak by test procházel, i když hra uvízne
if (!reachedSettlement) {
  console.error('CHYBA: hra nedošla k zúčtování (smyčka vyčerpána)');
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

async function tableClip(): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#game-section').boundingBox();
  return box ?? { x: 0, y: 0, width: 1200, height: 900 };
}
