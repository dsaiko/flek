/**
 * verify.ts — testy projektu (vzor mars: node:assert, spouští se `make verify`)
 *
 * Zatím: konzistence karetních sad. Poroste s enginem (viz docs/marias-design.md §8).
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { FIGURE_EMBLEM, SUIT_IDENT, suitArt, type SuitCode } from '../src/lib/ui/suitArt';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RANKS = ['7', '8', '9', 'T', 'U', 'O', 'K', 'D'];
const SUITS = ['A', 'B', 'H', 'L'];
const NAMES = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

function checkDeck(dir: string, ext: string): void {
  for (const name of NAMES) {
    assert.ok(existsSync(join(ROOT, dir, `${name}.${ext}`)), `${dir}/${name}.${ext} chybí`);
  }
  console.log(`PASS ${dir} — 32 karet (${ext})`);
}

// karetní sady — kompletnost a shodné pojmenování napříč sadami
checkDeck('cards/modern', 'svg');
checkDeck('cards/modern-en', 'svg');
// německá sada se servíruje německým hráčům (cardAssets.ts), takže musí projít
// týmiž kontrolami jako ostatní
checkDeck('cards/modern-de', 'svg');
checkDeck('cards/modern-fr', 'svg');
checkDeck('cards/history', 'png');
assert.ok(existsSync(join(ROOT, 'cards/modern/back.svg')), 'chybí rub moderní sady');

// EN sada má správné indexy (spodek→J, svršek→Q)
const uh = readFileSync(join(ROOT, 'cards/modern-en/UH.svg'), 'utf8');
const oh = readFileSync(join(ROOT, 'cards/modern-en/OH.svg'), 'utf8');
assert.match(uh, />J</, 'EN spodek má mít index J');
assert.match(oh, />Q</, 'EN svršek má mít index Q');
const uhCs = readFileSync(join(ROOT, 'cards/modern/UH.svg'), 'utf8');
assert.match(uhCs, />S</, 'CZ spodek má mít index S');
const uhFr = readFileSync(join(ROOT, 'cards/modern-fr/UH.svg'), 'utf8');
const ohFr = readFileSync(join(ROOT, 'cards/modern-fr/OH.svg'), 'utf8');
assert.match(uhFr, />V</, 'FR spodek má mít index V (valet)');
assert.match(ohFr, />D</, 'FR svršek má mít index D (dame)');
console.log('PASS indexy CZ (S V K A) / EN (J Q K A) / FR (V D R A)');

// SVG neobsahují externí reference (self-contained; xmlns namespace je v pořádku)
for (const set of ['cards/modern', 'cards/modern-en', 'cards/modern-de', 'cards/modern-fr']) {
  for (const f of readdirSync(join(ROOT, set)).filter((f) => f.endsWith('.svg'))) {
    const svg = readFileSync(join(ROOT, set, f), 'utf8');
    assert.doesNotMatch(svg, /(href|src)\s*=\s*"https?:/, `${set}/${f}: externí odkaz`);
    assert.doesNotMatch(svg, /url\(\s*['"]?https?:/, `${set}/${f}: externí url()`);
  }
}
console.log('PASS SVG bez externích referencí');

/*
 * Karty v `cards/**` jsou ZAKOMITOVANÝ výstup, ne build artefakt: `make cards`
 * v `make all` není. Bez téhle kontroly tedy úprava `suitArt.ts` změní ikonku
 * u popisku závazku v běžící hře, ale každá karta na stole zůstane stará —
 * a celá sada testů zůstane zelená. Přesně to rozejití (žilka listu měla
 * v generátoru tři tahy, v ikonce jeden) byl důvod, proč `suitArt.ts` vznikl.
 *
 * Král má na hrudi `mono` variantu, ne plnobarevnou — kontroluje se tedy proti
 * ní. Vynechat ho nestačí: `mono()` a jeho napojení na generátor se můžou
 * rozejít i tehdy, když se obrysy nehnou, a král je jediná karta, která tu
 * větev kreslí.
 */
{
  const setsOf = ['cards/modern', 'cards/modern-en', 'cards/modern-de', 'cards/modern-fr'];
  let checked = 0;
  for (const code of SUITS as SuitCode[]) {
    const art = suitArt(code);
    // tytéž volby, jakými emblém kreslí `figureBody` v gen-cards.ts
    const emblem = suitArt(code, { mono: FIGURE_EMBLEM, detail: SUIT_IDENT[code].color });
    for (const set of setsOf) {
      for (const rank of RANKS) {
        const svg = readFileSync(join(ROOT, set, `${rank}${code}.svg`), 'utf8');
        const want = rank === 'K' ? emblem : art;
        assert.ok(svg.includes(want), `${set}/${rank}${code}.svg nesedí se suitArt.ts — spusť \`make cards\``);
        checked += 1;
      }
    }
  }
  assert.equal(checked, setsOf.length * RANKS.length * SUITS.length, 'kontrola musí projít všechny sady');
  // index se do karty píše taky ze sdílené palety — jinak by se dal rozejít bez alarmu
  for (const code of SUITS as SuitCode[]) {
    const svg = readFileSync(join(ROOT, `cards/modern/7${code}.svg`), 'utf8');
    assert.ok(svg.includes(`fill="${SUIT_IDENT[code].index}"`), `index na 7${code} nesedí se SUIT_IDENT`);
  }
  console.log(`PASS karty — znaky i indexy v sadách sedí se suitArt.ts (${checked} karet)`);
}

// ── engine: kódování karet a pořadí ─────────────────────────────────────────

const { card, strength, pointsOf, suitOf, rankOf, sortHand } = await import('../src/lib/cards');
const { R7, R8, R9, R10, SPODEK, SVRSEK, KRAL, ESO, CERVENE } = await import('../src/lib/cards');
const { legalPlays, trickWinner, beats } = await import('../src/lib/rules/tricks');

const ZELENE = 1 as const;
const KULE = 2 as const;

{
  // barevná hra: eso > 10 > král > svršek > spodek > 9 > 8 > 7
  const order = [ESO, R10, KRAL, SVRSEK, SPODEK, R9] as const;
  for (let i = 0; i < order.length - 1; i += 1) {
    assert.ok(
      strength(card(CERVENE, order[i]), 'trump') > strength(card(CERVENE, order[i + 1]), 'trump'),
      `trump order ${i}`,
    );
  }
  // betl/durch: desítka MEZI spodkem a devítkou
  assert.ok(strength(card(CERVENE, SPODEK), 'natural') > strength(card(CERVENE, R10), 'natural'));
  assert.ok(strength(card(CERVENE, R10), 'natural') > strength(card(CERVENE, R9), 'natural'));
  // body
  assert.equal(pointsOf(card(KULE, ESO)), 10);
  assert.equal(pointsOf(card(KULE, R10)), 10);
  assert.equal(pointsOf(card(KULE, KRAL)), 0);
  // kódování
  const c = card(3, SVRSEK);
  assert.equal(suitOf(c), 3);
  assert.equal(rankOf(c), SVRSEK);
  assert.equal(sortHand([c, card(0, R7)]).length, 2);
  console.log('PASS cards — pořadí (vč. pasti desítky v betlu), body, kódování');
}

{
  // ── matice legality štychů (hra s trumfy = kule) ──
  const T = KULE;
  const play = (s: 0 | 1 | 2, c: number) => ({ seat: s, card: c });

  // ctít barvu a přebít: v ruce vyšší i nižší od barvy výnosu → jen vyšší
  let legal = legalPlays(
    [card(CERVENE, ESO), card(CERVENE, R7), card(ZELENE, KRAL)],
    [play(0, card(CERVENE, KRAL))], T, 'hra',
  );
  assert.deepEqual(legal.sort(), [card(CERVENE, ESO)], 'musí přebít v barvě');

  // nemá čím přebít → jakákoliv karta barvy výnosu
  legal = legalPlays(
    [card(CERVENE, R7), card(CERVENE, R9), card(ZELENE, ESO)],
    [play(0, card(CERVENE, KRAL))], T, 'hra',
  );
  assert.deepEqual(legal.sort((a, b) => a - b), [card(CERVENE, R7), card(CERVENE, R9)]);

  // štych už přebit trumfem → držitel barvy výnosu ji jen ctí (nic z barvy trumf nepřebije)
  legal = legalPlays(
    [card(CERVENE, ESO), card(CERVENE, R7)],
    [play(0, card(CERVENE, KRAL)), play(1, card(T, R7))], T, 'hra',
  );
  assert.deepEqual(legal.sort((a, b) => a - b), [card(CERVENE, R7), card(CERVENE, ESO)].sort((a, b) => a - b));

  // bez barvy → povinný trumf
  legal = legalPlays(
    [card(T, R8), card(ZELENE, ESO)],
    [play(0, card(CERVENE, KRAL))], T, 'hra',
  );
  assert.deepEqual(legal, [card(T, R8)], 'povinný trumf');

  // bez barvy, trumf vítězí → povinnost přetrumfnout, má-li čím
  legal = legalPlays(
    [card(T, ESO), card(T, R7), card(ZELENE, ESO)],
    [play(0, card(CERVENE, KRAL)), play(1, card(T, R9))], T, 'hra',
  );
  assert.deepEqual(legal, [card(T, ESO)], 'povinné přetrumfnutí');

  // bez barvy i trumfu → cokoliv
  legal = legalPlays(
    [card(ZELENE, R7), card(3, R8)],
    [play(0, card(CERVENE, KRAL))], T, 'hra',
  );
  assert.equal(legal.length, 2);

  // betl: desítka NEpřebíjí svrška (v barevné hře ano)
  assert.equal(beats(card(CERVENE, R10), card(CERVENE, SVRSEK), null, 'betl'), false);
  assert.equal(beats(card(CERVENE, R10), card(CERVENE, SVRSEK), KULE, 'hra'), true);
  // betl: bez povinného trumfu — mimo barvu cokoliv
  legal = legalPlays(
    [card(T, ESO), card(ZELENE, R7)],
    [play(0, card(CERVENE, KRAL))], null, 'betl',
  );
  assert.equal(legal.length, 2, 'betl nemá povinný trumf');

  console.log('PASS tricks — matice legality (přebití, trumfnutí, betl)');
}

{
  // ── vítěz štychu ──
  const T = KULE;
  const t = (a: number, b: number, c: number) =>
    [{ seat: 0 as const, card: a }, { seat: 1 as const, card: b }, { seat: 2 as const, card: c }];

  // vyšší v barvě vyhrává; desítka > král v barevné hře
  assert.equal(trickWinner(t(card(CERVENE, KRAL), card(CERVENE, R10), card(CERVENE, R9)), T, 'hra'), 1);
  // trumf přebíjí barvu; vyšší trumf přebíjí nižší
  assert.equal(trickWinner(t(card(CERVENE, ESO), card(T, R7), card(T, R8)), T, 'hra'), 2);
  // karta mimo výnos i trumf nevyhrává
  assert.equal(trickWinner(t(card(CERVENE, R8), card(ZELENE, ESO), card(CERVENE, R9)), T, 'hra'), 2);
  // betl: přirozené pořadí — svršek > desítka
  assert.equal(trickWinner(t(card(CERVENE, R10), card(CERVENE, SVRSEK), card(CERVENE, R9)), null, 'betl'), 1);

  console.log('PASS tricks — vítěz štychu ve všech režimech');
}

// ── scoring ──────────────────────────────────────────────────────────────────

{
  const { settle, kiloSteps, stepsToMultiplier } = await import('../src/lib/rules/scoring');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  type Seat = 0 | 1 | 2;

  const cfg = defaultConfig('voleny');
  const KULE_S = 2 as const;
  const base = { mode: 'hra' as const, trump: KULE_S as 0 | 1 | 2 | 3, declarer: 0 as Seat, sedma: null, kilo: null, dveSedmy: false };
  const trick = (winner: Seat, ...cards: [Seat, number][]) => ({
    plays: cards.map(([seat, c]) => ({ seat, card: c })),
    winner,
  });
  const zeroSum = (d: [number, number, number]) => assert.equal(d[0] + d[1] + d[2], 0, 'delta zero-sum');

  // hra: víc bodů vyhrává; obrana bere 10+10 za poslední štych
  let r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: {},
    tricks: [
      trick(0, [0, card(KULE_S, ESO)], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)]),
      trick(1, [1, card(CERVENE, R10)], [2, card(CERVENE, R9)], [0, card(CERVENE, R8)]),
    ],
    marriages: [],
  });
  assert.deepEqual(r.cardPoints, { declarer: 10, defenders: 20 });
  assert.equal(r.components[0].wonBy, 'defenders');
  assert.deepEqual(r.delta, [-2, 1, 1]);
  zeroSum(r.delta);

  // rovnost bodů → prohrává aktér
  r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: {},
    tricks: [
      trick(0, [0, card(KULE_S, ESO)], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)]),
      trick(1, [1, card(CERVENE, ESO)], [2, card(CERVENE, R9)], [0, card(CERVENE, R8)]),
    ],
    marriages: [],
  }); // aktér 10, obrana 10+10... ne — uprav: aktér 10 (eso) vs obrana 10 (eso) + 10 poslední = 20
  assert.equal(r.components[0].wonBy, 'defenders');

  // sedma hlášená aktérem — uhraná / zabitá
  const seven = card(KULE_S, R7);
  r = settle({
    handNo: 0, config: cfg, contract: { ...base, sedma: 0 }, flekLevels: {},
    tricks: [trick(0, [0, seven], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)])],
    marriages: [],
  });
  const sedmaComp = r.components.find((c) => c.target === 'sedma');
  assert.equal(sedmaComp?.wonBy, 'declarer');
  assert.equal(sedmaComp?.amount, 2);

  r = settle({
    handNo: 0, config: cfg, contract: { ...base, sedma: 0 }, flekLevels: { sedma: 1 },
    tricks: [trick(1, [0, seven], [1, card(KULE_S, R8)], [2, card(ZELENE, R8)])],
    marriages: [],
  });
  const zabita = r.components.find((c) => c.target === 'sedma');
  assert.equal(zabita?.wonBy, 'defenders');
  assert.equal(zabita?.note, 'zabitá sedma');
  assert.equal(zabita?.amount, 4, 'flek na sedmu ×2');

  // tichá sedma obránce (uhraná) — poloviční sazba, bez fleku
  r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: {},
    tricks: [trick(2, [2, seven], [0, card(ZELENE, R7)], [1, card(ZELENE, R8)])],
    marriages: [],
  });
  const ticha = r.components.find((c) => c.target === 'sedma');
  assert.equal(ticha?.wonBy, 'defenders');
  assert.equal(ticha?.silent, true);
  assert.equal(ticha?.amount, 1);

  // kilo: oficiální ČSM pravidla — do hranice jen JEDNA hláška, sazba za každých 10 bodů
  assert.deepEqual(kiloSteps(60, [40], 0), { fulfilled: true, steps: 1, measured: 100 });
  assert.deepEqual(kiloSteps(80, [20], 0), { fulfilled: true, steps: 1, measured: 100 });
  assert.deepEqual(kiloSteps(60, [40, 20], 0), { fulfilled: true, steps: 3, measured: 120 });
  assert.deepEqual(kiloSteps(90, [], 0), { fulfilled: false, steps: 1, measured: 90 }, 'sto bez hlášky nelze');
  assert.deepEqual(kiloSteps(50, [40], 20), { fulfilled: false, steps: 3, measured: 90 }, 'deficit + hlášky obrany');
  assert.equal(stepsToMultiplier(3, 'linear'), 3);
  assert.equal(stepsToMultiplier(3, 'double'), 4, 'hospodské zdvojnásobování');
  assert.equal(stepsToMultiplier(1, 'double'), 1);

  // kilo hlášené aktérem: 60 z karet + trumfová hláška (40) + další (20) → 120 → 3× sazba
  r = settle({
    handNo: 0, config: cfg, contract: { ...base, kilo: 0 }, flekLevels: {},
    tricks: [
      trick(0, [0, card(KULE_S, ESO)], [1, card(ZELENE, R10)], [2, card(CERVENE, R10)]),
      trick(0, [0, card(3, ESO)], [1, card(CERVENE, ESO)], [2, card(ZELENE, R9)]),
    ],
    marriages: [{ seat: 0, suit: KULE_S }, { seat: 0, suit: CERVENE }],
  });
  const kilo = r.components.find((c) => c.target === 'kilo');
  assert.equal(kilo?.wonBy, 'declarer');
  assert.equal(kilo?.amount, 4 * 3, 'kilo 120 → 3× sazba (linear)');
  assert.equal(kilo?.note, 'kilo 120');

  // kilo prohrané: 0 bodů → 10 kroků deficitu, vyhrává obrana
  r = settle({
    handNo: 0, config: cfg, contract: { ...base, kilo: 0 }, flekLevels: {},
    tricks: [trick(1, [1, card(KULE_S, ESO)], [2, card(ZELENE, R7)], [0, card(ZELENE, R8)])],
    marriages: [],
  });
  const kiloLost = r.components.find((c) => c.target === 'kilo');
  assert.equal(kiloLost?.wonBy, 'defenders');
  assert.equal(kiloLost?.amount, 4 * 10, 'deficit 100 → 10 kroků');

  // betl / durch
  r = settle({
    handNo: 0, config: cfg,
    contract: { ...base, mode: 'betl', trump: null }, flekLevels: {},
    tricks: [trick(1, [1, card(ZELENE, ESO)], [2, card(ZELENE, R7)], [0, card(ZELENE, R8)])],
    marriages: [],
  });
  assert.equal(r.components[0].target, 'betl');
  assert.equal(r.components[0].wonBy, 'declarer');
  assert.equal(r.components[0].amount, 15);
  assert.deepEqual(r.delta, [30, -15, -15]);
  zeroSum(r.delta);

  r = settle({
    handNo: 0, config: cfg,
    contract: { ...base, mode: 'durch', trump: null }, flekLevels: { durch: 1 },
    tricks: [trick(0, [0, card(ZELENE, ESO)], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)])],
    marriages: [],
  });
  assert.equal(r.components[0].amount, 60, 'durch 30 × flek 2');

  // červený trumf zdvojnásobuje barevné komponenty
  r = settle({
    handNo: 0, config: cfg, contract: { ...base, trump: CERVENE }, flekLevels: {},
    tricks: [trick(0, [0, card(CERVENE, ESO)], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)])],
    marriages: [],
  });
  assert.equal(r.components[0].amount, 2, 'červená hra ×2');

  console.log('PASS scoring — hra, sedma (hlášená/zabitá/tichá), kilo škálování, betl/durch, červené, fleky, zero-sum');

  // ── tiché sto (Obecná pravidla čl. V/6, sazebníky obou variant) ───────────
  /*
   * Do tichého sta se počítají VŠECHNY hlášky, ne jen nejvyšší (to je hranice
   * hlášeného sta, čl. IV/4). A neplatí se jako samostatný závazek: „zvyšuje
   * hodnotu vyflekované hry 2×".
   */
  assert.deepEqual(
    kiloSteps(60, [20, 20], 0, 'all'), { fulfilled: true, steps: 1, measured: 100 },
    'tiché sto počítá všechny hlášky',
  );
  assert.equal(kiloSteps(60, [20, 20], 0).fulfilled, false, 'hlášené sto měří jen nejvyšší hláškou');

  // 60 z karet + dvě nečervené hlášky (20+20) = přesně 100
  const silentTricks = [
    trick(0, [0, card(KULE_S, ESO)], [1, card(ZELENE, R7)], [2, card(ZELENE, R8)]),
    trick(0, [0, card(KULE_S, R10)], [1, card(ZELENE, R9)], [2, card(ZELENE, KRAL)]),
    trick(0, [0, card(CERVENE, ESO)], [1, card(CERVENE, R7)], [2, card(CERVENE, R8)]),
    trick(0, [0, card(CERVENE, R10)], [1, card(CERVENE, R9)], [2, card(CERVENE, KRAL)]),
    trick(0, [0, card(ZELENE, ESO)], [1, card(3, R7)], [2, card(3, R8)]),
  ];
  const silentMarriages = [{ seat: 0 as Seat, suit: ZELENE }, { seat: 0 as Seat, suit: 3 as 0 | 1 | 2 | 3 }];
  r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: {},
    tricks: silentTricks, marriages: silentMarriages,
  });
  assert.equal(r.cardPoints.declarer, 60, 'fixtura: 50 z karet + 10 za poslední štych');
  assert.equal(r.marriagePoints.declarer, 40, 'fixtura: dvě nečervené hlášky');
  assert.equal(r.components.length, 1, 'tiché sto NENÍ samostatná komponenta');
  assert.equal(r.components[0].target, 'hra');
  assert.equal(r.components[0].amount, 2, 'tiché sto zdvojnásobuje hru: 1 → 2 (ne 1 + 2)');
  assert.equal(r.components[0].note, 'tiché kilo 100');
  assert.deepEqual(r.delta, [4, -2, -2]);

  // flek na hru: tiché sto zdvojnásobuje až VYFLEKOVANOU hodnotu
  r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: { hra: 1 },
    tricks: silentTricks, marriages: silentMarriages,
  });
  assert.equal(r.components[0].amount, 4, 'flek 2× a tiché sto 2× → 4');

  // nad 100 náleží navíc sazba za tiché sto za každých 10 bodů (čl. V/6)
  r = settle({
    handNo: 0, config: cfg, contract: { ...base }, flekLevels: {},
    tricks: silentTricks,
    marriages: [...silentMarriages, { seat: 0 as Seat, suit: KULE_S as 0 | 1 | 2 | 3 }],
  });
  const silentBonus = r.components.find((c) => c.target === 'kilo');
  assert.equal(r.components[0].amount, 2, 'hra pořád jen zdvojnásobená');
  assert.ok(silentBonus?.silent, 'bonus nad 100 je tichá komponenta');
  assert.equal(silentBonus?.amount, 2 * 4, '140 bodů = 4 desítky nad 100 × sazba tichého sta 2');

  // hlášené sto se naopak sčítá s hrou (čl. V/2) a tiché se u něj neuplatní.
  // Hranici hlášeného sta nese JEDNA hláška, proto trumfová: 60 + 40 = 100.
  r = settle({
    handNo: 0, config: cfg, contract: { ...base, kilo: 0 }, flekLevels: {},
    tricks: silentTricks, marriages: [{ seat: 0 as Seat, suit: KULE_S as 0 | 1 | 2 | 3 }],
  });
  assert.equal(r.components.find((c) => c.target === 'hra')?.amount, 1, 'u hlášeného sta se hra nezdvojnásobuje');
  assert.equal(r.components.find((c) => c.target === 'kilo')?.amount, 4, 'hlášené sto za 100 = sazba 4');
  assert.deepEqual(r.delta, [10, -5, -5], 'hlášené sto přesně za 100 platí 1 + 4');
  console.log('PASS scoring — tiché sto: všechny hlášky, zdvojnásobení hry, bonus nad 100');

  // ── limit (čl. V/8, volený B/15, licitovaný II/18) ────────────────────────
  const durch = { ...base, mode: 'durch' as const, trump: null };
  // durch se musí UHRÁT, jinak platí aktér: deset štychů aktéra, karty 0..29
  const durchTricks = Array.from({ length: 10 }, (_, i) =>
    trick(0, [0, i * 3], [1, i * 3 + 1], [2, i * 3 + 2]));
  r = settle({
    handNo: 0, config: cfg, contract: durch, flekLevels: { durch: 5 },
    tricks: durchTricks, marriages: [],
  });
  assert.equal(r.components[0].amount, 30 * 32, 'kalhoty na durch = 960');
  assert.equal(r.limit, cfg.sazby.limit, 'nad limitem se musí strop zaznamenat');
  assert.deepEqual(r.delta, [1000, -500, -500], 'limit 500× od každého');

  // zapojili-li se do flekování oba obránci, platí zvýšený limit
  r = settle({
    handNo: 0, config: cfg, contract: durch, flekLevels: { durch: 5 },
    tricks: durchTricks, marriages: [], flekRaisers: [1, 2],
  });
  assert.equal(r.limit, cfg.sazby.limitRaised);
  assert.deepEqual(r.delta, [1500, -750, -750], 'zvýšený limit 750×');

  // pod limitem se nic nemění a v výsledku se o něm nemluví
  r = settle({
    handNo: 0, config: cfg, contract: durch, flekLevels: { durch: 3 },
    tricks: durchTricks, marriages: [],
  });
  assert.equal(r.limit, undefined, 'pod limitem se strop nezaznamenává');
  assert.deepEqual(r.delta, [480, -240, -240]);
  console.log('PASS scoring — limit 500×/750× stropí výslednou sazbu za hru');
}

// ── engine: self-play fuzz ───────────────────────────────────────────────────

{
  const { initialState, apply, replay } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { Random } = await import('../src/lib/random');
  const { pointsOf: pts } = await import('../src/lib/cards');
  type St = ReturnType<typeof initialState>;
  type Act = ReturnType<typeof legalActions>[number];

  const SEEDS = 60; // seedů na variantu; každý seed = celá odehraná hra
  for (const variant of ['voleny', 'licitovany'] as const) {
    const cfg = defaultConfig(variant);
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rng = new Random(seed * 7919);
      let s: St = initialState(cfg, 2);
      s = apply(s, { type: 'deal', seed });

      let steps = 0;
      while (s.phase.name !== 'scored') {
        steps += 1;
        assert.ok(steps < 500, `${variant}/${seed}: zaseknutá hra ve fázi ${s.phase.name}`);
        // najdi hráče na tahu (právě jeden má legální akce)
        let acts: Act[] = [];
        for (const seat of [0, 1, 2] as const) {
          const a = legalActions(view(s, seat));
          if (a.length > 0) { acts = a; break; }
        }
        assert.ok(acts.length > 0, `${variant}/${seed}: nikdo nemá legální akci (${s.phase.name})`);
        s = apply(s, acts[rng.int(acts.length)]);
      }

      // závěrečné kontroly odehrané hry
      const result = s.phase.result;
      assert.equal(result.delta[0] + result.delta[1] + result.delta[2], 0);
      if (result.contract.mode === 'hra') {
        const total = result.cardPoints.declarer + result.cardPoints.defenders;
        const autoSettled = result.components.some((c) => c.note === 'dobrá — nehrálo se');
        if (autoSettled) {
          assert.equal(total, 0);
          assert.equal(result.components[0].wonBy, 'declarer');
        } else {
          assert.equal(total, 90, `${variant}/${seed}: celkové body ${total} ≠ 90`);
        }
      }

      // redakce pohledu: žádný únik cizích karet
      for (const seat of [0, 1, 2] as const) {
        const v = view(s, seat);
        assert.equal(v.hand.length, s.hands[seat].length);
        assert.ok(v.talon === null || s.talonOwner === seat);
      }
    }

    // replay determinismus: přehraná historie = identický stav
    const rng = new Random(123);
    let s: St = initialState(cfg, 2);
    s = apply(s, { type: 'deal', seed: 42 });
    while (s.phase.name !== 'scored') {
      let acts: Act[] = [];
      for (const seat of [0, 1, 2] as const) {
        const a = legalActions(view(s, seat));
        if (a.length > 0) { acts = a; break; }
      }
      s = apply(s, acts[rng.int(acts.length)]);
    }
    const replayed = replay(s.history, cfg, 2);
    assert.deepEqual(replayed, s, `${variant}: replay nedává identický stav`);

    console.log(`PASS engine self-play — ${variant}: ${SEEDS} her + replay determinismus`);
  }

  void pts;
}

// ── AI: heuristiky + ISMCTS self-play ────────────────────────────────────────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { think } = await import('../src/lib/ai/think');
  const { Random } = await import('../src/lib/random');
  type St = ReturnType<typeof initialState>;

  const playHand = (
    variant: 'voleny' | 'licitovany',
    seed: number,
    difficulty: 'easy' | 'normal',
    iterations: number,
  ): St => {
    let s: St = initialState(defaultConfig(variant), 2);
    s = apply(s, { type: 'deal', seed });
    let steps = 0;
    while (s.phase.name !== 'scored') {
      steps += 1;
      if (steps > 300) throw new Error(`AI hra se zasekla (${variant}/${seed}, ${s.phase.name})`);
      for (const seat of [0, 1, 2] as const) {
        const v = view(s, seat);
        if (legalActions(v).length === 0) continue;
        const moveSeed = Random.derive(seed, steps * 3 + seat);
        const { action } = think({ view: v, difficulty, seed: moveSeed, budgetMs: 0, iterations });
        s = apply(s, action);
        break;
      }
    }
    return s;
  };

  // heuristiky (easy) — rychlé kompletní hry v obou variantách
  for (const variant of ['voleny', 'licitovany'] as const) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const s = playHand(variant, seed, 'easy', 0);
      const r = s.phase.name === 'scored' ? s.phase.result : null;
      assert.ok(r, `${variant}/${seed}: nedohráno`);
      assert.equal(r.delta[0] + r.delta[1] + r.delta[2], 0);
    }
  }
  console.log('PASS ai — heuristické self-play (12 her × 2 varianty)');

  // ISMCTS — malý pevný počet iterací, obě varianty
  for (const variant of ['voleny', 'licitovany'] as const) {
    for (let seed = 1; seed <= 3; seed += 1) {
      const s = playHand(variant, seed, 'normal', 40);
      assert.equal(s.phase.name, 'scored');
    }
  }
  console.log('PASS ai — ISMCTS self-play (40 iterací, 3 hry × 2 varianty)');

  // reprodukovatelnost: stejné seedy ⇒ identický průběh
  const a = playHand('voleny', 5, 'normal', 30);
  const b = playHand('voleny', 5, 'normal', 30);
  assert.deepEqual(a.history, b.history, 'AI není deterministická');
  console.log('PASS ai — determinismus (stejný seed ⇒ stejná hra)');
}

// ── match controller ─────────────────────────────────────────────────────────

{
  const { MatchController } = await import('../src/lib/match/controller');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { think } = await import('../src/lib/ai/think');
  const { playPolicy, decideAuction } = await import('../src/lib/ai/heuristics');
  const { Random } = await import('../src/lib/random');

  const driver = {
    think: async (req: Parameters<typeof think>[0] & { requestId: number }) =>
      think({ view: req.view, difficulty: 'easy', seed: req.seed, budgetMs: 0 }),
    cancel: () => {},
  };

  let seedCounter = 100;
  let saves = 0;
  /** akce, které ručně poslal test — cokoli navíc v historii udělal controller sám */
  const dispatchedByTest: string[] = [];
  const mc = new MatchController(driver, {
    config: defaultConfig('voleny'),
    humanSeat: 0,
    difficulty: 'easy',
    budgetMs: 0,
    seedSource: () => (seedCounter += 1),
    autosave: () => { saves += 1; },
    aiDelayMs: 0,
    autoGood: true,
  });

  // odehraj kompletní hry: člověk = heuristika volaná synchronně přes dispatch
  const HANDS = 2;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let hand = 0; hand < HANDS; hand += 1) {
    mc.dealNext();
    let guard = 0;
    while (mc.state.phase.name !== 'scored') {
      guard += 1;
      assert.ok(guard < 3000, 'controller: zaseknutý zápas');
      const actor = mc.actor();
      if (actor === 0) {
        const v = mc.humanView();
        const legalHuman = mc.humanLegal();
        // tytéž tři podoby „dobré", jaké zná `maybeAutoGood`
        const forced =
          legalHuman.length === 1 &&
          (legalHuman[0].type === 'good' ||
            (legalHuman[0].type === 'bid' && legalHuman[0].bid === 'pass') ||
            (legalHuman[0].type === 'takeover' && legalHuman[0].claim === 'good'));
        if (forced) {
          // NEdispatchovat ručně — vynucenou „dobrou" musí potvrdit maybeAutoGood
          const before = mc.state.history.length;
          for (let w = 0; w < 200 && mc.state.history.length === before; w += 1) await sleep(5);
          assert.ok(mc.state.history.length > before, 'auto-dobrá nepotvrdila vynucenou akci');
        } else {
          const rng = new Random(guard);
          const act = v.phase.name === 'tricks' ? playPolicy(v, rng) : decideAuction(v, 'easy', rng);
          dispatchedByTest.push(JSON.stringify(act));
          mc.dispatch(act);
        }
      } else {
        await sleep(2); // AI jede asynchronně přes driver
      }
    }
  }
  assert.equal(mc.state.handResults.length, HANDS);
  // každé apply → přesně jeden autosave (žádné magické číslo závislé na pravidlech)
  assert.equal(saves, mc.state.history.length, 'autosave neodpovídá počtu akcí');
  /*
   * Historie musí sedět na to, co poslal test: controller si žádnou akci
   * nepřimyslí. (Auto-dobrá sem po opravě pořadí komentování nespadá —
   * aktér už ke svému závazku v prvním kole nemluví, takže vynucená jediná
   * akce v náhodných rozdáních prakticky nepadne. Měří ji deterministicky
   * regrese i12 níž, a to počtem akcí v historii.)
   */
  const humanActions = mc.state.history.filter((a) => a.type !== 'deal' && a.seat === 0).length;
  assert.ok(humanActions >= dispatchedByTest.length, 'v historii chybí akce, které test poslal');
  assert.equal(mc.state.ledger[0] + mc.state.ledger[1] + mc.state.ledger[2], 0);
  mc.stop();
  console.log('PASS match controller — 2 hry: člověk (dispatch) + 2 AI (async driver), autosave');
}


// ── regrese: nálezy z fixpoint review-code (2026-08-24) ──────────────────────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions, actionMatchesLegal } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { discardWarnings } = await import('../src/lib/ui/discardWarnings');
  const { pointsOf: pts2, card: mk, CERVENE: CERV, KRAL: K, SVRSEK: SV, R7: S7, ESO: A } =
    await import('../src/lib/cards');
  type St = ReturnType<typeof initialState>;
  type Act = ReturnType<typeof legalActions>[number];

  const sleep2 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const actorOf = (st: St): 0 | 1 | 2 | null => {
    for (const seat of [0, 1, 2] as const) if (legalActions(view(st, seat)).length > 0) return seat;
    return null;
  };
  const actsOf = (st: St): Act[] => {
    const seat = actorOf(st);
    return seat === null ? [] : legalActions(view(st, seat));
  };

  // ── i27: „dobrá hra se nehraje" — přesná výplata i vypnutelnost ───────────
  const playToDecision = (cfg: ReturnType<typeof defaultConfig>, seed: number, flek = false): St => {
    let st: St = initialState(cfg, 2);
    st = apply(st, { type: 'deal', seed });
    let guard = 0;
    while (st.phase.name !== 'scored' && st.phase.name !== 'tricks') {
      if ((guard += 1) > 200) throw new Error('scénář prosté hry se zasekl');
      const acts = actsOf(st);
      const pick =
        acts.find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo) ??
        acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
        (flek ? acts.find((a) => a.type === 'flek' && a.target === 'hra') : undefined) ??
        acts.find((a) => a.type === 'good') ??
        acts.find((a) => a.type === 'discard' && a.cards.every((c) => pts2(c) === 0)) ??
        acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ??
        acts[0];
      st = apply(st, pick);
    }
    return st;
  };

  const cfgOn = defaultConfig('voleny');
  const settled = playToDecision(cfgOn, 3);
  assert.equal(settled.phase.name, 'scored', 'neflekovaná prostá hra se nemá hrát');
  if (settled.phase.name === 'scored') {
    const r = settled.phase.result;
    assert.equal(r.components.length, 1, 'auto-zúčtování má právě jednu komponentu');
    const comp = r.components[0];
    const cerveny = r.contract.trump === CERV ? cfgOn.sazby.cervenyMultiplier : 1;
    const amount = cfgOn.sazby.hra * cerveny;
    assert.equal(comp.target, 'hra');
    assert.equal(comp.wonBy, 'declarer');
    assert.equal(comp.flekMultiplier, 1);
    assert.equal(comp.amount, amount, 'auto-zúčtování platí základní sazbu');
    const d = r.contract.declarer;
    assert.equal(r.delta[d], 2 * amount, 'aktér inkasuje od obou soupeřů');
    assert.equal(r.delta[0] + r.delta[1] + r.delta[2], 0);
    assert.deepEqual(settled.ledger, r.delta);
  }

  /*
   * Flek A RE vynutí sehrávku (jinak by se flek „zdarma" pohltil základní
   * sazbou). `playToDecision` bere flek pokaždé, když ho může vzít, takže po
   * fleku obrany přijde re aktéra — a to už se hraje.
   */
  const flekked = playToDecision(cfgOn, 3, true);
  assert.equal(flekked.phase.name, 'tricks', 'flekovaná hra s re se musí hrát');
  const lvl: Record<string, number> = {};
  for (const a of flekked.history) if (a.type === 'flek') lvl[a.target] = (lvl[a.target] ?? 0) + 1;
  assert.ok((lvl.hra ?? 0) >= 2, 'scénář počítá s flekem i re — jinak by platilo B/19');

  // přepínač vypnutý → hraje se vždy
  const offSettled = playToDecision({ ...cfgOn, autoSettlePlainHra: false }, 3);
  assert.equal(offSettled.phase.name, 'tricks', 's vypnutým pravidlem se hra musí hrát');
  console.log('PASS regrese i27 — auto-zúčtování: výplata, flek vynutí hru, vypnutelnost');

  // ── i1: aktér smí přebrat vlastní hru durchem a nárok se nesmí zahodit ────
  {
    let st: St = initialState(cfgOn, 2);
    st = apply(st, { type: 'deal', seed: 11 });
    // volba trumfu + odhoz + prostá hra
    const step = (pred: (a: Act) => boolean, label: string) => {
      const acts = actsOf(st);
      const a = acts.find(pred);
      assert.ok(a, `scénář i1: chybí akce ${label}`);
      st = apply(st, a as Act);
    };
    step((a) => a.type === 'choose-trump' && a.card !== 'from-people', 'choose-trump');
    step((a) => a.type === 'discard' && a.cards.every((c) => pts2(c) === 0), 'discard');
    // „Barva?" — aktér nabídne hru bez trumfů JEŠTĚ PŘED deklarací (čl. VII/1)
    const declarer = actorOf(st);
    assert.equal(st.phase.name, 'takeover', 'po odhozu se ve voleném ptá „Barva?"');
    step((a) => a.type === 'takeover' && a.claim === 'good', 'Barva?');
    // obránce „sebere talon", odhodí a TEPRVE PAK ohlásí betl (čl. VII/1)
    step((a) => a.type === 'takeover' && a.claim === 'take', 'takeover take');
    step((a) => a.type === 'discard', 'odhoz přebírajícího');
    step((a) => a.type === 'declare' && a.mode === 'betl', 'declare betl');
    // z ohlášeného betla přebere durchem PŮVODNÍ aktér; druhý obránce pasuje
    let durchTaker: 0 | 1 | 2 | null = null;
    let guard = 0;
    while (st.phase.name === 'takeover') {
      if ((guard += 1) > 10) throw new Error('scénář i1 se zasekl');
      const actor = actorOf(st);
      if (actor === declarer && durchTaker === null) {
        durchTaker = actor;
        step((a) => a.type === 'takeover' && a.claim === 'durch', 'takeover durch');
      } else {
        step((a) => a.type === 'takeover' && a.claim === 'good', 'takeover good');
      }
    }
    assert.equal(durchTaker, declarer, 'scénář i1 vyžaduje, aby durch hlásil PŮVODNÍ aktér');
    assert.equal(st.contract?.mode, 'durch', 'durch nároku se nesmí zahodit');
    assert.equal(st.contract?.declarer, declarer, 'aktérem zůstává ten, kdo durch ohlásil');
    assert.equal(st.contract?.trump, null, 'durch nemá trumf');
    console.log('PASS regrese i1 — převzetí durchem (i vlastní hry) se zachová');
  }

  // ── i2/i6/i7: v licitovaném nesmí žádný legální odhoz zamknout deklaraci ──
  {
    let checkedDiscards = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      let st: St = initialState(defaultConfig('licitovany'), 2);
      st = apply(st, { type: 'deal', seed });
      let guard = 0;
      // dolicituj: kdo může, přihodí nejvyšší dostupný závazek (stresuje sedmy)
      while (st.phase.name === 'bidding') {
        if ((guard += 1) > 40) throw new Error('licitace se zasekla');
        const acts = actsOf(st);
        const bid = seed % 2 === 0
          ? acts.filter((a) => a.type === 'bid' && a.bid !== 'pass').pop()
          : acts.find((a) => a.type === 'bid' && a.bid !== 'pass');
        st = apply(st, bid ?? (acts.find((a) => a.type === 'bid') as Act));
      }
      if (st.phase.name !== 'discard-talon') continue;
      const discards = actsOf(st);
      assert.ok(discards.length > 0, `seed ${seed}: žádný legální odhoz`);
      for (const d of discards) {
        const after = apply(st, d);
        const acts = actsOf(after);
        assert.ok(
          acts.length > 0,
          `seed ${seed}: odhoz ${JSON.stringify(d)} zamkl fázi ${after.phase.name}`,
        );
        checkedDiscards += 1;
      }
    }
    assert.ok(checkedDiscards > 100, 'málo prověřených odhozů');
    console.log(`PASS regrese i2/i6/i7 — ${checkedDiscards} legálních odhozů, žádný deadlock`);
  }

  // ── i13: validace akcí nesmí ztrácet vnořená pole (bid) ──────────────────
  {
    const legalBids: Act[] = [
      { type: 'bid', seat: 0, bid: { kind: 'sedma', cervena: false } },
      { type: 'bid', seat: 0, bid: 'pass' },
    ];
    assert.equal(
      actionMatchesLegal({ type: 'bid', seat: 0, bid: { kind: 'sedma', cervena: false } }, legalBids),
      true,
    );
    assert.equal(
      actionMatchesLegal({ type: 'bid', seat: 0, bid: { kind: 'betl', cervena: false } }, legalBids),
      false,
      'jiný závazek nesmí projít jako shodný',
    );
    assert.equal(
      actionMatchesLegal({ type: 'bid', seat: 0, bid: { kind: 'sedma', cervena: true } }, legalBids),
      false,
      'červená varianta nesmí projít jako nečervená',
    );
    console.log('PASS regrese i13 — kanonické porovnání akcí včetně vnořeného bid');
  }


  // ── i8/i20: requestId se nesmí opakovat mezi controllery (sdílený driver) ─
  {
    const { MatchController: MC } = await import('../src/lib/match/controller');
    const seen: number[] = [];
    const spyDriver = {
      think: async (req: { requestId: number; view: unknown }) => {
        seen.push(req.requestId);
        // odpověď nikdy nepřijde — simuluje běžící výpočet zrušeného požadavku
        return new Promise<never>(() => {});
      },
      cancel: () => {},
    };
    const mkCtrl = () =>
      new MC(spyDriver as never, {
        config: defaultConfig('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
        seedSource: () => 42, aiDelayMs: 0,
      });
    for (let i = 0; i < 3; i += 1) {
      const c = mkCtrl();
      c.dealNext();
      // dotlač stav k tahu AI, ať driver dostane požadavek
      let guard = 0;
      while (c.actor() === 0 && guard++ < 50) {
        const acts = c.humanLegal();
        c.dispatch(acts[0]);
      }
      await sleep2(10);
      c.stop();
    }
    assert.ok(seen.length >= 3, `driver dostal jen ${seen.length} požadavků`);
    assert.equal(new Set(seen).size, seen.length, `requestId se opakují: ${seen.join(',')}`);
    console.log(`PASS regrese i8/i20 — ${seen.length} požadavků, žádná kolize requestId`);
  }

  // ── i30: varování před odhozem ──────────────────────────────────────────
  {
    const hand = [mk(CERV, K), mk(CERV, SV), mk(1, A), mk(2, S7), mk(3, S7)];
    assert.deepEqual(discardWarnings(hand, [mk(2, S7), mk(3, S7)]), [], 'nezávadný odhoz nevaruje');
    assert.deepEqual(discardWarnings(hand, [mk(1, A), mk(2, S7)]), [{ kind: 'valuable' }]);
    assert.deepEqual(discardWarnings(hand, [mk(CERV, K), mk(2, S7)]), [{ kind: 'marriage', suit: CERV }]);
    assert.deepEqual(
      discardWarnings(hand, [mk(CERV, K), mk(CERV, SV)]),
      [{ kind: 'marriage', suit: CERV }],
      'odhoz obou půlek hlášky musí varovat také',
    );

    /*
     * Vysoutěžený betl/durch: odhodit eso je přesně to, co se má udělat (zákaz
     * platí jen „u závazků s ustanovením trumfové barvy", Obecná pravidla Čl.
     * IV/11) a hlášky se v nich nepočítají (Čl. IV/1). Varovat není o čem.
     */
    for (const mode of ['betl', 'durch'] as const) {
      assert.deepEqual(discardWarnings(hand, [mk(1, A), mk(2, S7)], mode), [], `${mode}: eso do talonu nevaruje`);
      assert.deepEqual(
        discardWarnings(hand, [mk(CERV, K), mk(CERV, SV)], mode), [],
        `${mode}: hláška v talonu nevaruje`,
      );
    }
    assert.deepEqual(
      discardWarnings(hand, [mk(1, A), mk(2, S7)], 'hra'), [{ kind: 'valuable' }],
      'v barevné hře varování zůstává',
    );
    assert.deepEqual(
      discardWarnings(hand, [mk(1, A), mk(2, S7)], null), [{ kind: 'valuable' }],
      'dokud závazek nepadl, varuje se pořád (volený odhazuje před deklarací)',
    );
    console.log('PASS regrese i30 — varování odhozu (eso/desítka, hláška; v betlu/durchu mlčí)');
  }
}


// ── regrese: druhé kolo fixpoint review-code (2026-08-24, po 293dbfc) ───────

{
  const { initialState, apply, assertValid } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { MatchController: MC2 } = await import('../src/lib/match/controller');
  const { decideAuction: decide2, trumpScore } = await import('../src/lib/ai/heuristics');
  const { Random: Rnd } = await import('../src/lib/cards').then(() => import('../src/lib/random'));
  const { card: mk2, CERVENE: CE, R7: S7b, ESO: Ab, R10: Tb, KRAL: Kb, SVRSEK: SVb } =
    await import('../src/lib/cards');
  type St = ReturnType<typeof initialState>;
  type Act = ReturnType<typeof legalActions>[number];
  const nap = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  // ── sedmový závazek: nečervený stačí JAKÁKOLI sedma, červený jen červená ─
  {
    const base = defaultConfig('licitovany');
    const mkView = (hand: number[]): Parameters<typeof legalActions>[0] => ({
      seat: 0, config: base, dealer: 2, hand, handCounts: [10, 10, 10],
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null, contract: null,
      phase: { name: 'bidding', bids: [], toAct: 0, best: null },
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    });
    // ruka, kde JEDINÁ sedma je červená
    const onlyRedSeven = [mk2(CE, S7b), mk2(1, Ab), mk2(1, Tb), mk2(2, Kb), mk2(2, SVb),
      mk2(3, Ab), mk2(3, Tb), mk2(1, Kb), mk2(2, Ab), mk2(3, Kb)];
    const bidKinds = (hand: number[]): string[] =>
      legalActions(mkView(hand))
        .flatMap((a) => (a.type === 'bid' && a.bid !== 'pass' ? [`${a.bid.kind}${a.bid.cervena ? '-č' : ''}`] : []));
    const kinds = bidKinds(onlyRedSeven);
    /*
     * Vysoutěžený stupeň je MINIMUM (Obecná pravidla čl. VII/3, §25), a červená
     * sedma stojí v žebříčku NAD nečervenou (licitovaný čl. I). Kdo drží červenou
     * sedmu, umí tedy pokrýt i nečervený sedmový závazek — ohlásí červenou
     * variantu. Dřív se mu nenabízel a hráč s červenou sedmou nemohl začít
     * licitaci nejnižším stupněm.
     */
    assert.ok(kinds.includes('sedma'), `s červenou sedmou má jít licitovat i nečervená sedma: ${kinds.join(',')}`);
    assert.ok(kinds.includes('sto-sedma'), 's červenou sedmou má jít licitovat i nečervené sto a sedma');
    assert.ok(kinds.includes('sedma-č'), 'červená sedma se s červenou sedmou nabídnout má');
    // …a bez jakékoli sedmy se sedmový závazek nenabízí vůbec (omyl neúčtujeme)
    const noSeven = [mk2(CE, Ab), mk2(CE, Tb), mk2(1, Ab), mk2(1, Tb), mk2(2, Kb), mk2(2, SVb),
      mk2(3, Ab), mk2(3, Tb), mk2(1, Kb), mk2(3, Kb)];
    const kindsNoSeven = bidKinds(noSeven);
    for (const forbidden of ['sedma', 'sedma-č', 'sto-sedma', 'sto-sedma-č']) {
      assert.ok(!kindsNoSeven.includes(forbidden), `bez sedmy se „${forbidden}" licitovat nesmí`);
    }
    assert.ok(kindsNoSeven.includes('sto'), 'sto bez sedmy licitovat lze');
    // „dvě sedmy" se nesmí nabízet vůbec (scoring je neumí)
    assert.ok(!kinds.some((k) => k.startsWith('dve-sedmy')), 'dvě sedmy se nesmí licitovat');
    const twoSevens = [mk2(CE, S7b), mk2(1, S7b), ...onlyRedSeven.slice(1, 9)];
    const kinds2 = bidKinds(twoSevens);
    assert.ok(kinds2.includes('sedma'), 's nečervenou sedmou se nečervená sedma nabídnout má');
    assert.ok(!kinds2.some((k) => k.startsWith('dve-sedmy')), 'dvě sedmy se nesmí licitovat ani se dvěma sedmami');
    // a nečervená sedma na červený závazek nestačí — ten chce právě tu červenou
    const onlyGreenSeven = [mk2(1, S7b), ...onlyRedSeven.slice(1, 10)];
    const kinds3 = bidKinds(onlyGreenSeven);
    assert.ok(kinds3.includes('sedma'), 's nečervenou sedmou jde nečervená sedma');
    assert.ok(!kinds3.includes('sedma-č'), 'červenou sedmu bez červené sedmy licitovat nelze');
    assert.ok(!kinds3.includes('sto-sedma-č'), 'červené sto a sedma bez červené sedmy licitovat nelze');

    /*
     * A hlavně: vysoutěžená nečervená sedma JDE s červenou sedmou pokrýt —
     * deklarace nabídne sedmu v červené. Bez toho by nová větev vedla na
     * zaseknutou hru bez legální akce.
     */
    const declareView = {
      ...mkView([mk2(CE, S7b), mk2(CE, Kb), mk2(CE, SVb), mk2(1, Ab), mk2(1, Tb),
        mk2(2, Kb), mk2(2, SVb), mk2(3, Ab), mk2(3, Kb), mk2(3, SVb)]),
      talon: [mk2(1, Kb), mk2(2, S7b)],
      phase: {
        name: 'declare' as const,
        standing: { declarer: 0 as const, mode: null, trump: null, bid: { kind: 'sedma' as const, cervena: false } },
      },
    } as Parameters<typeof legalActions>[0];
    const declares = legalActions(declareView).flatMap((a) => (a.type === 'declare' ? [a] : []));
    assert.ok(declares.length > 0, 'vysoutěžená sedma musí jít deklarovat');
    assert.ok(
      declares.some((a) => a.sedma && a.trump === CE),
      'pokrytí nečervené sedmy = ohlásit sedmu v červené',
    );
    console.log('PASS licitace — sedmový závazek podle sedem v ruce (nečervený i z červené)');
  }

  // ── i19: house rule talonForbidsTrump — filtr odhozu ho musí respektovat ──
  {
    const cfg = { ...defaultConfig('licitovany'), talonForbidsTrump: true };
    let checked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      let st: St = initialState(cfg, 2);
      st = apply(st, { type: 'deal', seed });
      let guard = 0;
      while (st.phase.name === 'bidding') {
        if ((guard += 1) > 40) throw new Error('licitace se zasekla');
        const seat = ([0, 1, 2] as const).find((x) => legalActions(view(st, x)).length > 0)!;
        const acts = legalActions(view(st, seat));
        st = apply(st, acts.find((a) => a.type === 'bid' && a.bid !== 'pass') ?? acts[0]);
      }
      if (st.phase.name !== 'discard-talon') continue;
      for (const d of legalActions(view(st, st.phase.standing.declarer))) {
        const after = apply(st, d);
        const seatAfter = ([0, 1, 2] as const).find((x) => legalActions(view(after, x)).length > 0);
        assert.ok(seatAfter !== undefined, `talonForbidsTrump: odhoz zamkl fázi ${after.phase.name}`);
        // pravidlo musí být VYNUCENÉ: žádná nabídnutá hra nesmí mít trumf,
        // jehož barva leží v talonu (a talon nesmí obsahovat bodované karty)
        // jen barevný závazek (u betla/durcha smí talon obsahovat cokoli)
        if (after.phase.name === 'declare' && after.phase.standing.mode === null) {
          const talonSuits = new Set(after.talon.map((c) => c >> 3));
          const standingTrump: number | null = after.phase.standing.trump;
          assert.ok(!after.talon.some((c) => (c & 7) === 7 || (c & 7) === 3), 'eso/desítka v talonu u barevného závazku');
          for (const a of legalActions(view(after, after.phase.standing.declarer))) {
            if (a.type !== 'declare' || a.mode !== 'hra') continue;
            const tr: number | null = a.trump ?? standingTrump;
            assert.ok(tr !== null, 'hra bez trumfu');
            assert.ok(!talonSuits.has(tr as number), `talonForbidsTrump nevynuceno: trumf ${tr} leží v talonu`);
          }
        }
        checked += 1;
      }
    }
    assert.ok(checked > 50, `talonForbidsTrump: prověřeno jen ${checked} odhozů`);
    console.log(`PASS regrese i19 — talonForbidsTrump: ${checked} odhozů bez deadlocku`);
  }

  // ── i24: „Barva?" se ptá aktér, teprve pak odpovídá obrana ───────────────
  {
    /*
     * Odpovědi jdou ve směru hraní OD AKTÉRA (čl. V/4, B/11) — tady je aktérem
     * forhont (dealer 0 → forhont 1), takže pořadí [2, 0] vyjde stejně jako
     * podle dřívějšího pravidla „od forhonta". Rozlišující případ (aktér ≠
     * forhont) hlídá test „pořadí mluvení jde od toho, kdo hlásil" níž.
     */
    let st: St = initialState(defaultConfig('voleny'), 0);
    st = apply(st, { type: 'deal', seed: 5 });
    const step = (pred: (a: Act) => boolean) => {
      const seat = ([0, 1, 2] as const).find((x) => legalActions(view(st, x)).length > 0)!;
      const a = legalActions(view(st, seat)).find(pred);
      assert.ok(a, 'chybí očekávaná akce');
      st = apply(st, a as Act);
    };
    step((a) => a.type === 'choose-trump' && a.card !== 'from-people');
    // bez esa a desítky v talonu, jinak aktérovi zbude jen betl/durch (C/13)
    step((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0));
    // „Barva?" je na aktérovi (sedadlo 1), teprve pak odpovídá obrana
    assert.equal(st.phase.name, 'takeover', 'převzetí se řeší hned po odhozu (čl. VII/1)');
    if (st.phase.name === 'takeover') assert.equal(st.phase.toAct, 1, 'ptá se aktér');
    step((a) => a.type === 'takeover' && a.claim === 'good');
    if (st.phase.name === 'takeover') assert.equal(st.phase.toAct, 2, 'první odpovídá sedadlo 2 (po forhontovi)');
    step((a) => a.type === 'takeover' && a.claim === 'good');
    if (st.phase.name === 'takeover') assert.equal(st.phase.toAct, 0, 'druhý odpovídá sedadlo 0');
    step((a) => a.type === 'takeover' && a.claim === 'good');
    assert.equal(st.phase.name, 'declare', 'po souhlasu obou obránců teprve hlásí aktér');
    console.log('PASS regrese i24 — „Barva?" od aktéra, odpovědi obrany ve směru hraní');
  }

  // ── i22: AI volí trumf podle ruky, ne první nabídnutý (ani červenou) ─────
  {
    const cfg = defaultConfig('licitovany');
    // dlouhé silné zelené, červené slabé → trumf musí být zelený
    const hand = [mk2(1, Ab), mk2(1, Tb), mk2(1, Kb), mk2(1, SVb), mk2(1, S7b),
      mk2(CE, 1), mk2(CE, 2), mk2(2, 1), mk2(3, 1), mk2(3, 2)];
    assert.ok(trumpScore(hand, 1) > trumpScore(hand, CE), 'zelená musí skórovat výš než červená');
    const v = {
      seat: 0, config: cfg, dealer: 2, hand, handCounts: [10, 10, 10],
      revealedTrump: null, unseenCount: 0,
      talonKnown: [], talon: [mk2(2, 0), mk2(2, 2)], // sedma a devítka kulová — nic bodovaného
      contract: null,
      phase: { name: 'declare' as const, standing: { declarer: 0 as const, mode: null, trump: null, bid: null } },
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    };
    const picked = decide2(v as never, 'normal', new Rnd(1));
    assert.equal(picked.type, 'declare');
    if (picked.type === 'declare') {
      assert.equal(picked.mode, 'hra');
      assert.equal(picked.trump, 1, `AI zvolila trumf ${picked.trump}, čekáno zelenou (1)`);
    }
    console.log('PASS regrese i22 — AI volí nejlepší trumf, ne naslepo červenou');
  }

  // ── i17: obnova po selhání AI (nelegální tah / pád driveru / mrtvý fallback)
  {
    const mkCtrl = (
      driver: { think: (r: never) => Promise<never>; cancel: () => void },
      fallbackPolicy?: () => never,
    ) =>
      new MC2(driver as never, {
        config: defaultConfig('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
        seedSource: () => 7, aiDelayMs: 0, autoGood: true,
        ...(fallbackPolicy ? { fallbackPolicy } : {}),
      });

    // (a) driver vrací NELEGÁLNÍ tah → záložní politika hru dotáhne
    const badDriver = {
      think: async () => ({ action: { type: 'good', seat: 1 }, stats: { iterations: 0, elapsedMs: 0, evaluations: [] } }),
      cancel: () => {},
    };
    const cA = mkCtrl(badDriver as never);
    cA.dealNext();
    for (let i = 0; i < 400 && cA.state.handResults.length === 0; i += 1) {
      await nap(3);
      if (cA.actor() === 0) {
        const acts = cA.humanLegal();
        // jedinou akci `good` si bere `autoGood` sám; jediný VYNUCENÝ výnos ale
        // musí zahrát test, jinak hra uvízne a kontrola tiše neproběhne
        if (acts.length > 1 || (acts.length === 1 && acts[0].type !== 'good')) cA.dispatch(acts[0]);
      }
    }
    assert.equal(cA.state.handResults.length, 1, 'hra se s nelegálními tahy AI musí dotáhnout přes fallback');
    cA.stop();

    // (b) driver padá (odmítne) → totéž
    const throwingDriver = { think: async () => { throw new Error('worker mrtvý'); }, cancel: () => {} };
    const cB = mkCtrl(throwingDriver as never);
    cB.dealNext();
    for (let i = 0; i < 400 && cB.state.handResults.length === 0; i += 1) {
      await nap(3);
      if (cB.actor() === 0) {
        const acts = cB.humanLegal();
        // jedinou akci `good` si bere `autoGood` sám; jediný VYNUCENÝ výnos ale
        // musí zahrát test, jinak hra uvízne a kontrola tiše neproběhne
        if (acts.length > 1 || (acts.length === 1 && acts[0].type !== 'good')) cB.dispatch(acts[0]);
      }
    }
    assert.equal(cB.state.handResults.length, 1, 'hra se po pádu driveru musí dotáhnout přes fallback');
    cB.stop();

    // (c) selže i záložní politika → smyčka se zastaví, NEcyklí (strop)
    let fallbackCalls = 0;
    const cC = mkCtrl(throwingDriver as never, (() => {
      fallbackCalls += 1;
      throw new Error('fallback mrtvý');
    }) as never);
    cC.dealNext();
    // dotlač hru až k tahu AI (jinak se fallback vůbec nezavolá)
    for (let i = 0; i < 40 && cC.actor() === 0; i += 1) {
      const pick = cC.humanLegal().find((a) => a.type !== 'deal');
      if (!pick) break;
      try { cC.dispatch(pick); } catch { break; }
      await nap(2);
    }
    await nap(200);
    assert.ok(fallbackCalls > 0, 'záložní politika se nezavolala');
    assert.ok(fallbackCalls <= 4, `smyčka se zacyklila (${fallbackCalls} volání)`);
    cC.stop();
    console.log(`PASS regrese i17 — obnova AI: nelegální tah, pád driveru, strop (${fallbackCalls} pokusů)`);
  }

  // ── i18/i8: validace obnoveného stavu ───────────────────────────────────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch, clearMatch } = await import('../src/lib/match/persist');

    // pravý stav projde a je hodnotově shodný
    let st: St = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 9 });
    saveMatch(st);
    assert.deepEqual(loadMatch(), JSON.parse(JSON.stringify(st)), 'kolotoč save→load musí projít');

    const raw = () => store.get('flek.match.v1') as string;
    const withState = (mutate: (s: Record<string, unknown>) => void): void => {
      const parsed = JSON.parse(raw()) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    saveMatch(st); withState((x) => { delete x.talonKnowledge; });
    assert.equal(loadMatch(), null, 'chybějící pole musí být odmítnuto');

    saveMatch(st); withState((x) => { x.phase = { name: 'neexistuje' }; });
    assert.equal(loadMatch(), null, 'neznámá fáze musí být odmítnuta');

    saveMatch(st); withState((x) => { x.ledger = [1, 2, 3]; });
    assert.equal(loadMatch(), null, 'nenulové konto (nesplněný invariant) musí být odmítnuto');

    saveMatch(st); withState((x) => { (x.hands as number[][])[0] = [1, 1, 1]; });
    assert.equal(loadMatch(), null, 'duplikované karty musí být odmítnuty');

    saveMatch(st); withState((x) => { (x.hands as number[][])[0] = [99]; });
    assert.equal(loadMatch(), null, 'karta mimo rozsah musí být odmítnuta');

    store.set('flek.match.v1', '{nevalidní json');
    assert.equal(loadMatch(), null, 'poškozený JSON musí být odmítnut');
    store.set('flek.match.v1', JSON.stringify({ v: 99, state: st }));
    assert.equal(loadMatch(), null, 'jiná verze musí být odmítnuta');
    store.set('flek.match.v1', JSON.stringify({ v: 1, state: { cizí: 'objekt' } }));
    assert.equal(loadMatch(), null, 'cizí objekt musí být odmítnut');

    clearMatch();
    assert.equal(loadMatch(), null, 'po clearMatch nesmí nic zůstat');
    delete (globalThis as { localStorage?: unknown }).localStorage;
    void assertValid;
    console.log('PASS regrese i18/i8 — validace savu: tvar, neznámá fáze, invarianty, poškozený JSON');
  }
}


// ── regrese: třetí kolo fixpoint review-code (2026-08-24, po 5782606) ───────

{
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { deriveConstraints } = await import('../src/lib/ai/determinize');
  const { card: mk3, CERVENE: CE3, R7: S73, KRAL: K3, SVRSEK: SV3 } = await import('../src/lib/cards');
  const nap2 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  // ── i25: esc() escapuje vše, co jde do innerHTML ──────────────────────────
  {
    const { esc } = await import('../src/lib/ui/table');
    assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(esc('a & b'), 'a &amp; b');
    assert.equal(esc('"quoted"'), '&quot;quoted&quot;');
    assert.equal(esc("it's"), 'it&#39;s');
    assert.equal(esc('</script><script>x()</script>'), '&lt;/script&gt;&lt;script&gt;x()&lt;/script&gt;');
    assert.equal(esc(42), '42');
    assert.equal(esc('čistý text'), 'čistý text');
    console.log('PASS regrese i25 — esc() escapuje HTML metaznaky (obnovený sav je nedůvěryhodný)');
  }

  // ── i26/i36: workerDriver — zrušení, neopakování, watchdog ───────────────
  {
    interface FakeMsg { type: string; requestId: number }
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      posted: FakeMsg[] = [];
      terminated = false;
      constructor() { FakeWorker.instances.push(this); }
      postMessage(m: FakeMsg): void { this.posted.push(m); }
      terminate(): void { this.terminated = true; }
    }
    const g = globalThis as { Worker?: unknown };
    const orig = g.Worker;
    g.Worker = FakeWorker as never;
    const { createWorkerDriver } = await import('../src/lib/match/workerDriver');
    const req = (requestId: number, budgetMs = 5000) => ({
      requestId, view: {} as never, difficulty: 'easy' as const, seed: 1, budgetMs,
    });
    const stats = { iterations: 0, elapsedMs: 0, evaluations: [] };
    const thinkCount = (w: FakeWorker): number => w.posted.filter((m) => m.type === 'think').length;

    // (a) normální odpověď se vyřídí
    FakeWorker.instances.length = 0;
    const dA = createWorkerDriver();
    const pA = dA.think(req(1));
    const wA = FakeWorker.instances[0];
    assert.equal(thinkCount(wA), 1, 'požadavek se má odeslat workeru');
    wA.onmessage?.({ data: { type: 'move', requestId: 1, action: { type: 'good', seat: 1 }, stats } });
    assert.equal((await pA).action.type, 'good');

    // (b) cancel odmítne CancelledError, NEopakuje a uvolní zaneprázdněný worker
    FakeWorker.instances.length = 0;
    const dB = createWorkerDriver();
    const pB = dB.think(req(2));
    const wB = FakeWorker.instances[0];
    dB.cancel(2);
    await assert.rejects(pB, (e: Error) => e.name === 'CancelledError', 'cancel musí promise ODMÍTNOUT');
    assert.equal(thinkCount(wB), 1, 'zrušený požadavek se nesmí opakovat');
    assert.equal(wB.terminated, true, 'opuštěné hledání nesmí blokovat další požadavky');

    // (c) pád workeru → jeden retry na čerstvém workeru
    FakeWorker.instances.length = 0;
    const dC = createWorkerDriver();
    const pC = dC.think(req(3));
    const wC1 = FakeWorker.instances[0];
    wC1.onerror?.();
    await nap2(5);
    assert.equal(FakeWorker.instances.length, 2, 'po pádu workeru se má zkusit čerstvý');
    const wC2 = FakeWorker.instances[1];
    assert.equal(thinkCount(wC2), 1, 'retry pošle požadavek znovu');
    wC2.onmessage?.({ data: { type: 'move', requestId: 3, action: { type: 'good', seat: 2 }, stats } });
    assert.equal((await pC).action.type, 'good');

    // (d) watchdog: mlčící worker → zabít a odmítnout VŠECHNY čekající (i19)
    //
    // Klíč testu (i38): druhý požadavek má DLOUHÝ budget, takže jeho vlastní
    // watchdog by se ještě neozval. Když ho po zabití workeru někdo nevyhodí,
    // zůstane viset na mrtvém workeru navždy. Pozorovatelný důsledek
    // hromadného odmítnutí = OBA požadavky se zopakují na čerstvém workeru.
    FakeWorker.instances.length = 0;
    const dD = createWorkerDriver();
    // zahřátí: worker existuje, další požadavky tedy nemají startovní toleranci
    const warm = dD.think(req(9));
    const wWarm = FakeWorker.instances[0];
    wWarm.onmessage?.({ data: { type: 'move', requestId: 9, action: { type: 'good', seat: 0 }, stats } });
    await warm;

    const pD1 = dD.think(req(4, 0));
    const pD2 = dD.think(req(5, 60_000));
    const wD = FakeWorker.instances[FakeWorker.instances.length - 1];
    assert.deepEqual(
      wD.posted.filter((m) => m.type === 'think').map((m) => m.requestId).sort(),
      [4, 5, 9], 'oba nové požadavky mají čekat na TÉMŽE (zahřátém) workeru',
    );
    await nap2(2150); // budgetMs 0 + GRACE_MS 2000
    assert.equal(wD.terminated, true, 'watchdog má mlčící worker ukončit');
    const wD2 = FakeWorker.instances[FakeWorker.instances.length - 1];
    assert.notEqual(wD2, wD, 'retry po watchdogu má vzniknout na novém workeru');
    const retried = wD2.posted.filter((m) => m.type === 'think').map((m) => m.requestId).sort();
    assert.deepEqual(retried, [4, 5], `watchdog musí odmítnout OBA čekající (opakováno: ${retried.join(',')})`);
    // dokonči, ať nic nevisí
    for (const id of [4, 5]) {
      wD2.onmessage?.({ data: { type: 'move', requestId: id, action: { type: 'good', seat: 1 }, stats } });
    }
    await Promise.all([pD1, pD2]);

    if (orig === undefined) delete g.Worker; else g.Worker = orig;
    console.log('PASS regrese i26/i36/i19 — driver: cancel odmítá bez retry, watchdog čistí vše');
  }

  // ── i5/i6: determinizace zná odhalený trumf a hlášenou sedmu ─────────────
  {
    const cfg = defaultConfig('voleny');
    const trumpCard = mk3(2, 5); // kulový svršek — ukázaná trumfová karta
    const mkView = (sedmaSeat: 0 | 1 | 2 | null) => ({
      seat: 1 as const, config: cfg, dealer: 2 as const,
      hand: [mk3(CE3, K3), mk3(CE3, SV3)], handCounts: [2, 2, 2],
      // obránce ukázanou kartu NEVIDÍ (leží lícem dolů) — view() mu pošle null
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: sedmaSeat, kilo: null, dveSedmy: false },
      phase: { name: 'tricks' as const, trickNo: 0, leader: 0 as const, toAct: 1 as const,
        trick: [], played: [], won: [[], [], []] as [number[], number[], number[]], marriages: [] },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    });

    /*
     * Zvolená karta leží stranou LÍCEM DOLŮ (ČSM, Obecná pravidla Čl. VII/1),
     * takže ji obránce nezná a AI si na ni nesmí vyrobit omezení. Dřív tu
     * omezení bylo — a znamenalo, že AI přesně ví, kterou kartu forhont drží.
     */
    const c1 = deriveConstraints(mkView(null) as never);
    assert.equal(c1.allowed.get(trumpCard), undefined, 'AI nesmí znát kartu ležící lícem dolů');

    // sedma hlášená OBRÁNCEM (sedadlo 2) → drží trumfovou sedmu jistě
    const c2 = deriveConstraints(mkView(2) as never);
    assert.ok(c2.mustHave[2].has(mk3(2, S73)), 'sedma proti ⇒ obránce drží trumfovou sedmu');

    // totéž po převzetí betlem, ať už přebírající talon bere nebo ne
    const betlContract = { mode: 'betl' as const, trump: null, declarer: 2 as const, sedma: null, kilo: null, dveSedmy: false };
    for (const takeover of ['keep', 'retake'] as const) {
      const c = deriveConstraints({
        ...mkView(null), config: { ...cfg, talonOnTakeover: takeover }, contract: betlContract,
      } as never);
      assert.equal(c.allowed.get(trumpCard), undefined, `„${takeover}" — karta lícem dolů zůstává neznámá`);
    }

    // sedma hlášená AKTÉREM → deklarace je až PO odhozu, takže je JISTĚ v ruce
    const c3 = deriveConstraints(mkView(0) as never);
    assert.ok(c3.mustHave[0].has(mk3(2, S73)), 'hlášená sedma aktéra je jistě v jeho ruce');
    assert.equal(c3.allowed.has(mk3(2, S73)), false, 'sedma aktéra nesmí padnout do talonu');
    console.log('PASS regrese i5/i6 — determinizace: odhalený trumf a hlášená sedma');
  }
}


// ── regrese: páté kolo fixpoint review-code (2026-08-25, po 4b29631) ────────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: pts5 } = await import('../src/lib/cards');
  type St5 = ReturnType<typeof initialState>;
  type Act5 = ReturnType<typeof legalActions>[number];
  const acts5 = (st: St5): Act5[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  // ── i50: house rule talonOnTakeover='keep' — přebírající talon NEbere ────
  {
    const run = (mode: 'retake' | 'keep'): St5 => {
      const cfg = { ...defaultConfig('voleny'), talonOnTakeover: mode };
      let st: St5 = initialState(cfg, 2);
      st = apply(st, { type: 'deal', seed: 11 });
      const step = (pred: (a: Act5) => boolean, label: string): void => {
        const a = acts5(st).find(pred);
        assert.ok(a, `scénář i50 (${mode}): chybí akce ${label}`);
        st = apply(st, a as Act5);
      };
      step((a) => a.type === 'choose-trump' && a.card !== 'from-people', 'choose-trump');
      step((a) => a.type === 'discard' && a.cards.every((c) => pts5(c) === 0), 'discard');
      // „Barva?" (čl. VII/1) — převzetí se řeší JEŠTĚ PŘED deklarací
      step((a) => a.type === 'takeover' && a.claim === 'good', 'Barva?');
      // hru přebere OBRÁNCE: „sebere talon" — právě tuhle větev 'keep' řeší
      step((a) => a.type === 'takeover' && a.claim === 'take', 'takeover take');
      // 'retake': talon v ruce, odhazuje; 'keep': talon leží, rovnou volí
      // (`st` mění closure `step`, takže se porovnává přes string — jinak TS zúží typ fáze)
      const phaseName = (): string => st.phase.name;
      if (mode === 'retake') {
        assert.equal(phaseName(), 'discard-talon', 'při „retake" přebírající nejdřív odhazuje');
        step((a) => a.type === 'discard', 'odhoz přebírajícího');
      }
      assert.equal(phaseName(), 'declare', 'druh hry bez trumfů se volí až s talonem');
      step((a) => a.type === 'declare' && a.mode === 'betl', 'declare betl');
      let guard = 0;
      while (st.phase.name === 'takeover') {
        if ((guard += 1) > 10) throw new Error(`scénář i50 (${mode}) se zasekl`);
        step((a) => a.type === 'takeover' && a.claim === 'good', 'takeover good');
      }
      return st;
    };

    // talonOwner před převzetím (view() z něj rozhoduje, kdo smí talon vidět)
    const ownerBefore = (() => {
      let st: St5 = initialState({ ...defaultConfig('voleny'), talonOnTakeover: 'keep' }, 2);
      st = apply(st, { type: 'deal', seed: 11 });
      const ct = acts5(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people');
      st = apply(st, ct as Act5);
      const d = acts5(st).find((a) => a.type === 'discard' && a.cards.every((c) => pts5(c) === 0));
      st = apply(st, d as Act5);
      return st.talonOwner;
    })();

    const keep = run('keep');
    assert.equal(keep.contract?.mode, 'betl', 'betl obránce musí platit');
    assert.equal(keep.phase.name, 'fleks', 'při „keep" se talon znovu neodhazuje — rovnou fleky');
    assert.deepEqual(
      keep.hands.map((h) => h.length), [10, 10, 10],
      'při „keep" nikdo talon nezvedá (10/10/10)',
    );
    assert.equal(keep.talon.length, 2, 'talon zůstává odložený');
    assert.notEqual(keep.contract?.declarer, 0, 'scénář vyžaduje, aby přebíral obránce');
    assert.equal(keep.talonOwner, ownerBefore, 'talonOwner se při „keep" nemění (kdo smí vidět talon)');

    const retake = run('retake');
    assert.equal(retake.phase.name, 'fleks', 'po odhozu a ohlášení betla se flekuje');
    assert.equal(retake.contract?.mode, 'betl');
    assert.notEqual(retake.contract?.declarer, 0, 'scénář vyžaduje, aby přebíral obránce');
    assert.deepEqual(retake.hands.map((h) => h.length), [10, 10, 10], 'po odhozu má každý 10');
    assert.equal(retake.talonOwner, retake.contract?.declarer, 'při „retake" talon odhodil přebírající');
    assert.ok(
      retake.talonKnowledge[retake.contract?.declarer as 0 | 1 | 2].length >= 2,
      'přebírající zvednutý talon viděl',
    );
    console.log('PASS regrese i50 — talonOnTakeover: „keep" nechá talon ležet, „retake" ho předá');
  }

  // ── i1/i2: heuristiky — díry v betlu a nepřebíjení vlastního parťáka ─────
  {
    const { betlHoles, playPolicy } = await import('../src/lib/ai/heuristics');
    const { card: mk5, CERVENE: CE5, R7: S75, R8: S85, R9: S95, R10: T5, ESO: A5 } =
      await import('../src/lib/cards');
    const { Random: Rnd5 } = await import('../src/lib/random');
    const ZE5 = 1 as const; // zelené

    // 7-8-9 v jedné barvě = tři nejnižší karty ⇒ žádná díra
    assert.equal(betlHoles([mk5(CE5, S75), mk5(CE5, S85), mk5(CE5, S95)]), 0, 'nejnižší trojice nemá díru');
    // samotné eso je díra (pod ním leží sedm cizích karet)
    assert.equal(betlHoles([mk5(CE5, A5)]), 1, 'osamocené eso je díra');
    // sedma + eso: sedma je bezpečná, eso ne
    assert.equal(betlHoles([mk5(CE5, S75), mk5(CE5, A5)]), 1, 'sedma kryje, eso ne');
    // díry se počítají po barvách nezávisle
    assert.equal(betlHoles([mk5(CE5, A5), mk5(ZE5, A5)]), 2, 'dvě barvy, dvě díry');

    /*
     * Aktér vede eso, obránce (sedadlo 2) je poslední ve štychu a drží krále
     * i devítku téže barvy. Přebít nemůže (eso je nejvyšší), takže maže co
     * nejlevněji; klíčové je, že NEmaže body do štychu, který bere protistrana.
     */
    const vDef = {
      seat: 2 as const, config: defaultConfig('voleny'), dealer: 2 as const,
      // desítka v ruce JE — jinak by tvrzení „nemaže body" nic netestovalo
      hand: [mk5(CE5, T5), mk5(CE5, S95)], handCounts: [2, 2, 2], revealedTrump: null, unseenCount: 0,
      talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      phase: {
        name: 'tricks' as const, trickNo: 8, leader: 0 as const, toAct: 2 as const,
        trick: [{ seat: 0 as const, card: mk5(CE5, A5) }, { seat: 1 as const, card: mk5(CE5, S85) }],
        played: [], won: [[], [], []] as [number[], number[], number[]], marriages: [],
      },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    };
    const pick = playPolicy(vDef as never, new Rnd5(1));
    assert.equal(pick.type, 'play');
    if (pick.type === 'play') {
      assert.equal(pick.card, mk5(CE5, S95), 'do cizího štychu se body nemažou (desítku si nechá)');
    }

    /*
     * Táž pozice, ale vedoucí kartu drží PARŤÁK obránce (sedadlo 1 zahrálo eso,
     * aktér 0 podložil osmičku). Obránce nesmí parťáka přebíjet — a smí mu
     * naopak přimazat body, protože štych bere jeho strana.
     */
    const vPartner = {
      ...vDef,
      phase: {
        ...vDef.phase,
        leader: 1 as const,
        trick: [{ seat: 1 as const, card: mk5(CE5, A5) }, { seat: 0 as const, card: mk5(CE5, S85) }],
      },
    };
    const pick2 = playPolicy(vPartner as never, new Rnd5(1));
    assert.equal(pick2.type, 'play');
    if (pick2.type === 'play') {
      assert.equal(pick2.card, mk5(CE5, T5), 'do parťákova štychu se body naopak mažou');
    }
    console.log('PASS regrese i1/i2 — betlHoles počítá díry, AI nepřebíjí vlastní stranu');
  }

  // ── i5: v licitaci smí dřívější mluvčí DRŽET stejný závazek ──────────────
  {
    const cfg = defaultConfig('licitovany');
    const mkBid = (dealer: 0 | 1 | 2, me: 0 | 1 | 2, bids: { seat: 0 | 1 | 2; bid: unknown }[]) => ({
      seat: me, config: cfg, dealer, hand: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], handCounts: [10, 10, 10],
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null, contract: null,
      phase: {
        name: 'bidding' as const, toAct: me,
        bids, best: { kind: 'sedma', cervena: false }, passed: [],
      },
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    });
    // dealer 2 ⇒ pořadí mluvení 0, 1, 2. Sedmu drží sedadlo 1.
    // závazek je dvojice kind+červená (černá sedma ≠ červená sedma)
    const bids5 = (v: unknown): string[] =>
      legalActions(v as never)
        .filter((a) => a.type === 'bid' && a.bid !== 'pass')
        .map((a) => (a.type === 'bid' && a.bid !== 'pass' ? `${a.bid.kind}${a.bid.cervena ? '-č' : ''}` : ''));

    const earlier = bids5(mkBid(2, 0, [{ seat: 1, bid: { kind: 'sedma', cervena: false } }]));
    assert.ok(earlier.includes('sedma'), 'dřívější mluvčí (0) smí sedmu držet, ne jen přebít');

    const later = bids5(mkBid(2, 2, [{ seat: 1, bid: { kind: 'sedma', cervena: false } }]));
    assert.equal(later.includes('sedma'), false, 'pozdější mluvčí (2) musí přebít výš');
    assert.ok(later.includes('sedma-č'), 'pozdějšímu mluvčímu zůstává červená sedma');
    assert.ok(later.length > 0, 'pozdější mluvčí má stále co licitovat');
    console.log('PASS regrese i5 — držení stejného závazku má jen dřívější mluvčí');
  }

  // ── i43/i49: popisky jdoucí do innerHTML (escapování + jméno fleku) ──────
  {
    const { targetLabel, bidLabel, bubbleText } = await import('../src/lib/ui/table');
    const { flekName } = await import('../src/lib/ui/i18n');

    // neznámý cíl/závazek z podvrženého savu se NESMÍ dostat do HTML syrový
    const evil = '<img src=x onerror=alert(1)>';
    assert.equal(targetLabel(evil).includes('<'), false, 'targetLabel musí escapovat neznámý cíl');
    assert.ok(targetLabel(evil).includes('&lt;img'), 'targetLabel má escapovat, ne mazat');
    assert.equal(targetLabel('hra').includes('&lt;'), false, 'známý cíl se překládá, ne escapuje');
    assert.equal(bidLabel({ kind: evil, cervena: false }).includes('<'), false, 'bidLabel musí escapovat');
    assert.ok(bidLabel({ kind: 'betl', cervena: false }).startsWith('Betl'), 'známý závazek má svůj překlad');

    // jméno fleku: historie už obsahuje TENTO flek ⇒ jméno je na indexu count−1
    const mkFlekState = (n: number) => ({
      history: [
        { type: 'deal' as const },
        ...Array.from({ length: n }, (_, i) => ({
          type: 'flek' as const, seat: (i % 3) as 0 | 1 | 2, target: 'hra' as const,
        })),
      ],
    });
    const flekAct = { type: 'flek' as const, seat: 0 as const, target: 'hra' as const };
    // ve větě „flek NA hru" se vykřičník nehodí, proto se u jména odřízne
    const word = (level: number): string => flekName(level).replace(/!$/, '');
    for (const [count, level] of [[1, 0], [2, 1], [3, 2]] as const) {
      const text = bubbleText(flekAct as never, mkFlekState(count) as never) as string;
      assert.ok(text.startsWith(word(level)), `${count}. flek se hlásí jako „${word(level)}": ${text}`);
      assert.equal(text.includes('!'), false, `hlášení fleku ve větě nemá vykřičník: ${text}`);
    }
    // 4. pád: „na hru", ne „na Hra"
    const cs = bubbleText(flekAct as never, mkFlekState(1) as never) as string;
    assert.ok(cs.endsWith('na hru'), `flek se hlásí na 4. pád: ${cs}`);
    assert.equal(targetLabel('sedma'), 'sedmu', 'sedma ve 4. pádě');
    assert.equal(targetLabel('betl'), 'betla', 'betl ve 4. pádě');
    console.log('PASS regrese i43/i49 — popisky escapují a flek se hlásí správným jménem');
  }

  // ── i36/i44/i45: sav — negativní pokrytí archivu i známých fází ──────────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');

    let st: St5 = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 5 });
    const withState = (mutate: (s: Record<string, unknown>) => void): void => {
      saveMatch(st);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    // (i36/i44) archiv výsledků: pravý projde, podvržený s HTML v note ne
    const comp = {
      target: 'hra', wonBy: 'declarer', baseRate: 1, flekMultiplier: 1, extraMultiplier: 1,
      amount: 1, silent: false, note: 'čistá výhra',
    };
    const goodResult = {
      handNo: 0,
      contract: { mode: 'hra', trump: 2, declarer: 0, sedma: null, kilo: null, dveSedmy: false },
      cardPoints: { declarer: 60, defenders: 30 },
      marriagePoints: { declarer: 0, defenders: 0 },
      components: [comp],
      delta: [2, -1, -1],
    };
    withState((x) => { x.handResults = [goodResult]; });
    assert.ok(loadMatch(), 'poctivý archivní výsledek musí projít');

    withState((x) => { x.handResults = [{ ...goodResult, components: [{ ...comp, note: 42 }] }]; });
    assert.equal(loadMatch(), null, 'note musí být řetězec (jde do innerHTML)');

    withState((x) => { x.handResults = [{ ...goodResult, contract: { mode: 'zlodějina' } }]; });
    assert.equal(loadMatch(), null, 'archivní kontrakt musí být platný');

    withState((x) => { x.handResults = [{ ...goodResult, components: 'nic' }]; });
    assert.equal(loadMatch(), null, 'components musí být pole');

    withState((x) => { x.handResults = [{ ...goodResult, delta: [1, 1, 1] }]; });
    assert.equal(loadMatch(), null, 'archiv s nenulovým součtem delt musí být odmítnut');

    withState((x) => { x.handResults = ['<img src=x onerror=alert(1)>']; });
    assert.equal(loadMatch(), null, 'řetězec místo výsledku musí být odmítnut');

    // (i45) známá fáze s poškozeným payloadem — typeof null === 'object'
    withState((x) => {
      x.phase = { name: 'fleks', fleks: { levels: null, lastRaiser: {}, toAct: 0, passed: [] } };
    });
    assert.equal(loadMatch(), null, 'fleks.levels = null musí být odmítnuto');

    withState((x) => {
      x.phase = { name: 'fleks', fleks: { levels: {}, lastRaiser: null, toAct: 0, passed: [] } };
    });
    assert.equal(loadMatch(), null, 'fleks.lastRaiser = null musí být odmítnuto');

    withState((x) => {
      x.phase = { name: 'tricks', trickNo: 0, leader: 0, toAct: 0, trick: null, played: [], won: [[], [], []], marriages: [] };
    });
    assert.equal(loadMatch(), null, 'tricks.trick = null musí být odmítnuto');

    withState((x) => { x.contract = { mode: 'zlodějina', trump: null, declarer: 0, sedma: null, kilo: null, dveSedmy: false }; });
    assert.equal(loadMatch(), null, 'neznámý mód kontraktu musí být odmítnut');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i36/i44/i45 — sav: archiv i payloady známých fází');
  }

  // ── i47: determinizace karty opravdu UMÍSŤUJE podle omezení ─────────────
  {
    const { determinize } = await import('../src/lib/ai/determinize');
    const { Random } = await import('../src/lib/random');
    const { card: mk6, CERVENE: CE6, R7: S76, R8: S86, R9: S96, KRAL: K6, SVRSEK: SV6 } =
      await import('../src/lib/cards');
    const ZE6 = 1 as const; // zelené

    const trumpCard = mk6(2, SV6); // kulový svršek — veřejně ukázaný trumf
    const seven = mk6(2, S76); // kulová sedma — hlášená aktérem
    // realistická pozice před posledními třemi štychy: 3+3+3 v rukou, 2 v talonu,
    // 21 karet je odehráno (jinak by se determinizace neměla do čeho trefit)
    const myHand = [mk6(CE6, K6), mk6(CE6, SV6), mk6(ZE6, S86)];
    const unseen = [trumpCard, seven, mk6(ZE6, S76), mk6(ZE6, S96), mk6(3, S76), mk6(3, S86), mk6(3, S96), mk6(CE6, S76)];
    const rest = Array.from({ length: 32 }, (_, i) => i).filter(
      (c) => !myHand.includes(c) && !unseen.includes(c),
    );
    assert.equal(rest.length, 21, 'scénář i47: 21 odehraných karet');
    const won: [number[], number[], number[]] = [rest.slice(0, 7), rest.slice(7, 14), rest.slice(14, 21)];

    const v = {
      seat: 1 as const, config: defaultConfig('voleny'), dealer: 2 as const,
      // obránce zvolenou kartu nevidí (leží lícem dolů) — view() mu pošle null
      hand: myHand, handCounts: [3, 3, 3], revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: 0 as const, kilo: null, dveSedmy: false },
      phase: {
        name: 'tricks' as const, trickNo: 7, leader: 0 as const, toAct: 1 as const,
        trick: [], played: rest, won, marriages: [],
      },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    };

    let trumpAtDefender = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const d = determinize(v as never, new Random(seed));
      // konzervace karet
      const all = [...d.hands[0], ...d.hands[1], ...d.hands[2], ...d.talon];
      assert.equal(new Set(all).size, all.length, `seed ${seed}: karta dvakrát`);
      assert.deepEqual(d.hands[1].slice().sort((a, b) => a - b), v.hand.slice().sort((a, b) => a - b),
        `seed ${seed}: moje ruka se nesmí měnit`);
      assert.deepEqual(d.hands.map((h) => h.length), [3, 3, 3], `seed ${seed}: velikosti rukou`);
      assert.equal(d.talon.length, 2, `seed ${seed}: talon má dvě karty`);
      // hlášená sedma aktéra: v jeho ruce, nikdy jinde
      assert.ok(d.hands[0].includes(seven), `seed ${seed}: hlášená sedma patří aktérovi`);
      assert.equal(d.talon.includes(seven), false, `seed ${seed}: sedma nesmí do talonu`);
      if (d.hands[2].includes(trumpCard)) trumpAtDefender += 1;
    }
    /*
     * Zvolená karta leží lícem dolů, takže ji AI nezná a musí ji vzorkovat
     * volně — kdyby ji pořád umísťovala k volícímu, byla by to stará znalost
     * cizí karty. Přes 60 seedů musí aspoň jednou padnout i obránci.
     */
    assert.ok(trumpAtDefender > 0, 'karta lícem dolů se musí vzorkovat volně, ne vždy k volícímu');
    void S96;
    console.log('PASS regrese i47 — determinizace umísťuje ukázaný trumf i hlášenou sedmu');
  }

  // ── i27: dvojklik nesmí zabít rozmyšlený tah AI ─────────────────────────
  {
    const { MatchController: MC5 } = await import('../src/lib/match/controller');
    const nap5 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    let cancels = 0;
    const driver = {
      think: async (r: { requestId: number }) => {
        await nap5(30);
        return { action: null as never, stats: { iterations: 0, elapsedMs: 0, evaluations: [] }, requestId: r.requestId };
      },
      cancel: () => { cancels += 1; },
    };
    const ctrl = new MC5(driver as never, {
      config: defaultConfig('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
      seedSource: () => 7, aiDelayMs: 0, autoGood: false,
    });
    ctrl.dealNext();
    const first = ctrl.humanLegal().find((a) => a.type === 'choose-trump' && a.card !== 'from-people');
    assert.ok(first, 'scénář i27 čeká volbu trumfu');
    ctrl.dispatch(first as never);
    const before = cancels;
    // druhý (už nelegální) klik na tutéž akci — typický dvojklik
    assert.throws(() => ctrl.dispatch(first as never), /.*/, 'nelegální akce musí vyhodit chybu');
    assert.equal(cancels, before, 'odmítnutá akce nesmí zrušit běžící hledání AI');
    ctrl.stop();
    console.log('PASS regrese i27 — dispatch nejdřív ověří, teprve pak ruší AI');
  }
}


// ── regrese: páté kolo fixpoint review-code (2026-08-25, po 959131f) ────────

{
  const { initialState, apply, assertValid } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: pts6 } = await import('../src/lib/cards');
  type St6 = ReturnType<typeof initialState>;
  type Act6 = ReturnType<typeof legalActions>[number];
  const acts6 = (st: St6): Act6[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  /** Dotáhne hru do sehrávky a odehraje `plays` karet (aspoň jeden celý štych). */
  const playIntoTricks = (seed: number, plays: number): St6 => {
    const cfg = { ...defaultConfig('voleny'), autoSettlePlainHra: false };
    let st: St6 = initialState(cfg, 2);
    st = apply(st, { type: 'deal', seed });
    let guard = 0;
    while (st.phase.name !== 'tricks' && st.phase.name !== 'scored') {
      if ((guard += 1) > 200) throw new Error('scénář sehrávky se zasekl');
      const a = acts6(st);
      const pick =
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => pts6(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ??
        a.find((x) => x.type === 'takeover' && x.claim === 'good') ??
        a.find((x) => x.type === 'good') ??
        a[0];
      st = apply(st, pick);
    }
    assert.equal(st.phase.name, 'tricks', 'scénář vyžaduje sehrávku');
    for (let i = 0; i < plays; i += 1) {
      const a = acts6(st).find((x) => x.type === 'play');
      if (!a) break;
      st = apply(st, a);
    }
    return st;
  };

  // ── i1/i3/i5/i25: sav MUSÍ přežít dohraný štych (kritická regrese) ───────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');

    const mid = playIntoTricks(3, 5); // dva dohrané štychy + rozehraný třetí
    assert.equal(mid.phase.name, 'tricks');
    if (mid.phase.name === 'tricks') {
      assert.ok(mid.phase.played.length >= 1, 'scénář vyžaduje aspoň jeden dohraný štych');
      assert.ok(mid.phase.trick.length >= 1, 'scénář vyžaduje i rozehraný štych');
    }
    saveMatch(mid);
    assert.deepEqual(
      loadMatch(), JSON.parse(JSON.stringify(mid)),
      'rozehraná sehrávka se musí dát obnovit (jinak se autosave tiše zahazuje)',
    );

    // a ještě pozdní fáze — poslední štych
    const late = playIntoTricks(3, 27);
    saveMatch(late);
    assert.ok(loadMatch(), 'sav z konce sehrávky se musí dát obnovit');

    const withState = (mutate: (s: Record<string, unknown>) => void, from: St6 = mid): void => {
      saveMatch(from);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    // `played` jsou dohrané ŠTYCHY, ne karty — obojí musí být rozlišené
    withState((x) => { (x.phase as Record<string, unknown>).played = [1, 2, 3]; });
    assert.equal(loadMatch(), null, 'pole karet místo dohraných štychů musí být odmítnuto');
    withState((x) => {
      (x.phase as Record<string, unknown>).played = [{ plays: [{ seat: 0, card: 1 }], winner: 0 }];
    });
    assert.equal(loadMatch(), null, 'štych o jedné kartě musí být odmítnut');

    // ── i6: hodnoty karet ve štychu neprošly ani jednou vrstvou ────────────
    withState((x) => {
      const ph = x.phase as Record<string, unknown>;
      ph.trick = [{ seat: 0, card: null }];
    });
    assert.equal(loadMatch(), null, 'karta `null` ve štychu musí být odmítnuta (suitOf by z ní udělal kartu 0)');

    withState((x) => {
      const ph = x.phase as Record<string, unknown>;
      ph.trick = [{ seat: 0, card: '5' }];
    });
    assert.equal(loadMatch(), null, 'karta jako řetězec musí být odmítnuta');

    withState((x) => { (x.phase as Record<string, unknown>).marriages = [{ seat: 0, suit: 9 }]; });
    assert.equal(loadMatch(), null, 'hláška v neexistující barvě musí být odmítnuta');

    // fleky: úrovně jdou do 2**level
    const fleksState = JSON.parse(JSON.stringify(mid)) as Record<string, unknown>;
    fleksState.phase = { name: 'fleks', fleks: { levels: { hra: 'mnoho' }, lastRaiser: {}, toAct: 0, passed: [] } };
    store.set('flek.match.v1', JSON.stringify({ v: 1, state: fleksState }));
    assert.equal(loadMatch(), null, 'nečíselná úroveň fleku musí být odmítnuta');
    fleksState.phase = { name: 'fleks', fleks: { levels: { hra: 999 }, lastRaiser: {}, toAct: 0, passed: [] } };
    store.set('flek.match.v1', JSON.stringify({ v: 1, state: fleksState }));
    assert.equal(loadMatch(), null, 'absurdní úroveň fleku musí být odmítnuta');

    // druhá vrstva sama: assertValid nesmí nečíselnou kartu propustit
    const tampered = JSON.parse(JSON.stringify(mid)) as St6;
    (tampered.hands[0] as unknown[])[0] = null;
    assert.throws(() => assertValid(tampered), /karta/, 'assertValid musí nečíselnou kartu odmítnout');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i1/i3/i5/i25/i6 — sav přežije sehrávku, karty ve štychu se validují');
  }

  // ── i26: skutečné sinky do innerHTML (zúčtování a průběh hry) ────────────
  {
    const { settlementHtml, replayHtml } = await import('../src/lib/ui/resultHtml');
    const evil = '<img src=x onerror=alert(1)>';
    const deps = { humanSeat: 0 as const, nameOf: () => evil, pattern: () => 'modern' as const };
    const result = {
      handNo: 0,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      cardPoints: { declarer: 60, defenders: 30 },
      marriagePoints: { declarer: 20, defenders: 0 },
      components: [{
        target: evil, wonBy: 'declarer' as const, baseRate: 1, flekMultiplier: 4,
        extraMultiplier: 1, amount: 4, silent: false, note: evil,
      }],
      delta: [2, -1, -1] as [number, number, number],
    };
    const v6 = {
      seat: 0 as const, config: defaultConfig('voleny'), dealer: 2 as const, hand: [],
      handCounts: [0, 0, 0], revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null, contract: result.contract,
      phase: { name: 'scored' as const, result },
      publicHistory: [], handResults: [result], ledger: [2, -1, -1], handNo: 1,
    };

    const html = settlementHtml(result as never, v6 as never, deps);
    assert.equal(html.includes('<img src=x'), false, 'zúčtování nesmí pustit HTML z note/target/jména');
    assert.ok(html.includes('&lt;img src=x'), 'hodnoty se mají escapovat, ne zahazovat');

    const st6 = playIntoTricks(3, 3);
    const replay = replayHtml({ ...st6, talon: st6.talon } as never, result as never, deps);
    assert.equal(replay.includes('<img src=x'), false, 'průběh hry nesmí pustit HTML ze jména hráče');
    assert.ok(replay.includes('&lt;img src=x'), 'jméno se má escapovat');
    console.log('PASS regrese i26 — zúčtování i průběh hry escapují nedůvěryhodné hodnoty');
  }

  // ── i19: hláška je volba — a „bez hlášky" se opravdu dá zahrát ───────────
  {
    const { playChoice } = await import('../src/lib/ui/playChoice');
    const { card: mk7, KRAL: K7, SVRSEK: SV7 } = await import('../src/lib/cards');

    // najdi ve hře pozici, kde má hráč na ruce král+svršek téže barvy a vynáší
    let asked = 0;
    let single = 0;
    for (let seed = 1; seed <= 60 && asked === 0; seed += 1) {
      let st = playIntoTricks(seed, 0);
      for (let step = 0; step < 30; step += 1) {
        if (st.phase.name !== 'tricks') break;
        const seat = st.phase.toAct;
        const v = view(st, seat);
        const legal = legalActions(v);
        for (const c of v.hand) {
          const ch = playChoice(v, legal, c);
          if (ch.ask) {
            asked += 1;
            // obě varianty jsou legální a liší se jen ohlášením
            assert.equal(ch.ask.withMarriage.type, 'play');
            assert.equal(ch.ask.plain.type, 'play');
            const trump = v.contract?.trump ?? null;
            const expected = trump !== null && (c >> 3) === trump ? 40 : 20;
            assert.equal(ch.ask.points, expected, `hláška v barvě ${c >> 3} (trumf ${trump}) je za ${expected}`);
            // „zahrát bez hlášky" MUSÍ projít enginem a NEsmí nic naskórovat
            const after = apply(st, ch.ask.plain);
            assert.equal(
              after.phase.name === 'tricks' ? after.phase.marriages.length : -1,
              st.phase.name === 'tricks' ? st.phase.marriages.length : -2,
              'odmítnutá hláška se nesmí zapsat',
            );
            // a ohlášená varianta naopak zapsat musí
            const announced = apply(st, ch.ask.withMarriage);
            assert.equal(
              announced.phase.name === 'tricks' ? announced.phase.marriages.length : -1,
              (st.phase.name === 'tricks' ? st.phase.marriages.length : 0) + 1,
              'ohlášená hláška se zapsat musí',
            );
            break;
          }
          if (ch.single) single += 1;
        }
        if (asked > 0) break;
        const a = legal.find((x) => x.type === 'play');
        if (!a) break;
        st = apply(st, a);
      }
    }
    assert.ok(asked > 0, 'scénář nenašel pozici s volbou hlášky');
    assert.ok(single > 0, 'bez páru v ruce se hraje bez ptaní');

    /*
     * Sazba hlášky přímo (i26): typ `20 | 40` sám o sobě nic negarantuje —
     * podmínka musí opravdu porovnávat barvu hlášky s trumfem.
     */
    const mkChoiceView = (suit: 0 | 1 | 2 | 3, trump: 0 | 1 | 2 | 3) => ({
      seat: 0 as const, config: defaultConfig('voleny'), dealer: 2 as const,
      hand: [mk7(suit, K7), mk7(suit, SV7)], handCounts: [2, 2, 2], revealedTrump: null, unseenCount: 0,
      talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      phase: {
        name: 'tricks' as const, trickNo: 8, leader: 0 as const, toAct: 0 as const,
        trick: [], played: [], won: [[], [], []] as [number[], number[], number[]], marriages: [],
      },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    });
    for (const [suit, trump, pts] of [[2, 2, 40], [2, 1, 20], [0, 0, 40], [0, 3, 20]] as const) {
      const v = mkChoiceView(suit, trump);
      const ch = playChoice(v as never, legalActions(v as never), mk7(suit, K7));
      assert.ok(ch.ask, `barva ${suit} / trumf ${trump}: hláška musí být na výběr`);
      assert.equal(ch.ask?.points, pts, `hláška v barvě ${suit} při trumfu ${trump} je za ${pts}`);
    }
    console.log(`PASS regrese i19 — volba hlášky: ${asked}× dotaz, „bez hlášky" nic neskóruje`);
  }

  // ── i20: první požadavek na čerstvém workeru má startovní toleranci ─────
  {
    interface FakeMsg2 { type: string; requestId: number }
    class FakeWorker2 {
      static instances: FakeWorker2[] = [];
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      posted: FakeMsg2[] = [];
      terminated = false;
      constructor() { FakeWorker2.instances.push(this); }
      postMessage(m: FakeMsg2): void { this.posted.push(m); }
      terminate(): void { this.terminated = true; }
    }
    const g = globalThis as { Worker?: unknown };
    const orig = g.Worker;
    g.Worker = FakeWorker2 as never;
    const { createWorkerDriver } = await import('../src/lib/match/workerDriver');
    const nap6 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

    FakeWorker2.instances.length = 0;
    const d = createWorkerDriver();
    const p = d.think({ requestId: 1, view: {} as never, difficulty: 'easy', seed: 1, budgetMs: 0 });
    let settled = false;
    p.then(() => { settled = true; }, () => { settled = true; });
    const w = FakeWorker2.instances[0];
    // bez SPAWN_GRACE_MS by watchdog udeřil v 2000 ms; start workeru přidává 2000
    await nap6(2600);
    assert.equal(w.terminated, false, 'první požadavek nesmí zemřít, než worker vůbec nastartuje');
    assert.equal(settled, false, 'požadavek má stále čekat');
    assert.equal(FakeWorker2.instances.length, 1, 'nesmí vzniknout retry worker');
    // po plné toleranci watchdog udeřit MUSÍ
    await nap6(1700);
    assert.equal(w.terminated, true, 'po budgetMs + GRACE + SPAWN_GRACE musí watchdog zabít');
    d.cancel(1);
    await p.catch(() => {});
    if (orig === undefined) delete g.Worker; else g.Worker = orig;
    console.log('PASS regrese i20 — watchdog nezapočítává start workeru do budgetu');
  }

  // ── i21/i29: CSP a SRI jsou ve stránce A JSOU ÚČINNÉ ────────────────────
  {
    const layout = readFileSync(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    const csp = /http-equiv="Content-Security-Policy"[\s\S]{0,80}content="([^"]+)"/.exec(layout);
    assert.ok(csp, 'Layout.astro musí obsahovat CSP meta');
    const policy = (csp as RegExpExecArray)[1];

    // rozpad na direktivy, ať se dá kontrolovat obsah, ne jen přítomnost
    const directives = new Map<string, string[]>();
    for (const part of policy.split(';')) {
      const [name, ...src] = part.trim().split(/\s+/);
      if (name) directives.set(name, src);
    }
    for (const name of [
      'default-src', 'script-src', 'style-src', 'img-src', 'connect-src',
      'worker-src', 'font-src', 'object-src', 'base-uri', 'form-action',
    ]) {
      assert.ok(directives.has(name), `CSP musí obsahovat ${name}`);
    }
    // žádná direktiva nesmí být rozvolněná na celý web (typicky `worker-src *`)
    for (const [name, sources] of directives) {
      for (const src of sources) {
        assert.equal(src, src.replace(/^\*$/, 'ZAKÁZÁNO'), `${name} nesmí být *`);
        assert.equal(/^https?:$/.test(src), false, `${name} nesmí povolovat celé schéma (${src})`);
        assert.equal(src === "'unsafe-eval'", false, `${name} nesmí povolovat unsafe-eval`);
      }
    }
    assert.deepEqual(directives.get('object-src'), ["'none'"], "object-src musí být 'none'");
    assert.deepEqual(directives.get('default-src'), ["'self'"], "default-src musí být 'self'");
    // skripty: jen vlastní origin + jeden konkrétní host analytiky
    const scriptSrc = directives.get('script-src') as string[];
    assert.ok(scriptSrc.includes("'self'"), "script-src musí obsahovat 'self'");
    for (const src of scriptSrc) {
      assert.ok(
        src === "'self'" || src === "'unsafe-inline'" || src === 'https://gc.zgo.at',
        `script-src nesmí povolovat ${src}`,
      );
    }

    // SRI musí být NA TOM SKRIPTU, ne kdekoliv v souboru
    const tag = /<script\b[^>]*?\bsrc="https:\/\/gc\.zgo\.at\/[^"]+"[\s\S]*?><\/script>/.exec(layout);
    assert.ok(tag, 'skript analytiky se nenašel (nebo není samostatný tag)');
    const tagStr = (tag as RegExpExecArray)[0];
    assert.match(tagStr, /src="https:\/\/gc\.zgo\.at\/count\.v\d+\.js"/, 'analytika musí být na verzované URL');
    assert.match(tagStr, /integrity="sha(256|384|512)-[A-Za-z0-9+/=]{40,}"/, 'skript analytiky musí mít SRI hash');
    assert.match(tagStr, /crossorigin="anonymous"/, 'SRI vyžaduje crossorigin na TÉMŽE tagu');
    // hash musí odpovídat skutečnému obsahu → aspoň že není zakomentovaný
    assert.equal(/^\s*<!--/.test(tagStr), false, 'skript nesmí být zakomentovaný');
    console.log('PASS regrese i21/i29 — CSP direktivy nejsou rozvolněné, SRI je na skriptu analytiky');
  }

  // ── i17: dvojklik při rozmýšlení AI nesmí zrušit její požadavek ─────────
  {
    const { MatchController: MC6 } = await import('../src/lib/match/controller');
    const nap7 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    let cancels = 0;
    let asked = 0;
    const driver = {
      think: async (r: { view: Parameters<typeof legalActions>[0] }) => {
        asked += 1;
        await nap7(400); // AI „rozmýšlí" — po celou dobu je requestId pending
        return { action: legalActions(r.view)[0], stats: { iterations: 0, elapsedMs: 0, evaluations: [] } };
      },
      cancel: () => { cancels += 1; },
    };
    // dealer 0 ⇒ forhont je sedadlo 1 (AI) — člověk tedy čeká, až AI zvolí trumf
    const dealt = apply(initialState(defaultConfig('voleny'), 0), { type: 'deal', seed: 7 });
    const ctrl = new MC6(driver as never, {
      config: defaultConfig('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
      seedSource: () => 7, aiDelayMs: 0, autoGood: false,
    }, dealt);
    ctrl.kick();
    await nap7(60);
    assert.ok(asked > 0, 'scénář i17 vyžaduje, aby AI opravdu rozmýšlela');
    assert.equal(ctrl.actor(), 1, 'na tahu je AI (sedadlo 1)');

    // člověk mezitím klikne — jeho akce je nelegální (není na tahu)
    const before = cancels;
    assert.throws(
      () => ctrl.dispatch({ type: 'good', seat: 0 } as never),
      (e: Error) => e.name === 'IllegalActionError' || /nelegální/.test(e.message),
      'akce mimo tah musí vyhodit IllegalActionError',
    );
    assert.equal(cancels, before, 'odmítnutá akce NESMÍ zrušit běžící hledání AI');

    // a hledání se opravdu dokončí (smyčka žije dál)
    await nap7(600);
    assert.ok(ctrl.state.history.length > 1, 'AI musí svůj tah dokončit');
    ctrl.stop();
    console.log('PASS regrese i17 — nelegální dispatch nezruší rozmyšlený tah AI');
  }
}


// ── regrese: šesté kolo fixpoint review-code (2026-08-25, po 987d0d1) ───────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: pts8 } = await import('../src/lib/cards');
  type St8 = ReturnType<typeof initialState>;
  type Act8 = ReturnType<typeof legalActions>[number];
  const acts8 = (st: St8): Act8[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  // ── i27: revealedTrump putuje z reduceru do pohledu — a JEN k volícímu ──
  {
    let st: St8 = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 4 });
    assert.equal(st.revealedTrump, null, 'po rozdání není nic ukázáno');
    for (const seat of [0, 1, 2] as const) {
      assert.equal(view(st, seat).revealedTrump, null, 'pohled kopíruje null');
    }

    /*
     * „Zvolenou kartu odloží stranou LÍCEM DOLŮ" (ČSM, Obecná pravidla
     * Čl. VII/1): stav si ji drží, ale pohled ji dá jen tomu, kdo volil —
     * to je vždy forhont (rozdával 2 ⇒ forhont 0). Obránci dostanou null,
     * jinak by AI znala forhontovu přesnou kartu.
     */
    const pick = acts8(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people');
    assert.ok(pick, 'scénář i27 čeká volbu trumfu');
    const chosen = (pick as { card: number }).card;
    const afterPick = apply(st, pick as Act8);
    assert.equal(afterPick.revealedTrump, chosen, 'reducer musí ukázanou kartu zapsat do stavu');
    assert.equal(view(afterPick, 0).revealedTrump, chosen, 'volící svou kartu vidí');
    for (const seat of [1, 2] as const) {
      assert.equal(view(afterPick, seat).revealedTrump, null, `sedadlo ${seat} kartu vidět nesmí`);
    }

    // „z lidu": karta je otočená naslepo, ale leží stejně lícem dolů
    const fromPeople = acts8(st).find((a) => a.type === 'choose-trump' && a.card === 'from-people');
    assert.ok(fromPeople, 'scénář i27 čeká i volbu „z lidu"');
    const flipped = st.unseen[0];
    const afterPeople = apply(st, fromPeople as Act8);
    assert.equal(afterPeople.revealedTrump, flipped, 'stav si „z lidu" kartu drží');
    assert.equal(view(afterPeople, 0).revealedTrump, flipped, 'volící ji vidí');
    assert.equal(view(afterPeople, 1).revealedTrump, null, 'obránce ji vidět nesmí');
    console.log('PASS regrese i27 — revealedTrump: stav ano, pohled jen volícímu (Čl. VII/1)');
  }

  // ── i8: kdo v licitaci pasoval, už se nevrací ──────────────────────────
  {
    const cfg = defaultConfig('licitovany');
    let st: St8 = initialState(cfg, 2);
    st = apply(st, { type: 'deal', seed: 6 });
    assert.equal(st.phase.name, 'bidding');

    const bidderOf = (state: St8): 0 | 1 | 2 => {
      const p = state.phase;
      if (p.name !== 'bidding') throw new Error('mimo licitaci');
      return p.toAct;
    };
    // první na slovo pasuje a tím z licitace vypadává
    const first = bidderOf(st);
    st = apply(st, { type: 'bid', seat: first, bid: 'pass' });
    const passed = new Set<number>([first]);

    let guard = 0;
    while (st.phase.name === 'bidding') {
      if ((guard += 1) > 30) throw new Error('licitace se zasekla');
      const seat = bidderOf(st);
      assert.equal(passed.has(seat), false, `sedadlo ${seat} už pasovalo a nesmí dostat slovo znovu`);
      const a = acts8(st);
      // přihoď, pokud to jde (ať se držitel mění a rotace se protočí)
      const raise = a.find((x) => x.type === 'bid' && x.bid !== 'pass');
      if (raise && guard < 6) { st = apply(st, raise); continue; }
      st = apply(st, { type: 'bid', seat, bid: 'pass' });
      passed.add(seat);
    }
    assert.notEqual(st.phase.name, 'bidding', 'licitace musí skončit');
    const winner = st.phase.name === 'discard-talon' ? st.phase.standing.declarer : null;
    assert.ok(winner !== null, 'po licitaci se odhazuje talon');
    assert.equal(passed.has(winner as number), false, 'licitaci nesmí vyhrát ten, kdo odstoupil');
    console.log('PASS regrese i8 — odstoupení z licitace je konečné');
  }

  // ── i12: vynucená „dobrá" v převzetí se potvrdí sama ───────────────────
  {
    const { MatchController: MC8 } = await import('../src/lib/match/controller');
    const nap8 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

    /*
     * Scénář: člověk (forhont) hlásí hru, jeden obránce ji přebere betlem,
     * druhý durchem. Pak se člověk dostane na slovo a legální je JEN
     * takeover/'good' — durch už nikdo nepřebije. Měřit se to musí historií,
     * ne pozorováním: s aiDelayMs 0 auto-potvrzení proletí mezi dvěma pollingy.
     */
    const runScenario = async (autoGood: boolean) => {
      const driver = {
        think: async (r: { view: Parameters<typeof legalActions>[0] }) => {
          const legal = legalActions(r.view);
          return {
            action:
              legal.find((a) => a.type === 'takeover' && a.claim === 'durch') ??
              // obránce „sebere talon" a po odhozu ohlásí betl (čl. VII/1)
              legal.find((a) => a.type === 'takeover' && a.claim === 'take') ??
              legal.find((a) => a.type === 'declare' && a.mode === 'betl') ??
              legal[0],
            stats: { iterations: 0, elapsedMs: 0, evaluations: [] },
          };
        },
        cancel: () => {},
      };
      const ctrl = new MC8(driver as never, {
        config: defaultConfig('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
        seedSource: () => 11, aiDelayMs: 0, autoGood,
      });
      ctrl.dealNext();
      for (const pred of [
        (a: Act8) => a.type === 'choose-trump' && a.card !== 'from-people',
        (a: Act8) => a.type === 'discard' && a.cards.every((c) => pts8(c) === 0),
        // „Barva?" — ve voleném se převzetí řeší před deklarací (čl. VII/1)
        (a: Act8) => a.type === 'takeover' && a.claim === 'good',
      ]) {
        await nap8(20);
        const a = ctrl.humanLegal().find(pred);
        assert.ok(a, 'scénář i12: chybí lidská akce');
        ctrl.dispatch(a as never);
      }
      await nap8(300); // AI odehraje betl + durch, člověk se dostane na slovo
      return ctrl;
    };

    // (a) s vypnutou auto-dobrou zůstane hra stát na jediné vynucené akci
    const manual = await runScenario(false);
    const stuck = manual.humanLegal();
    assert.equal(manual.state.phase.name, 'takeover', 'scénář i12 nedošel k převzetí');
    assert.deepEqual(
      stuck.map((a) => `${a.type}/${a.type === 'takeover' ? a.claim : ''}`),
      ['takeover/good'], 'člověku má zbýt jediná vynucená akce',
    );
    manual.stop();

    // (b) se zapnutou auto-dobrou ji potvrdí controller sám (dle historie)
    const auto = await runScenario(true);
    const humanGoods = auto.state.history.filter(
      (a) => a.type === 'takeover' && a.seat === 0 && a.claim === 'good',
    );
    // první „dobrá" je test sám („Barva?"), druhou musí po cizím durchu — kde
    // už nic jiného nezbývá — potvrdit controller
    assert.equal(humanGoods.length, 2, 'controller musí vynucenou „dobrou" potvrdit za člověka');
    assert.notEqual(auto.state.phase.name, 'takeover', 'převzetí se musí uzavřít bez klikání');
    auto.stop();
    console.log('PASS regrese i12 — takeover/„dobrá" bez volby se neklikají ručně');
  }

  // ── i10/i13/i28: sav — kontrakt, sazebník, historie, prvky map ─────────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch, VERSION: SAVE_VERSION } = await import('../src/lib/match/persist');

    // dotáhni do sehrávky (tam je kontrakt povinný)
    let st: St8 = initialState({ ...defaultConfig('voleny'), autoSettlePlainHra: false }, 2);
    st = apply(st, { type: 'deal', seed: 3 });
    let guard = 0;
    while (st.phase.name !== 'tricks') {
      if ((guard += 1) > 200) throw new Error('scénář i10 se zasekl');
      const a = acts8(st);
      st = apply(st,
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => pts8(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ??
        a.find((x) => x.type === 'takeover' && x.claim === 'good') ??
        a.find((x) => x.type === 'good') ?? a[0]);
    }
    // stav před prvním výnosem (všech 32 karet leží v rukách + talonu) se hodí
    // jako podklad pro ručně sestavenou fázi fleků — jinak by nesouhlasil počet karet
    const beforePlay = st;
    st = apply(st, acts8(st).find((a) => a.type === 'play') as Act8);
    saveMatch(st);
    assert.ok(loadMatch(), 'poctivá sehrávka se musí obnovit');

    const withState = (mutate: (s: Record<string, unknown>) => void): void => {
      saveMatch(st);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    // (i10) sehrávka bez kontraktu projde oběma vrstvami, ale nemá legální tah
    withState((x) => { x.contract = null; });
    assert.equal(loadMatch(), null, 'sehrávka bez kontraktu musí být odmítnuta (zamrzla by)');

    // (i10) prázdný sazebník → NaN v zúčtování
    withState((x) => { (x.config as Record<string, unknown>).sazby = {}; });
    assert.equal(loadMatch(), null, 'prázdný sazebník musí být odmítnut');
    withState((x) => {
      const cfg = x.config as Record<string, unknown>;
      cfg.sazby = { ...(cfg.sazby as object), kiloScaling: 'jinak' };
    });
    assert.equal(loadMatch(), null, 'neznámé škálování kila musí být odmítnuto');

    // (i13) akce v historii mimo rozsah shodí renderMelds a UI se nezhojí
    withState((x) => {
      (x.history as unknown[]).push({ type: 'play', seat: 5, card: 0, announceMarriage: true });
    });
    assert.equal(loadMatch(), null, 'akce v historii se sedadlem 5 musí být odmítnuta');
    withState((x) => {
      (x.history as unknown[]).push({ type: 'play', seat: 1, card: 99, announceMarriage: false });
    });
    assert.equal(loadMatch(), null, 'akce v historii s kartou 99 musí být odmítnuta');
    withState((x) => { (x.history as unknown[]).push({ type: 'vymyslena-akce', seat: 1 }); });
    assert.equal(loadMatch(), null, 'neznámý typ akce musí být odmítnut');
    withState((x) => { (x.history as unknown[]).push({ type: 'play', seat: 1, card: 5 }); });
    assert.equal(loadMatch(), null, 'akce play bez announceMarriage musí být odmítnuta');

    // (i28) platné kontejnery s NEplatnými prvky
    const fleksState = () => {
      const c = JSON.parse(JSON.stringify(beforePlay)) as Record<string, unknown>;
      c.phase = {
        name: 'fleks',
        fleks: { levels: {}, lastRaiser: {}, toAct: 0, spoke: [], open: ['hra'], raised: [], round: 0 },
      };
      return c;
    };
    const setPhase = (mutate: (f: Record<string, unknown>) => void): void => {
      const c = fleksState();
      mutate(((c.phase as Record<string, unknown>).fleks) as Record<string, unknown>);
      store.set('flek.match.v1', JSON.stringify({ v: SAVE_VERSION, state: c }));
    };
    setPhase((f) => { (f.lastRaiser as Record<string, unknown>).hra = 7; });
    assert.equal(loadMatch(), null, 'lastRaiser se sedadlem 7 musí být odmítnut');
    setPhase((f) => { f.spoke = ['x']; });
    assert.equal(loadMatch(), null, 'spoke s řetězcem musí být odmítnut');
    setPhase((f) => { f.open = ['vymyslena-komponenta']; });
    assert.equal(loadMatch(), null, 'otevřená komponenta mimo závazek musí být odmítnuta');
    setPhase((f) => { f.round = -1; });
    assert.equal(loadMatch(), null, 'záporné kolo flekování musí být odmítnuto');
    setPhase((f) => { (f.levels as Record<string, unknown>).hra = 2; });
    assert.ok(loadMatch(), 'platná fáze fleků musí projít');

    withState((x) => {
      (x.phase as Record<string, unknown>).trick = [{ seat: 0, card: 99 }];
    });
    assert.equal(loadMatch(), null, 'karta 99 ve štychu musí být odmítnuta');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i10/i13/i28 — sav: kontrakt, sazebník, historie i prvky map');
  }

  // ── i1: simulace nese jen aktuální hru, ne celý zápas ──────────────────
  {
    const { buildState } = await import('../src/lib/ai/determinize');
    const older = [
      { type: 'deal' as const },
      { type: 'good' as const, seat: 0 as const },
      { type: 'deal' as const },
      { type: 'good' as const, seat: 1 as const },
      { type: 'play' as const, seat: 2 as const, card: 5, announceMarriage: false },
    ];
    const v = {
      seat: 1 as const, config: defaultConfig('voleny'), dealer: 2 as const, hand: [1, 2],
      handCounts: [2, 2, 2], revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      phase: {
        name: 'tricks' as const, trickNo: 0, leader: 0 as const, toAct: 1 as const,
        trick: [], played: [], won: [[], [], []] as [number[], number[], number[]], marriages: [],
      },
      publicHistory: older, handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 2,
    };
    const built = buildState(v as never, { hands: [[1], [2], [3]], talon: [] } as never);
    // přesná shoda s úsekem od POSLEDNÍHO rozdání (slice(0,3) by taky měl
    // délku 3 a začínal dealem, ale nesl by předchozí hru)
    assert.deepEqual(built.history, older.slice(2), 'simulace nese právě aktuální hru');
    assert.equal(
      built.history.some((h) => h.type === 'good' && h.seat === 0), false,
      'akce z předchozí hry se do simulace nesmí dostat',
    );
    console.log('PASS regrese i1 — buildState nevláčí historii předchozích her');
  }

  // ── i9/i19: seedová posloupnost — PRODUKČNÍ modul, ne kopie logiky ─────
  {
    const { createSeedSequence, parseSeedParam } = await import('../src/lib/match/seedSequence');

    assert.equal(parseSeedParam('?seed=10'), 10);
    assert.equal(parseSeedParam('?seed=0'), 0, 'seed 0 je platný seed, ne „bez seedu"');
    assert.equal(parseSeedParam('?seed='), null);
    assert.equal(parseSeedParam('?seed=abc'), null);
    assert.equal(parseSeedParam(''), null);

    // nový zápas: N, N+1, N+2
    const fresh = createSeedSequence(5);
    assert.deepEqual([fresh.next(), fresh.next(), fresh.next()], [5, 6, 7]);

    // obnovený zápas po dvou odehraných hrách pokračuje, nerestartuje
    const resumed = createSeedSequence(5);
    resumed.resumeAfter(2);
    assert.deepEqual([resumed.next(), resumed.next()], [7, 8], 'po obnovení se pokračuje');

    // seed 0 se nesmí chovat jinak (dřívější past `|| 1`)
    const zero = createSeedSequence(0);
    zero.resumeAfter(1);
    assert.deepEqual([zero.next(), zero.next()], [1, 2]);

    // bez ?seed= je každé rozdání náhodné (a nesahá na counter)
    let calls = 0;
    const random = createSeedSequence(null, () => (calls += 1) * 100);
    random.resumeAfter(3); // nesmí mít žádný efekt
    assert.deepEqual([random.next(), random.next()], [100, 200]);

    // a tatáž posloupnost dává tatáž rozdání
    const deal = (seed: number): string =>
      JSON.stringify(apply(initialState(defaultConfig('voleny'), 2), { type: 'deal', seed }).hands);
    assert.equal(deal(7), deal(7), 'týž seed = totéž rozdání');
    assert.notEqual(deal(7), deal(8), 'jiný seed = jiné rozdání');
    console.log('PASS regrese i9/i19 — seedová posloupnost přežije obnovení zápasu');
  }

  // ── i21: explorační člen UCB škáluje s rozsahem odměn ─────────────────
  {
    const { ucbScore } = await import('../src/lib/ai/ismcts');

    // bez odměn se rozhoduje čistě explorace: méně navštívené dítě má víc
    assert.ok(ucbScore(0, 1, 100, 1) > ucbScore(0, 1, 100, 50), 'méně navštívené se má zkoumat');

    // klíč opravy: explorační člen roste LINEÁRNĚ s rozsahem odměn
    const explore = (scale: number) => ucbScore(0, scale, 100, 4);
    assert.ok(Math.abs(explore(64) - 64 * explore(1)) < 1e-9, 'explorace musí škálovat lineárně');

    /*
     * A hlavně: u vysokých sázek nesmí průměr exploraci utlumit. Dítě s
     * průměrem +8 a 50 návštěvami vs. sotva zkoumané dítě s průměrem 0:
     * v rozsahu ±128 se to ještě zkoumat MÁ, v rozsahu ±1 už ne.
     */
    const exploited = (scale: number) => ucbScore(8, scale, 400, 50);
    const fresh2 = (scale: number) => ucbScore(0, scale, 400, 0);
    assert.ok(fresh2(128) > exploited(128), 've hře o 128 jednotek se má dál zkoumat');
    assert.ok(fresh2(1) < exploited(1), 'v drobné hře už průměr rozhoduje');
    console.log('PASS regrese i21 — UCB explorace škáluje rozsahem odměn');
  }

  // ── i23: popisky ve všech třech jazycích (currentLang čte document) ────
  {
    const classes = new Set<string>();
    (globalThis as { document?: unknown }).document = {
      documentElement: { classList: { contains: (c: string) => classes.has(c) } },
    };
    const { bidLabel } = await import('../src/lib/ui/table');
    const { t: t9, flekName: flekName9 } = await import('../src/lib/ui/i18n');
    const setLang = (lang: 'cs' | 'en' | 'de' | 'fr'): void => {
      classes.clear();
      if (lang !== 'cs') classes.add(`lang-${lang}`);
    };

    // VŠECH sedm hodnot Bid.kind — 'dve-sedmy*' jsou právě ty, které existují
    // jen v licitovaném, a bidLabel pro nezmapovaný kind propadne na slug
    const kinds = ['sedma', 'sto', 'sto-sedma', 'betl', 'durch', 'dve-sedmy', 'dve-sedmy-sto'];
    for (const lang of ['cs', 'en', 'de', 'fr'] as const) {
      setLang(lang);
      for (const kind of kinds) {
        const label = bidLabel({ kind, cervena: false });
        assert.notEqual(label, kind, `${lang}: závazek „${kind}" nesmí propadnout na slug`);
        assert.equal(label.includes('-'), false, `${lang}: „${label}" vypadá jako slug`);
      }
    }
    // a jazyky se opravdu liší (jinak by němčina zase brala češtinu)
    setLang('cs'); const cs = bidLabel({ kind: 'sto-sedma', cervena: false });
    setLang('en'); const en = bidLabel({ kind: 'sto-sedma', cervena: false });
    setLang('de'); const de = bidLabel({ kind: 'sto-sedma', cervena: false });
    setLang('fr'); const fr = bidLabel({ kind: 'sto-sedma', cervena: false });
    assert.notEqual(cs, fr, 'FR popisek se musí lišit od CS');
    assert.notEqual(cs, en, 'EN popisek se musí lišit od CS');
    assert.notEqual(cs, de, 'DE popisek se musí lišit od CS');

    // klíčové texty musí existovat ve všech jazycích
    for (const lang of ['cs', 'en', 'de', 'fr'] as const) {
      setLang(lang);
      for (const key of ['hra', 'betl', 'durch', 'sedma', 'kilo', 'drawZero', 'youWon', 'youLost'] as const) {
        const val = t9(key);
        assert.ok(val.length > 0, `${lang}: chybí text ${key}`);
      }
      assert.ok(flekName9(0).length > 0, `${lang}: chybí jméno fleku`);
    }
    // neznámý klíč nesmí shodit render (obrana do hloubky, viz i9)
    assert.equal(t9('naprosto-neznamy-klic' as never), 'naprosto-neznamy-klic');
    delete (globalThis as { document?: unknown }).document;
    console.log('PASS regrese i23 — popisky závazků a texty ve všech třech jazycích');
  }

  // ── i20/i21: generace workeru a lhůta zahrnující čekání ve frontě ──────
  {
    interface FakeMsg3 { type: string; requestId: number }
    class FakeWorker3 {
      static instances: FakeWorker3[] = [];
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      posted: FakeMsg3[] = [];
      terminated = false;
      constructor() { FakeWorker3.instances.push(this); }
      postMessage(m: FakeMsg3): void { this.posted.push(m); }
      terminate(): void { this.terminated = true; }
    }
    const g = globalThis as { Worker?: unknown };
    const orig = g.Worker;
    g.Worker = FakeWorker3 as never;
    const { createWorkerDriver } = await import('../src/lib/match/workerDriver');
    const nap9 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const stats3 = { iterations: 0, elapsedMs: 0, evaluations: [] };
    const move = (id: number) => ({ data: { type: 'move', requestId: id, action: { type: 'good', seat: 1 }, stats: stats3 } });

    // (i20) opožděná odpověď ZABITÉHO workeru nesmí vyřídit požadavek nového
    FakeWorker3.instances.length = 0;
    const d = createWorkerDriver();
    const p = d.think({ requestId: 1, view: {} as never, difficulty: 'easy', seed: 1, budgetMs: 0 });
    const w1 = FakeWorker3.instances[0];
    await nap9(4200); // budget 0 + GRACE 2000 + SPAWN_GRACE 2000
    assert.equal(w1.terminated, true, 'watchdog má mlčící worker zabít');
    await nap9(20);
    const w2 = FakeWorker3.instances[FakeWorker3.instances.length - 1];
    assert.notEqual(w2, w1, 'retry běží na novém workeru');
    // teď doručíme starou odpověď z W1 — nesmí se jí věřit
    w1.onmessage?.(move(1));
    await nap9(20);
    let settled = false;
    p.then(() => { settled = true; }, () => { settled = true; });
    await nap9(20);
    assert.equal(settled, false, 'odpověď zabitého workeru nesmí vyřídit požadavek nového');
    // a pád starého workeru nesmí zabít ten aktuální
    w1.onerror?.();
    await nap9(20);
    assert.equal(w2.terminated, false, 'chyba starého workeru nesmí shodit aktuální');
    w2.onmessage?.(move(1));
    await p;

    // (i21) druhý požadavek ve frontě má lhůtu i na čekání
    FakeWorker3.instances.length = 0;
    const d2 = createWorkerDriver();
    const warm = d2.think({ requestId: 8, view: {} as never, difficulty: 'easy', seed: 1, budgetMs: 0 });
    FakeWorker3.instances[0].onmessage?.(move(8));
    await warm;
    const wq = FakeWorker3.instances[0];
    const a2 = d2.think({ requestId: 9, view: {} as never, difficulty: 'easy', seed: 1, budgetMs: 1000 });
    const b2 = d2.think({ requestId: 10, view: {} as never, difficulty: 'easy', seed: 1, budgetMs: 1000 });
    a2.catch(() => {}); b2.catch(() => {});
    // A vyprší ve 3000 ms; B čeká ve frontě, takže jeho lhůta musí být delší
    await nap9(2600);
    assert.equal(wq.terminated, false, 'ani jedna lhůta nesmí vypršet před dokončením A');
    // odpověď na A přijde na hraně jeho lhůty — B smí začít až teď
    wq.onmessage?.(move(9));
    await a2;
    await nap9(600);
    assert.equal(wq.terminated, false, 'B nesmí vypršet kvůli čekání ve frontě');
    wq.onmessage?.(move(10));
    await b2;

    if (orig === undefined) delete g.Worker; else g.Worker = orig;
    console.log('PASS regrese i20/i21 — generace workeru a lhůta zahrnující frontu');
  }
}


// ── regrese: sedmé kolo fixpoint review-code (2026-08-25, po 8ede9c5) ───────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: pts9 } = await import('../src/lib/cards');
  type St9 = ReturnType<typeof initialState>;
  type Act9 = ReturnType<typeof legalActions>[number];
  const acts9 = (st: St9): Act9[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  // ── i7: sazby voleného i licitovaného podle ČSM (betl 15×, durch 30×) ──
  {
    const { SAZBY_CSM } = await import('../src/lib/rules/sazby');
    /*
     * ČSM „dvacetihaléřový bodovaný volený" (2007) i „soutěžní licitovaný"
     * (2014) mají shodně betl 15× a durch 30×. Sazebník 10×/20× patří
     * KŘÍŽOVÉMU mariáši (4 hráči), který nehrajeme — viz §17.
     */
    assert.equal(SAZBY_CSM.hra, 1);
    assert.equal(SAZBY_CSM.sedma, 2);
    assert.equal(SAZBY_CSM.kilo, 4);
    assert.equal(SAZBY_CSM.betl, 15, 'betl je v obou našich variantách 15× (10× je křížový)');
    assert.equal(SAZBY_CSM.durch, 30, 'durch je v obou našich variantách 30× (20× je křížový)');
    assert.equal(SAZBY_CSM.tichaSedma, SAZBY_CSM.sedma / 2, 'tichá sedma je poloviční');
    for (const variant of ['voleny', 'licitovany'] as const) {
      // strop fleků se liší (licitovaný čl. IV: čtvrtý flek je poslední platný), peníze ne
      const { maxFlekLevel: _cap, ...money } = defaultConfig(variant).sazby;
      const { maxFlekLevel: _capCsm, ...moneyCsm } = SAZBY_CSM;
      assert.deepEqual(money, moneyCsm, `${variant} má sazebník ČSM`);
    }
    assert.equal(defaultConfig('licitovany').sazby.maxFlekLevel, 4, 'licitovaný: boty jsou poslední platný flek (čl. IV)');
    assert.equal(defaultConfig('voleny').sazby.maxFlekLevel, 5, 'volený: tradiční strop kalhoty');
    console.log('PASS regrese i7 — sazebník ČSM (betl 15×, durch 30×) v obou variantách');
  }

  // ── sazebník originálu FLEK!/RE! (změřeno v DOSBoxu, docs/original-notes.md) ──
  {
    const { SAZBY_CSM, SAZBY_FLEK } = await import('../src/lib/rules/sazby');

    // hodnoty odečtené z vyúčtování originálu; základ hry je tam 0,10 Kč
    assert.equal(SAZBY_FLEK.hra, 1, '„Hra 0.10 Kč" holé');
    assert.equal(SAZBY_FLEK.sedma, 2, '„Sedma 0.20 Kč"');
    assert.equal(SAZBY_FLEK.kilo, 4, 'prohrané kilo 0,40 × 2^(schodek/10+1)');
    assert.equal(SAZBY_FLEK.betl, 10, '„Flekovaný betl 2.00" = 1,00 × 2');
    assert.equal(SAZBY_FLEK.durch, 20, '„Durch 2.00"');
    assert.equal(SAZBY_FLEK.dveSedmy, 30, '„6x flek na dvě sedmy 192.00" = 3,00 × 2⁶');
    assert.equal(SAZBY_FLEK.kiloScaling, 'double', 'kilo se v originálu zdvojnásobuje');

    /*
     * Jádro nálezu: běžné závazky sedí s ČSM přesně, rozcházejí se JEN betl,
     * durch a dvě sedmy (plus škálování kila, strop fleků a limit). Kdyby se
     * rozdíl rozlezl jinam, je to chyba v presetu, ne nový objev.
     */
    const rozdilne = (Object.keys(SAZBY_CSM) as (keyof typeof SAZBY_CSM)[])
      .filter((k) => SAZBY_CSM[k] !== SAZBY_FLEK[k]).sort();
    assert.deepEqual(rozdilne,
      ['betl', 'durch', 'dveSedmy', 'kiloScaling', 'limit', 'limitRaised', 'maxFlekLevel'].sort(),
      'preset FLEK! se od ČSM smí lišit jen v těchto položkách');

    // strop fleků je ustanovení ČSM (čl. IV), na preset originálu se nevztahuje
    assert.equal(defaultConfig('licitovany', 'flek').sazby.maxFlekLevel, 9,
      'originálu se licitovaný strop 4 (boty) nevnucuje — devět fleků v něm prošlo');
    assert.equal(defaultConfig('licitovany').sazby.maxFlekLevel, 4, 'výchozí preset zůstává ČSM');

    // limit nesmí sepnout: nejdražší možná komponenta musí zůstat pod ním
    const nejdrazsi = SAZBY_FLEK.dveSedmy * 2 ** SAZBY_FLEK.maxFlekLevel * SAZBY_FLEK.cervenyMultiplier;
    assert.ok(nejdrazsi < SAZBY_FLEK.limit,
      `limit originálu musí zůstat nedosažitelný (nejdražší komponenta ${nejdrazsi})`);

    // sav: preset musí přežít kolotoč save→load…
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');
    const st: St9 = initialState(defaultConfig('voleny', 'flek'), 2);
    saveMatch(st);
    const nacteno = loadMatch();
    assert.ok(nacteno, 'sav se sazebníkem originálu se musí načíst');
    assert.equal(nacteno.config.sazby.betl, 10, 'a musí si sazebník pamatovat');

    /*
     * …a právě proto limit NENÍ `Infinity`: JSON ho uloží jako `null` a validace
     * ho pak odmítne. Negativní kontrola — bez ní by se dalo `BEZ_LIMITU`
     * kdykoli „zjednodušit" na Infinity a sav by se tiše přestal načítat.
     */
    const ulozene = JSON.parse(store.get('flek.match.v1') as string) as
      { v: number; state: { config: { sazby: Record<string, unknown> } } };
    assert.equal(JSON.parse(JSON.stringify({ x: Infinity })).x, null, 'JSON Infinity neumí');
    ulozene.state.config.sazby.limit = null;
    store.set('flek.match.v1', JSON.stringify(ulozene));
    assert.equal(loadMatch(), null, 'sav s nekonečným limitem musí být odmítnut');

    // ?sazby=flek — jediná cesta, jak preset zapnout ve hře; překlep nesmí hru shodit
    const { parseSazbyPreset } = await import('../src/lib/rules/sazby');
    assert.equal(parseSazbyPreset('?sazby=flek'), 'flek');
    assert.equal(parseSazbyPreset('?seed=7&sazby=flek'), 'flek');
    for (const bad of ['', '?', '?sazby=', '?sazby=FLEK', '?sazby=csm', '?sazby=flek2', '?sazba=flek']) {
      assert.equal(parseSazbyPreset(bad), 'csm', `„${bad}" musí spadnout na ČSM`);
    }

    console.log('PASS sazebník FLEK! — změřené sazby, rozdíl jen betl/durch/dvě sedmy, sav, limit a ?sazby=');
  }

  // ── i1/i2/i9: sav — licitace, číslo štychu, mód závazku ────────────────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');

    // (i1) licitace: prvky `bids` čte legal.ts i reducer
    let bid: St9 = initialState(defaultConfig('licitovany'), 2);
    bid = apply(bid, { type: 'deal', seed: 6 });
    const firstBid = acts9(bid).find((a) => a.type === 'bid' && a.bid !== 'pass');
    bid = apply(bid, firstBid as Act9);
    saveMatch(bid);
    assert.ok(loadMatch(), 'poctivá licitace se musí obnovit');

    const patch = (from: St9, mutate: (s: Record<string, unknown>) => void): void => {
      saveMatch(from);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    for (const bad of [
      null, 'pass', 42,
      { seat: 5, bid: 'pass' },
      { seat: 0, bid: { kind: 'vymyslene', cervena: false } },
      { seat: 0, bid: { kind: 'sedma' } },
      { seat: 0 },
    ]) {
      patch(bid, (x) => { (x.phase as Record<string, unknown>).bids = [bad]; });
      assert.equal(loadMatch(), null, `vadný záznam licitace ${JSON.stringify(bad)} musí být odmítnut`);
    }
    patch(bid, (x) => { (x.phase as Record<string, unknown>).best = { kind: 'nic', cervena: false }; });
    assert.equal(loadMatch(), null, 'neznámý nejvyšší závazek musí být odmítnut');

    // (i2) trickNo mimo 0..9 → hra nikdy nedojde k zúčtování
    let tr: St9 = initialState({ ...defaultConfig('voleny'), autoSettlePlainHra: false }, 2);
    tr = apply(tr, { type: 'deal', seed: 3 });
    let guard = 0;
    while (tr.phase.name !== 'tricks') {
      if ((guard += 1) > 200) throw new Error('scénář i2 se zasekl');
      const a = acts9(tr);
      tr = apply(tr,
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => pts9(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ??
        a.find((x) => x.type === 'takeover' && x.claim === 'good') ??
        a.find((x) => x.type === 'good') ?? a[0]);
    }
    for (const bad of [-1, 10, 2.5, 1e9]) {
      patch(tr, (x) => { (x.phase as Record<string, unknown>).trickNo = bad; });
      assert.equal(loadMatch(), null, `trickNo ${bad} musí být odmítnuto (hra by nikdy neskončila)`);
    }
    patch(tr, (x) => { (x.phase as Record<string, unknown>).trickNo = 9; });
    assert.ok(loadMatch(), 'trickNo 9 (poslední štych) je legitimní');

    // (i9) mód stojícího závazku teče do contract.mode a odtud do t()
    let tk: St9 = initialState(defaultConfig('voleny'), 2);
    tk = apply(tk, { type: 'deal', seed: 11 });
    guard = 0;
    while (tk.phase.name !== 'takeover') {
      if ((guard += 1) > 50) throw new Error('scénář i9 se zasekl');
      const a = acts9(tk);
      tk = apply(tk,
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => pts9(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ?? a[0]);
    }
    saveMatch(tk);
    assert.ok(loadMatch(), 'poctivé převzetí se musí obnovit');
    patch(tk, (x) => {
      const st = ((x.phase as Record<string, unknown>).standing) as Record<string, unknown>;
      st.mode = 'zlodejina';
    });
    assert.equal(loadMatch(), null, 'neznámý mód závazku musí být odmítnut (t() by spadl)');
    patch(tk, (x) => {
      const st = ((x.phase as Record<string, unknown>).standing) as Record<string, unknown>;
      st.trump = 9;
    });
    assert.equal(loadMatch(), null, 'trumf mimo 0..3 musí být odmítnut');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i1/i2/i9 — sav: licitace, číslo štychu, mód i trumf závazku');
  }

  // ── i5/i19: bublina deklarace hlásí SPRÁVNÝ trumf (i přes fallback) ────
  {
    const { bubbleText } = await import('../src/lib/ui/table');
    const { suitIcon } = await import('../src/lib/ui/cardAssets');
    let st: St9 = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 11 });
    const trumpPick = acts9(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people');
    st = apply(st, trumpPick as Act9);
    const trumpSuit = st.phase.name === 'discard-talon' ? st.phase.standing.trump : null;
    assert.ok(trumpSuit !== null, 'volba trumfu musí trumf nastavit');
    st = apply(st, acts9(st).find((a) => a.type === 'discard' && a.cards.every((c) => pts9(c) === 0)) as Act9);
    // „Barva?" a souhlas obou obránců — deklarace je až za nimi (čl. VII/1)
    let guard5 = 0;
    while (st.phase.name === 'takeover') {
      if ((guard5 += 1) > 10) throw new Error('scénář i5 se zasekl na převzetí');
      st = apply(st, acts9(st).find((a) => a.type === 'takeover' && a.claim === 'good') as Act9);
    }
    const declare = acts9(st).find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo);
    assert.ok(declare, 'scénář i5 čeká deklaraci prosté hry');
    assert.equal((declare as { trump?: number }).trump, undefined, 've voleném akce trumf nenese');

    // (a) po deklaraci je trumf v kontraktu — a v bublině musí být TA barva
    const after = apply(st, declare as Act9);
    const icon = suitIcon(trumpSuit as 0 | 1 | 2 | 3);
    const bubble = bubbleText(declare as never, after as never);
    assert.ok(bubble?.includes(icon), 'bublina musí ukázat ikonu TRUMFOVÉ barvy');
    for (const other of [0, 1, 2, 3] as const) {
      if (other === trumpSuit) continue;
      assert.equal(bubble?.includes(suitIcon(other)), false, `bublina nesmí ukázat barvu ${other}`);
    }

    // (b) fallback `standingTrumpOf`: stav BEZ kontraktu, trumf jen ve standing
    //     (jinak by se nová pomocná funkce nikdy nezavolala)
    const noContract = { ...after, contract: null, phase: st.phase };
    const fallback = bubbleText(declare as never, noContract as never);
    assert.ok(fallback?.includes(icon), 'fallback musí vzít trumf ze stojícího závazku');
    console.log('PASS regrese i5/i19 — bublina deklarace ukazuje správný trumf i přes fallback');
  }
}


// ── regrese: osmé kolo fixpoint review-code (2026-08-25, po abc84b7) ────────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: ptsA } = await import('../src/lib/cards');
  type StA = ReturnType<typeof initialState>;
  type ActA = ReturnType<typeof legalActions>[number];
  const actsA = (st: StA): ActA[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  // ── i6: „z lidu" bez neprohlédnutých karet ─────────────────────────────
  {
    let st: StA = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 4 });
    const v = view(st, 0);
    assert.equal(v.unseenCount, 5, 'po rozdání leží 5 karet „z lidu"');
    assert.ok(
      legalActions(v).some((a) => a.type === 'choose-trump' && a.card === 'from-people'),
      'dokud je z čeho brát, „z lidu" se nabízí',
    );

    // poškozený stav: prázdný neprohlédnutý balíček
    const empty = { ...st, unseen: [] as number[] };
    assert.equal(
      legalActions(view(empty, 0)).some((a) => a.type === 'choose-trump' && a.card === 'from-people'),
      false, '„z lidu" se nesmí nabízet, když není z čeho brát',
    );
    // a i kdyby akci někdo poslal ručně, reducer ji musí odmítnout
    assert.throws(
      () => apply(empty, { type: 'choose-trump', seat: 0, card: 'from-people' }),
      /lidu|nelegální/, 'reducer nesmí vzít trumf z prázdného balíčku (suitOf(undefined) = červené)',
    );
    console.log('PASS regrese i6 — „z lidu" bez karet se nenabídne ani neprovede');
  }

  // ── i33: kdo je na tahu (včetně volby trumfu) ───────────────────────────
  {
    const { seatOnTurn } = await import('../src/lib/ui/table');
    // dealer rotuje, takže forhont se mění — a právě to se dřív ztrácelo
    for (const dealer of [0, 1, 2] as const) {
      let st: StA = initialState(defaultConfig('voleny'), dealer);
      st = apply(st, { type: 'deal', seed: 4 });
      assert.equal(st.phase.name, 'choose-trump');
      const expected = ((dealer + 1) % 3) as 0 | 1 | 2;
      assert.equal(seatOnTurn(view(st, 0)), expected, `dealer ${dealer} ⇒ na tahu forhont ${expected}`);
    }
    // ostatní fáze: sedadlo z fáze; idle/scored nikdo
    let st: StA = initialState(defaultConfig('voleny'), 2);
    assert.equal(seatOnTurn(view(st, 0)), null, 'v idle není nikdo na tahu');
    st = apply(st, { type: 'deal', seed: 4 });
    st = apply(st, actsA(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people') as ActA);
    assert.equal(seatOnTurn(view(st, 0)), 0, 'talon odhazuje aktér');
    st = apply(st, actsA(st).find((a) => a.type === 'discard' && a.cards.every((c) => ptsA(c) === 0)) as ActA);
    assert.equal(seatOnTurn(view(st, 0)), 0, 'deklaruje aktér');
    console.log('PASS regrese i33 — „na tahu" zná i fázi volby trumfu');
  }

  // ── odložený trumf: co leží na stole, není v ruce (a do talonu nesmí) ───
  {
    const { trumpAsideOf, handAside, opponentBacks, syncChildren } = await import('../src/lib/ui/table');
    let st: StA = initialState(defaultConfig('voleny'), 2); // forhont = 0
    st = apply(st, { type: 'deal', seed: 4 });
    assert.equal(trumpAsideOf(view(st, 0)), null, 'před volbou stranou nic neleží');

    const pick = actsA(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people') as ActA;
    const chosen = (pick as { card: number }).card;
    st = apply(st, pick);

    // volící: vlastní karta lícem NAHORU a zmizí mu z vějíře
    const mine = trumpAsideOf(view(st, 0));
    assert.ok(mine, 'volícímu leží zvolená karta stranou');
    assert.equal(mine?.card, chosen);
    assert.equal(mine?.faceDown, false, 'svou kartu volící vidí');
    assert.equal(view(st, 0).hand.includes(chosen), true, 'v ruce ji stav pořád má');
    assert.equal(handAside(view(st, 0)).includes(chosen), false, 've vějíři už být nesmí');
    assert.equal(handAside(view(st, 0)).length, view(st, 0).hand.length - 1, 'ubyla právě jedna');

    // obránce: leží tam rub, konkrétní kartu nezná (ČSM Čl. VII/1)
    const theirs = trumpAsideOf(view(st, 1));
    assert.ok(theirs, 'obránce vidí, že karta stranou leží');
    assert.equal(theirs?.card, null, 'ale kterou, neví');
    assert.equal(theirs?.faceDown, true, 'leží lícem dolů');

    /*
     * `holder` = z čí ruky karta odešla stranou. Ve stavu v ní pořád leží, takže
     * `handCounts` ji počítá — kdo kreslí CIZÍ ruku, musí ji podle `holder` ubrat,
     * jinak ukáže o kartu víc a po sehrávce mu jedna nevysvětlitelně zmizí.
     * Vlastní vějíř tuhle práci dělá přes `handAside()`, kterou hlídá test výš.
     */
    assert.equal(mine?.holder, 0, 'volícímu karta odešla z ruky');
    assert.equal(theirs?.holder, 0, 'a obránce ví KOMU, i když neví KTEROU');

    /*
     * `opponentBacks` je druhá půlka opravy — ta, která se opravdu kreslí.
     * Protihráč, kterému karta leží stranou, má mít o rub MÍŇ; ostatní sedadla
     * se nemění. Kontroluje se z pohledu OBOU obránců, ať se nespleteme
     * v sedadle, a proti `handAside()` téhož hráče, ať obě půlky drží pohromadě.
     */
    for (const watcher of [1, 2] as const) {
      const vw = view(st, watcher);
      assert.equal(
        opponentBacks(vw, 0), handAside(view(st, 0)).length,
        `sedadlo ${watcher}: rubů u volícího musí být tolik, kolik má karet ve vějíři`,
      );
      assert.equal(opponentBacks(vw, 0), vw.handCounts[0] - 1, 'tj. o odloženou kartu míň');
      const other = watcher === 1 ? 2 : 1;
      assert.equal(
        opponentBacks(vw, other), vw.handCounts[other],
        'komu nic stranou neleží, tomu se nic neodečítá',
      );
    }

    /*
     * Pojistka proti ZAMRZNUTÍ. Podvržený sav (prázdná ruka, a přesto odložená
     * karta) dal dřív -1; `syncChildren` pak v odebírací smyčce točil donekonečna,
     * protože `0 > -1` platí dál, ale `lastElementChild` je už `null` — karta
     * ztuhne. `assertValid` to nechytí, hlídá 32 karet celkem, ne po rukou.
     */
    const broken = { ...view(st, 1), handCounts: [0, 0, 0] as [number, number, number] };
    assert.ok(trumpAsideOf(broken), 'fixtura: odložená karta musí ležet, jinak se clamp neprojeví');
    assert.equal(opponentBacks(broken, 0), 0, 'záporný počet rubů se nesmí vrátit');

    /*
     * Do talonu zvolená karta nesmí (ČSM volený, B/7: dvě karty „odděleně od
     * zvolené karty"). Kdyby směla, hráč by ji odhodil a UI by mu ji ukazovalo
     * ležet na stole, i když je pryč.
     */
    const discards = actsA(st).filter((a) => a.type === 'discard');
    assert.ok(discards.length > 0, 'scénář čeká odhoz do talonu');
    assert.equal(
      discards.some((a) => (a as { cards: number[] }).cards.includes(chosen)), false,
      'zvolená karta se do talonu nesmí nabídnout',
    );
    assert.throws(
      () => apply(st, { type: 'discard', seat: 0, cards: [chosen, view(st, 0).hand.find((c) => c !== chosen)] } as ActA),
      /nelegální/, 'reducer odhoz zvolené karty odmítne, i kdyby akce přišla ručně',
    );

    // sehrávka: karta se vrací do ruky, stranou už neleží nic
    st = apply(st, actsA(st).find((a) => a.type === 'discard' && a.cards.every((c) => ptsA(c) === 0)) as ActA);
    assert.ok(trumpAsideOf(view(st, 0)), 'při „Barva?" pořád leží');
    // „Barva?" a souhlas obou obránců; deklarace je až za nimi (čl. VII/1)
    let guardA = 0;
    while (st.phase.name === 'takeover') {
      if ((guardA += 1) > 10) throw new Error('scénář §24 se zasekl na převzetí');
      st = apply(st, actsA(st).find((a) => a.type === 'takeover' && a.claim === 'good') as ActA);
    }
    assert.ok(trumpAsideOf(view(st, 0)), 'při deklaraci pořád leží');
    st = apply(st, actsA(st).find((a) => a.type === 'declare') as ActA);
    /*
     * Schvalovat, ne přebírat (převzetí betlem by hru poslalo jinam). Flek A RE
     * jsou ale nutné: schválená holá hra se nehraje a flekovaná bez re taky ne
     * (ČSM volený B/19) — v obou případech by stav skočil rovnou na `scored`
     * a kontrola sehrávky by tiše zmizela.
     */
    let raises = 0;
    while (st.phase.name !== 'tricks' && st.phase.name !== 'scored') {
      const acts = actsA(st);
      const flek = raises < 2 ? acts.find((a) => a.type === 'flek') : undefined;
      if (flek !== undefined) raises += 1;
      const pass = acts.find((a) => a.type === 'good')
        ?? acts.find((a) => a.type === 'takeover' && a.claim === 'good');
      st = apply(st, (flek ?? pass ?? acts[0]) as ActA);
    }
    assert.equal(st.phase.name, 'tricks', 'scénář čeká sehrávku');
    for (const seat of [0, 1, 2] as const) {
      assert.equal(trumpAsideOf(view(st, seat)), null, `sedadlo ${seat}: při sehrávce stranou nic neleží`);
    }
    assert.deepEqual(handAside(view(st, 0)), view(st, 0).hand, 've hře je vějíř zase celá ruka');
    /*
     * Pojistka proti ZAMRZNUTÍ. Podvržený sav (prázdná ruka, a přesto odložená
     * karta) dal dřív -1; `syncChildren` pak v odebírací smyčce točil donekonečna,
     * protože `0 > -1` platí dál, ale `lastElementChild` je už `null`. Karta
     * ztuhne — a `assertValid` tohle nechytí, hlídá 32 karet celkem, ne po rukou.
     */

    /*
     * Kontejner s POJISTKOU: bez ořezu se odebírací smyčka točí donekonečna
     * a `make verify` by jen visel (ověřeno: běh skončí až timeoutem). Getter
     * se v každé otáčce ptá na poslední dítě, takže se počítá — a po tisícovce
     * radši spadne, aby test selhal hlasitě a hned, ne zamrznutím CI.
     */
    let spins = 0;
    const fakeParent = {
      children: [] as unknown[],
      get lastElementChild() {
        if ((spins += 1) > 1000) throw new Error('syncChildren se zacyklil — chybí ořez na nezáporný počet');
        return this.children.length ? this.children[this.children.length - 1] : null;
      },
      appendChild(c: unknown) { this.children.push(c); return c; },
    };
    const mkChild = () => {
      const child = { remove: () => { fakeParent.children.splice(fakeParent.children.indexOf(child), 1); } };
      return child as unknown as HTMLElement;
    };
    syncChildren(fakeParent as unknown as HTMLElement, 3, mkChild);
    assert.equal(fakeParent.children.length, 3, 'kladný počet se naplní');
    for (const bad of [-1, Number.NaN, 1.5]) {
      spins = 0;
      syncChildren(fakeParent as unknown as HTMLElement, bad, mkChild);
      assert.ok(
        fakeParent.children.length >= 0 && Number.isInteger(fakeParent.children.length),
        `syncChildren(${String(bad)}) musí skončit s rozumným počtem`,
      );
    }
    assert.equal(fakeParent.children.length, 1, '1.5 se má chovat jako 1, záporné a NaN jako 0');
    console.log('PASS odložený trumf — stranou místo ruky, lícem dolů u soupeře, do talonu nesmí');
  }

  /*
   * Fronta bublin: „Momentíček…", které ČEKÁ, musí jít zrušit dřív, než ho
   * fronta vykreslí. Uživatel hlásil přesně tenhle případ — bublina naskočila
   * nad sedadlem, které už dávno táhlo, protože se hlídala jen ta VISÍCÍ.
   *
   * Hodiny i časovače se podstrkují: kontrola je o tom, co se stane mezi
   * „přišel tah" a „doběhl odklad", a čekat na to doopravdy by znamenalo test,
   * který jednou za čas probliká.
   */
  {
    const { BubbleQueue } = await import('../src/lib/ui/table');
    const MIN = 1100;
    /*
     * Hodiny NEZAČÍNAJÍ na nule: `Date.now()` je v ostrém provozu velké číslo,
     * takže „žádná bublina tu ještě nebyla" vyjde jako dávno. S nulou by se
     * první hláška ocitla v minimálním čase té neexistující předchozí a čekala
     * by — test by tak měřil něco, co v prohlížeči nikdy nenastane.
     */
    const START = 1_700_000_000_000;
    let clock = START;
    let nextId = 1;
    const timers = new Map<number, { at: number; fn: () => void }>();
    const fake = {
      now: () => clock,
      setTimeout: ((fn: () => void, ms: number) => {
        const id = nextId += 1;
        timers.set(id, { at: clock + ms, fn });
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as never,
      clearTimeout: ((id: unknown) => void timers.delete(id as number)) as never,
    };
    /** Posun hodin — spustí, co mezitím mělo doběhnout. */
    const advance = (ms: number): void => {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) { timers.delete(id); timer.fn(); }
      }
    };

    const painted: string[] = [];
    const q = new BubbleQueue(MIN, fake);

    // hláška, kterou nic nepředchází, jde na plátno hned
    q.request(1, 'talk', () => { painted.push('talk1'); q.painted(1); });
    assert.deepEqual(painted, ['talk1'], 'první hláška se kreslí bez odkladu');

    // „Momentíček…" hned po ní musí počkat na dočtení
    q.request(1, 'thinking', () => { painted.push('think'); q.painted(1); });
    assert.deepEqual(painted, ['talk1'], 'druhá hláška v minimálním čase čeká');
    assert.equal(q.queuedSeat, 1, 'a eviduje se jako čekající „Momentíček…"');

    // tah přišel dřív, než odklad doběhl — čekající se musí zrušit
    q.cancelQueuedThinking();
    assert.equal(q.queuedSeat, null, 'po tahu už nic nečeká');
    advance(MIN * 2);
    assert.deepEqual(painted, ['talk1'], '„Momentíček…" se nesmí vykreslit nad hotovým tahem');

    // …a bez zrušení se vykreslit MUSÍ, jinak by kontrola procházela vždycky
    clock = START; timers.clear(); painted.length = 0;
    const q2 = new BubbleQueue(MIN, fake);
    q2.request(1, 'talk', () => { painted.push('talk1'); q2.painted(1); });
    q2.request(1, 'thinking', () => { painted.push('think'); q2.painted(1); });
    advance(MIN * 2);
    assert.deepEqual(painted, ['talk1', 'think'], 'nezrušený odklad se po uplynutí času dokreslí');

    // běžná hláška čekající „Momentíček…" střídá — jinak by ho zrušil cizí tah
    clock = START; timers.clear(); painted.length = 0;
    const q3 = new BubbleQueue(MIN, fake);
    q3.request(2, 'talk', () => { painted.push('a'); q3.painted(2); });
    q3.request(2, 'thinking', () => { painted.push('think'); q3.painted(2); });
    q3.request(2, 'talk', () => { painted.push('b'); q3.painted(2); });
    assert.equal(q3.queuedSeat, null, 'novější hláška „Momentíček…" z fronty vystřídala');
    q3.cancelQueuedThinking(); // tah u jiného sedadla nesmí tuhle hlášku shodit
    advance(MIN * 2);
    assert.deepEqual(painted, ['a', 'b'], 've frontě čeká vždy jen poslední hláška, a ta se dokreslí');

    // nový zápas: nic starého nesmí doskočit do nového rozdání
    clock = START; timers.clear(); painted.length = 0;
    const q4 = new BubbleQueue(MIN, fake);
    q4.request(0, 'talk', () => { painted.push('x'); q4.painted(0); });
    q4.request(0, 'talk', () => painted.push('y'));
    q4.clear();
    advance(MIN * 2);
    assert.deepEqual(painted, ['x'], 'po `clear()` nesmí doskočit nic z minulého zápasu');
    assert.equal(timers.size, 0, 'a nesmí zůstat viset časovač');

    console.log('PASS bubliny — čekající „Momentíček…" se ruší tahem, nezrušený se dokreslí');
  }

  // ── vějíř v betlu/durchu: desítka patří pod spodka, ne vedle esa ────────
  {
    const { handAside, handOrderMode } = await import('../src/lib/ui/table');
    type HandView = Parameters<typeof handAside>[0];
    const baseV: HandView = {
      seat: 0, config: defaultConfig('voleny'), dealer: 2,
      hand: [ESO, R10, KRAL, SVRSEK, SPODEK, R9].map((r) => card(CERVENE, r)),
      handCounts: [6, 6, 6], revealedTrump: null, unseenCount: 0,
      talonKnown: [], talon: null, contract: null,
      phase: { name: 'tricks', trickNo: 0, leader: 0, toAct: 0, trick: [], played: [],
        won: [[], [], []], marriages: [] },
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    };
    const ranksOf = (v: HandView): number[] => handAside(v).map((c) => rankOf(c));
    const mkContract = (mode: 'hra' | 'betl' | 'durch'): NonNullable<HandView['contract']> =>
      ({ mode, trump: null, declarer: 0, sedma: null, kilo: null, dveSedmy: false });

    assert.deepEqual(
      ranksOf({ ...baseV, contract: mkContract('hra') }),
      [ESO, R10, KRAL, SVRSEK, SPODEK, R9], 'v barevné hře je desítka hned za esem',
    );
    for (const mode of ['betl', 'durch'] as const) {
      assert.deepEqual(
        ranksOf({ ...baseV, contract: mkContract(mode) }),
        [ESO, KRAL, SVRSEK, SPODEK, R10, R9], `${mode}: desítka patří mezi spodka a devítku`,
      );
    }

    // vysoutěžený betl platí už při odhozu do talonu, ne až po deklaraci
    const discarding = (mode: 'betl' | null, trump: 0 | null = null): HandView['phase'] =>
      ({ name: 'discard-talon', standing: { declarer: 0, mode, trump, bid: null } });
    assert.equal(handOrderMode({ ...baseV, phase: discarding('betl') }), 'natural');
    // volený: forhont má trumf zvolený ještě před odhozem — hlásit může cokoli
    assert.equal(
      handOrderMode({ ...baseV, phase: discarding(null, 0) }), 'trump',
      'dokud závazek není znám, řadí se jako do barevné hry',
    );
    // volený: bez trumfu odhazuje ten, kdo „sebral talon" — hraje betl, nebo durch (čl. VII/1)
    assert.equal(
      handOrderMode({ ...baseV, phase: discarding(null, null) }), 'natural',
      'kdo sebral talon, hraje bez trumfů, i když druh ještě nevybral',
    );
    // licitovaný: trumf null je jen „bez červeného příhozu" — řadí se do barevné hry
    assert.equal(
      handOrderMode({ ...baseV, config: defaultConfig('licitovany'), phase: discarding(null, null) }), 'trump',
      'v licitovaném chybějící trumf neznamená hru bez trumfů',
    );

    // převzetí: stojící nárok je novější než už překonaná deklarace v `contract`
    assert.equal(
      handOrderMode({
        ...baseV, contract: mkContract('hra'),
        phase: { name: 'takeover', toAct: 1, passed: [],
          standing: { declarer: 1, mode: 'betl', trump: null, bid: null } },
      }),
      'natural', 'nárok na betl přebíjí překonanou deklaraci hry',
    );
    console.log('PASS vějíř — v betlu/durchu klesá desítka pod spodka (přirozené pořadí)');
  }

  // ── „Barva?" je otázka, ne souhlas — hláška ji nesmí přebít ────────────
  {
    const { bubbleText, talkSituationFor, isColourQuestion } =
      await import('../src/lib/ui/table');
    let st: StA = initialState(defaultConfig('voleny'), 2); // forhont = 0 = aktér
    st = apply(st, { type: 'deal', seed: 4 });
    st = apply(st, actsA(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people') as ActA);
    st = apply(st, actsA(st).find((a) => a.type === 'discard' && a.cards.every((c) => ptsA(c) === 0)) as ActA);
    assert.equal(st.phase.name, 'takeover', 'po odhozu se aktér ptá „Barva?"');

    const ask = actsA(st).find((a) => a.type === 'takeover' && a.claim === 'good') as ActA;
    assert.ok(ask.type === 'takeover' && ask.seat === 0, 'ptá se aktér (forhont)');
    st = apply(st, ask); // otázkou se fáze nemění, mluví se pořád o témž závazku

    assert.equal(isColourQuestion(ask, st), true, 'aktérovo „dobrá" je otázka');
    assert.equal(
      talkSituationFor(ask, st), null,
      'za „Barva?" se hláška neříká — popisek nese informaci (§5.8)',
    );
    assert.equal(bubbleText(ask, st), 'Barva?');

    // odpověď obrany souhlas JE — tam hláška patří
    const answer = actsA(st).find((a) => a.type === 'takeover' && a.claim === 'good') as ActA;
    assert.ok(answer.type === 'takeover' && answer.seat !== 0, 'odpovídá obrana');
    assert.equal(isColourQuestion(answer, st), false);
    assert.equal(talkSituationFor(answer, st), 'accept', 'souhlas obrany hláškou nahradit lze');
    assert.equal(bubbleText(answer, st), 'Dobrá');
    console.log('PASS bublina — „Barva?" zůstane otázkou, souhlas obrany smí být hláška');
  }

  // ── i2: seed musí být celé číslo v rozsahu 32 bitů ─────────────────────
  {
    const { parseSeedParam, createSeedSequence } = await import('../src/lib/match/seedSequence');
    for (const bad of ['1.5', '-1', '1e300', String(2 ** 53), String(2 ** 32), 'NaN', 'Infinity']) {
      assert.equal(parseSeedParam(`?seed=${bad}`), null, `seed „${bad}" nesmí projít`);
    }
    for (const ok of ['0', '10', String(2 ** 32 - 1)]) {
      assert.equal(parseSeedParam(`?seed=${ok}`), Number(ok), `seed „${ok}" je platný`);
    }
    // posloupnost se u velkých čísel nesmí zastavit na místě
    const seq = createSeedSequence(2 ** 32 - 3);
    const three = [seq.next(), seq.next(), seq.next()];
    assert.equal(new Set(three).size, 3, 'tři hry = tři různé seedy');
    console.log('PASS regrese i2 — seed jen celé číslo v rozsahu, posloupnost se nezasekne');
  }

  // ── i4/i5/i24: sav — nemožné převzetí, zlomkový trumf, platné módy ─────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');

    // dotáhni do převzetí
    let st: StA = initialState(defaultConfig('voleny'), 2);
    st = apply(st, { type: 'deal', seed: 11 });
    let guard = 0;
    while (st.phase.name !== 'takeover') {
      if ((guard += 1) > 50) throw new Error('scénář i4 se zasekl');
      const a = actsA(st);
      st = apply(st,
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => ptsA(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ?? a[0]);
    }
    const patch = (mutate: (s: Record<string, unknown>) => void): void => {
      saveMatch(st);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };

    /*
     * (i4, přehodnoceno v §25) Mód `null` je v převzetí legitimní: tak vypadá
     * otázka „Barva?", která teď přichází PŘED deklarací (čl. VII/1), a
     * kontrakt v tu chvíli ještě neexistuje. Zakázaný zůstává mód 'hra' —
     * z něj by `resolveTakeover` vyrobil bezbarvý kontrakt a hra by se
     * dohrávala v přirozeném pořadí a zúčtovala jako durch.
     */
    patch((x) => { ((x.phase as Record<string, unknown>).standing as Record<string, unknown>).mode = null; });
    assert.ok(loadMatch(), 'otázka „Barva?" (mód null, bez kontraktu) se musí obnovit');
    patch((x) => { ((x.phase as Record<string, unknown>).standing as Record<string, unknown>).mode = 'hra'; });
    assert.equal(loadMatch(), null, 'mód „hra" v převzetí musí být odmítnut');

    // (i24) POZITIVNÍ případ: betl i durch v převzetí musí projít, jinak by
    // se rozehraný zápas při obnovení tiše zahodil
    for (const mode of ['betl', 'durch'] as const) {
      patch((x) => {
        ((x.phase as Record<string, unknown>).standing as Record<string, unknown>).mode = mode;
        x.contract = {
          mode, trump: null, declarer: 0, sedma: null, kilo: null, dveSedmy: false,
        };
      });
      assert.ok(loadMatch(), `probíhající převzetí na ${mode} se musí obnovit`);
    }

    // (i5) zlomkový trumf: projde rozsahem, ale žádná barva se mu nerovná
    patch((x) => {
      x.contract = {
        mode: 'hra', trump: 0.5, declarer: 0, sedma: null, kilo: null, dveSedmy: false,
      };
    });
    assert.equal(loadMatch(), null, 'zlomkový trumf musí být odmítnut');
    patch((x) => { x.revealedTrump = 2.5; });
    assert.equal(loadMatch(), null, 'zlomková ukázaná karta musí být odmítnuta');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i4/i5/i24 — sav: mód převzetí, zlomkový trumf, platné módy');
  }

  // ── i11: post-build krok vymění 'unsafe-inline' za hashe inline skriptů ─
  {
    const { withScriptHashes, inlineScriptHashes } = await import('./csp');
    const page = [
      '<!doctype html><html><head>',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ',
      'script-src \'self\' \'unsafe-inline\' https://gc.zgo.at; style-src \'self\' \'unsafe-inline\'">',
      '<script>window.__lang="cs"</script>',
      '<script src="https://gc.zgo.at/count.v4.js" integrity="sha384-x"></script>',
      '</head><body><script>console.log(1)</script></body></html>',
    ].join('');

    const hashes = inlineScriptHashes(page);
    assert.equal(hashes.length, 2, 'dva inline skripty (externí se nehashuje)');
    for (const h of hashes) assert.match(h, /^'sha256-[A-Za-z0-9+/=]{40,}'$/);

    const out = withScriptHashes(page);
    const policy = /content="([^"]+)"/.exec(out)?.[1] as string;
    const scriptSrc = policy.split(';').find((d) => d.trim().startsWith('script-src')) as string;
    assert.equal(scriptSrc.includes("'unsafe-inline'"), false, "script-src už nesmí mít 'unsafe-inline'");
    for (const h of hashes) assert.ok(scriptSrc.includes(h), 'hash inline skriptu musí být v script-src');
    // styly zůstávají (inline styly Astra) a ostatní direktivy se nemění
    assert.ok(policy.includes("style-src 'self' 'unsafe-inline'"), 'style-src se nemá měnit');
    assert.ok(policy.includes("default-src 'self'"), 'ostatní direktivy zůstávají');
    assert.ok(policy.includes('https://gc.zgo.at'), 'povolený host analytiky zůstává');
    // idempotence: druhý běh nesmí hashe zdvojit
    assert.equal(withScriptHashes(out), out, 'opakovaný běh nic nemění');
    // stránka bez inline skriptů: jen odebrání 'unsafe-inline'
    const noInline = page.replace(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal(/script-src[^;]*unsafe-inline/.test(withScriptHashes(noInline)), false);
    console.log('PASS regrese i11 — CSP hashe inline skriptů místo \'unsafe-inline\'');
  }

  // ── i12/i13: politika bez zástupných hostů a bez blob: ─────────────────
  {
    const layout = readFileSync(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    const policy = /http-equiv="Content-Security-Policy"[\s\S]{0,80}content="([^"]+)"/.exec(layout)?.[1] as string;
    assert.ok(policy, 'CSP meta musí existovat');
    // žádný zástupný host: goatcounter je self-service, *.goatcounter.com
    // by povolil i domény cizích lidí
    assert.equal(policy.includes('*'), false, `CSP nesmí obsahovat žádný zástupný znak: ${policy}`);
    assert.ok(policy.includes('https://flek.goatcounter.com'), 'povolen je jen náš subdomain');
    // blob: ve worker-src je zbytečná cesta ke spuštění cizího kódu
    const worker = policy.split(';').find((d) => d.trim().startsWith('worker-src')) as string;
    assert.equal(worker.includes('blob:'), false, 'worker-src nesmí povolovat blob:');
    assert.ok(worker.includes("'self'"), "worker-src musí povolovat 'self'");
    console.log('PASS regrese i12/i13 — CSP bez zástupných hostů a bez blob:');
  }
}


// ── regrese: deváté kolo fixpoint review-code (2026-08-25, po 8803888) ──────

{
  const { initialState, apply } = await import('../src/lib/rules/engine');
  const { legalActions } = await import('../src/lib/rules/legal');
  const { view } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { pointsOf: ptsB } = await import('../src/lib/cards');
  type StB = ReturnType<typeof initialState>;
  type ActB = ReturnType<typeof legalActions>[number];
  const actsB = (st: StB): ActB[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalActions(view(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  // ── i5/i13/i19: post-build krok NESMÍ tiše neudělat nic ────────────────
  {
    const { scriptSrcAllowsInline, hasScriptPolicy, withScriptHashes } = await import('./csp');

    // detekce „politika je pořád bezzubá" — i s escapovanými apostrofy
    const loose = '<meta content="script-src \'self\' \'unsafe-inline\'">';
    assert.equal(scriptSrcAllowsInline(loose), true, "'unsafe-inline' se musí poznat");
    const escaped = '<meta content="script-src &#39;self&#39; &#39;unsafe-inline&#39;">';
    assert.equal(scriptSrcAllowsInline(escaped), true, 'i escapovaný apostrof se musí poznat');
    assert.equal(
      scriptSrcAllowsInline('<meta content="script-src \'self\' \'sha256-abc\'">'), false,
      'zpevněná politika nesmí být hlášena jako bezzubá',
    );
    // 'unsafe-inline' v JINÉ direktivě (style-src) není chyba
    assert.equal(
      scriptSrcAllowsInline('<meta content="script-src \'self\'; style-src \'unsafe-inline\'">'), false,
      "'unsafe-inline' ve style-src je v pořádku",
    );
    assert.equal(hasScriptPolicy('<meta content="default-src \'self\'">'), false, 'bez script-src');
    assert.equal(hasScriptPolicy(loose), true);

    /*
     * Politika sama obsahuje apostrofy ('self'), takže regex na uvozovky musí
     * být svázaný zpětnou referencí — jinak match skončí uvnitř politiky
     * a celý krok tiše neudělá nic (přesně to i5 popisuje).
     */
    const page = '<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-inline\'">'
      + '<script>window.x=1</script>';
    const out = withScriptHashes(page);
    assert.equal(scriptSrcAllowsInline(out), false, 'po zpracování už politika nesmí být bezzubá');
    assert.match(out, /'sha256-[A-Za-z0-9+/=]+'/, 'hash inline skriptu musí být v politice');
    assert.ok(out.startsWith('<meta http-equiv="Content-Security-Policy"'), 'atribut se nesmí rozbít');

    // stránka v jednoduchých uvozovkách se taky musí zpracovat
    const single = "<meta content='script-src \"self\" \\'unsafe-inline\\''><script>window.y=1</script>";
    assert.equal(scriptSrcAllowsInline(withScriptHashes(single)), false, 'jednoduché uvozovky taky');

    // ochrana proti tomu, že krok vypadne z buildu
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    assert.match(pkg.scripts.build, /csp\.ts/, 'build MUSÍ spouštět zpevnění CSP');
    const mk = readFileSync(join(ROOT, 'Makefile'), 'utf8');
    assert.match(mk, /^all: .*smoke/m, 'make all musí spouštět i smoke (kontroluje doručenou politiku)');
    console.log('PASS regrese i5/i13/i19 — zpevnění CSP nemůže tiše neproběhnout');
  }

  // ── i1/i4: sav — nemožné kontrakty a plný rozehraný štych ──────────────
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch, loadMatch } = await import('../src/lib/match/persist');

    let st: StB = initialState({ ...defaultConfig('voleny'), autoSettlePlainHra: false }, 2);
    st = apply(st, { type: 'deal', seed: 3 });
    let guard = 0;
    while (st.phase.name !== 'tricks') {
      if ((guard += 1) > 200) throw new Error('scénář i1 se zasekl');
      const a = actsB(st);
      st = apply(st,
        a.find((x) => x.type === 'choose-trump' && x.card !== 'from-people') ??
        a.find((x) => x.type === 'discard' && x.cards.every((c) => ptsB(c) === 0)) ??
        a.find((x) => x.type === 'declare' && x.mode === 'hra' && !x.sedma && !x.kilo) ??
        a.find((x) => x.type === 'takeover' && x.claim === 'good') ??
        a.find((x) => x.type === 'good') ?? a[0]);
    }
    const patch = (mutate: (s: Record<string, unknown>) => void): void => {
      saveMatch(st);
      const parsed = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
      mutate(parsed.state);
      store.set('flek.match.v1', JSON.stringify(parsed));
    };
    saveMatch(st);
    assert.ok(loadMatch(), 'poctivá sehrávka se musí obnovit');

    // (i1) betl s trumfem: beats() by nominovanou barvu brala jako trumf
    patch((x) => {
      const c = x.contract as Record<string, unknown>;
      c.mode = 'betl'; c.sedma = null; c.kilo = null; // trump zůstává!
    });
    assert.equal(loadMatch(), null, 'betl s trumfem musí být odmítnut');

    // (i1) barevná hra BEZ trumfu: legalPlays přestane vynucovat trumf
    patch((x) => { (x.contract as Record<string, unknown>).trump = null; });
    assert.equal(loadMatch(), null, 'hra bez trumfu musí být odmítnuta');

    // (i1) sedma/kilo v bezbarvé hře
    patch((x) => {
      const c = x.contract as Record<string, unknown>;
      c.mode = 'betl'; c.trump = null; c.sedma = 1; c.kilo = null;
    });
    assert.equal(loadMatch(), null, 'sedma v betlu musí být odmítnuta');
    patch((x) => {
      const c = x.contract as Record<string, unknown>;
      c.mode = 'durch'; c.trump = null; c.sedma = null; c.kilo = 2;
    });
    assert.equal(loadMatch(), null, 'kilo v durchu musí být odmítnuto');
    // pozitivně: čistý betl projít MUSÍ
    patch((x) => {
      const c = x.contract as Record<string, unknown>;
      c.mode = 'betl'; c.trump = null; c.sedma = null; c.kilo = null;
    });
    assert.ok(loadMatch(), 'poctivý betl se musí obnovit');

    // (i4) skutečně rozehraný štych (2 karty) projít MUSÍ …
    let mid: StB = st;
    for (let i = 0; i < 2; i += 1) {
      mid = apply(mid, actsB(mid).find((a) => a.type === 'play') as ActB);
    }
    assert.equal(mid.phase.name === 'tricks' ? mid.phase.trick.length : -1, 2, 'scénář i4 čeká dvě karty');
    saveMatch(mid);
    assert.ok(loadMatch(), 'dvě karty v rozehraném štychu jsou v pořádku');

    // … tři už ne: reducer plný štych okamžitě vyhodnocuje, takže v savu
    // znamená, že další tah vyrobí štych o čtyřech kartách
    const three = JSON.parse(JSON.stringify(mid)) as Record<string, unknown>;
    const phase = three.phase as Record<string, unknown>;
    const hand0 = (three.hands as number[][])[(mid.phase.name === 'tricks' ? mid.phase.toAct : 0)];
    (phase.trick as unknown[]).push({ seat: mid.phase.name === 'tricks' ? mid.phase.toAct : 0, card: hand0[0] });
    (three.hands as number[][])[(mid.phase.name === 'tricks' ? mid.phase.toAct : 0)] = hand0.slice(1);
    store.set('flek.match.v1', JSON.stringify({ v: 1, state: three }));
    assert.equal(loadMatch(), null, 'plný štych v savu musí být odmítnut (jinak by měl 4 karty)');

    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS regrese i1/i4 — sav: nemožné kontrakty a plný rozehraný štych');
  }
}


// ── hlášky u stolu (§5.8) a zvuky (§5.7) ───────────────────────────────────

{
  const { tableTalk, talkFires, TALK_SITUATIONS, TALK_TABLES } =
    await import('../src/lib/ui/tableTalk');
  const LANGS = ['cs', 'en', 'de', 'fr'] as const;
  const SETS = ['slusna', 'hospodska', 'vulgarni'] as const;

  // ── úplnost: každá situace, každý jazyk, obě sady ──────────────────────
  {
    assert.ok(TALK_SITUATIONS.length >= 7, 'situací má být aspoň sedm');
    /*
     * Dost hlášek na to, aby se v jedné hře neopakovaly. Osm jich bylo málo:
     * `accept` padne v jednom rozdání klidně šestkrát a hráč slyšel pořád to
     * samé. Okno „nedávno řečených" (RECENT_TALK) proto musí zůstat MENŠÍ než
     * nejkratší tabulka, jinak se vyhýbání vyčerpá a repertoár se zase zúží.
     */
    const { RECENT_TALK } = await import('../src/lib/ui/table');
    let shortest = Infinity;
    for (const [name, table] of Object.entries(TALK_TABLES)) {
      for (const [situation, lines] of Object.entries(table as Record<string, Record<string, readonly string[]>>)) {
        for (const lang of LANGS) {
          const n = (lines[lang] ?? []).length;
          assert.ok(n >= 14, `${name}/${lang}/${situation}: jen ${n} hlášek, má být aspoň 14`);
          shortest = Math.min(shortest, n);
        }
      }
    }
    assert.ok(
      RECENT_TALK < shortest,
      `okno nedávných hlášek (${RECENT_TALK}) musí být menší než nejkratší tabulka (${shortest})`,
    );
    for (const situation of TALK_SITUATIONS) {
      for (const set of SETS) {
        for (const lang of LANGS) {
          const line = tableTalk(situation, { set, lang, seed: [1] });
          assert.ok(line, `${set}/${lang}/${situation}: chybí hláška`);
          assert.ok((line as string).trim().length > 0, `${set}/${lang}/${situation}: prázdná hláška`);
        }
      }
    }
    // hospodská sada dědí od slušné tam, kde vlastní variantu nemá
    assert.equal('fromPeople' in TALK_TABLES.PUB, false, 'scénář počítá se zděděnou situací');
    // zděděná situace bere hlášky ze slušné sady (výběr se liší, seznam ne)
    const politeFromPeople = TALK_TABLES.POLITE.fromPeople.cs;
    for (let i = 0; i < 20; i += 1) {
      const line = tableTalk('fromPeople', { set: 'hospodska', lang: 'cs', seed: [i] }) as string;
      assert.ok(politeFromPeople.includes(line), `zděděná hláška „${line}" musí být ze slušné sady`);
    }
    console.log(
      `PASS hlášky — úplnost ${TALK_SITUATIONS.length} situací × ${LANGS.length} jazyky × ${SETS.length} sady`,
    );
  }

  // ── vypnuto = ticho ───────────────────────────────────────────────────
  for (const situation of TALK_SITUATIONS) {
    assert.equal(tableTalk(situation, { set: 'off', lang: 'cs', seed: [1] }), null,
      `vypnuté hlášky musí mlčet (${situation})`);
  }

  // ── determinismus a pestrost ──────────────────────────────────────────
  {
    // tentýž stav musí dát tutéž hlášku — jinak by text „blikal" při každém
    // překreslení (přepnutí jazyka, vzoru karet) u téže akce
    for (let i = 0; i < 20; i += 1) {
      const seed = [1, i, 'x'];
      assert.equal(
        tableTalk('accept', { set: 'slusna', lang: 'cs', seed }),
        tableTalk('accept', { set: 'slusna', lang: 'cs', seed }),
        'tentýž seed musí dát tutéž hlášku',
      );
    }
    // …ale napříč okamžiky se hlášky musí střídat
    for (const situation of TALK_SITUATIONS) {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i += 1) {
        seen.add(tableTalk(situation, { set: 'slusna', lang: 'cs', seed: [i] }) as string);
      }
      assert.ok(seen.size >= 3, `${situation}: hlášky se musí střídat (viděno ${seen.size})`);
    }
    // sady se od sebe musí lišit (jinak by přepínač nedával smysl)
    const polite = new Set<string>();
    const pub = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      polite.add(tableTalk('handLost', { set: 'slusna', lang: 'cs', seed: [i] }) as string);
      pub.add(tableTalk('handLost', { set: 'hospodska', lang: 'cs', seed: [i] }) as string);
    }
    assert.equal([...pub].some((l) => polite.has(l)), false, 'hospodská sada musí mít vlastní hlášky');
    const vulgar = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      vulgar.add(tableTalk('handLost', { set: 'vulgarni', lang: 'cs', seed: [i] }) as string);
    }
    assert.equal([...vulgar].some((l) => polite.has(l)), false, 'vulgární sada nesmí sahat do slušné');
    assert.ok([...vulgar].some((l) => !pub.has(l)), 'vulgární sada musí mít vlastní hlášky');
    console.log('PASS hlášky — determinismus, pestrost a odlišnost sad');
  }

  // ── `avoid`: dva soupeři nesmí říct totéž hned po sobě ────────────────
  {
    for (const situation of TALK_SITUATIONS) {
      for (const set of SETS) {
        const opts = { set, lang: 'cs' as const, seed: [1, 2, 3] };
        const first = tableTalk(situation, opts) as string;
        const second = tableTalk(situation, { ...opts, avoid: [first] }) as string;
        assert.notEqual(second, first, `${set}/${situation}: avoid musí hlášku změnit`);

        // a ani při shodném seedu se nesmí opakovat nic z nedávné historie
        const recent = [first, second];
        for (let i = 0; i < 4; i += 1) {
          const next = tableTalk(situation, { ...opts, avoid: recent }) as string;
          assert.equal(recent.includes(next), false, `${set}/${situation}: „${next}" padlo nedávno`);
          recent.push(next);
        }

        // když „nedávno padlo" pokryje celou tabulku, ať radši mluví, než mlčí
        const all = (TALK_TABLES.POLITE[situation as keyof typeof TALK_TABLES.POLITE].cs ?? []) as readonly string[];
        const anyway = tableTalk(situation, { ...opts, avoid: [...all, ...recent] });
        assert.ok(anyway, 'při vyčerpané tabulce se hláška nesmí ztratit');
      }
    }
    // determinismus platí i s `avoid`
    const a = tableTalk('accept', { set: 'slusna', lang: 'cs', seed: [9], avoid: ['Dobrá.'] });
    const b = tableTalk('accept', { set: 'slusna', lang: 'cs', seed: [9], avoid: ['Dobrá.'] });
    assert.equal(a, b, 'výběr s avoid musí být deterministický');
    console.log('PASS hlášky — nedávno řečené se neopakují (dva soupeři neřeknou totéž)');
  }

  // ── hygiena textů: jdou do innerHTML a do bubliny ─────────────────────
  {
    let count = 0;
    for (const [name, table] of Object.entries(TALK_TABLES)) {
      for (const [situation, lines] of Object.entries(table as Record<string, Record<string, readonly string[]>>)) {
        for (const lang of LANGS) {
          for (const line of lines[lang] ?? []) {
            count += 1;
            assert.equal(/[<>]/.test(line), false, `${name}/${lang}/${situation}: „${line}" má HTML metaznak`);
            assert.ok(line.length <= 46, `${name}/${lang}/${situation}: „${line}" je na bublinu moc dlouhá`);
            assert.equal(line.trim(), line, `${name}/${lang}/${situation}: „${line}" má bílé znaky na kraji`);
          }
        }
      }
    }
    console.log(`PASS hlášky — hygiena ${count} textů (bez HTML, délka do 46 znaků)`);
  }

  // ── talkFires: deterministické a přiměřeně řídké ──────────────────────
  {
    /*
     * Determinismus se NEDÁ ověřit dvěma voláními v jednom procesu: `Math.random()
     * < 1/3` by takový test prošlo v pěti případech z devíti. Pinujeme proto
     * konkrétní vzorek — ten musí sedět napříč běhy i implementacemi.
     */
    const pattern = Array.from({ length: 24 }, (_, i) => (talkFires(3, [i]) ? '1' : '0')).join('');
    assert.equal(pattern, '100111010101000011110001', `vzorek se změnil: ${pattern}`);
    assert.equal(
      Array.from({ length: 24 }, (_, i) => (talkFires(3, [i]) ? '1' : '0')).join(''), pattern,
      'opakovaný běh musí dát týž vzorek',
    );
    let fired = 0;
    for (let i = 0; i < 300; i += 1) if (talkFires(3, [i])) fired += 1;
    assert.ok(fired > 60 && fired < 140, `hláška u štychu má padnout asi třetinově (padlo ${fired}/300)`);
    let always = 0;
    for (let i = 0; i < 50; i += 1) if (talkFires(1, [i])) always += 1;
    assert.equal(always, 50, 'chanceOneIn 1 znamená vždy');
    console.log('PASS hlášky — výběr okamžiku je deterministický a řídký');
  }

  // ── zvuky: autoplay policy a tichý dublér ─────────────────────────────
  {
    const { createSounds, silentSounds } = await import('../src/lib/ui/sounds');

    // bez Web Audio (Node, staré prohlížeče) se hra nesmí ani zakuckat
    assert.doesNotThrow(() => {
      const s0 = createSounds(true);
      s0.unlock();
      s0.play('deal');
      s0.setEnabled(false);
    }, 'bez AudioContext musí zvuky tiše mlčet');
    assert.doesNotThrow(() => silentSounds.play('win'));

    // podvržený AudioContext: sleduje, kolik zdrojů se opravdu rozezvučelo
    let started: number = 0;
    let created: number = 0;
    class FakeParam {
      value = 0;
      setValueAtTime(): this { return this; }
      exponentialRampToValueAtTime(): this { return this; }
    }
    class FakeNode {
      connect(next: unknown): unknown { return next; }
    }
    class FakeSource extends FakeNode {
      buffer: unknown = null;
      start(): void { started += 1; }
      stop(): void {}
    }
    class FakeCtx {
      state: 'suspended' | 'running' = 'suspended';
      currentTime = 0;
      constructor() { created += 1; }
      sampleRate = 48000;
      destination = new FakeNode();
      createGain(): unknown { return { gain: new FakeParam(), connect: (n: unknown) => n }; }
      createBiquadFilter(): unknown {
        return { type: '', frequency: new FakeParam(), Q: new FakeParam(), connect: (n: unknown) => n };
      }
      createBuffer(): unknown { return { getChannelData: () => new Float32Array(16) }; }
      createBufferSource(): unknown { return new FakeSource(); }
      createOscillator(): unknown {
        return { type: '', frequency: new FakeParam(), connect: (n: unknown) => n, start: () => { started += 1; }, stop: () => {} };
      }
      /*
       * Kontext se probouzí AŽ s dojitím příslibu, ne hned při zavolání — přesně
       * tak to dělá prohlížeč. Se synchronním probuzením by test neuviděl zvuk
       * poslaný těsně po `unlock()`, který se ve skutečnosti zahodí.
       */
      resume(): Promise<void> {
        return new Promise((r) => setTimeout(() => { this.state = 'running'; r(); }, 1));
      }
    }
    const g = globalThis as { AudioContext?: unknown };
    const orig = g.AudioContext;
    g.AudioContext = FakeCtx as never;

    /*
     * Uložené „zvuky vypnuto" se předává KONSTRUKTORU (`createSounds(settings.sounds)`
     * v main.ts) a `setEnabled` se při startu nevolá — takže konstruktor je jediné
     * místo, které to nastavení ctí. Bez tohohle testu by `let on = true` znamenalo,
     * že uživatel s vypnutým zvukem ho slyší po každém načtení stránky.
     */
    const off = createSounds(false);
    off.unlock();
    await new Promise((r) => setTimeout(r, 5));
    for (const name of ['deal', 'play', 'trick', 'flek', 'win', 'lose'] as const) off.play(name);
    assert.equal(started, 0, 'createSounds(false) nesmí přehrát nic');
    // a vypnutý zvuk nesmí ani otevřít AudioContext (na mobilu budí zvukovou relaci)
    assert.equal(created, 0, 'vypnutý zvuk nesmí zakládat AudioContext');
    // dá se zapnout za běhu
    off.setEnabled(true);
    off.unlock();
    await new Promise((r) => setTimeout(r, 5));
    off.play('deal');
    assert.ok(started > 0, 'po zapnutí musí zvuk naskočit i u vypnuto-zrozeného');
    started = 0;

    const snd = createSounds(true);
    // PŘED gestem uživatele se nesmí ozvat nic (autoplay policy)
    snd.play('deal');
    assert.equal(started, 0, 'před gestem uživatele musí být ticho');

    snd.unlock();
    await new Promise((r) => setTimeout(r, 5)); // resume() je asynchronní
    snd.play('deal');
    assert.ok(started > 0, 'po odemknutí se zvuk ozvat musí');

    // vypnutí opravdu vypne
    const before = started;
    snd.setEnabled(false);
    for (const name of ['deal', 'play', 'trick', 'flek', 'win', 'lose'] as const) snd.play(name);
    assert.equal(started, before, 'vypnuté zvuky nesmí nic přehrát');

    // každý ze šesti zvuků musí sám o sobě něco rozeznít (ne jen „nespadne")
    snd.setEnabled(true);
    for (const name of ['deal', 'play', 'trick', 'flek', 'win', 'lose'] as const) {
      const mark: number = started;
      assert.doesNotThrow(() => snd.play(name), `zvuk ${name} nesmí vyhodit výjimku`);
      assert.ok(started > mark, `zvuk ${name} nic nerozezněl (chybí větev?)`);
    }
    assert.ok(started > before, 'po zapnutí se zvuky zas ozvou');

    /*
     * `resume()` je asynchronní, takže zvuk poslaný HNED za `unlock()` ještě
     * narazí na uspaný kontext a tiše se zahodí. Tlačítko „zvuky" na tom stojí:
     * potvrzovací „deal" se hraje až z příslibu, který `unlock()` vrací.
     */
    const cold = createSounds(true);
    started = 0;
    const resumed = cold.unlock();
    cold.play('deal');
    assert.equal(started, 1, 'hned po unlock() zazní jen odemykací ticháč, ne vyžádaný zvuk');
    await resumed;
    cold.play('deal');
    assert.ok(started > 1, 'po dojití příslibu z unlock() se zvuk ozvat MUSÍ');

    /*
     * A totéž pro `playWhenUnlocked` — to je ta cesta, kterou jde potvrzení po
     * zapnutí zvuku v nastavení. Kdyby se vrátila na `unlock(); play()`, zvuk
     * by narazil na uspaný kontext a uživatel by po zapnutí neslyšel nic.
     */
    const fresh = createSounds(true);
    started = 0;
    fresh.playWhenUnlocked('deal');
    assert.equal(started, 1, 'hned po zavolání zazní jen odemykací ticháč — vyžádaný zvuk ještě ne');
    // dvakrát: `resume()` dojde v jednom úkolu, `then` na něm v dalším
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(started > 1, 'jakmile kontext naběhne, potvrzení se ozvat MUSÍ');

    if (orig === undefined) delete g.AudioContext; else g.AudioContext = orig;
    console.log('PASS zvuky — autoplay policy, odemknutí příslibem, potvrzení po zapnutí, všech šest zvuků');
  }

  // ── komentář k vyúčtování se escapuje (jde do innerHTML) ──────────────
  {
    const { settlementHtml } = await import('../src/lib/ui/resultHtml');
    const { defaultConfig } = await import('../src/lib/rules/sazby');
    const result = {
      handNo: 0,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      cardPoints: { declarer: 60, defenders: 30 },
      marriagePoints: { declarer: 0, defenders: 0 },
      components: [], delta: [2, -1, -1] as [number, number, number],
    };
    const v = {
      seat: 0 as const, config: defaultConfig('voleny'), dealer: 2 as const, hand: [],
      handCounts: [0, 0, 0], revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null,
      contract: result.contract, phase: { name: 'scored' as const, result },
      publicHistory: [], handResults: [result], ledger: [2, -1, -1], handNo: 1,
    };
    const deps = { humanSeat: 0 as const, nameOf: () => 'Franta', pattern: () => 'modern' as const };

    const plain = settlementHtml(result as never, v as never, deps);
    assert.equal(plain.includes('felt-talk'), false, 'bez hlášky se komentář nevykresluje');

    const withTalk = settlementHtml(result as never, v as never, { ...deps, talkLine: 'Dobrá hra' });
    assert.ok(withTalk.includes('felt-talk'), 'hláška se má vykreslit');
    assert.ok(withTalk.includes('Dobrá hra'), 'text hlášky má být vidět');

    const evil = settlementHtml(result as never, v as never, {
      ...deps, talkLine: '<img src=x onerror=alert(1)>',
    });
    assert.equal(evil.includes('<img src=x'), false, 'komentář musí být escapovaný');
    assert.ok(evil.includes('&lt;img src=x'), 'escapovat, ne zahazovat');
    console.log('PASS hlášky — komentář k vyúčtování se escapuje');
  }
}


// ── IQ za běhu ───────────────────────────────────────────────────────────────
/*
 * Přepnutí obtížnosti v nastavení nesmí shodit rozehraný zápas (dřív volalo
 * UI „nový zápas", takže hráč spadl na úvodní obrazovku a o hru přišel).
 * Kontrola je na požadavcích, které controller posílá driveru: musí se změnit
 * OBTÍŽNOST i ROZPOČET, a to bez ztráty stavu.
 */
{
  const { MatchController: MC9 } = await import('../src/lib/match/controller');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { think } = await import('../src/lib/ai/think');

  const seen: { difficulty: string; budgetMs: number }[] = [];
  const driver = {
    think: async (req: Parameters<typeof think>[0] & { requestId: number }) => {
      seen.push({ difficulty: req.difficulty, budgetMs: req.budgetMs });
      return think({ view: req.view, difficulty: 'easy', seed: req.seed, budgetMs: 0 });
    },
    cancel: () => {},
  };

  let seed = 700;
  const mc = new MC9(driver, {
    config: defaultConfig('voleny'),
    humanSeat: 0,
    difficulty: 'easy',
    budgetMs: 0,
    seedSource: () => (seed += 1),
    aiDelayMs: 0,
    autoGood: true,
  });
  mc.dealNext();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const historyBefore = mc.state.history.length;
  const handBefore = JSON.stringify(mc.state.hands[0]);

  mc.setDifficulty('hard', 2200);
  // rozehrané rozdání zůstává — žádný reset, žádná nová ruka
  assert.equal(mc.state.phase.name !== 'idle', true, 'IQ nesmí zahodit rozehranou hru');
  assert.equal(JSON.stringify(mc.state.hands[0]), handBefore, 'IQ nesmí přerozdat karty');
  assert.ok(mc.state.history.length >= historyBefore, 'IQ nesmí umazat historii');

  // dotlač hru k tahu AI, ať driver dostane další požadavek
  let guard = 0;
  while (mc.actor() === 0 && mc.state.phase.name !== 'scored') {
    guard += 1;
    assert.ok(guard < 200, 'IQ test: zaseknutý zápas');
    const legal = mc.humanLegal();
    if (legal.length === 0) break;
    mc.dispatch(legal[0]!);
  }
  await sleep(30);
  const afterSwitch = seen.filter((r) => r.difficulty === 'hard' && r.budgetMs === 2200);
  assert.ok(afterSwitch.length > 0, 'po přepnutí musí AI dostat nové IQ i rozpočet');
}
console.log('PASS IQ — přepnutí obtížnosti platí hned a nezahodí rozehraný zápas');


// ── názvy karet ve všech jazycích ────────────────────────────────────────────
/*
 * Názvy barev a hodnot jdou do přístupnostních popisků. Chybějící jazyk se
 * dřív tiše propadl na češtinu — Francouz by slyšel „zelené desítka".
 * `currentLang()` čte třídu na <html>, takže si test podstrčí minimální
 * dokument a jazyk mění přes něj.
 */
{
  let lang = 'cs';
  const g = globalThis as { document?: unknown };
  const hadDocument = 'document' in g;
  g.document = { documentElement: { classList: { contains: (c: string) => c === `lang-${lang}` } } };

  const { suitName, cardName } = await import('../src/lib/ui/cardAssets');
  const names = new Map<string, string>();
  for (const l of ['cs', 'en', 'de', 'fr']) {
    lang = l;
    for (let c = 0; c < 32; c += 1) {
      const n = cardName(c);
      assert.ok(n.length > 0 && !/undefined/.test(n), `${l}: název karty ${c} = „${n}"`);
    }
    for (let sIdx = 0; sIdx < 4; sIdx += 1) {
      const n = suitName(sIdx as 0 | 1 | 2 | 3);
      assert.ok(n.length > 0 && !/undefined/.test(n), `${l}: název barvy ${sIdx} = „${n}"`);
    }
    names.set(l, `${suitName(0)}|${cardName(7)}`);
  }
  // rozlišující kontrola: žádný jazyk nesmí být jen propadnutá čeština
  for (const l of ['en', 'de', 'fr']) {
    assert.notEqual(names.get(l), names.get('cs'), `${l}: názvy karet propadly na češtinu`);
  }
  if (!hadDocument) delete g.document;
}
console.log('PASS karty — názvy barev a hodnot ve všech čtyřech jazycích');


// ── vzdání hry (house rule §5.5.2) ───────────────────────────────────────────
/*
 * Vzdání je jediná akce, která obchází `legalActions`, a platí se u ní ručně
 * spočítaná částka — obojí si zaslouží deterministické pokrytí.
 *
 * Rozlišující bod testu: kontrakt musí mít OHLÁŠENOU SEDMU I KILO, červený
 * trumf a aspoň jeden flek. Kdyby se platila jen hra (jak to dělala první
 * verze), byl by rozdíl v částce několikanásobný a test spadne.
 */
{
  const { initialState: init, apply: ap } = await import('../src/lib/rules/engine');
  const { legalActions: legal } = await import('../src/lib/rules/legal');
  const { view: viewOf } = await import('../src/lib/rules/view');
  const { defaultConfig } = await import('../src/lib/rules/sazby');
  const { think: thinkC } = await import('../src/lib/ai/think');
  const { Random: Rnd } = await import('../src/lib/random');
  const { CERVENE: CERV } = await import('../src/lib/cards');

  type S = ReturnType<typeof init>;
  const cfg = defaultConfig('licitovany');

  /**
   * Dohraj aukci a ve fázi fleků flekuj podle rozpisu `want`.
   *
   * Rozpis je tam schválně: kdyby měly všechny komponenty STEJNOU úroveň
   * fleku, test by nerozlišil „každá komponenta má svůj flek" od „všechny
   * berou flek hry". Proto se flekuje hra dvakrát a sedma jednou.
   *
   * Pořadí odpovídá kolům (čl. V/4): v prvním kole flekuje obrana (jeden hráč
   * hru, druhý sedmu), ve druhém aktér zvedne hru na re.
   */
  const driveToTricks = (seed: number, want: string[] = ['hra', 'sedma', 'hra']): S => {
    let st: S = ap(init(cfg, 2), { type: 'deal', seed });
    const queue = [...want];
    for (let steps = 0; steps < 400 && st.phase.name !== 'tricks' && st.phase.name !== 'scored'; steps += 1) {
      for (const seat of [0, 1, 2] as const) {
        const v = viewOf(st, seat);
        const acts = legal(v);
        if (acts.length === 0) continue;
        const wanted = queue[0];
        const flekAct = wanted === undefined
          ? undefined
          : acts.find((a) => a.type === 'flek' && a.target === wanted);
        if (flekAct) {
          queue.shift();
          st = ap(st, flekAct);
        } else {
          const { action } = thinkC({
            view: v, difficulty: 'easy', seed: Rnd.derive(seed, steps * 3 + seat), budgetMs: 0, iterations: 0,
          });
          st = ap(st, action);
        }
        break;
      }
    }
    return st;
  };

  const st = driveToTricks(4);
  assert.equal(st.phase.name, 'tricks', 'seed 4: hra se nedostala do sehrávky');
  const contract = st.contract;
  assert.ok(contract, 'seed 4: chybí kontrakt');
  // bez těchto vlastností by test neměl co rozlišit
  assert.notEqual(contract.sedma, null, 'seed 4 měl hlásit sedmu — test by jinak nic neověřil');
  assert.notEqual(contract.kilo, null, 'seed 4 měl hlásit kilo — test by jinak nic neověřil');
  assert.equal(contract.trump, CERV, 'seed 4 měl hrát červené — test by jinak neověřil násobek');
  const flekLevels: Record<string, number> = {};
  for (const a of st.history) if (a.type === 'flek') flekLevels[a.target] = (flekLevels[a.target] ?? 0) + 1;
  assert.ok((flekLevels.hra ?? 0) > 0, 'na hru nepadl flek — test by neověřil multiplikátor');
  assert.ok((flekLevels.sedma ?? 0) > 0, 'na sedmu nepadl flek — test by neověřil vlastní flek komponenty');
  assert.notEqual(
    flekLevels.hra, flekLevels.sedma,
    'hra a sedma mají stejnou úroveň fleku — test by nerozlišil vlastní flek od sdíleného',
  );

  // vzdání NENÍ v legálních akcích — jinak by ho AI mohla zahrát sama
  for (const seat of [0, 1, 2] as const) {
    const acts = legal(viewOf(st, seat));
    assert.equal(acts.some((a) => a.type === 'concede'), false, `sedadlo ${seat}: concede se objevil v legalActions`);
  }

  // očekávaná částka spočítaná nezávisle na engine
  const sz = cfg.sazby;
  const levels: Record<string, number> = {};
  for (const a of st.history) if (a.type === 'flek') levels[a.target] = (levels[a.target] ?? 0) + 1;
  const flekMul = (t: string): number => 2 ** (levels[t] ?? 0);
  const cerv = sz.cervenyMultiplier;
  const expected =
    sz.hra * flekMul('hra') * cerv +
    sz.sedma * flekMul('sedma') * cerv +
    sz.kilo * flekMul('kilo') * cerv;

  const conceder = contract.declarer;
  const after = ap(st, { type: 'concede', seat: conceder });
  assert.equal(after.phase.name, 'scored', 'vzdání musí hru rovnou vyúčtovat');
  const res = after.phase.name === 'scored' ? after.phase.result : null;
  assert.ok(res, 'vzdání nevrátilo výsledek');

  assert.equal(res.delta[conceder], -2 * expected, 'vzdávající platí oběma soupeřům celý stojící závazek');
  for (const other of [0, 1, 2] as const) {
    if (other === conceder) continue;
    assert.equal(res.delta[other], expected, `soupeř ${other} má dostat celou sazbu`);
  }
  assert.equal(res.delta[0] + res.delta[1] + res.delta[2], 0, 'zúčtování vzdání musí být zero-sum');

  // regrese i9: dřív se platila jen hra, takže by částka byla výrazně nižší
  const plainGameOnly = sz.hra * flekMul('hra') * cerv;
  assert.ok(expected > plainGameOnly, 'kontrola i9 by nic nerozlišila (chybí sedma/kilo)');
  assert.notEqual(-res.delta[conceder] / 2, plainGameOnly, 'vzdání se účtuje jen jako holá hra (regrese i9)');

  // komponenty odpovídají stojícím závazkům, každá se svým flekem
  const targets = res.components.map((c) => c.target).sort();
  assert.deepEqual(targets, ['hra', 'kilo', 'sedma'], 'komponenty vzdání neodpovídají kontraktu');
  for (const c of res.components) {
    assert.equal(c.amount, c.baseRate * c.flekMultiplier * c.extraMultiplier, `komponenta ${c.target}: amount nesedí`);
    assert.equal(c.extraMultiplier, cerv, `komponenta ${c.target}: chybí červený násobek`);
    assert.equal(c.note, 'vzdáno');
  }

  // ledger se posunul přesně o delta
  for (const seat of [0, 1, 2] as const) {
    assert.equal(after.ledger[seat], st.ledger[seat] + res.delta[seat], `ledger sedadla ${seat}`);
  }

  // replay: vzdání je v historii a `history.reduce(apply)` dá stejný stav
  const replayed = after.history.reduce<S>(
    (acc, a) => (a.type === 'deal' ? ap(init(cfg, 2), a) : ap(acc, a)),
    init(cfg, 2),
  );
  assert.deepEqual(replayed, after, 'replay historie se vzdáním nedal stejný stav');

  // strážce fází: vzdát jde jen rozehranou hru
  assert.throws(() => ap(init(cfg, 2), { type: 'concede', seat: 0 }), /rozehranou/, 'concede v idle musí selhat');
  assert.throws(() => ap(after, { type: 'concede', seat: 0 }), /rozehranou/, 'concede po zúčtování musí selhat');

  /*
   * Převzetí betlem: nárok drží `phase.standing`, kontrakt ještě NEEXISTUJE —
   * ve voleném se totiž o převzetí rozhoduje před deklarací (čl. VII/1).
   * Vzdání se proto musí účtovat podle nároku (betl/durch), ne jako holá hra,
   * jinak by šlo z betlu utéct za sazbu 1. Scénář je vynucený (nárok `betl`
   * je ve fázi převzetí legální vždy), takže nemůže tiše vypadnout.
   */
  /*
   * Dvě podoby téhož podle čl. VII/1: obránce „sebere talon" a vzdá ještě
   * PŘED volbou betl/durch (platí aspoň betl — zvednutý talon nesmí být únik
   * za sazbu hry), a druhý obránce, který z ohlášeného betla nárokuje durch a
   * vzdá ve fázi převzetí (platí durch).
   */
  for (const claim of ['betl', 'durch'] as const) {
    const cfgV = defaultConfig('voleny');
    let tst: S = ap(init(cfgV, 2), { type: 'deal', seed: 4 });
    let claimed: number | null = null;
    // původní aktér = ten, kdo se ptal „Barva?" (talonOwner je uprostřed převzetí schválně null)
    let originalActor: number | null = null;
    for (let steps = 0; steps < 200 && tst.phase.name !== 'tricks' && tst.phase.name !== 'scored'; steps += 1) {
      if (tst.phase.name === 'takeover' && claimed === null) {
        const actor = tst.phase.toAct;
        const acts = legal(viewOf(tst, actor));
        const st = tst.phase.standing;
        if (st.mode === null && actor === st.declarer) {
          // aktér se nejdřív zeptá „Barva?"
          originalActor = actor;
          tst = ap(tst, acts.find((a) => a.type === 'takeover' && a.claim === 'good')!);
          continue;
        }
        if (st.mode === null) {
          // obránce sebere talon
          const take = acts.find((a) => a.type === 'takeover' && a.claim === 'take');
          assert.ok(take, 'obránce musí mít možnost sebrat talon');
          assert.ok(
            !acts.some((a) => a.type === 'takeover' && (a.claim === 'betl' || a.claim === 'durch')),
            'obránce druh hry bez trumfů NEHLÁSÍ naslepo — vybírá až s talonem (čl. VII/1)',
          );
          tst = ap(tst, take);
          if (claim === 'betl') { claimed = actor; break; } // vzdává hned s talonem v ruce
          continue;
        }
        // z ohlášeného betla přebírá durchem ten, kdo talon nezvedl a nebyl aktér
        const durch = acts.find((a) => a.type === 'takeover' && a.claim === 'durch');
        assert.ok(durch, 'z ohlášeného betla musí jít přebrat na durch');
        claimed = actor;
        tst = ap(tst, durch);
        break; // vzdáváme ROVNOU ve fázi převzetí, dokud kontrakt neexistuje
      }
      if (claim === 'durch' && tst.phase.name === 'declare' && tst.phase.standing.trump === null) {
        // přebírající po odhozu hlásí betl, aby bylo z čeho přebírat durchem
        tst = ap(tst, legal(viewOf(tst, tst.phase.standing.declarer)).find((a) => a.type === 'declare' && a.mode === 'betl')!);
        continue;
      }
      for (const seat of [0, 1, 2] as const) {
        const v = viewOf(tst, seat);
        const acts = legal(v);
        if (acts.length === 0) continue;
        const { action } = thinkC({
          view: v, difficulty: 'easy', seed: Rnd.derive(4, steps * 3 + seat), budgetMs: 0, iterations: 0,
        });
        tst = ap(tst, action);
        break;
      }
    }
    assert.notEqual(claimed, null, `scénář s převzetím (${claim}) vůbec nenastal — test by nic neověřil`);
    assert.notEqual(originalActor, null, 'scénář musí projít otázkou „Barva?"');
    assert.notEqual(claimed, originalActor, 'scénář vyžaduje, aby přebíral OBRÁNCE, ne původní aktér');
    // rozlišující bod: kontrakt ještě není, nárok žije ve standing
    assert.equal(tst.contract, null, 'před deklarací kontrakt neexistuje — to je jádro nálezu');
    if (claim === 'betl') {
      assert.equal(tst.phase.name, 'discard-talon', 'se sebraným talonem se nejdřív odhazuje');
      assert.equal(tst.hands[claimed as 0 | 1 | 2].length, 12, 'přebírající drží 12 karet');
      if (tst.phase.name === 'discard-talon') assert.equal(tst.phase.standing.mode, null, 'druh ještě nevybral');
    } else {
      assert.equal(tst.phase.name, 'takeover', 'po nároku na durch se pokračuje ve fázi převzetí');
      if (tst.phase.name === 'takeover') assert.equal(tst.phase.standing.mode, 'durch');
    }

    const rate = claim === 'betl' ? cfgV.sazby.betl : cfgV.sazby.durch;
    const out = ap(tst, { type: 'concede', seat: claimed as 0 | 1 | 2 });
    const r = out.phase.name === 'scored' ? out.phase.result : null;
    assert.ok(r);
    assert.deepEqual(r.components.map((c) => c.target), [claim], `vzdání po převzetí se účtuje jako ${claim}`);
    assert.equal(r.components[0]!.baseRate, rate, `účtuje se sazba ${claim}, ne hry`);
    assert.equal(r.components[0]!.extraMultiplier, 1, `${claim} nemá červený násobek`);
    assert.equal(r.contract.declarer, claimed, 'do výsledku patří ten, kdo hru drží po převzetí');
    assert.equal(-r.delta[claimed as 0 | 1 | 2], 2 * rate, `vzdávající platí ${claim} oběma`);
    assert.notEqual(rate, cfgV.sazby.hra, `sazby ${claim} a hry se musí lišit, jinak test nic nerozliší`);
  }

  /*
   * Opačná větev téhož: po deklaraci (fáze fleků) je autoritativní `contract`
   * a vzdání musí zaplatit i vedlejší závazky (sedmu/kilo). Kdyby se kontrakt
   * přepočítával ze `standing` vždycky, tyhle komponenty by se ztratily.
   */
  {
    const cfgV = defaultConfig('voleny');
    // seed 1: aktér drží trumfovou sedmu, takže jde deklarovat hru SE SEDMOU
    let tst: S = ap(init(cfgV, 2), { type: 'deal', seed: 1 });
    for (let steps = 0; steps < 200 && tst.phase.name !== 'fleks' && tst.phase.name !== 'scored'; steps += 1) {
      for (const seat of [0, 1, 2] as const) {
        const v = viewOf(tst, seat);
        const acts = legal(v);
        if (acts.length === 0) continue;
        // vynuť deklaraci se sedmou, ať je co ztratit; převzetí se jen schvaluje
        const withSedma = acts.find((a) => a.type === 'declare' && a.mode === 'hra' && a.sedma);
        const goodTakeover = acts.find((a) => a.type === 'takeover' && a.claim === 'good');
        tst = ap(tst, withSedma ?? goodTakeover ?? thinkC({
          view: v, difficulty: 'easy', seed: Rnd.derive(1, steps * 3 + seat), budgetMs: 0, iterations: 0,
        }).action);
        break;
      }
    }
    assert.equal(tst.phase.name, 'fleks', 'fixtura předpokládá fázi fleků');
    assert.notEqual(tst.contract, null);
    assert.notEqual(tst.contract!.sedma, null, 'fixtura předpokládá ohlášenou sedmu — jinak nic nerozliší');

    const out = ap(tst, { type: 'concede', seat: tst.contract!.declarer });
    const r = out.phase.name === 'scored' ? out.phase.result : null;
    assert.ok(r);
    assert.deepEqual(
      r.components.map((c) => c.target).sort(), ['hra', 'sedma'],
      'po deklaraci se platí i vedlejší závazky z kontraktu',
    );
  }

  /*
   * Vysoutěžený závazek v licitovaném: mezi koncem licitace a deklarací je
   * `contract` pořád `null`, ale závazek už drží `phase.standing.bid`.
   * Vzdání v téhle mezeře se nesmí účtovat jako holá hra.
   */
  {
    let bst: S = ap(init(cfg, 2), { type: 'deal', seed: 4 });
    for (let steps = 0; steps < 200 && bst.phase.name !== 'discard-talon' && bst.phase.name !== 'scored'; steps += 1) {
      for (const seat of [0, 1, 2] as const) {
        const v = viewOf(bst, seat);
        const acts = legal(v);
        if (acts.length === 0) continue;
        // vynuť co nejvyšší závazek, ať se rozdíl proti holé hře pozná
        const durch = acts.find((a) => a.type === 'bid' && a.bid !== 'pass' && a.bid.kind === 'durch');
        bst = ap(bst, durch ?? thinkC({
          view: v, difficulty: 'easy', seed: Rnd.derive(77, steps * 3 + seat), budgetMs: 0, iterations: 0,
        }).action);
        break;
      }
    }
    assert.equal(bst.phase.name, 'discard-talon', 'fixtura předpokládá fázi po skončené licitaci');
    assert.equal(bst.contract, null, 'v discard-talonu ještě kontrakt neexistuje — to je jádro nálezu');
    const st = bst.phase.name === 'discard-talon' ? bst.phase.standing : null;
    assert.ok(st?.bid, 'fixtura předpokládá vysoutěžený závazek');
    assert.equal(st.bid.kind, 'durch', 'fixtura předpokládá vysoutěžený durch');

    const out = ap(bst, { type: 'concede', seat: st.declarer });
    const r = out.phase.name === 'scored' ? out.phase.result : null;
    assert.ok(r);
    assert.deepEqual(r.components.map((c) => c.target), ['durch'], 'vzdání se účtuje podle vysoutěženého závazku');
    assert.equal(-r.delta[st.declarer], 2 * cfg.sazby.durch, 'platí se sazba durchu, ne hry');
  }

  /*
   * Vzdát může i OBRÁNCE — pak platí on, ne aktér, a strany se nemění.
   */
  {
    const defender = ([0, 1, 2] as const).find((x) => x !== contract.declarer) as 0 | 1 | 2;
    const out = ap(st, { type: 'concede', seat: defender });
    const r = out.phase.name === 'scored' ? out.phase.result : null;
    assert.ok(r);
    assert.equal(r.delta[defender], -2 * expected, 'vzdávající obránce platí oběma');
    assert.equal(r.delta[contract.declarer], expected, 'aktér při vzdání obránce inkasuje');
    assert.equal(r.components[0]!.wonBy, 'declarer', 'vzdá-li obránce, vyhrál aktér');
  }

  // vzdání ještě před deklarací: základní sazba hry a ŽÁDNÁ vymyšlená barva
  {
    const cfgV = defaultConfig('voleny');
    const fresh: S = ap(init(cfgV, 2), { type: 'deal', seed: 4 });
    assert.equal(fresh.contract, null, 'fixtura předpokládá stav před deklarací');
    const out = ap(fresh, { type: 'concede', seat: 0 });
    const r = out.phase.name === 'scored' ? out.phase.result : null;
    assert.ok(r);
    assert.equal(r.contract.trump, null, 'bez deklarace se nesmí dosadit trumfová barva');
    assert.equal(-r.delta[0], 2 * cfgV.sazby.hra, 'bez kontraktu se platí základní sazba hry');
  }
}
console.log('PASS vzdání — platí se celý stojící závazek, mimo legalActions, replay sedí');


// ── sav po vzdání ────────────────────────────────────────────────────────────
/*
 * Vzdání před deklarací zapisuje do archivu „hru bez trumfu" — a `isContract`
 * takový kontrakt u ŽIVÉHO stavu (správně) odmítá. Kdyby platila stejná
 * přísnost i na archiv, jediné takové vzdání by udělalo z každého dalšího
 * savu nenačitatelný: `handResults` si ten záznam nese pořád dál.
 */
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, val: string) => void store.set(k, val),
    removeItem: (k: string) => void store.delete(k),
  };
  const { saveMatch: save, loadMatch: load, VERSION: SAV_V } = await import('../src/lib/match/persist');
  const { initialState: init2, apply: ap2 } = await import('../src/lib/rules/engine');
  const { defaultConfig: cfg2 } = await import('../src/lib/rules/sazby');

  const c = cfg2('voleny');
  const conceded = ap2(ap2(init2(c, 2), { type: 'deal', seed: 4 }), { type: 'concede', seat: 0 });
  assert.equal(conceded.phase.name, 'scored');
  save(conceded);
  assert.notEqual(load(), null, 'sav s vzdáním před deklarací se musí dát načíst');
  assert.deepEqual(load(), JSON.parse(JSON.stringify(conceded)), 'sav po vzdání musí projít beze změny');

  // a ještě jedna hra navrch: archiv se nese dál, takže by otrávil i další savy
  const next = ap2(conceded, { type: 'deal', seed: 5 });
  save(next);
  assert.notEqual(load(), null, 'archiv vzdané hry nesmí zneplatnit pozdější savy');
  assert.ok(
    load()!.history.some((a) => a.type === 'concede'),
    'akce concede musí projít whitelistem historie',
  );

  // ŽIVÝ kontrakt bez trumfu ale zůstává nepřípustný (legalPlays by přestal vynucovat trumf)
  const raw = JSON.parse(store.get('flek.match.v1') as string) as { v: number; state: Record<string, unknown> };
  raw.state.contract = { mode: 'hra', trump: null, declarer: 0, sedma: null, kilo: null, dveSedmy: false };
  store.set('flek.match.v1', JSON.stringify(raw));
  assert.equal(load(), null, 'živá „hra bez trumfu" se pořád musí odmítnout');

  /*
   * Vysoutěžený závazek v savu musí mít tvar příhozu, ne „jakýkoli objekt":
   * `bidRank` na cizím tvaru vrátí `undefined`, každé porovnání s ním je
   * `false` — a minimum z licitace (čl. VII/3) tiše přestane platit, takže
   * aktér smí z vydraženého durchu ohlásit holou hru.
   */
  const dealt = ap2(init2(c, 2), { type: 'deal', seed: 4 });
  const badBids: unknown[] = [
    {}, { kind: 'hra', cervena: false }, { kind: 'sedma' }, { kind: 'sedma', cervena: 'ano' },
    // `String(['durch'])` je taky 'durch' — pole `JSON.parse` vyrobí přímo
    { kind: ['durch'], cervena: false },
    // kombinace, které licitace nikdy nevydá: `bidRank` na nich vrací -1, tedy
    // míň než každá deklarace, takže by minimum z licitace přestalo platit
    { kind: 'betl', cervena: true }, { kind: 'durch', cervena: true },
  ];
  for (const bid of badBids) {
    const bad = JSON.parse(JSON.stringify({ v: SAV_V, state: dealt })) as { v: number; state: { phase: Record<string, unknown> } };
    bad.state.phase = { name: 'discard-talon', standing: { declarer: 0, mode: null, trump: null, bid } };
    store.set('flek.match.v1', JSON.stringify(bad));
    assert.equal(load(), null, `sav s příhozem ${JSON.stringify(bid)} se musí odmítnout`);
  }
  // a korektní příhoz projít musí — jinak by test procházel i s `() => false`
  const okSave = JSON.parse(JSON.stringify({ v: SAV_V, state: dealt })) as { v: number; state: { phase: Record<string, unknown> } };
  okSave.state.phase = {
    name: 'discard-talon',
    standing: { declarer: 0, mode: null, trump: null, bid: { kind: 'durch', cervena: false } },
  };
  store.set('flek.match.v1', JSON.stringify(okSave));
  assert.notEqual(load(), null, 'platný vysoutěžený závazek se načíst musí');

  /*
   * Starší obálka: v2 se načíst SMÍ, ale jen mimo komentování.
   *
   * `FlekState.spoke` změnil význam (§36), takže rozehraná kolečka z v2 nesou
   * sedadlo, které „domluvilo" po jediném fleku — nový reduktor by mu slovo
   * nevrátil a komponenta by se vyúčtovala o stupeň níž. Dopočítat, co by hráč
   * řekl, nejde. Jenže `spoke` nikde jinde než v payloadu fáze „fleks" není,
   * takže odmítnout kvůli tomu i sav z klidu znamená vynulovat hráči konto
   * a archiv — a další autosave to pak přepíše nadobro (§38).
   */
  assert.ok(SAV_V > 2, 'verze obálky se kvůli změně významu `spoke` musela zvednout');
  store.set('flek.match.v1', JSON.stringify({ ...okSave, v: 2 }));
  assert.notEqual(load(), null, 'sav verze 2 mimo komentování se načíst musí — nese konto a archiv');
  assert.equal(
    (JSON.parse(store.get('flek.match.v1') as string) as { v: number }).v, SAV_V,
    'a rovnou se přepíše na aktuální verzi, ať se migrace neopakuje',
  );

  // konto a archiv migraci přežijí (to je celý důvod, proč se v2 vůbec přijímá)
  const withLedger = JSON.parse(JSON.stringify({ v: 2, state: conceded })) as { v: number; state: unknown };
  assert.ok(conceded.handResults.length > 0, 'testovací sav musí mít co ztratit');
  store.set('flek.match.v1', JSON.stringify(withLedger));
  const migrated = load();
  assert.deepEqual(migrated?.ledger, conceded.ledger, 'konto musí přežít migraci z v2');
  assert.equal(migrated?.handResults.length, conceded.handResults.length, 'a archiv odehraných her taky');

  // rozehraná kolečka z v2 se ale načíst nesmějí — to je to jediné, co nejde přenést
  const v2Fleks = JSON.parse(JSON.stringify({ v: 2, state: dealt })) as { v: number; state: { contract: unknown; phase: unknown } };
  v2Fleks.state.contract = { mode: 'hra', trump: 0, declarer: 0, sedma: null, kilo: null, dveSedmy: false };
  v2Fleks.state.phase = {
    name: 'fleks',
    fleks: { levels: {}, lastRaiser: {}, toAct: 1, spoke: [0], open: ['hra'], raised: [], round: 0 },
  };
  store.set('flek.match.v1', JSON.stringify(v2Fleks));
  assert.equal(load(), null, 'rozehraná komentovací kolečka z v2 se načíst nesmějí (starý význam `spoke`)');
  // …a nesmí to být tím, že by ten stav byl vadný sám o sobě
  store.set('flek.match.v1', JSON.stringify({ ...v2Fleks, v: SAV_V }));
  assert.notEqual(load(), null, 'tentýž stav ve v3 projít musí — odmítá se verze, ne tvar');

  /*
   * Migrace nesmí přepsat, co mezitím zapsal jiný panel. Záznam je sdílený:
   * druhý panel může tentýž sav zmigrovat a rozehrát dřív, než se první dostane
   * k zápisu — a ten by mu pak konto i archiv vrátil o kus zpátky.
   */
  {
    const stale = JSON.stringify({ v: 2, state: conceded });
    const newer = JSON.stringify({ v: SAV_V, state: next }); // co mezitím zapsal druhý panel
    store.set('flek.match.v1', stale);
    const real = store.get.bind(store);
    // čtení uvnitř `loadMatch`: první dá starý sav, druhé (kontrolní) už ten cizí
    let reads = 0;
    store.get = ((k: string) => {
      reads += 1;
      if (k === 'flek.match.v1' && reads === 2) store.set('flek.match.v1', newer);
      return real(k);
    }) as typeof store.get;
    assert.notEqual(load(), null, 'sav se i tak načte — o co jde, je ten zápis');
    store.get = real;
    assert.equal(store.get('flek.match.v1'), newer, 'migrace nesmí přepsat novější zápis z jiného panelu');
  }

  // a neznámá verze zůstává odmítnutá (migruje se jen z v2)
  store.set('flek.match.v1', JSON.stringify({ ...okSave, v: 1 }));
  assert.equal(load(), null, 'sav verze 1 se pořád načíst nesmí');
}
console.log('PASS sav — v2 mimo komentování se migruje, rozehrané fleky z v2 ne, cizí příhoz ani živá hra bez trumfu neprojdou');

// ── únik skrytých informací do workeru (review pravidel, §25 i1/i2) ─────────
/*
 * Fér hra se tvrdí v README, takže se musí i testovat — a to na CELÉM vstupu
 * workeru, ne jen na jednom poli. Dvě samostatné díry: karta v `publicHistory`
 * (redakce ji vynechávala) a seed AI odvozený ze seedu rozdání (`derive` je
 * invertibilní, takže z něj šlo spočítat zamíchání balíčku = všechny ruce).
 */
{
  const { initialState: initL, apply: apL } = await import('../src/lib/rules/engine');
  const { legalActions: legalL } = await import('../src/lib/rules/legal');
  const { view: viewL } = await import('../src/lib/rules/view');
  const { defaultConfig: cfgL } = await import('../src/lib/rules/sazby');
  const { Random: RndL } = await import('../src/lib/random');
  type StL = ReturnType<typeof initL>;

  /** Karty, které dané sedadlo v daném stavu NESMÍ znát. */
  const secretsFor = (st: StL, seat: 0 | 1 | 2): Set<number> => {
    const out = new Set<number>();
    for (const s2 of [0, 1, 2] as const) {
      if (s2 === seat) continue;
      for (const c of st.hands[s2]) out.add(c);
    }
    for (const c of st.unseen) out.add(c);
    for (const c of st.talon) out.add(c);
    /*
     * Co sedadlo FYZICKY vidělo, skrytá informace není: vlastní odhoz zná
     * navždy, i když talon po převzetí zvedl soupeř a drží ty karty v ruce
     * (ČSM volený B/7). Proto se `talonKnowledge` z tajemství odečítá.
     */
    for (const c of st.talonKnowledge[seat]) out.delete(c);
    return out;
  };

  /** Všechny hodnoty pod klíči, které nesou karty (rekurzivně). */
  const cardValues = (value: unknown, key = ''): number[] => {
    const CARD_KEYS = ['card', 'cards', 'hand', 'talon', 'talonKnown', 'revealedTrump', 'won', 'trick'];
    const out: number[] = [];
    const walk = (v: unknown, k: string, inCardKey: boolean): void => {
      const here = inCardKey || CARD_KEYS.includes(k);
      if (typeof v === 'number') { if (here) out.push(v); return; }
      if (Array.isArray(v)) { for (const x of v) walk(x, k, here); return; }
      if (v !== null && typeof v === 'object') {
        for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
          walk(vv, kk, CARD_KEYS.includes(kk) ? true : kk === 'seat' ? false : here && kk !== 'winner');
        }
      }
    };
    walk(value, key, false);
    return out;
  };

  let checkedStates = 0;
  let chooseTrumpSeen = 0;
  for (const variant of ['voleny', 'licitovany'] as const) {
    for (let seed = 101; seed <= 130; seed += 1) {
      const rng = new RndL(seed * 7 + 1);
      let st: StL = initL(cfgL(variant), 2);
      // velké seedy: kdyby prosákl do pohledu, nespletl by se s kartou ani počtem
      st = apL(st, { type: 'deal', seed: 1_000_003 * seed });
      let guard = 0;
      while (st.phase.name !== 'scored' && st.phase.name !== 'idle') {
        if ((guard += 1) > 400) throw new Error('únik-test: hra se zasekla');
        for (const seat of [0, 1, 2] as const) {
          const v = viewL(st, seat);
          const secret = secretsFor(st, seat);
          for (const n of cardValues(v)) {
            assert.ok(!secret.has(n), `${variant}/${seed}: karta ${n} unikla sedadlu ${seat} (${st.phase.name})`);
          }
          // seed rozdání se do pohledu nesmí dostat v žádné podobě
          assert.ok(
            !JSON.stringify(v).includes(String(st.seed)),
            `${variant}/${seed}: seed rozdání je v pohledu sedadla ${seat}`,
          );
          for (const a of v.publicHistory) {
            if (a.type !== 'choose-trump') continue;
            chooseTrumpSeen += 1;
            assert.ok(
              a.card === 'hidden' || a.card === 'from-people',
              `${variant}/${seed}: veřejná historie nese zvolenou kartu (${String(a.card)})`,
            );
          }
          checkedStates += 1;
        }
        let acted = false;
        for (const seat of [0, 1, 2] as const) {
          const acts = legalL(viewL(st, seat));
          if (acts.length === 0) continue;
          st = apL(st, acts[rng.int(acts.length)]);
          acted = true;
          break;
        }
        if (!acted) break;
      }
    }
  }
  assert.ok(chooseTrumpSeen > 0, 'test musí projít i volbou trumfu, jinak nic nekontroluje');
  console.log(`PASS únik — pohled hráče neobsahuje cizí karty ani seed rozdání (${checkedStates} stavů)`);
}

/*
 * Únik druhým kanálem: přes REDUKTOR, ne přes `view()`.
 *
 * Testy výš hlídají, že pohled na DANÝ stav neprozradí cizí karty. Neřeknou ale
 * nic o tom, jak stav vzniká — a fáze fleků se do pohledu posílá celá. Když
 * o předání slova rozhodne cokoli z ruky, stačí se dívat na `toAct`: aktér
 * (i heuristika ve workeru) si přečte, co vidět neměl.
 *
 * Konkrétně: aktér hlásí hru a sto, obránce oba flekne. Tím vyčerpá zvýšení
 * i sto proti a zbývá jediná otázka — jestli má čím hlásit SEDMU proti, tedy
 * jestli drží trumfovou sedmu. Přesně tu kartu, podle níž se aktér rozhoduje,
 * jestli hrát na sedmu. Dvě rozdání, která se liší jen jejím držitelem, proto
 * musí po TÉŽE veřejné sekvenci skončit ve shodné veřejné fázi.
 */
{
  const { initialState: initX, apply: apX } = await import('../src/lib/rules/engine');
  const { view: viewX } = await import('../src/lib/rules/view');
  const { legalActions: legalX } = await import('../src/lib/rules/legal');
  const { defaultConfig: cfgX } = await import('../src/lib/rules/sazby');
  const { card: mkX, R7: R7X } = await import('../src/lib/cards');
  type StX = ReturnType<typeof initX>;

  const TRUMP = 2 as const;
  const seven = mkX(TRUMP, R7X);
  const base = apX(initX(cfgX('voleny'), 2), { type: 'deal', seed: 5 });

  /** Aktér 0 hlásil hru + sto; trumfovou sedmu drží zadaný obránce. */
  const withSevenAt = (holder: 1 | 2): StX => {
    const hands = base.hands.map((h) => h.filter((c) => c !== seven)) as StX['hands'];
    hands[holder] = [...hands[holder], seven];
    return {
      ...base,
      hands,
      contract: { mode: 'hra', trump: TRUMP, declarer: 0, sedma: null, kilo: 0, dveSedmy: false },
      phase: {
        name: 'fleks',
        fleks: { levels: {}, lastRaiser: {}, toAct: 1, spoke: [], open: ['hra', 'kilo'], raised: [], round: 0 },
      },
    } as StX;
  };

  const publicAfterFleks = (holder: 1 | 2): string => {
    let st = withSevenAt(holder);
    st = apX(st, { type: 'flek', seat: 1, target: 'hra' });
    st = apX(st, { type: 'flek', seat: 1, target: 'kilo' });
    // co o stavu ví AKTÉR — tedy přesně to, co jde ze stolu vyčíst
    return JSON.stringify(viewX(st, 0).phase);
  };

  assert.equal(
    publicAfterFleks(1), publicAfterFleks(2),
    'veřejná fáze po flecích nesmí záviset na tom, který obránce drží trumfovou sedmu',
  );

  /*
   * Shoda sama nestačí: kdyby se sedmová větev `protiPossible` ztratila, obě
   * varianty by slovo předaly dál — taky shodně, a test by mlčel. Musí se proto
   * ověřit i to, CO má být: obránce drží slovo, protože sedma proti je ještě ve
   * hře. Nabídka se pak liší podle ruky (to je v pořádku — ta je soukromá),
   * ale veřejný stav ne.
   */
  for (const holder of [1, 2] as const) {
    let st = withSevenAt(holder);
    st = apX(st, { type: 'flek', seat: 1, target: 'hra' });
    st = apX(st, { type: 'flek', seat: 1, target: 'kilo' });
    const f = st.phase.name === 'fleks' ? st.phase.fleks : null;
    assert.equal(f?.toAct, 1, `sedma proti je pořád ve hře, obránce 1 drží slovo (sedmu drží ${holder})`);
    assert.deepEqual(f?.spoke, [], 'a do „domluvil" ho to nezapisuje');
    const mine = legalX(viewX(st, 1));
    assert.equal(
      mine.some((a) => a.type === 'announce-proti' && a.sedma), holder === 1,
      'sedmu proti smí hlásit jen ten, kdo ji opravdu drží (nabídka je soukromá)',
    );
    assert.ok(mine.some((a) => a.type === 'good'), 'druhý má aspoň „dobrá" — kolo se nezasekne');
  }

  // a fixtura musí být taková, že je co rozlišovat (jinak by test procházel naprázdno)
  const holdsSeven = (holder: 1 | 2): boolean => withSevenAt(holder).hands[1].includes(seven);
  assert.ok(holdsSeven(1) && !holdsSeven(2), 'fixtura: sedmu má mít jednou obránce 1, podruhé ne');
  console.log('PASS únik — předání slova ve flecích nezávisí na cizí ruce (reduktor, ne jen view)');
}

// seed AI: nesmí jít odvodit ze seedu rozdání (a naopak)
{
  const { MatchController: MCL } = await import('../src/lib/match/controller');
  const { defaultConfig: cfgS } = await import('../src/lib/rules/sazby');
  const { Random: RndS } = await import('../src/lib/random');

  const seedsOf = (dealSeed: number, aiSeedSource?: () => number): number[] => {
    const seen: number[] = [];
    const driver = {
      // požadavek se nikdy nedokončí: stačí zachytit seed, hra běžet nemusí
      think: (r: { seed: number }) => { seen.push(r.seed); return new Promise<never>(() => {}); },
      cancel: () => {},
    };
    const ctrl = new MCL(driver as never, {
      config: cfgS('voleny'), humanSeat: 1, difficulty: 'easy', budgetMs: 0,
      seedSource: () => dealSeed, aiDelayMs: 0, autoGood: false,
      ...(aiSeedSource ? { aiSeedSource } : {}),
    });
    ctrl.dealNext(); // volí forhont (sedadlo 0) = AI, takže požadavek padne hned
    ctrl.stop();
    return seen;
  };

  const DEAL = 123_456_789;
  const got = seedsOf(DEAL);
  assert.ok(got.length > 0, 'test potřebuje aspoň jeden požadavek na AI');
  for (const s of got) {
    for (let n = 0; n <= 5000; n += 1) {
      assert.notEqual(
        RndS.derive(DEAL, n), s,
        `seed AI ${s} je derive(seedRozdání, ${n}) — z toho jde spočítat celé rozdání`,
      );
    }
    assert.notEqual(s, DEAL, 'seed AI nesmí být přímo seed rozdání');
  }
  // dva zápasy s TÝMŽ rozdáním nesmí dát tytéž seedy (jinak je to funkce rozdání)
  assert.notDeepEqual(seedsOf(DEAL), seedsOf(DEAL), 'seed AI nesmí být funkcí seedu rozdání');
  // pro testy a reprodukovatelnost jde základ zafixovat
  assert.deepEqual(seedsOf(DEAL, () => 42), seedsOf(DEAL, () => 42), 'zafixovaný základ musí být deterministický');
  console.log('PASS únik — seed AI je nezávislý na seedu rozdání a nejde z něj invertovat');
}

// ── pořadí „Barva?" a deklarace, licitace od zadáka, volnost deklarace ──────
{
  const { initialState: initR, apply: apR } = await import('../src/lib/rules/engine');
  const { legalActions: legalR } = await import('../src/lib/rules/legal');
  const { view: viewR } = await import('../src/lib/rules/view');
  const { defaultConfig: cfgR } = await import('../src/lib/rules/sazby');
  const { card: mkR, CERVENE: CER, R7: S7R, ESO: AR, R10: TR, KRAL: KR, SVRSEK: SVR } =
    await import('../src/lib/cards');
  const { forhont: forhontR } = await import('../src/lib/rules/types');
  type StR = ReturnType<typeof initR>;
  type ActR = ReturnType<typeof legalR>[number];
  const actsR = (st: StR): ActR[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalR(viewR(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  /*
   * „Pokud chce hrát hru s trumfy, musí dát ještě PO ODLOŽENÍ TALONU možnost
   * ostatním hrát hru bez trumfů (Betl, Durch). Učiní tak otázkou »Barva?«
   * … Pokud oba hráči obrany hru schválí, aktér nahlásí závazek"
   * (ČSM, Obecná pravidla Čl. VII/1).
   *
   * Dřív běželo pořadí obráceně, takže obrana o převzetí rozhodovala se
   * znalostí aktérovy sedmy a sta.
   */
  {
    let checked = 0;
    for (let seed = 1; seed <= 25; seed += 1) {
      let st: StR = apR(initR(cfgR('voleny'), 2), { type: 'deal', seed });
      st = apR(st, actsR(st).find((a) => a.type === 'choose-trump' && a.card !== 'from-people') as ActR);
      const cheap = actsR(st).find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0));
      if (!cheap) continue;
      st = apR(st, cheap);

      assert.equal(st.phase.name, 'takeover', `seed ${seed}: po odhozu se ptá „Barva?"`);
      assert.equal(st.contract, null, 'závazek se hlásí až po převzetí, kontrakt tedy neexistuje');
      if (st.phase.name !== 'takeover') continue;
      assert.equal(st.phase.toAct, st.talonOwner, 'ptá se ten, kdo odhodil talon');

      // obrana rozhoduje BEZ znalosti sedmy a sta — v historii žádná deklarace
      for (const seat of [0, 1, 2] as const) {
        assert.ok(
          !viewR(st, seat).publicHistory.some((a) => a.type === 'declare'),
          'obrana nesmí znát závazek dřív, než se na převzetí vyjádří',
        );
      }

      // aktér se zeptá, obrana schválí → teprve teď hlásí závazek
      let guard = 0;
      while (st.phase.name === 'takeover') {
        if ((guard += 1) > 10) throw new Error('převzetí se zaseklo');
        st = apR(st, actsR(st).find((a) => a.type === 'takeover' && a.claim === 'good') as ActR);
      }
      assert.equal(st.phase.name, 'declare', 'po souhlasu obou obránců hlásí aktér');
      assert.equal(
        st.phase.name === 'declare' ? st.phase.standing.declarer : null, st.talonOwner,
        'hlásí pořád týž aktér',
      );
      // a betl/durch už tady nejsou — ty se nabízely na otázku „Barva?"
      assert.equal(
        actsR(st).some((a) => a.type === 'declare' && a.mode !== 'hra'), false,
        'po „Barva?" se hlásí jen barevná hra',
      );
      checked += 1;
    }
    assert.ok(checked >= 10, `málo prověřených rozdání (${checked})`);
    console.log(`PASS pořadí — „Barva?" před deklarací (${checked} rozdání, ČSM čl. VII/1)`);
  }

  /*
   * „S prvotní nabídkou … začíná licitovat ZADÁK (hráč, který dostává karty
   * jako poslední), tj. hráč sedící ve směru hraní před forhontem"
   * (Obecná pravidla Čl. VII/3). Ve třech je to rozdávající.
   */
  {
    for (const dealer of [0, 1, 2] as const) {
      const st: StR = apR(initR(cfgR('licitovany'), dealer), { type: 'deal', seed: 3 });
      // `deal` posouvá rozdávajícího, takže se ptáme na TEN stav
      assert.equal(st.phase.name, 'bidding');
      if (st.phase.name !== 'bidding') continue;
      assert.equal(st.phase.toAct, st.dealer, 'licitaci otevírá zadák (= rozdávající)');
      assert.notEqual(st.phase.toAct, forhontR(st.dealer), 'forhont neotevírá');
    }
    console.log('PASS licitace — otevírá zadák (ČSM čl. VII/3)');
  }

  /*
   * „Ohlášený závazek nesmí být v dané posloupnosti níže, než jej zavazuje
   * výška ukončené licitace, může se však jednat o JAKÝKOLIV VYŠŠÍ druh
   * závazku" (Obecná pravidla Čl. VII/3).
   */
  {
    const base = cfgR('licitovany');
    // ruka s nečervenou i červenou sedmou, ať jdou sedmové závazky hlásit
    const hand = [mkR(CER, S7R), mkR(1, S7R), mkR(CER, AR), mkR(CER, TR), mkR(1, AR),
      mkR(1, TR), mkR(2, KR), mkR(2, SVR), mkR(3, AR), mkR(3, TR)];
    const mkDeclare = (bid: { kind: string; cervena: boolean } | null) => ({
      seat: 0 as const, config: base, dealer: 2 as const, hand, handCounts: [10, 10, 10] as [number, number, number],
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: [] as number[], contract: null,
      phase: {
        name: 'declare' as const,
        standing: {
          declarer: 0 as const,
          mode: bid?.kind === 'betl' || bid?.kind === 'durch' ? bid.kind : null,
          trump: bid?.cervena ? 0 : null,
          bid,
        },
      },
      publicHistory: [], handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    });
    const kindsOf = (bid: { kind: string; cervena: boolean } | null): string[] =>
      legalR(mkDeclare(bid) as never)
        .flatMap((a) => {
          if (a.type !== 'declare') return [];
          if (a.mode !== 'hra') return [a.mode];
          const cerv = (a.trump ?? 0) === CER ? '-č' : '';
          const kind = a.sedma && a.kilo ? 'sto-sedma' : a.kilo ? 'sto' : a.sedma ? 'sedma' : 'hra';
          return [`${kind}${cerv}`];
        })
        .filter((x, i, all) => all.indexOf(x) === i);

    // po vylicitovaném betlu jde ohlásit durch
    const afterBetl = kindsOf({ kind: 'betl', cervena: false });
    assert.ok(afterBetl.includes('durch'), 'po betlu musí jít ohlásit durch');
    assert.ok(afterBetl.includes('betl'), 'betl samozřejmě taky');
    assert.equal(afterBetl.some((k) => k.startsWith('sto') || k.startsWith('sedma') || k === 'hra'), false,
      'barevná hra je pod betlem — nabízet se nesmí');

    // po nečerveném stu jde nahoru i červené sto, sto a sedma i betl/durch
    const afterSto = kindsOf({ kind: 'sto', cervena: false });
    for (const want of ['sto', 'sto-sedma', 'sto-č', 'sto-sedma-č', 'betl', 'durch']) {
      assert.ok(afterSto.includes(want), `po nečerveném stu musí jít ohlásit ${want}`);
    }
    for (const no of ['hra', 'sedma', 'sedma-č']) {
      assert.equal(afterSto.includes(no), false, `${no} je pod vysoutěženým stem`);
    }

    // po ČERVENÉ sedmě smí i nečervené sto (stupeň 3 > stupeň 2)
    const afterRedSeven = kindsOf({ kind: 'sedma', cervena: true });
    assert.ok(afterRedSeven.includes('sto'), 'nečervené sto je nad červenou sedmou');
    assert.equal(afterRedSeven.includes('hra'), false, 'holá hra je pod vylicitovanou sedmou');
    assert.equal(afterRedSeven.includes('sedma'), false, 'nečervená sedma je pod tou červenou');

    // bez licitace (všichni pasovali) smí forhont holou hru
    assert.ok(kindsOf(null).includes('hra'), 'bez příhozu je holá hra v pořádku');
    console.log('PASS deklarace — vysoutěžený stupeň je MINIMUM, ne přesný předpis (čl. VII/3)');
  }
}

// ── flekování po kolech, proti jen ve voleném, hra bez re ───────────────────
{
  const { initialState: initF, apply: apF } = await import('../src/lib/rules/engine');
  const { legalActions: legalF } = await import('../src/lib/rules/legal');
  const { view: viewF } = await import('../src/lib/rules/view');
  const { defaultConfig: cfgF } = await import('../src/lib/rules/sazby');
  const { card: mkF, R7: S7F, CERVENE: CEF } = await import('../src/lib/cards');
  type StF = ReturnType<typeof initF>;
  type ActF = ReturnType<typeof legalF>[number];
  const actsF = (st: StF): ActF[] => {
    for (const seat of [0, 1, 2] as const) {
      const a = legalF(viewF(st, seat));
      if (a.length > 0) return a;
    }
    return [];
  };

  /*
   * „Sedmu ani sto proti nelze hlásit" (licitovaný čl. II/23). Ve voleném
   * naopak lze — ale jen „v PRVNÍM KOLE komentování ohlášeného trumfového
   * závazku" (Obecná pravidla čl. VII/1).
   */
  {
    const mkFleks = (variant: 'voleny' | 'licitovany', round: number, open: string[]) => ({
      seat: 1 as const, config: cfgF(variant), dealer: 2 as const,
      // obránce drží trumfovou sedmu, takže sedma proti není blokovaná kartami
      hand: [mkF(2, S7F), mkF(2, 1), mkF(3, 1), mkF(3, 2)], handCounts: [4, 4, 4] as [number, number, number],
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      phase: {
        name: 'fleks' as const,
        fleks: { levels: {}, lastRaiser: {}, toAct: 1 as const, spoke: [], open, raised: [], round },
      },
      publicHistory: [], handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    });
    const protiCount = (v: unknown): number =>
      legalF(v as never).filter((a) => a.type === 'announce-proti').length;

    assert.ok(protiCount(mkFleks('voleny', 0, ['hra'])) > 0, 'volený: sedma/sto proti v prvním kole ANO');
    assert.equal(protiCount(mkFleks('voleny', 1, ['hra'])), 0, 'volený: v dalších kolech už ne (čl. VII/1)');
    assert.equal(protiCount(mkFleks('licitovany', 0, ['hra'])), 0, 'licitovaný: proti nelze vůbec (čl. II/23)');

    // a co se nenabízí, to nesmí projít ani ručně poslané reducerem
    const stL: StF = apF(initF(cfgF('licitovany'), 2), { type: 'deal', seed: 5 });
    assert.throws(
      () => apF({ ...stL, contract: { mode: 'hra', trump: 2, declarer: 0, sedma: null, kilo: null, dveSedmy: false },
        phase: { name: 'fleks', fleks: { levels: {}, lastRaiser: {}, toAct: 1, spoke: [], open: ['hra'], raised: [], round: 0 } } } as StF,
        { type: 'announce-proti', seat: 1, sedma: false, kilo: true }),
      /nelegální/, 'reducer musí sto proti v licitovaném odmítnout',
    );
    /*
     * Na pořadí uvnitř tahu nesmí záležet: „flek a sto proti" i „sto proti
     * a flek" je táž řeč u stolu (§36). Sedadlo proto drží slovo, dokud má co
     * říct — a obě cesty musí skončit v témže stavu, jinak by hráči propadlo
     * to, co mu UI o akci dřív samo nabízelo.
     */
    const roundZero: StF = {
      ...stL,
      config: cfgF('voleny'),
      contract: { mode: 'hra', trump: 2, declarer: 0, sedma: null, kilo: null, dveSedmy: false },
      phase: { name: 'fleks', fleks: { levels: {}, lastRaiser: {}, toAct: 1, spoke: [], open: ['hra'], raised: [], round: 0 } },
    } as StF;
    const flekHra: ActF = { type: 'flek', seat: 1, target: 'hra' };
    const stoProti: ActF = { type: 'announce-proti', seat: 1, sedma: false, kilo: true };
    const fleksOf = (st: StF) => (st.phase.name === 'fleks' ? st.phase.fleks : null);

    const afterFlek = apF(roundZero, flekHra);
    assert.equal(fleksOf(afterFlek)?.toAct, 1, 'po fleku drží slovo dál — sto proti má pořád na jazyku');
    assert.ok(
      legalF(viewF(afterFlek, 1)).some((a) => a.type === 'announce-proti' && a.kilo),
      'a sto proti mu zůstalo nabídnuté',
    );
    const afterProti = apF(roundZero, stoProti);
    assert.equal(fleksOf(afterProti)?.toAct, 1, 'po ohlášení taky — flek na hru mu zbývá');
    assert.ok(
      legalF(viewF(afterProti, 1)).some((a) => a.type === 'flek' && a.target === 'hra'),
      'a flek na hru mu zůstal nabídnutý',
    );

    // obě pořadí musí dát tentýž závazek i tytéž úrovně
    const viaFlek = apF(afterFlek, stoProti);
    const viaProti = apF(afterProti, flekHra);
    assert.deepEqual(viaFlek.contract, viaProti.contract, 'závazek nesmí záviset na pořadí kliknutí');
    assert.deepEqual(fleksOf(viaFlek)?.levels, fleksOf(viaProti)?.levels, 'ani úrovně fleků');
    assert.deepEqual(fleksOf(viaFlek)?.toAct, fleksOf(viaProti)?.toAct, 'ani to, kdo mluví dál');
    // a jakmile domluví (buď mu nic nezbylo, nebo řekne „dobrá"), mluví druhý
    const settled = fleksOf(viaFlek)?.toAct === 1
      ? apF(viaFlek, { type: 'good', seat: 1 })
      : viaFlek;
    assert.equal(fleksOf(settled)?.toAct, 2, 'po domluvení jde slovo druhému obránci');
    console.log('PASS proti — jen volený a jen v prvním kole, a nezávisle na pořadí v tahu (čl. VII/1, V/4, II/23)');
  }

  /*
   * „V daném kole schvalování se lze vyjadřovat již jen k tomu závazku, který
   * v předchozím kole protistrana flekovala" (čl. V/4), a fáze končí, jakmile
   * celá jedna strana schválí — ne až po třech pasech.
   */
  {
    const cfg = cfgF('voleny');
    // dotáhni k fleků s hrou I sedmou, ať je co uzavírat
    let st: StF | null = null;
    for (let seed = 1; seed <= 60 && st === null; seed += 1) {
      let s2: StF = apF(initF(cfg, 2), { type: 'deal', seed });
      let guard = 0;
      while (s2.phase.name !== 'fleks' && s2.phase.name !== 'scored' && (guard += 1) < 60) {
        const acts = actsF(s2);
        s2 = apF(s2,
          acts.find((a) => a.type === 'declare' && a.mode === 'hra' && a.sedma) ??
          acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
          acts.find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0)) ??
          acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ?? acts[0]);
      }
      if (s2.phase.name === 'fleks' && s2.contract?.sedma !== null) st = s2;
    }
    assert.ok(st, 'nenašlo se rozdání s hrou i sedmou — test by nic neověřil');
    const fleks0 = st.phase.name === 'fleks' ? st.phase.fleks : null;
    assert.ok(fleks0);
    assert.equal(fleks0.round, 0);
    assert.notEqual(fleks0.toAct, st.contract?.declarer, 'závazek schvaluje obrana, aktér v prvním kole nemluví');
    assert.deepEqual(
      [...fleks0.open].sort(), ['hra', 'sedma'],
      'v prvním kole se komentuje celý závazek',
    );

    // obránce flekne hru → v dalším kole je otevřená JEN hra
    const flekHra = legalF(viewF(st, fleks0.toAct)).find((a) => a.type === 'flek' && a.target === 'hra');
    assert.ok(flekHra, 'flek na hru musí být v prvním kole legální');
    let st2 = apF(st, flekHra);
    /*
     * „U kombinovaných závazků lze flekovat každý z nich samostatně" (čl. V/4):
     * kdo flekl hru, drží slovo dál, protože sedma mu zůstala otevřená. Teprve
     * až ji schválí (nebo flekne), přijde na řadu druhý obránce.
     */
    const fMid = st2.phase.name === 'fleks' ? st2.phase.fleks : null;
    assert.ok(fMid);
    assert.equal(fMid.toAct, fleks0.toAct, 'kdo flekl hru, vyjádří se ještě k sedmě');
    assert.ok(
      legalF(viewF(st2, fMid.toAct)).some((a) => a.type === 'flek' && a.target === 'sedma'),
      'sedma zůstala témuž obránci otevřená',
    );
    st2 = apF(st2, actsF(st2).find((a) => a.type === 'good') as ActF); // sedmu schvaluje
    // druhý obránce dořekne kolo
    st2 = apF(st2, actsF(st2).find((a) => a.type === 'good') as ActF);
    const f1 = st2.phase.name === 'fleks' ? st2.phase.fleks : null;
    assert.ok(f1);
    assert.equal(f1.round, 1, 'po vyjádření celé obrany začíná kolo aktéra');
    assert.equal(f1.toAct, st2.contract?.declarer, 've druhém kole odpovídá aktér');
    assert.deepEqual(f1.open, ['hra'], 'otevřená zůstává jen flekovaná komponenta (čl. V/4)');
    assert.equal(
      legalF(viewF(st2, f1.toAct)).some((a) => a.type === 'flek' && a.target === 'sedma'), false,
      'na sedmu, kterou nikdo neflekoval, se ve druhém kole vyjadřovat nelze',
    );

    // aktér schválí → flekování končí, obrana se už neptá (čl. V/4)
    const st3 = apF(st2, actsF(st2).find((a) => a.type === 'good') as ActF);
    assert.notEqual(st3.phase.name, 'fleks', 'schválení jednou stranou flekování ukončí');
    console.log('PASS fleky — kola, otevřené komponenty a konec po souhlasu strany (čl. V/4)');
  }

  /*
   * Každá komponenta se komentuje SAMOSTATNĚ (čl. V/4: „U kombinovaných závazků
   * lze flekovat každý z nich samostatně"). Flekne-li obrana dvě, aktér se musí
   * dostat k oběma — dřív mu jediné „re" uzavřelo kolo, druhá komponenta zůstala
   * zamrzlá na fleku a vyúčtovala se o stupeň níž, než jak se u stolu mluvilo.
   */
  {
    let st: StF | null = null;
    for (let seed = 1; seed <= 60 && st === null; seed += 1) {
      let s2: StF = apF(initF(cfgF('voleny'), 2), { type: 'deal', seed });
      let guard = 0;
      while (s2.phase.name !== 'fleks' && s2.phase.name !== 'scored' && (guard += 1) < 60) {
        const acts = actsF(s2);
        s2 = apF(s2,
          acts.find((a) => a.type === 'declare' && a.mode === 'hra' && a.sedma) ??
          acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
          acts.find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0)) ??
          acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ?? acts[0]);
      }
      if (s2.phase.name === 'fleks' && s2.contract?.sedma !== null) st = s2;
    }
    assert.ok(st, 'nenašlo se rozdání s hrou i sedmou — test by nic neověřil');
    const declarer = st.contract?.declarer;
    const d0 = st.phase.name === 'fleks' ? st.phase.fleks.toAct : null;
    assert.ok(d0 !== null);

    // první obránce flekne hru a sedmu schválí, druhý flekne sedmu
    let s = apF(st, legalF(viewF(st, d0)).find((a) => a.type === 'flek' && a.target === 'hra') as ActF);
    s = apF(s, actsF(s).find((a) => a.type === 'good') as ActF);
    const fB = s.phase.name === 'fleks' ? s.phase.fleks : null;
    assert.ok(fB);
    assert.notEqual(fB.toAct, d0, 'po vyjádření k oběma komponentám mluví druhý obránce');
    const sedma = legalF(viewF(s, fB.toAct)).find((a) => a.type === 'flek' && a.target === 'sedma');
    assert.ok(sedma, 'druhý obránce smí flekovat sedmu');
    const d1 = fB.toAct;
    s = apF(s, sedma);
    /*
     * Ve voleném kole 0 má i po fleku pořád na jazyku „sto proti" (čl. VII/1),
     * takže tah uzavře až „dobrá" — viz §36. V licitovaném by skončil hned.
     */
    assert.equal(
      s.phase.name === 'fleks' ? s.phase.fleks.toAct : null, d1,
      'dokud má co říct, drží slovo',
    );
    s = apF(s, actsF(s).find((a) => a.type === 'good') as ActF);

    const fC = s.phase.name === 'fleks' ? s.phase.fleks : null;
    assert.ok(fC);
    assert.equal(fC.round, 1, 'obrana domluvila, začíná kolo aktéra');
    assert.equal(fC.toAct, declarer, 'kolo 1 patří aktérovi');
    assert.deepEqual([...fC.open].sort(), ['hra', 'sedma'], 'otevřené jsou OBĚ flekované komponenty');

    // aktér zvedne hru — a nesmí tím přijít o právo odpovědět i na sedmu
    s = apF(s, legalF(viewF(s, fC.toAct)).find((a) => a.type === 'flek' && a.target === 'hra') as ActF);
    const fD = s.phase.name === 'fleks' ? s.phase.fleks : null;
    assert.ok(fD);
    assert.equal(fD.toAct, declarer, 'aktér drží slovo, dokud neodpoví i na sedmu');
    const reSedma = legalF(viewF(s, fD.toAct)).find((a) => a.type === 'flek' && a.target === 'sedma');
    assert.ok(reSedma, 'druhé „re" musí jít vyslovit — jinak se sedma vyúčtuje o stupeň níž');
    s = apF(s, reSedma);

    const fE = s.phase.name === 'fleks' ? s.phase.fleks : null;
    assert.ok(fE);
    assert.equal(fE.round, 2, 'teprve po odpovědi na obě komponenty se kolo posune');
    assert.notEqual(fE.toAct, declarer, 'slovo se vrací obraně');
    assert.equal(fE.levels.hra, 2, 'hra: flek + re');
    assert.equal(fE.levels.sedma, 2, 'sedma: flek + re');
    console.log('PASS fleky — na každou flekovanou komponentu se odpovídá zvlášť (čl. V/4)');
  }

  /*
   * Předpověď UI musí sedět s reducerem: `passSettlesWithoutPlay` říká, kdy
   * „dobrá" hru rovnou zaplatí (a UI se na to ptá popupem). Kdyby se ty dvě
   * podmínky rozešly, hráč by buď dostal dotaz zbytečně, nebo — hůř — by
   * dvojnásobek zaplatil bez varování.
   */
  {
    const { passSettlesWithoutPlay } = await import('../src/lib/rules/legal');
    const cfg = cfgF('voleny');
    let checkedTrue = 0;
    let checkedFalse = 0;
    // scénář se musí VYNUTIT: náhodná hra skoro nikdy neskončí přesně na
    // „holá hra, jeden flek, aktér nezvedá"
    for (let seed = 1; seed <= 15; seed += 1) {
      for (const maxRaises of [1, 2]) {
        let st: StF = apF(initF(cfg, 2), { type: 'deal', seed });
        let raises = 0;
        let guard = 0;
        while (st.phase.name !== 'scored' && st.phase.name !== 'tricks' && (guard += 1) < 200) {
          const acts = actsF(st);
          if (acts.length === 0) break;
          const seat = ([0, 1, 2] as const).find((x) => legalF(viewF(st, x)).length > 0)!;
          const good = acts.find((a) => a.type === 'good');
          if (good) {
            const predicted = passSettlesWithoutPlay(viewF(st, seat));
            const after = apF(st, good);
            const note = after.phase.name === 'scored'
              ? after.phase.result.components.find((c) => c.note?.endsWith('nehrálo se'))?.note ?? null
              : null;
            const settledUnplayed =
              note === 'flek bez re — nehrálo se' ? 'flek-bez-re'
              : note === 'vyrovnáno — nehrálo se' ? 'vyrovnano'
              : null;
            assert.equal(
              predicted, settledUnplayed,
              `seed ${seed}/${maxRaises}: předpověď (${predicted}) nesedí s reducerem (${settledUnplayed})`,
            );
            if (predicted !== null) checkedTrue += 1; else checkedFalse += 1;
          }
          const wantFlek = raises < maxRaises
            ? acts.find((a) => a.type === 'flek' && a.target === 'hra')
            : undefined;
          if (wantFlek) raises += 1;
          st = apF(st,
            wantFlek ??
            acts.find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo) ??
            acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
            good ??
            acts.find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0)) ??
            acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ?? acts[0]);
        }
      }
    }
    assert.ok(checkedTrue > 0, 'scénář „dobrá platí hru" vůbec nenastal — test by nic neověřil');
    assert.ok(checkedFalse > 0, 'scénář obyčejné „dobré" vůbec nenastal');
    console.log(`PASS varování — předpověď „dobrá platí hru" sedí s reducerem (${checkedTrue}+${checkedFalse} pasů)`);
  }

  /*
   * Obecná pravidla čl. V/11: „Dojde-li k tomu, že při závazku Sedma je obranou
   * Hra okomentována flekem a Sedma schválena bez fleku, a volící strana
   * schvaluje prohranou Hru, sehrávka se nekoná, neboť závazky jsou finančně
   * vyrovnané a není v nich sporu o vítězi."
   */
  {
    const cfg = cfgF('voleny');
    let found: StF | null = null;
    for (let seed = 1; seed <= 60 && found === null; seed += 1) {
      let st: StF = apF(initF(cfg, 2), { type: 'deal', seed });
      let flekked = false;
      let guard = 0;
      while (st.phase.name !== 'scored' && st.phase.name !== 'tricks' && (guard += 1) < 200) {
        const acts = actsF(st);
        // aktér hlásí hru SE SEDMOU, obrana flekne JEN hru, aktér pak schválí
        const flek = !flekked ? acts.find((a) => a.type === 'flek' && a.target === 'hra') : undefined;
        if (flek) flekked = true;
        st = apF(st,
          acts.find((a) => a.type === 'declare' && a.mode === 'hra' && a.sedma && !a.kilo) ??
          flek ??
          acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
          acts.find((a) => a.type === 'good') ??
          acts.find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0)) ??
          acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ?? acts[0]);
      }
      if (st.phase.name === 'scored' && st.contract?.sedma !== null && flekked) found = st;
    }
    assert.ok(found, 'nenašel se scénář hra+sedma s flekem jen na hru');
    const r = found.phase.name === 'scored' ? found.phase.result : null;
    assert.ok(r);
    assert.deepEqual(r.delta, [0, 0, 0], 'vyrovnané závazky = nulové vyúčtování');
    assert.deepEqual(
      r.components.map((c) => `${c.target}/${c.wonBy}`).sort(),
      ['hra/defenders', 'sedma/declarer'],
      'do archivu patří obě komponenty, ať je vidět proč je nula',
    );
    assert.equal(r.components.find((x) => x.target === 'hra')?.amount,
      r.components.find((x) => x.target === 'sedma')?.amount, 'částky se musí rovnat');
    assert.equal(found.contract?.kilo, null, 'scénář je o závazku Sedma, ne o stu');

    // se sedmou PROTI (drží ji obrana) se naopak hraje — není vyrovnáno
    const { flekEnding } = await import('../src/lib/rules/legal');
    const c0 = found.contract!;
    const fleks1 = { levels: { hra: 1 }, lastRaiser: { hra: 1 as const }, toAct: 0 as const,
      spoke: [], open: ['hra' as const], raised: [], round: 1 };
    assert.equal(flekEnding(cfg, c0, fleks1), 'vyrovnano');
    assert.equal(
      flekEnding(cfg, { ...c0, sedma: (c0.declarer === 0 ? 1 : 0) as 0 | 1 | 2 }, fleks1), 'play',
      'sedma proti není vyrovnaný závazek aktéra',
    );
    assert.equal(
      flekEnding(cfg, c0, { ...fleks1, levels: { hra: 1, sedma: 1 } }), 'play',
      'flekovaná sedma je ve sporu — musí se hrát',
    );
    assert.equal(
      flekEnding(cfg, c0, { ...fleks1, levels: { hra: 2 } }), 'play',
      'po re se hraje',
    );
    assert.equal(
      flekEnding({ ...cfg, sazby: { ...cfg.sazby, sedma: 3 } }, c0, fleks1), 'play',
      'v sazebníku, kde se částky nerovnají, premisa čl. V/11 neplatí',
    );
    console.log('PASS vyrovnané závazky — flek na hru proti uhrané sedmě se nehraje (čl. V/11)');
  }

  /*
   * „Flekovaná hra se bez »re« nehraje" (ČSM volený B/19).
   */
  {
    const play = (cfg: ReturnType<typeof cfgF>, seed: number, re: boolean): StF => {
      let st: StF = apF(initF(cfg, 2), { type: 'deal', seed });
      let raises = 0;
      let guard = 0;
      while (st.phase.name !== 'scored' && st.phase.name !== 'tricks' && (guard += 1) < 200) {
        const acts = actsF(st);
        const wantFlek = raises < (re ? 2 : 1)
          ? acts.find((a) => a.type === 'flek' && a.target === 'hra')
          : undefined;
        if (wantFlek) raises += 1;
        st = apF(st,
          wantFlek ??
          acts.find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo) ??
          acts.find((a) => a.type === 'takeover' && a.claim === 'good') ??
          acts.find((a) => a.type === 'good') ??
          acts.find((a) => a.type === 'discard' && a.cards.every((c) => pointsOf(c) === 0)) ??
          acts.find((a) => a.type === 'choose-trump' && a.card !== 'from-people') ?? acts[0]);
      }
      return st;
    };

    const cfg = cfgF('voleny');
    assert.equal(cfg.autoSettleFlekkedHra, true, 've voleném platí B/19');
    assert.equal(cfgF('licitovany').autoSettleFlekkedHra, false, 'licitovaná pravidla B/19 neznají');

    const noRe = play(cfg, 3, false);
    assert.equal(noRe.phase.name, 'scored', 'flekovaná hra bez re se nehraje (B/19)');
    const r = noRe.phase.name === 'scored' ? noRe.phase.result : null;
    assert.ok(r);
    assert.equal(r.components.length, 1);
    assert.equal(r.components[0].wonBy, 'defenders', 'aktér flek nezvedl, takže platí');
    assert.equal(r.components[0].flekMultiplier, 2, 'platí se vyflekovaná sazba');
    const cerv = r.contract.trump === CEF ? cfg.sazby.cervenyMultiplier : 1;
    assert.equal(r.components[0].amount, cfg.sazby.hra * 2 * cerv);
    assert.equal(r.delta[r.contract.declarer], -2 * cfg.sazby.hra * 2 * cerv, 'aktér platí oběma');
    assert.equal(r.delta[0] + r.delta[1] + r.delta[2], 0);

    // s re se hraje
    assert.equal(play(cfg, 3, true).phase.name, 'tricks', 'po re se hra sehrává');
    // s vypnutým přepínačem se hraje i bez re
    assert.equal(
      play({ ...cfg, autoSettleFlekkedHra: false }, 3, false).phase.name, 'tricks',
      's vypnutým pravidlem se flekovaná hra hraje',
    );
    console.log('PASS hra bez re — flekovaná a nezvednutá se nehraje (volený B/19)');
  }
}

// ── review 2026-09-18 (§34): převzetí podle VII/1, pořadí mluvení, strop fleků,
//    přísný tvar pohledu + non-interference, talon ve vyúčtování ──────────────
{
  const { initialState: initV, apply: apV } = await import('../src/lib/rules/engine');
  const { legalActions: legalV } = await import('../src/lib/rules/legal');
  const { view: viewV } = await import('../src/lib/rules/view');
  const { defaultConfig: cfgV } = await import('../src/lib/rules/sazby');
  const { pointsOf: ptsV } = await import('../src/lib/cards');
  const { Random: RndV } = await import('../src/lib/random');
  type StV = ReturnType<typeof initV>;
  type ActV = ReturnType<typeof legalV>[number];
  type SeatV = 0 | 1 | 2;
  const actsV = (st: StV, seat: SeatV): ActV[] => legalV(viewV(st, seat));
  const actorV = (st: StV): SeatV | null =>
    ([0, 1, 2] as const).find((x) => actsV(st, x).some((a) => a.type !== 'deal')) ?? null;
  const stepV = (st: StV, pred: (a: ActV) => boolean, label: string): StV => {
    const seat = actorV(st);
    assert.notEqual(seat, null, `${label}: nikdo není na tahu`);
    const a = actsV(st, seat as SeatV).find(pred);
    assert.ok(a, `${label}: akce chybí (fáze ${st.phase.name})`);
    return apV(st, a as ActV);
  };
  const claimsOf = (st: StV, seat: SeatV): string[] =>
    actsV(st, seat).flatMap((a) => (a.type === 'takeover' ? [a.claim] : [])).sort();

  /** Volený: forhont 0 zvolí trumf, odhodí bez esa/desítky a zeptá se „Barva?". */
  const askedColour = (): StV => {
    for (let seed = 1; seed < 200; seed += 1) {
      let st: StV = apV(initV(cfgV('voleny'), 2), { type: 'deal', seed });
      st = stepV(st, (a) => a.type === 'choose-trump' && a.card !== 'from-people', 'volba trumfu');
      const cheap = actsV(st, 0).find((a) => a.type === 'discard' && a.cards.every((c) => ptsV(c) === 0));
      if (!cheap) continue;
      st = apV(st, cheap);
      return apV(st, { type: 'takeover', seat: 0, claim: 'good' });
    }
    throw new Error('nenašel se seed s odhozem bez hodnotových karet');
  };

  // ── převzetí ve voleném (Obecná pravidla čl. VII/1) ──
  {
    const asked = askedColour();
    assert.equal(asked.phase.name, 'takeover');
    if (asked.phase.name !== 'takeover') throw new Error('unreachable');
    assert.equal(asked.phase.toAct, 1, 'první odpovídá hráč po aktérovi ve směru hry');
    assert.deepEqual(claimsOf(asked, 1), ['good', 'take'], 'obránce barvu schválí, nebo SEBERE TALON — betl/durch nehlásí naslepo');

    // obránce sebere talon: vidí ho jen on, drží 12 karet a druh hry ještě nevybral
    const discards = asked.talon.slice();
    let st = apV(asked, { type: 'takeover', seat: 1, claim: 'take' });
    assert.equal(st.phase.name, 'discard-talon', 'po sebrání talonu se odhazuje jiný talon');
    assert.equal(st.hands[1].length, 12);
    assert.equal(st.talon.length, 0);
    for (const c of discards) {
      assert.ok(viewV(st, 1).talonKnown.includes(c), 'přebírající sebraný talon viděl');
      assert.ok(!viewV(st, 2).talonKnown.includes(c), 'druhý obránce talon nevidí');
      assert.ok(!viewV(st, 2).hand.includes(c) && !viewV(st, 0).hand.includes(c));
    }
    if (st.phase.name === 'discard-talon') {
      assert.deepEqual(
        { mode: st.phase.standing.mode, trump: st.phase.standing.trump, declarer: st.phase.standing.declarer },
        { mode: null, trump: null, declarer: 1 }, 'stojící závazek: hra bez trumfů, druh se teprve vybere',
      );
    }
    st = stepV(st, (a) => a.type === 'discard', 'odhoz přebírajícího');
    assert.equal(st.phase.name, 'declare', 'teprve po odhozu se hlásí betl či durch');
    assert.deepEqual(
      actsV(st, 1).map((a) => (a.type === 'declare' ? a.mode : a.type)).sort(),
      ['betl', 'durch'], 'k volbě je právě betl a durch — barevná hra ne, byla odmítnuta',
    );
    const chosen = st;

    // (a) betl: „z ohlášeného Betla mohou zbývající dva hráči přebrat hru ještě na Durcha"
    let a = apV(chosen, { type: 'declare', seat: 1, mode: 'betl', sedma: false, kilo: false });
    assert.equal(a.phase.name, 'takeover', 'po ohlášeném betlu se převzetí otevře znovu');
    if (a.phase.name === 'takeover') {
      assert.equal(a.phase.toAct, 2, 'první mluví hráč po přebírajícím ve směru hry (2), ne forhont');
      assert.deepEqual(a.phase.standing, { declarer: 1, mode: 'betl', trump: null, bid: null });
    }
    assert.deepEqual(claimsOf(a, 2), ['durch', 'good'], 'proti betlu zbývá jen souhlas, nebo durch');
    a = apV(a, { type: 'takeover', seat: 2, claim: 'good' });
    if (a.phase.name === 'takeover') assert.equal(a.phase.toAct, 0, 'pak původní aktér');
    assert.deepEqual(claimsOf(a, 0), ['durch', 'good']);
    const betlPlayed = apV(a, { type: 'takeover', seat: 0, claim: 'good' });
    assert.equal(betlPlayed.phase.name, 'fleks', 'schválený betl se flekuje');
    assert.deepEqual(
      { mode: betlPlayed.contract?.mode, declarer: betlPlayed.contract?.declarer, trump: betlPlayed.contract?.trump },
      { mode: 'betl', declarer: 1, trump: null },
    );
    assert.deepEqual(betlPlayed.hands.map((h) => h.length), [10, 10, 10]);
    assert.equal(betlPlayed.talonOwner, 1, 'talon odhodil přebírající, vidí ho jen on');

    // (a') z betla přebere durchem druhý obránce: zvedne talon, odhodí, hlásí durch
    let c = apV(apV(apV(chosen, { type: 'declare', seat: 1, mode: 'betl', sedma: false, kilo: false }),
      { type: 'takeover', seat: 2, claim: 'durch' }), { type: 'takeover', seat: 0, claim: 'good' });
    if (c.phase.name === 'takeover') assert.equal(c.phase.toAct, 1, 'po souhlasu aktéra mluví ten, kdo hlásil betl');
    assert.deepEqual(claimsOf(c, 1), ['good'], 'durch už nikdo nepřebije');
    c = apV(c, { type: 'takeover', seat: 1, claim: 'good' });
    assert.equal(c.phase.name, 'discard-talon', 'přebírající durchem zvedá talon a odhazuje');
    assert.equal(c.hands[2].length, 12);
    c = stepV(c, (x) => x.type === 'discard', 'odhoz na durch');
    assert.deepEqual(actsV(c, 2).map((x) => (x.type === 'declare' ? x.mode : x.type)), ['durch'], 'nárok na durch je zamčený');
    c = stepV(c, (x) => x.type === 'declare', 'declare durch');
    assert.equal(c.phase.name, 'fleks');
    assert.equal(c.contract?.mode, 'durch');
    assert.equal(c.contract?.declarer, 2);

    // (b) durch: nic vyššího není, rovnou se flekuje
    const d = apV(chosen, { type: 'declare', seat: 1, mode: 'durch', sedma: false, kilo: false });
    assert.equal(d.phase.name, 'fleks', 'ohlášený durch jde rovnou do flekování');
    assert.equal(d.contract?.mode, 'durch');

    // aktér sám smí betl/durch ohlásit rovnou (talon už odhodil) a přebírá se z něj durchem
    {
      let s0: StV = apV(initV(cfgV('voleny'), 2), { type: 'deal', seed: 3 });
      s0 = stepV(s0, (x) => x.type === 'choose-trump' && x.card !== 'from-people', 'volba');
      s0 = stepV(s0, (x) => x.type === 'discard', 'odhoz');
      assert.ok(claimsOf(s0, 0).includes('betl') && claimsOf(s0, 0).includes('durch'), 'aktér hlásí betl/durch rovnou');
      s0 = apV(s0, { type: 'takeover', seat: 0, claim: 'betl' });
      if (s0.phase.name === 'takeover') assert.equal(s0.phase.toAct, 1);
      assert.deepEqual(claimsOf(s0, 1), ['durch', 'good'], 'proti aktérovu betlu: souhlas, nebo durch — talon se nebere');
    }
    console.log('PASS převzetí — obránce sebere talon, odhodí a teprve pak hlásí betl/durch (čl. VII/1)');
  }

  // ── sav: historie s nárokem `take` musí projít validací (jinak reload zahodí rozehraný zápas) ──
  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, val: string) => void store.set(k, val),
      removeItem: (k: string) => void store.delete(k),
    };
    const { saveMatch: saveT, loadMatch: loadT } = await import('../src/lib/match/persist');
    let st = apV(askedColour(), { type: 'takeover', seat: 1, claim: 'take' });
    assert.ok(st.history.some((a) => a.type === 'takeover' && a.claim === 'take'), 'fixtura nese nárok take');
    saveT(st);
    assert.deepEqual(loadT(), JSON.parse(JSON.stringify(st)), 'sav s nárokem take se musí načíst beze změny');
    // a totéž po odhozu a volbě — ať kolotoč projde i fází declare se standing bez trumfu
    st = stepV(st, (a) => a.type === 'discard', 'odhoz');
    saveT(st);
    assert.deepEqual(loadT(), JSON.parse(JSON.stringify(st)), 'sav ve fázi declare po sebraném talonu projde');
    // poškozený nárok validace odmítne — to je ta hranice, kterou `take` musel projít
    const raw = JSON.parse(store.get('flek.match.v1') as string) as { state: { history: { type: string; claim?: string }[] } };
    const takeIdx = raw.state.history.findIndex((a) => a.type === 'takeover' && a.claim === 'take');
    raw.state.history[takeIdx].claim = 'grab';
    store.set('flek.match.v1', JSON.stringify(raw));
    assert.equal(loadT(), null, 'neznámý nárok v historii se odmítá');
    delete (globalThis as { localStorage?: unknown }).localStorage;
    console.log('PASS sav — nárok „take" v historii projde kolotočem save→load');
  }

  // ── AI: obránce bere talon na betlovou ruku, a se sebraným talonem odhazuje na hru bez trumfů ──
  {
    const { decideAuction } = await import('../src/lib/ai/heuristics');
    const { card: mkH, strength: strH, pointsOf: ptsH } = await import('../src/lib/cards');
    type ViewH = Parameters<typeof decideAuction>[0];
    const rngH = new RndV(1);
    const baseH = (variant: 'voleny' | 'licitovany', seat: SeatV, hand: number[], phase: ViewH['phase']): ViewH => ({
      seat, config: cfgV(variant), dealer: 2, hand, handCounts: [10, hand.length, 10] as [number, number, number],
      revealedTrump: null, unseenCount: 0, talonKnown: [], talon: null, contract: null, phase,
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    });
    const asking: ViewH['phase'] = {
      name: 'takeover', toAct: 1, passed: [], standing: { declarer: 0, mode: null, trump: 2, bid: null },
    };
    // 7 a 8 ve všech barvách + dvě devítky: nejnižší karty barev, nula děr ⇒ betl
    const betlHand = [0, 1, 8, 9, 16, 17, 24, 25, 2, 10];
    // esa, králové, desítky napříč barvami: díry všude ⇒ ani betl, ani durch
    const weakHand = [7, 6, 3, 15, 14, 11, 23, 22, 31, 30];
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const take = decideAuction(baseH('voleny', 1, betlHand, asking), difficulty, rngH);
      assert.deepEqual(take, { type: 'takeover', seat: 1, claim: 'take' }, `${difficulty}: na betlovou ruku obránce bere talon`);
      const good = decideAuction(baseH('voleny', 1, weakHand, asking), difficulty, rngH);
      assert.deepEqual(good, { type: 'takeover', seat: 1, claim: 'good' }, `${difficulty}: slabá ruka barvu schválí`);
    }
    // se sebraným talonem (standing bez módu i trumfu) odhazuje na betl: dvě NEJVYŠŠÍ karty pryč
    const twelve = [...betlHand, mkH(1, 7), mkH(3, 3)]; // + zelené eso a žaludská desítka
    const took: ViewH['phase'] = { name: 'discard-talon', standing: { declarer: 1, mode: null, trump: null, bid: null } };
    const d = decideAuction(baseH('voleny', 1, twelve, took), 'normal', rngH);
    assert.equal(d.type, 'discard');
    if (d.type === 'discard') {
      const top = twelve.slice().sort((a, b) => strH(b, 'natural') - strH(a, 'natural')).slice(0, 2).sort();
      assert.deepEqual([...d.cards].sort(), top, 'na betl letí do talonu eso a desítka — nejvyšší karty');
    }
    // v licitovaném totéž standing (trumf jen „bez červeného příhozu") znamená barevnou hru: esa a desítky se drží
    const dL = decideAuction(baseH('licitovany', 1, twelve, took), 'normal', rngH);
    assert.equal(dL.type, 'discard');
    if (dL.type === 'discard') assert.ok(dL.cards.every((c) => ptsH(c) === 0), 'v licitovaném se hodnotové karty do talonu nedávají');
    console.log('PASS AI — obránce bere talon na betl a se sebraným talonem odhazuje vysoké karty');
  }

  // ── pořadí mluvení: ve směru hraní od aktéra, ne od forhonta (čl. V/4, B/11) ──
  {
    // licitovaný, dealer 2: forhont 0, prostřední 1, zadák 2. Aktér vylicituje sto a hlásí ho.
    const stoBy = (bidder: SeatV, passers: SeatV[]): StV => {
      for (let seed = 21; seed < 300; seed += 1) {
        let st: StV = apV(initV(cfgV('licitovany'), 2), { type: 'deal', seed });
        for (const p of passers.filter((x) => x === 2)) st = apV(st, { type: 'bid', seat: p, bid: 'pass' });
        st = apV(st, { type: 'bid', seat: bidder, bid: { kind: 'sto', cervena: false } });
        for (const p of passers.filter((x) => x !== 2)) st = apV(st, { type: 'bid', seat: p, bid: 'pass' });
        const cheap = actsV(st, bidder).find((a) => a.type === 'discard' && a.cards.every((c) => ptsV(c) === 0));
        if (!cheap) continue;
        st = apV(st, cheap);
        const sto = actsV(st, bidder).find((a) => a.type === 'declare' && a.mode === 'hra' && a.kilo && !a.sedma);
        if (!sto) continue;
        return apV(st, sto);
      }
      throw new Error('nenašel se seed pro vylicitované sto');
    };
    // aktérem prostřední (1): zadák pasuje, prostřední hlásí sto, forhont pasuje
    let st = stoBy(1, [2, 0]);
    assert.equal(st.phase.name, 'fleks');
    if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, 2, 'první komentuje zadák (po aktérovi 1 ve směru hry), ne forhont');
    st = apV(st, { type: 'flek', seat: 2, target: 'hra' });
    // „U kombinovaných závazků lze flekovat každý z nich samostatně" (čl. V/4):
    // zadák komentoval hru, sto má pořád otevřené — slovo tedy drží dál
    if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, 2, 'zadák se ještě vyjádří ke stu');
    st = apV(st, { type: 'good', seat: 2 });
    if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, 0, 'pak forhont');
    st = apV(st, { type: 'good', seat: 0 });
    if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, 1, 'kolo 1 patří aktérovi');
    st = apV(st, { type: 'flek', seat: 1, target: 'hra' });
    if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, 2, 'kolo 2 zase od hráče po aktérovi');

    // aktérem zadák (2): první mluví forhont (0) — tady se obě pořadí shodují
    const z = stoBy(2, [0, 1]);
    if (z.phase.name === 'fleks') assert.equal(z.phase.fleks.toAct, 0, 'po zadákovi mluví forhont');
    console.log('PASS pořadí — komentuje se ve směru hraní od aktéra (čl. V/4, volený B/11)');
  }

  // ── strop fleků: licitovaný končí botami (čl. IV), volený drží kalhoty ──
  {
    /** Holá hra ve fázi fleků s aktérem 0 (obránci 1 a 2), pro obě varianty. */
    const plainHra = (variant: 'voleny' | 'licitovany'): StV => {
      for (let seed = 1; seed < 300; seed += 1) {
        let st: StV = apV(initV(cfgV(variant), 2), { type: 'deal', seed });
        if (variant === 'voleny') {
          st = stepV(st, (a) => a.type === 'choose-trump' && a.card !== 'from-people', 'volba');
          const cheap = actsV(st, 0).find((a) => a.type === 'discard' && a.cards.every((c) => ptsV(c) === 0));
          if (!cheap) continue;
          st = apV(st, cheap);
          st = apV(st, { type: 'takeover', seat: 0, claim: 'good' });
          st = apV(st, { type: 'takeover', seat: 1, claim: 'good' });
          st = apV(st, { type: 'takeover', seat: 2, claim: 'good' });
        } else {
          st = apV(st, { type: 'bid', seat: 2, bid: 'pass' });
          st = apV(st, { type: 'bid', seat: 1, bid: 'pass' });
          const cheap = actsV(st, 0).find((a) => a.type === 'discard' && a.cards.every((c) => ptsV(c) === 0));
          if (!cheap) continue;
          st = apV(st, cheap);
        }
        const plain = actsV(st, 0).find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo);
        if (!plain) continue;
        st = apV(st, plain);
        if (st.phase.name === 'fleks' && st.contract?.declarer === 0) return st;
      }
      throw new Error(`${variant}: nenašla se holá hra`);
    };
    const canFlek = (st: StV, seat: SeatV): boolean =>
      actsV(st, seat).some((a) => a.type === 'flek' && a.target === 'hra');

    for (const variant of ['voleny', 'licitovany'] as const) {
      let st = plainHra(variant);
      const cap = cfgV(variant).sazby.maxFlekLevel;
      // flek (1), re (2), tutti (3), boty (4) — střídavě obrana 1 / aktér 0, obránce 2 vždy „dobrá"
      const raise = (seat: SeatV): void => {
        assert.ok(canFlek(st, seat), `${variant}: sedadlo ${seat} musí smět zvýšit`);
        st = apV(st, { type: 'flek', seat, target: 'hra' });
        /*
         * Obrana dořekne kolo. Ve voleném kole 0 drží slovo i ten, kdo právě
         * flekl — „sto proti" má pořád na jazyku (§36) — takže „dobrá" řekne
         * nejdřív on a teprve pak jeho spoluhráč.
         */
        if (seat === 0) return;
        let guard = 0;
        while (st.phase.name === 'fleks' && st.phase.fleks.toAct !== 0 && (guard += 1) < 5) {
          st = apV(st, { type: 'good', seat: st.phase.fleks.toAct });
        }
      };
      raise(1); raise(0); raise(1); raise(0);
      // strop se měří u hráče NA TAHU — `legalActions` dá jinak prázdno každému, kdo na tahu není
      const onTurn = (seat: SeatV): void => {
        assert.equal(st.phase.name, 'fleks');
        if (st.phase.name === 'fleks') assert.equal(st.phase.fleks.toAct, seat, `${variant}: na tahu má být ${seat}`);
        assert.ok(actsV(st, seat).some((a) => a.type === 'good'), `${variant}: sedadlo ${seat} má aspoň „dobrá"`);
      };
      if (variant === 'licitovany') {
        assert.equal(cap, 4);
        onTurn(1);
        assert.equal(canFlek(st, 1), false, 'licitovaný: po botách už pátý flek není („posledního platného fleku (čtvrtého)", čl. IV)');
      } else {
        assert.equal(cap, 5);
        onTurn(1);
        assert.equal(canFlek(st, 1), true, 'volený: kalhoty jdou');
        raise(1);
        onTurn(0);
        assert.equal(canFlek(st, 0), false, 'volený: nad kalhoty se nejde');
      }
    }
    console.log('PASS strop fleků — licitovaný končí botami (čl. IV), volený kalhotami');
  }

  // ── tvar pohledu: přísný allowlist klíčů + non-interference ──
  {
    const keysOf = (o: unknown, allowed: readonly string[], where: string): void => {
      assert.ok(o !== null && typeof o === 'object' && !Array.isArray(o), `${where}: má být objekt`);
      for (const k of Object.keys(o as object)) {
        assert.ok(allowed.includes(k), `${where}: neznámý klíč „${k}" — nová položka pohledu musí projít revizí úniku`);
      }
    };
    const VIEW = ['seat', 'config', 'dealer', 'hand', 'handCounts', 'revealedTrump', 'unseenCount', 'talonKnown',
      'talon', 'contract', 'phase', 'publicHistory', 'handResults', 'ledger', 'handNo'];
    const CONFIG = ['variant', 'sazby', 'talonForbidsTrump', 'talonOnTakeover', 'enableDveSedmy',
      'autoSettlePlainHra', 'autoSettleFlekkedHra'];
    const CONTRACT = ['mode', 'trump', 'declarer', 'sedma', 'kilo', 'dveSedmy'];
    const STANDING = ['declarer', 'mode', 'trump', 'bid'];
    const PHASE: Record<string, string[]> = {
      idle: ['name'], 'choose-trump': ['name'], bidding: ['name', 'bids', 'toAct', 'best'],
      'discard-talon': ['name', 'standing'], declare: ['name', 'standing'],
      takeover: ['name', 'toAct', 'standing', 'passed'], fleks: ['name', 'fleks'],
      tricks: ['name', 'trickNo', 'leader', 'toAct', 'trick', 'played', 'won', 'marriages'],
      scored: ['name', 'result'],
    };
    const HISTORY: Record<string, string[]> = {
      deal: ['type'], discard: ['type', 'seat'], 'choose-trump': ['type', 'seat', 'card'],
      bid: ['type', 'seat', 'bid'], declare: ['type', 'seat', 'mode', 'sedma', 'kilo', 'dveSedmy', 'trump'],
      takeover: ['type', 'seat', 'claim'], flek: ['type', 'seat', 'target'], good: ['type', 'seat'],
      'announce-proti': ['type', 'seat', 'sedma', 'kilo'], play: ['type', 'seat', 'card', 'announceMarriage'],
      concede: ['type', 'seat'],
    };
    const RESULT = ['handNo', 'contract', 'limit', 'cardPoints', 'marriagePoints', 'components', 'delta'];
    const POINTS = ['declarer', 'defenders'];
    const COMPONENT = ['target', 'wonBy', 'baseRate', 'flekMultiplier', 'extraMultiplier', 'amount', 'silent', 'note'];
    const resultShape = (r: unknown, where: string): void => {
      keysOf(r, RESULT, where);
      const x = r as Record<string, unknown>;
      keysOf(x.contract, CONTRACT, `${where}.contract`);
      keysOf(x.cardPoints, POINTS, `${where}.cardPoints`);
      keysOf(x.marriagePoints, POINTS, `${where}.marriagePoints`);
      assert.ok(Array.isArray(x.delta) && (x.delta as unknown[]).length === 3, `${where}.delta`);
      for (const c of x.components as unknown[]) keysOf(c, COMPONENT, `${where}.components`);
    };
    const seenPhases = new Set<string>();
    const assertShape = (v: ReturnType<typeof viewV>): void => {
      seenPhases.add(v.phase.name);
      keysOf(v, VIEW, 'view');
      keysOf(v.config, CONFIG, 'config');
      if (v.contract !== null) keysOf(v.contract, CONTRACT, 'contract');
      const p = v.phase as unknown as Record<string, unknown>;
      assert.ok(PHASE[p.name as string], `neznámá fáze ${String(p.name)}`);
      keysOf(p, PHASE[p.name as string], `phase ${String(p.name)}`);
      if ('standing' in p) keysOf(p.standing, STANDING, 'standing');
      if (p.name === 'fleks') keysOf(p.fleks, ['levels', 'lastRaiser', 'toAct', 'spoke', 'open', 'raised', 'round'], 'fleks');
      if (p.name === 'tricks') {
        for (const t of p.trick as unknown[]) keysOf(t, ['seat', 'card'], 'trick');
        for (const t of p.played as { plays: unknown[] }[]) {
          keysOf(t, ['plays', 'winner'], 'played');
          for (const x of t.plays) keysOf(x, ['seat', 'card'], 'played.plays');
        }
        for (const m of p.marriages as unknown[]) keysOf(m, ['seat', 'suit'], 'marriages');
      }
      if (p.name === 'bidding') for (const b of p.bids as unknown[]) keysOf(b, ['seat', 'bid'], 'bids');
      if (p.name === 'scored') resultShape(p.result, 'phase.scored.result');
      for (const a of v.publicHistory) {
        assert.ok(HISTORY[a.type], `neznámá akce ${a.type}`);
        keysOf(a, HISTORY[a.type], `history ${a.type}`);
        if (a.type === 'choose-trump') assert.ok(a.card === 'hidden' || a.card === 'from-people');
      }
      for (const r of v.handResults) resultShape(r, 'handResult');
    };

    /**
     * Non-interference: prohoď skryté karty mezi soupeři (a s talonem, který
     * sedadlo nesmí znát) — pohled sedadla se nesmí změnit ani o bit.
     */
    const swapped = (st: StV, seat: SeatV): StV => {
      const [a, b] = ([0, 1, 2] as const).filter((x) => x !== seat) as [SeatV, SeatV];
      const hands = st.hands.map((h) => h.slice()) as StV['hands'];
      if (hands[a].length > 0 && hands[b].length > 0) {
        const t = hands[a][0]; hands[a][0] = hands[b][0]; hands[b][0] = t;
      }
      const talon = st.talon.slice();
      const known = st.talonKnowledge[seat];
      if (talon.length === 2 && st.talonOwner !== seat && !talon.some((c) => known.includes(c)) && hands[a].length > 1) {
        const t = talon[0]; talon[0] = hands[a][1]; hands[a][1] = t;
      }
      const unseen = st.unseen.slice().reverse();
      return { ...st, hands, talon, unseen };
    };

    let states = 0;
    const checkAll = (st: StV, variant: string, seed: number): void => {
      for (const seat of [0, 1, 2] as const) {
        const v = viewV(st, seat);
        assertShape(v);
        assert.equal(
          JSON.stringify(viewV(swapped(st, seat), seat)), JSON.stringify(v),
          `${variant}/${seed}: pohled sedadla ${seat} závisí na cizích kartách (${st.phase.name})`,
        );
        states += 1;
      }
    };
    for (const variant of ['voleny', 'licitovany'] as const) {
      for (let seed = 201; seed <= 240; seed += 1) {
        const rng = new RndV(seed * 13 + 5);
        let st: StV = initV(cfgV(variant), 2);
        checkAll(st, variant, seed); // idle
        // druhá hra navrch: `handResults` je pak neprázdné i během hry, ne až v `scored`
        for (let hand = 0; hand < 2; hand += 1) {
          st = apV(st, { type: 'deal', seed: 7_000_009 * seed + hand });
          let guard = 0;
          while (st.phase.name !== 'scored') {
            if ((guard += 1) > 400) throw new Error('tvar-test: hra se zasekla');
            checkAll(st, variant, seed);
            const seat = actorV(st);
            if (seat === null) break;
            const acts = actsV(st, seat);
            st = apV(st, acts[rng.int(acts.length)]);
          }
          // ZÚČTOVÁNÍ: právě tady se poprvé objeví `phase.result` i nový záznam archivu —
          // smyčka, která končí na `scored`, by je nikdy nezkontrolovala
          assert.equal(st.phase.name, 'scored');
          checkAll(st, variant, seed);
        }
      }
    }
    // každý deklarovaný tvar fáze se musel doopravdy potkat, jinak je allowlist mrtvý
    for (const name of Object.keys(PHASE)) {
      assert.ok(seenPhases.has(name), `fáze „${name}" se v testu nikdy neobjevila — její allowlist nic nehlídá`);
    }
    console.log(`PASS tvar pohledu — jen známé klíče a žádná závislost na cizích kartách (${states} pohledů, ${seenPhases.size} fází)`);
  }

  // ── sav si veze config: další rozdání musí jet podle AKTUÁLNÍCH pravidel ──
  {
    const { MatchController: MCV } = await import('../src/lib/match/controller');
    const stale = apV(initV(cfgV('licitovany'), 2), { type: 'deal', seed: 1 });
    const staleCfg = { ...stale.config, sazby: { ...stale.config.sazby, maxFlekLevel: 5 } };
    const resumed: StV = { ...stale, config: staleCfg, phase: { name: 'idle' } };
    const driver = { think: () => new Promise<never>(() => {}), cancel: () => {} };
    const ctrl = new MCV(driver as never, {
      config: cfgV('licitovany'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
      seedSource: () => 2, aiDelayMs: 0, autoGood: false,
    }, resumed);
    assert.equal(ctrl.state.config.sazby.maxFlekLevel, 5, 'fixtura: sav nese zastaralý strop');
    ctrl.dealNext();
    ctrl.stop();
    assert.equal(ctrl.state.config.sazby.maxFlekLevel, 4, 'nové rozdání jede podle aktuální konfigurace, ne podle savu');
    console.log('PASS sav — config ze savu neřídí další rozdání (strop fleků v licitovaném)');
  }

  // ── talon ve vyúčtování: v licitovaném při betlu/durchu zůstává rubem (čl. II/11) ──
  {
    const { replayHtml } = await import('../src/lib/ui/resultHtml');
    const deps = { humanSeat: 0 as const, nameOf: () => 'x', pattern: () => 'modern' as const };
    const mkResult = (mode: 'hra' | 'betl' | 'durch') => ({
      handNo: 1,
      contract: { mode, trump: mode === 'hra' ? (2 as const) : null, declarer: 0 as const, sedma: null, kilo: null, dveSedmy: false },
      cardPoints: { declarer: 0, defenders: 0 }, marriagePoints: { declarer: 0, defenders: 0 },
      components: [], delta: [0, 0, 0] as [number, number, number],
    });
    const mkState = (variant: 'voleny' | 'licitovany') =>
      ({ config: cfgV(variant), talon: [5, 6], history: [{ type: 'deal', seed: 1 }] }) as never;
    assert.ok(replayHtml(mkState('voleny'), mkResult('betl'), deps).includes('rtalon'), 'volený: talon po hře ukázat lze (B/8)');
    assert.ok(replayHtml(mkState('licitovany'), mkResult('hra'), deps).includes('rtalon'), 'licitovaný, hra: talon se ukáže');
    for (const mode of ['betl', 'durch'] as const) {
      assert.ok(!replayHtml(mkState('licitovany'), mkResult(mode), deps).includes('rtalon'),
        `licitovaný, ${mode}: do talonu nelze nahlédnout ani po hře (čl. II/11)`);
    }
    console.log('PASS vyúčtování — talon v licitovaném betlu/durchu zůstává rubem (čl. II/11)');
  }
}

/*
 * „Vše za mnou" (§39) — nabídka nesmí prozradit cizí karty a plán nesmí stát
 * hráče peníze.
 *
 * Druhé je to podstatnější: tlačítko hráč zmáčkne proto, aby nemusel klikat,
 * ne proto, aby hrál hůř. Kontroluje se tedy VÝSLEDEK — vyúčtování po plánu
 * se porovná se VŠEMI ostatními pořadími vlastní ruky. Kdyby plán vynesl
 * trumfovou sedmu dřív, přišel by o tichou sedmu, a tahle kontrola to uvidí
 * jako menší částku, ne jako „jiné pořadí".
 */
{
  const { claimPlan, shouldAnnounce } = await import('../src/lib/rules/claim');
  const { initialState: initC, apply: apC } = await import('../src/lib/rules/engine');
  const { legalActions: legalC } = await import('../src/lib/rules/legal');
  const { defaultConfig: cfgC } = await import('../src/lib/rules/sazby');
  const { view: viewC } = await import('../src/lib/rules/view');
  const { think: thinkC } = await import('../src/lib/ai/think');
  type StC = ReturnType<typeof initC>;
  type SeatC = 0 | 1 | 2;

  /** Pevná politika soupeřů: hlásit, co jde, jinak první legální karta. */
  const opponentMove = (st: StC, seat: SeatC) => {
    const acts = legalC(viewC(st, seat));
    return acts.find((a) => a.type === 'play' && a.announceMarriage) ?? acts[0];
  };

  /**
   * Dohraj od `st`, kde `me` hraje karty v pořadí `order`, a vrať jeho deltu —
   * nebo null, když je to pořadí nelegální (některou kartu v tu chvíli hrát
   * nesmí, třeba hlášenou sedmu před posledním štychem).
   */
  const playOut = (
    st: StC, me: SeatC, order: readonly number[], announce: boolean,
  ): { delta: number; alwaysLed: boolean } | null => {
    let s = st;
    let i = 0;
    let guard = 0;
    /*
     * Drží `me` po celou dobu výnos? To je přesně to, co nabídka slibuje: kdo
     * bere všechny zbylé štychy, vynáší do všech. Kdyby byla podmínka
     * v `claimPlan` slabá, soupeř by jeden štych sebral a hráč by se octl
     * uprostřed rozehraného štychu — tohle to chytí.
     */
    let alwaysLed = true;
    while (s.phase.name === 'tricks' && (guard += 1) < 60) {
      const actor = ([0, 1, 2] as SeatC[]).find((x) => legalC(viewC(s, x)).length > 0);
      if (actor === undefined) break;
      if (actor === me) {
        if (s.phase.trick.length > 0) alwaysLed = false;
        const v = viewC(s, me);
        const want = order[i];
        i += 1;
        const wish = announce && shouldAnnounce(v, want);
        const act = legalC(v).find((a) => a.type === 'play' && a.card === want && a.announceMarriage === wish)
          ?? legalC(v).find((a) => a.type === 'play' && a.card === want);
        if (act === undefined) return null; // tohle pořadí legální není
        s = apC(s, act);
      } else {
        s = apC(s, opponentMove(s, actor));
      }
    }
    if (s.phase.name !== 'scored') return null;
    return { delta: s.handResults[s.handResults.length - 1].delta[me], alwaysLed };
  };

  /** Všechna pořadí ruky (ruka je na konci hry krátká, tak to projde celé). */
  const permutations = (cards: readonly number[]): number[][] => {
    if (cards.length <= 1) return [cards.slice()];
    const out: number[][] = [];
    for (let k = 0; k < cards.length; k += 1) {
      const rest = [...cards.slice(0, k), ...cards.slice(k + 1)];
      for (const tail of permutations(rest)) out.push([cards[k], ...tail]);
    }
    return out;
  };

  let cases = 0;
  /* Kolikrát na tom v PŘIROZENÉ hře doopravdy záleželo — jen do hlášky testu.
   * Že to bývá nula, je přesně důvod, proč jsou (D) a (E) postavené ručně. */
  let mattered = 0;
  /*
   * Rozpočet na KAŽDOU variantu zvlášť. Se sdíleným by stačilo, aby ho vyčerpal
   * volený (jde první), a licitovaný by se nespustil vůbec — a jediný strážce
   * (`cases >= 8`) by pořád prošel. Test, který tiše neměří, je přesně to, co
   * si §39 vyčítá jinde.
   */
  const perVariant: Record<string, number> = { voleny: 0, licitovany: 0 };
  for (const variant of ['voleny', 'licitovany'] as const) {
    for (let seed = 1; seed <= 140 && perVariant[variant] < 12; seed += 1) {
      let st: StC = apC(initC(cfgC(variant), (seed % 3) as SeatC), { type: 'deal', seed });
      let moveNo = 0;
      let guard = 0;
      while (st.phase.name !== 'scored' && (guard += 1) < 200) {
        if (st.phase.name === 'tricks') {
          // betl má plán jen na jeden tah (přiznává barvu) — ověřuje se zvlášť níž, (I)–(M)
          const me = st.contract?.mode === 'betl'
            ? undefined
            : ([0, 1, 2] as SeatC[]).find((s2) => claimPlan(viewC(st, s2)) !== null);
          const plan = me === undefined ? null : claimPlan(viewC(st, me));
          // jen krátké ruce: permutací je faktoriál, delší by test protáhl bez užitku
          if (me !== undefined && plan !== null && plan.length >= 2 && plan.length <= 5) {
            const best = playOut(st, me, plan, true);
            assert.ok(best !== null, 'plán „vše za mnou" musí být celý legální');
            assert.ok(
              best.alwaysLed,
              `„vše za mnou" slíbilo štychy, které nepřišly (${variant}, seed ${seed})`,
            );


            // (B) žádné jiné pořadí nesmí vydělat víc
            for (const alt of permutations(plan)) {
              const got = playOut(st, me, alt, true);
              if (got === null) continue; // nelegální pořadí se nepočítá
              assert.ok(
                best.delta >= got.delta - 1e-9,
                `plán „vše za mnou" není optimální: ${best.delta} vs ${got.delta} (${variant}, seed ${seed})`,
              );
              if (got.delta < best.delta - 1e-9) mattered += 1;
            }

            // (C) nehlásit hlášky nesmí být lepší — a někdy to musí být znát
            const silent = playOut(st, me, plan, false);
            if (silent !== null) {
              assert.ok(best.delta >= silent.delta - 1e-9, 'nehlásit hlášky nesmí vydělat víc');
              if (best.delta > silent.delta + 1e-9) mattered += 1;
            }
            cases += 1;
            perVariant[variant] += 1;
            break; // jedno rozdání = jeden případ, ať je vzorek pestrý
          }
        }
        const actor = ([0, 1, 2] as SeatC[]).find((s2) => legalC(viewC(st, s2)).length > 0);
        if (actor === undefined) break;
        /*
         * `iterations`, NE `budgetMs`: časový rozpočet dá na každém stroji (a
         * v každém běhu) jiný počet iterací, takže by AI hrála pokaždé jinak,
         * test by sbíral jiné případy a jednou za čas by probliknul. Pevný
         * počet iterací je deterministický; `budgetMs` je tu jen jako strop,
         * aby se pomalý stroj nezasekl.
         */
        st = apC(st, thinkC({
          view: viewC(st, actor), difficulty: 'normal',
          seed: seed * 1000 + (moveNo += 1), budgetMs: 5000, iterations: 40,
        }).action);
      }
    }
  }

  for (const variant of ['voleny', 'licitovany'] as const) {
    assert.ok(
      perVariant[variant] >= 4,
      `málo případů „vše za mnou" ve variantě ${variant} (${perVariant[variant]}) — ta by se neověřila`,
    );
  }

  /*
   * Dvě věci, na kterých plán stojí, se v přirozené hře NEPOTKAJÍ — a kdyby se
   * na ně čekalo, kontrola by tiše neměřila nic:
   *
   *  - TICHÁ sedma: v 1000 rozdáních nepadlo ani jedno „vše za mnou" s trumfovou
   *    sedmou, kterou hráč NEhlásil. Kdo má tolik trumfů, ten ji ohlásí — a
   *    hlášenou hlídá `legalActions`, takže permutace výš na ní kousnout nemůžou.
   *    Pravidlo „sedma nakonec" z `claimPlan` je potřeba právě a jen pro tu tichou.
   *  - Nehlášená HLÁŠKA v ruce: kdo ji drží, obvykle ji stihne hlásit dřív.
   *
   * Oba stavy se proto staví natvrdo: hráč drží všechny zbylé trumfy, soupeři
   * jen cizí barvy (takže nabídka platí) a zbytek balíčku leží v sedmi
   * odehraných štychách.
   */
  {
    const { DECK: DECK_C, card: cardC, R7: R7_C, R10: R10_C, ESO: ESO_C, KRAL: KRAL_C, SVRSEK: SVRSEK_C } =
      await import('../src/lib/cards');
    const { trickWinner: winnerC } = await import('../src/lib/rules/tricks');
    const TRUMP = 0 as const; // červené

    /**
     * Stav tři štychy před koncem, stavěný tak, aby se dal ohýbat.
     *
     * Výchozí podoba: sedadlo 0 je aktér barevné hry, drží `mine` (typicky
     * všechny zbylé trumfy), soupeři jen cizí barvy a zbytek balíčku leží
     * v sedmi odehraných štychách. Přes `opts` se dá přesunout karta mezi
     * ruku soupeře a talon, změnit závazek nebo předat talon jinému sedadlu —
     * tím se dostanou na kontrolu i větve, které přirozená hra nepotká.
     */
    const mkClaim = (mine: readonly number[], opts: {
      mode?: 'hra' | 'betl' | 'durch';
      trump?: 0 | null;
      declarer?: SeatC;
      /** Karta, která `mine` přebije — kam se položí. */
      beater?: { card: number; where: 'talon' | 'opponent' };
      talonOwner?: SeatC | null;
      /** `talonKnowledge` sedadla 0 (default: talon, když ho drží). */
      knows0?: number[];
      leader?: SeatC;
    } = {}): StC => {
      const mode = opts.mode ?? 'hra';
      const trump = opts.trump === undefined ? (0 as const) : opts.trump;
      const declarer = opts.declarer ?? 0;
      let opp1 = [8, 9, 10];
      let opp2 = [11, 12, 13];
      let talonC = [14, 15];
      if (opts.beater) {
        // přebíječ musí někde být — vždycky na úkor jedné „neškodné" karty
        if (opts.beater.where === 'talon') talonC = [opts.beater.card, 15];
        else opp1 = [opts.beater.card, 9, 10];
      }
      const held = [...mine, ...opp1, ...opp2, ...talonC];
      assert.equal(new Set(held).size, held.length, 'stav si nesmí kartu zdvojit');
      const gone = DECK_C.filter((c) => !held.includes(c));
      assert.equal(gone.length, 21, 'sedm odehraných štychů = 21 karet');
      const playedC: { plays: { seat: SeatC; card: number }[]; winner: SeatC }[] = [];
      const wonC: [number[], number[], number[]] = [[], [], []];
      for (let i = 0; i < 7; i += 1) {
        const plays = ([0, 1, 2] as SeatC[]).map((seat, k) => ({ seat, card: gone[i * 3 + k] }));
        const w = winnerC(plays, trump, mode);
        playedC.push({ plays, winner: w });
        wonC[w].push(...plays.map((x) => x.card));
      }
      const owner = opts.talonOwner === undefined ? (0 as SeatC | null) : opts.talonOwner;
      const know0 = opts.knows0 ?? (owner === 0 ? talonC.slice() : []);
      const lead = opts.leader ?? 0;
      return {
        config: cfgC('voleny'), dealer: 2, seed: 1,
        hands: [mine.slice(), opp1, opp2], unseen: [], talon: talonC.slice(),
        revealedTrump: null, talonOwner: owner, talonKnowledge: [know0, [], []],
        history: [], handResults: [], ledger: [0, 0, 0], handNo: 0,
        // sedma i kilo `null` = NEhlášené, takže `legalActions` nic nebrzdí
        contract: { mode, trump, declarer, sedma: null, kilo: null, dveSedmy: false },
        phase: {
          name: 'tricks', trickNo: 7, leader: lead, toAct: lead,
          trick: [], played: playedC, won: wonC, marriages: [],
        },
      } as unknown as StC;
    };

    /*
     * (F) KDY SE NABÍDKA NESMÍ OBJEVIT.
     *
     * Do teď nic netvrdilo, že `claimPlan` někdy vrátí `null` — a bez toho
     * nešlo odlišit poctivou podmínku od té, která kouká, kam nemá. Přirozená
     * smyčka to nezachytí ze své podstaty: dívá se jen na sedadla, kde už
     * nabídka padla.
     */
    {
      const trumpKing = cardC(0, KRAL_C);
      const trumpAce = cardC(0, ESO_C);
      const mineNoAce = [trumpKing, cardC(0, R10_C), cardC(0, R7_C)];

      // (i) jediný přebíječ leží v talonu, který hráč NEZNÁ → nabídka nesmí přijít
      const blind = mkClaim(mineNoAce, { beater: { card: trumpAce, where: 'talon' }, talonOwner: 1 });
      assert.equal(
        claimPlan(viewC(blind, 0)), null,
        'neznámý talon se musí počítat jako karty, které soupeř MŮŽE mít',
      );

      // (ii) tentýž přebíječ v ruce soupeře → taky ne (poctivá podmínka)
      const held = mkClaim(mineNoAce, { beater: { card: trumpAce, where: 'opponent' }, talonOwner: 1 });
      assert.equal(claimPlan(viewC(held, 0)), null, 'trumfové eso u soupeře nabídku vylučuje');

      // (iii) a když hráč talon ZNÁ, protože ho sám odložil, nabídka přijít MUSÍ —
      //       jinak by (i) procházelo i tehdy, kdyby funkce vracela pořád null
      const knows = mkClaim(mineNoAce, {
        beater: { card: trumpAce, where: 'talon' }, talonOwner: 0,
      });
      assert.ok(
        claimPlan(viewC(knows, 0)) !== null,
        'vlastní odložený talon je mimo hru — nabídka platit musí',
      );

      /*
       * (iv) `talonKnowledge` NENÍ „co leží mimo hru". Při převzetí ve voleném
       * si nový aktér talon vezme do ruky a původnímu tazateli ta znalost
       * zůstane. Kdo by odečítal ji, vyškrtne si karty, které soupeř drží.
       * (Dnes nedosažitelné — po převzetí se hraje betl nebo durch a obránce
       * se v durchu na výnos nedostane —, ale smysl funkce to drží.)
       */
      const stale = mkClaim(mineNoAce, {
        beater: { card: trumpAce, where: 'opponent' }, talonOwner: null, knows0: [trumpAce],
      });
      assert.equal(
        claimPlan(viewC(stale, 0)), null,
        '„kdysi jsem tu kartu viděl v talonu" neznamená, že je mimo hru',
      );
    }

    /*
     * (G) Betl s nejvyššími kartami: brát štychy je tam prohra. Podmínka „vše
     * za mnou" by tu prošla (`beats()` odpoví „nikdo mě nepřebije" i betlovému
     * aktérovi) — betl má ale vlastní „nic za mnou", a to tu platit nesmí:
     * aktér vynáší a každá jeho karta štych vezme, soupeři žaludy nemají.
     */
    {
      // žaludy (3): soupeři drží zelené (8–15), takže se ruce nepřekryjí
      const top = [cardC(3, ESO_C), cardC(3, KRAL_C), cardC(3, SVRSEK_C)];
      const st = mkClaim(top, { mode: 'betl', trump: null });
      assert.equal(claimPlan(viewC(st, 0)), null, 'v betlu s kartami, které štych vezmou, se nic nenabízí');
      assert.equal(shouldAnnounce(viewC(st, 0), top[1]), false, 'a v betlu se nehlásí ani hlášky');
    }

    /*
     * (H) Durch: podporovaný mód s JINOU cestou kódem (bez trumfu se přeskočí
     * větev se sedmou a řadí se přirozeným pořadím, kde desítka klesá pod
     * spodka). Jestli ho přirozená smyčka potká, je věc náhody — tady je jistý.
     */
    {
      const top = [cardC(3, ESO_C), cardC(3, KRAL_C), cardC(3, SVRSEK_C)];
      const st = mkClaim(top, { mode: 'durch', trump: null });
      const plan = claimPlan(viewC(st, 0));
      assert.ok(plan !== null, 'v durchu s nejvyššími kartami nabídka platit musí');
      const out = playOut(st, 0, plan, true);
      assert.ok(out !== null && out.alwaysLed, 'a aktér musí vynášet do všech zbylých štychů');
      for (const alt of permutations(plan)) {
        const got = playOut(st, 0, alt, true);
        if (got !== null) assert.ok(out.delta >= got.delta - 1e-9, 'plán v durchu musí být optimální');
      }
    }

    /*
     * (I)–(M) „Nic za mnou" v betlu (§43). Plán je tu jen na jeden tah — aktér
     * přiznává barvu —, takže se nedohrává pevné pořadí, ale na každém jeho
     * tahu první karta z `claimPlan`. Slib je silný: ŽÁDNÝ tah obrany mu štych
     * nedá. U krátké ruky se to ověřuje proti všem tahům obrany, u dlouhé
     * proti náhodným.
     */
    {
      type Trick = { seat: SeatC; card: number }[];
      /** Betl v prvním štychu: sedadlo 0 je aktér a talon zná, protože ho sám odložil. */
      const mkBetl = (
        hands: [number[], number[], number[]], talon: number[],
        opts: { talonOwner?: SeatC | null; trick?: Trick; toAct?: SeatC; leader?: SeatC } = {},
      ): StC => {
        const trick = opts.trick ?? [];
        const all = [...hands[0], ...hands[1], ...hands[2], ...talon, ...trick.map((p) => p.card)];
        assert.equal(new Set(all).size, 32, 'betlový stav musí rozdat celý balíček, každou kartu jednou');
        // stav musí být možný: hraje se 0 → 1 → 2, a kdo už do štychu dal, drží o kartu míň
        const leader = opts.leader ?? 0;
        const toAct = opts.toAct ?? 0;
        if (trick.length > 0) {
          assert.equal(trick[0].seat, leader, 'štych začíná ten, kdo vynáší');
          assert.equal(toAct, (trick[trick.length - 1].seat + 1) % 3, 'na tahu je sedadlo po posledním, kdo hrál');
        }
        for (const seat of [0, 1, 2] as SeatC[]) {
          const inTrick = trick.some((p) => p.seat === seat) ? 1 : 0;
          assert.equal(hands[seat].length, 10 - inTrick, `sedadlo ${seat} má držet ${10 - inTrick} karet`);
        }
        const owner = opts.talonOwner === undefined ? 0 : opts.talonOwner;
        return {
          config: cfgC('licitovany'), dealer: 2, seed: 1,
          hands: hands.map((h) => h.slice()), unseen: [], talon: talon.slice(),
          revealedTrump: null, talonOwner: owner, talonKnowledge: [owner === 0 ? talon.slice() : [], [], []],
          history: [], handResults: [], ledger: [0, 0, 0], handNo: 0,
          contract: { mode: 'betl', trump: null, declarer: 0, sedma: null, kilo: null, dveSedmy: false },
          phase: {
            name: 'tricks', trickNo: 0, leader, toAct,
            trick, played: [], won: [[], [], []], marriages: [],
          },
        } as unknown as StC;
      };
      const actorOf = (st: StC) => ([0, 1, 2] as SeatC[]).find((x) => legalC(viewC(st, x)).length > 0);
      /** Jeden tah aktéra podle nabídky — a nabídka musí platit na KAŽDÉM jeho tahu. */
      const claimedMove = (st: StC) => {
        const plan = claimPlan(viewC(st, 0));
        assert.ok(plan !== null, 'jednou nabídnuté „nic za mnou" musí platit na každém dalším tahu');
        const act = legalC(viewC(st, 0)).find((a) => a.type === 'play' && a.card === plan[0]);
        assert.ok(act !== undefined, 'karta z plánu musí být v tu chvíli legální');
        return act;
      };
      const betlKept = (st: StC) => {
        if (st.phase.name === 'tricks') {
          assert.equal(st.phase.won[0].length, 0, '„nic za mnou" slíbilo, že aktér nevezme štych — a vzal');
        } else {
          assert.equal(st.phase.name, 'scored', 'dohrávka musí dojít k zúčtování');
          assert.ok(st.handResults[st.handResults.length - 1].delta[0] > 0, 'betl po „nic za mnou" musí být vyhraný');
        }
      };
      /** Všechny tahy obrany (strom), aktér hraje podle nabídky. Vrací počet listů. */
      const exhaust = (st: StC): number => {
        betlKept(st);
        if (st.phase.name !== 'tricks') return 1;
        const actor = actorOf(st);
        if (actor === undefined) return 0;
        if (actor === 0) return exhaust(apC(st, claimedMove(st)));
        let leaves = 0;
        for (const a of legalC(viewC(st, actor))) leaves += exhaust(apC(st, a));
        return leaves;
      };
      /** Náhodná obrana (deterministická), aktér podle nabídky. */
      const rollout = (st: StC, seed: number): void => {
        let s = st;
        let r = seed;
        for (let guard = 0; s.phase.name === 'tricks' && guard < 40; guard += 1) {
          betlKept(s);
          const actor = actorOf(s);
          if (actor === undefined) break;
          if (actor === 0) { s = apC(s, claimedMove(s)); continue; }
          const acts = legalC(viewC(s, actor));
          r = (r * 1103515245 + 12345) % 2147483648;
          s = apC(s, acts[r % acts.length]);
        }
        betlKept(s);
      };
      const H = (r: number) => cardC(0, r as Parameters<typeof cardC>[1]); // červené
      const Z = (r: number) => cardC(1, r as Parameters<typeof cardC>[1]); // zelené
      const K = (r: number) => cardC(2, r as Parameters<typeof cardC>[1]); // kule
      const L = (r: number) => cardC(3, r as Parameters<typeof cardC>[1]); // žaludy
      const lowRanks = [0, 1, 2]; // 7, 8, 9
      const rest = (taken: number[]) => DECK_C.filter((c) => !taken.includes(c));

      // (I) jednoduše ložený betl: sedmy, osmy a devítky, nic nepřebije — nabídka hned na výnosu
      {
        const mine = [...lowRanks.map(H), ...lowRanks.map(Z), K(0), K(1), L(0), L(1)];
        const talon = [H(7), Z(7)];
        const others = rest([...mine, ...talon]);
        const st = mkBetl([mine, others.slice(0, 10), others.slice(10, 20)], talon);
        const plan = claimPlan(viewC(st, 0));
        assert.ok(plan !== null, 'jednoduše ložený betl se známým talonem musí „nic za mnou" nabídnout už na výnosu');
        assert.equal(plan.length, 10, 'plán je celá ruka');
        for (let seed = 1; seed <= 60; seed += 1) rollout(st, seed);

        // (L) tentýž stav, jen talon hráč NEZNÁ: na výnosu nelze říct, kterou barvu soupeři určitě mají
        const blind = mkBetl([mine, others.slice(0, 10), others.slice(10, 20)], talon, { talonOwner: null });
        assert.equal(claimPlan(viewC(blind, 0)), null, 'na výnosu s neznámým talonem se „nic za mnou" nabídnout nesmí');

      }

      /*
       * (K) Obrana nic za sebou nemá — „nic za mnou" je aktérova věc. Obránce je
       * tu na tahu a drží jen nejnižší karty pod vyneseným esem, takže by mu
       * všechno ostatní nabídku dalo: zastavit ji smí jedině to, že není aktér.
       */
      {
        const defender = [...lowRanks.map(H), ...lowRanks.map(Z), ...lowRanks.map(K), L(0)];
        const ace = H(7);
        const talon = [Z(7), K(7)];
        const others = rest([...defender, ace, ...talon]);
        const st = mkBetl([others.slice(0, 9), defender, others.slice(9, 19)], talon, {
          trick: [{ seat: 0, card: ace }], leader: 0, toAct: 1,
        });
        assert.equal(claimPlan(viewC(st, 1)), null, 'obránci v betlu se „nic za mnou" nenabízí');
      }

      // (J) devítka proti vynesené sedmě: přebít MUSÍM — a třetí hráč nemusí mít čím
      {
        const mine = [H(2), ...lowRanks.map(Z), K(0), K(1), K(2), L(0), L(1), L(2)];
        const talon = [H(1), Z(7)];             // osmička je v talonu (známém), takže pod devítkou u soupeřů nic
        const trick: Trick = [{ seat: 2, card: H(0) }]; // po sedadle 2 hraje 0
        const others = rest([...mine, ...talon, H(0)]);
        const st = mkBetl([mine, others.slice(0, 10), others.slice(10, 19)], talon, { trick, leader: 2, toAct: 0 });
        assert.equal(claimPlan(viewC(st, 0)), null, 'když v rozehraném štychu musím přebít, nic za mnou není');
        // …a když vynesl výš než moje devítka, nabídka přijít musí (jinak by (J) procházelo i s funkcí, co vrací null)
        // sedma i osma červená v (známém) talonu: pod mou devítkou u soupeřů nic není
        const hi = H(6);
        const talon2 = [H(0), H(1)];
        const others2 = rest([...mine, ...talon2, hi]);
        const st2 = mkBetl([mine, others2.slice(0, 10), others2.slice(10, 19)], talon2, { trick: [{ seat: 2, card: hi }], leader: 2, toAct: 0 });
        const plan2 = claimPlan(viewC(st2, 0));
        assert.ok(plan2 !== null, 'pod vynesenou vyšší kartou se „nic za mnou" nabídnout musí');
        assert.equal(plan2[0], H(2), 'a přiznat se musí barva');
        for (let seed = 1; seed <= 40; seed += 1) rollout(st2, seed);
      }

      // (M) neznámý talon s kartou POD mou: mohla by být u soupeře — nabídka nesmí přijít
      {
        const mine = [H(1), ...lowRanks.map(Z), K(0), K(1), K(2), L(0), L(1), L(2)]; // osma červená
        const talon = [H(0), Z(7)];              // sedma červená v talonu
        const hi = H(6);
        const others = rest([...mine, ...talon, hi]);
        const hands: [number[], number[], number[]] = [mine, others.slice(0, 10), others.slice(10, 19)];
        const trick: Trick = [{ seat: 2, card: hi }];
        const blind = mkBetl(hands, talon, { trick, leader: 2, toAct: 0, talonOwner: null });
        assert.equal(claimPlan(viewC(blind, 0)), null, 'neznámá nižší karta v talonu se musí počítat jako soupeřova');
        const known = mkBetl(hands, talon, { trick, leader: 2, toAct: 0 });
        assert.ok(claimPlan(viewC(known, 0)) !== null, 'když talon znám, ta karta je mimo hru a nabídka platí');
      }

      /*
       * Náhodná rozdání: aktér hraje nejnižší legální kartu, obrana náhodně, a
       * jakmile se „nic za mnou" nabídne, musí vydržet do konce. Ruka aktéra je
       * polovinou rozdání tažená z nízkých karet, jinak by se nabídka nepotkala.
       */
      let offered = 0;
      let exhaustive = 0;
      let leaves = 0;
      for (let seed = 1; seed <= 600 && offered < 60; seed += 1) {
        let r = seed * 7919;
        const next = () => (r = (r * 1103515245 + 12345) % 2147483648);
        const deck = [...DECK_C];
        for (let i = deck.length - 1; i > 0; i -= 1) { const j = next() % (i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        const low = deck.filter((c) => (c & 7) <= 4);
        const mine = seed % 2 === 0 ? low.slice(0, 10) : deck.slice(0, 10);
        const pool = deck.filter((c) => !mine.includes(c));
        let st = mkBetl([mine, pool.slice(0, 10), pool.slice(10, 20)], pool.slice(20, 22));
        for (let guard = 0; st.phase.name === 'tricks' && guard < 40; guard += 1) {
          const actor = actorOf(st);
          if (actor === undefined) break;
          if (actor === 0) {
            if (claimPlan(viewC(st, 0)) !== null) {
              offered += 1;
              if (st.hands[0].length <= 4) { leaves += exhaust(st); exhaustive += 1; }
              else for (let k = 1; k <= 15; k += 1) rollout(st, seed * 100 + k);
              break;
            }
            const acts = legalC(viewC(st, 0));
            acts.sort((a, b) => (a as { card: number }).card % 8 - (b as { card: number }).card % 8);
            st = apC(st, acts[0]);
          } else {
            const acts = legalC(viewC(st, actor));
            st = apC(st, acts[next() % acts.length]);
          }
        }
      }
      /*
       * Controller: v betlu se nabídka přijme i UPROSTŘED štychu (aktér tam
       * přiznává barvu, na výnos se už nedostane) a dohrávka dojde k vyhranému
       * betlu. U „vše za mnou" se doprostřed štychu odmítá — tohle je jediná
       * cesta, kde plán platí jen na jeden tah a controller ho musí přepočítávat.
       */
      {
        const { MatchController: MCB } = await import('../src/lib/match/controller');
        const driverB = {
          think: async (req: Parameters<typeof thinkC>[0] & { requestId: number }) =>
            thinkC({ view: req.view, difficulty: 'easy', seed: req.seed, budgetMs: 0 }),
          cancel: () => {},
        };
        const mine = [H(2), ...lowRanks.map(Z), K(0), K(1), K(2), L(0), L(1), L(2)];
        const talon = [H(0), H(1)];
        const hi = H(6);
        const others = rest([...mine, ...talon, hi]);
        const st = mkBetl([mine, others.slice(0, 10), others.slice(10, 19)], talon, { trick: [{ seat: 2, card: hi }], leader: 2, toAct: 0 });
        const c = new MCB(driverB, {
          config: cfgC('licitovany'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
          seedSource: () => 7, aiDelayMs: 0, claimDelayMs: 0,
        }, st);
        assert.equal(c.claimRest(), true, 'v betlu se „nic za mnou" přijme i uprostřed štychu');
        for (let i = 0; i < 400 && c.state.phase.name !== 'scored'; i += 1) await new Promise((res) => setTimeout(res, 2));
        betlKept(c.state);
        assert.equal(c.state.phase.name, 'scored', 'dohrávka betlu musí dojít k zúčtování');
        assert.equal(c.isClaiming, false, 'a příznak po zúčtování zhasne');
        c.stop();
      }

      assert.ok(offered >= 30, `„nic za mnou" se v náhodných betlech potkalo jen ${offered}× — tak by se neověřilo`);
      assert.ok(exhaustive >= 5, `úplné prohledání proběhlo jen ${exhaustive}× — krátké ruce se nepotkaly`);
      console.log(
        `PASS nic za mnou — betl: ${offered} nabídek v náhodných rozdáních, ${exhaustive}× proti všem tahům obrany `
        + `(${leaves} konců), vždy vyhraný; a nenabízí se při nutném přebití, neznámém talonu ani obránci`,
      );
    }

    // (D) tichá sedma — vynést ji první znamená přijít o ni
    {
      const st = mkClaim([cardC(TRUMP, ESO_C), cardC(TRUMP, R10_C), cardC(TRUMP, R7_C)]);
      const plan = claimPlan(viewC(st, 0));
      assert.ok(plan !== null, 'se všemi zbylými trumfy musí nabídka platit');
      assert.equal(plan[plan.length - 1], cardC(TRUMP, R7_C), 'trumfová sedma patří na konec plánu');
      const byPlan = playOut(st, 0, plan, true);
      const sevenFirst = playOut(st, 0, [cardC(TRUMP, R7_C), cardC(TRUMP, ESO_C), cardC(TRUMP, R10_C)], true);
      assert.ok(byPlan !== null && sevenFirst !== null, 'obě pořadí musí jít dohrát');
      assert.ok(
        byPlan.delta > sevenFirst.delta,
        `tichá sedma musí být znát: podle plánu ${byPlan.delta}, se sedmou první ${sevenFirst.delta}`,
      );
    }

    // (E) nehlášená trumfová hláška — bez ohlášení se hra prohraje
    {
      const st = mkClaim([cardC(TRUMP, KRAL_C), cardC(TRUMP, SVRSEK_C), cardC(TRUMP, R7_C)]);
      const plan = claimPlan(viewC(st, 0));
      assert.ok(plan !== null, 'nabídka musí platit i s králem a svrškem');
      const withIt = playOut(st, 0, plan, true);
      const without = playOut(st, 0, plan, false);
      assert.ok(withIt !== null && without !== null, 'obě varianty musí jít dohrát');
      assert.ok(
        withIt.delta > without.delta,
        `trumfová hláška musí být znát: s hláškou ${withIt.delta}, bez ní ${without.delta}`,
      );
    }
  /*
   * Controller: pojistky kolem „vše za mnou" (§39).
   *
   * Smoke klikne na tlačítko a počká na zúčtování — to je šťastná cesta. Odmítnutí
   * mimo výnos, zhasnutí při novém rozdání a hlavně to, že se nezahraje ani jedna
   * karta navíc, tím ověřené není. `claimDelayMs` vzniklo přesně kvůli tomuhle
   * testu, tak ať ho něco používá.
   */
  {
    const { MatchController: MCC } = await import('../src/lib/match/controller');
    const { think: thinkMC } = await import('../src/lib/ai/think');

    const driverC = {
      think: async (req: Parameters<typeof thinkMC>[0] & { requestId: number }) =>
        thinkMC({ view: req.view, difficulty: 'easy', seed: req.seed, budgetMs: 0 }),
      cancel: () => {},
    };
    const napC = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const mkController = (st: StC) => new MCC(driverC, {
      config: cfgC('voleny'), humanSeat: 0, difficulty: 'easy', budgetMs: 0,
      seedSource: () => 7, aiDelayMs: 0, claimDelayMs: 0,
    }, st);

    // (1) uprostřed rozehraného štychu se nabídka odmítá
    {
      const st = mkClaim([cardC(0, ESO_C), cardC(0, R10_C), cardC(0, R7_C)]);
      const mid = {
        ...st,
        phase: { ...(st.phase as object), toAct: 1, trick: [{ seat: 0, card: cardC(0, ESO_C) }] },
      } as unknown as StC;
      const c = mkController(mid);
      assert.equal(c.claimRest(), false, 'doprostřed štychu se „vše za mnou" nabídnout nesmí');
      c.stop();
    }

    // (2) na výnosu se přijme a dohraje se PŘESNĚ plán — ani karta navíc
    {
      const st = mkClaim([cardC(0, ESO_C), cardC(0, R10_C), cardC(0, R7_C)]);
      const plan = claimPlan(viewC(st, 0));
      assert.ok(plan !== null, 'testovací stav musí nabídku mít');
      const c = mkController(st);
      assert.equal(c.claimRest(), true, 'na výnosu se „vše za mnou" přijmout musí');
      for (let i = 0; i < 200 && c.state.phase.name !== 'scored'; i += 1) await napC(2);
      assert.equal(c.state.phase.name, 'scored', 'dohrávka musí dojít k zúčtování');
      const mine = c.state.history.filter((a) => a.type === 'play' && a.seat === 0).map((a) => (a as { card: number }).card);
      assert.deepEqual(mine, plan, 'zahrát se musí přesně plán, ve stejném pořadí');
      c.stop();
    }

    // (3) po dohrání příznak zhasne — jinak by doskočila do další hry
    {
      const st = mkClaim([cardC(0, ESO_C), cardC(0, R10_C), cardC(0, R7_C)]);
      const c = mkController(st);
      assert.equal(c.isClaiming, false, 'před kliknutím se nedohrává');
      assert.equal(c.claimRest(), true, 'nabídka platí');
      assert.equal(c.isClaiming, true, 'po přijetí dohrávka běží');
      for (let i = 0; i < 200 && c.state.phase.name !== 'scored'; i += 1) await napC(2);
      assert.equal(c.state.phase.name, 'scored', 'dohrávka musí dojít k zúčtování');
      assert.equal(c.isClaiming, false, 'a po zúčtování musí příznak zhasnout');
      c.stop();
    }
    }
  }

  console.log(
    `PASS vše za mnou — plán je optimální (volený ${perVariant.voleny}, licitovaný ${perVariant.licitovany} případů, `
    + `z toho ${mattered}× na pořadí záleželo; betl, durch, tichá sedma a hláška zvlášť)`,
  );
}


/*
 * Vydávací workflow: do těla `run:` nepatří výraz `${{ }}`.
 *
 * GitHub ho dosadí do textu skriptu JEŠTĚ PŘED tím, než ho shell rozebere —
 * hodnota se tak stává SYNTAXÍ, ne argumentem. Titulek vydání přitom pochází
 * z nadpisu v CHANGELOG.md (scripts/release-notes.ts bere `(.*)` doslova),
 * takže uvozovka v nadpisu by na runneru spustila cizí příkaz, a to v kroku,
 * kde je vystavený `GH_TOKEN` s právem `contents: write`. Hodnoty se proto
 * předávají přes `env:`, kde jsou pro shell jen text.
 */
{
  /**
   * Všechny `run:` skripty ve workflow — přes skutečný YAML parser.
   *
   * Tohle si vlastní parser třikrát nezasloužil: postupně mu unikl kompaktní
   * `- run: |` (odsazení od pomlčky), zapisy `run :` a `"run":`, a nakonec
   * `-    run:` s víc mezerami a kotva `run: &script |`, u níž se tělo tvářilo
   * jako hodnota. Strážce, který tiše přeskočí krok, je horší než žádný —
   * budí dojem, že je hlídáno i to, co není. YAML umí spoustu zápisů téhož;
   * rozplétat je regulárním výrazem je prohraná bitva, tak to dělá knihovna
   * (`yaml`, kotvy a flow mapy vyřeší sama).
   */
  interface WfStep { uses?: unknown; with?: unknown; run?: unknown }
  interface WfJob { name: string; contents: string | null; steps: WfStep[] }

  const parseJobs = (yamlText: string): WfJob[] => {
    const doc = parseYaml(yamlText) as {
      permissions?: unknown;
      jobs?: Record<string, { permissions?: unknown; steps?: unknown }>;
    } | null;
    /**
     * Právo `contents` daného bloku `permissions:` — `write-all` počítáme taky.
     *
     * `null` znamená „blok chybí", a to je jiná věc než prázdný blok: `permissions: {}`
     * vypne všechno (`none`), kdežto žádný blok nechá výchozí práva repozitáře,
     * a ta mohou být i zapisovací. Kdo si o práva neřekne, dostane výchozí.
     */
    const contentsOf = (p: unknown): string | null => {
      if (p === undefined || p === null) return null;
      if (p === 'write-all') return 'write';
      if (p === 'read-all') return 'read';
      if (typeof p === 'object') {
        const c = (p as Record<string, unknown>).contents;
        return typeof c === 'string' ? c : 'none';
      }
      return null;
    };
    const top = contentsOf(doc?.permissions);
    return Object.entries(doc?.jobs ?? {}).map(([name, job]) => ({
      name,
      // job si právo buď řekne sám, nebo zdědí to z celého workflow
      contents: contentsOf(job?.permissions) ?? top,
      steps: (Array.isArray(job?.steps) ? job.steps : [])
        .filter((s): s is WfStep => s !== null && typeof s === 'object'),
    }));
  };

  const runScripts = (yamlText: string): string[] =>
    parseJobs(yamlText).flatMap((j) => j.steps.map((s) => s.run).filter((r): r is string => typeof r === 'string'));

  /** Co se ve skriptu nesmí objevit, s vysvětlením proč. */
  const complaints = (script: string, where: string): string[] => {
    const out: string[] = [];
    for (const line of script.split('\n')) {
      /*
       * `${{ }}` se dosadí do TEXTU skriptu dřív, než ho shell rozebere —
       * hodnota se tím stává syntaxí. Předává se proto přes `env:`.
       */
      if (line.includes('${{')) out.push(`${where}: „${line.trim()}" — výraz se dosadí před shellem, předej ho přes env:`);
      /*
       * `echo "x=$(cmd)" >> $GITHUB_OUTPUT` SPOLKNE návratový kód: substituce
       * uvnitř argumentu ho nepropustí a `echo` vrátí 0, takže `set -e` nezabere
       * a krok pokračuje s prázdnou hodnotou.
       */
      if (line.includes('GITHUB_OUTPUT') && line.includes('$(')) {
        out.push(`${where}: „${line.trim()}" — návratový kód substituce se ztratí, přiřaď do proměnné`);
      }
      /*
       * `npx foo` SÁHNE DO REGISTRU, když `foo` v node_modules nenajde. Tady
       * to znamená cizí, nikým neodsouhlasený kód uvnitř vydávacího jobu.
       * Dneska se to nestane, protože `npm ci` běžel ve stejném adresáři —
       * ale je to jedno `--omit=dev` nebo jeden nedoběhlý `npm ci` daleko.
       * Binárka se volá z lockfilu (`node node_modules/<balík>/…`).
       */
      if (/(^|[\s;&|(])npx\s/.test(line) && !line.includes('--no-install')) {
        out.push(`${where}: „${line.trim()}" — npx si balík doinstaluje z registru, volej binárku z node_modules`);
      }
    }
    return out;
  };

  /**
   * Co se nesmí objevit ve STAVBĚ jobu — tohle `run:` řádky neuvidí.
   *
   * Token s `contents: write` nesmí být na runneru, kde běží kód projektu.
   * Nestačí ho nedat do `.git/config` (`persist-credentials: false`): postinstall
   * skript kterékoli závislosti si může podstrčit vlastní `gh` a přidat si
   * adresář do `$GITHUB_PATH`, a krok s tokenem pak zavolá jeho. Drží to jedině
   * dělba na dva joby — a ta se dá zrušit jediným smazaným řádkem, takže ji
   * musí hlídat test.
   */
  const jobComplaints = (job: WfJob, where: string): string[] => {
    const out: string[] = [];
    const writes = job.contents === 'write';
    let runsCode = false;
    for (const step of job.steps) {
      if (typeof step.uses === 'string' && step.uses.startsWith('actions/checkout')) {
        runsCode = true;
        const w = (step.with !== null && typeof step.with === 'object' ? step.with : {}) as Record<string, unknown>;
        if (w['persist-credentials'] !== false) {
          out.push(`${where} (${job.name}): checkout bez \`persist-credentials: false\` — token zůstane v .git/config na celý job`);
        }
        if (writes) out.push(`${where} (${job.name}): job s \`contents: write\` si stahuje repozitář — kód projektu patří do jobu, který zapisovat nesmí`);
      }
      /*
       * `gh` z image runneru je v pořádku; `npm`, `make`, `node` a spol. znamenají
       * kód projektu a jeho závislostí, tedy přesně to, před čím token chráníme.
       */
      // `(\s|$)`: jednořádkové `run: make` nemá za příkazem nic, ani konec řádku
      if (typeof step.run === 'string' && /(^|[\s;&|(])(npm|npx|yarn|pnpm|make|node)(\s|$)/.test(step.run)) {
        runsCode = true;
        if (writes) out.push(`${where} (${job.name}): \`contents: write\` a k tomu kód projektu — podstrčený \`gh\` by dostal token`);
      }
    }
    /*
     * Job, který si o práva vůbec neřekne (ani on, ani workflow), dostane VÝCHOZÍ
     * token repozitáře — a ten smí podle nastavení repozitáře i zapisovat. Kontrola
     * výš by takový job pustila, protože `write` v něm nikde nestojí. Kdo spouští
     * kód projektu, musí proto svoje právo napsat výslovně.
     */
    if (runsCode && job.contents === null) {
      out.push(`${where} (${job.name}): job spouští kód projektu a nemá \`permissions:\` — dostane výchozí token repozitáře, napiš \`contents: read\``);
    }
    return out;
  };

  // parser napřed na zápisech, které vlastnímu regexu postupně unikly
  const tricky = [
    'jobs:',
    '  a:',
    '    steps:',
    '      - run: |',                       // kompaktní blok
    '          echo "${{ github.event.issue.title }}"',
    '        env:',
    '          SAFE: ${{ secrets.TOKEN }}', // sourozenec, ne tělo
    '      -    run: echo "${{ inputs.x }}"', // víc mezer za pomlčkou
    '      - name: kotva',
    '        run: &script |',               // kotva: tělo se tvářilo jako hodnota
    '          echo "${{ inputs.y }}"',
    '      - { name: flow, run: \'echo "${{ inputs.z }}"\' }', // flow mapa
    '      - uses: actions/checkout@v4',    // krok bez run:
  ].join('\n');
  const found = runScripts(tricky);
  assert.equal(found.length, 4, `parser má najít čtyři skripty, našel ${found.length}`);
  assert.equal(
    found.filter((r) => r.includes('${{')).length, 4,
    'a ve všech čtyřech musí ten výraz vidět — každý z těchhle zápisů už jednou proklouzl',
  );
  assert.equal(
    complaints(found.join('\n'), 'x').length, 4, 'každý z nich musí vyvolat stížnost',
  );
  // sourozenecké `env:` do těla nepatří — jinak by guard shodil správný krok
  assert.ok(
    found.every((r) => !r.includes('SAFE')),
    '`env:` vedle `run:` není jeho tělo',
  );
  // a čistý workflow ze samých `uses:` projde bez řečí (žádný `run:` neznamená v pořádku)
  assert.deepEqual(runScripts('jobs:\n  a:\n    steps:\n      - uses: x/y@v1'), []);

  /*
   * Druhá větev potřebuje VLASTNÍ vzorek. Ve `tricky` je `${{` na každém řádku,
   * takže by tamní čtyři stížnosti seděly i tehdy, kdyby kontrola spolknutého
   * návratového kódu vypadla — negativní kontrola, která nekouše. Tady žádný
   * výraz není: stěžovat si smí jedině ta druhá větev.
   */
  const steps = (...lines: string[]) => ['jobs:', '  a:', '    steps:', '      - run: |', ...lines.map((l) => `          ${l}`)].join('\n');
  const swallows = complaints(runScripts(steps('echo "title=$(node scripts/release-notes.ts)" >> "$GITHUB_OUTPUT"')).join('\n'), 'x');
  assert.equal(swallows.length, 1, 'substituce uvnitř `echo` do GITHUB_OUTPUT musí vyvolat stížnost');
  assert.match(swallows[0], /návratový kód/, 'a říct proč, ne jen že se to nelíbí');
  // …a tvar, kterým to release.yml řeší (přiřazení a teprve pak echo), projít musí
  assert.deepEqual(
    complaints(runScripts(steps(
      'title="$(node scripts/release-notes.ts)"',
      'echo "title=$title" >> "$GITHUB_OUTPUT"',
    )).join('\n'), 'x'),
    [], 'přiřazení do proměnné je právě to řešení, které strážce vynucuje',
  );

  // …a totéž pro `npx`: co si smí doinstalovat z registru, do release jobu nepatří
  const npxBad = complaints(runScripts(steps('npx playwright install --with-deps chromium')).join('\n'), 'x');
  assert.equal(npxBad.length, 1, '`npx` bez `--no-install` musí vyvolat stížnost');
  assert.match(npxBad[0], /z registru/, 'a říct, co je na tom špatně');
  assert.deepEqual(
    complaints(runScripts(steps(
      'node node_modules/playwright/cli.js install chromium', // binárka z lockfilu
      'npx --no-install tsx scripts/x.ts',                    // …nebo aspoň bez doinstalace
      'echo "npx se o sobě jen zmiňuje"',                     // zmínka uprostřed slova není volání
    )).join('\n'), 'x'),
    [], 'volání z node_modules ani `--no-install` stěžovat nesmí',
  );

  /*
   * A stavba jobu. Tohle je ta kontrola, která PŘESKOČENÝ KROK nepromine:
   * checkout `run:` nemá, takže ho předchozí strážce míjel — a přesně v něm
   * sedí `persist-credentials`.
   */
  {
    const wf = (...lines: string[]) => lines.join('\n');
    const bare = parseJobs(wf(
      'permissions:', '  contents: write',
      'jobs:', '  a:', '    steps:', '      - uses: actions/checkout@v4',
    ));
    const bareSays = bare.flatMap((j) => jobComplaints(j, 'x'));
    assert.equal(bareSays.length, 2, `holý checkout v zapisujícím jobu má vyvolat dvě stížnosti, ne ${bareSays.length}`);
    assert.ok(bareSays.some((s) => s.includes('persist-credentials')), 'a jedna z nich musí být o `persist-credentials`');
    assert.ok(bareSays.some((s) => s.includes('stahuje repozitář')), 'a druhá o tom, že tenhle job nemá co checkoutovat');

    // právo zděděné z workflow se počítá stejně jako to, co si job řekne sám
    const inherited = parseJobs(wf('permissions:', '  contents: write', 'jobs:', '  a:', '    steps:', '      - run: npm ci'));
    assert.equal(inherited[0].contents, 'write', 'právo se dědí z workflow, když si job vlastní neřekne');
    assert.equal(jobComplaints(inherited[0], 'x').length, 1, '`npm ci` v zapisujícím jobu musí vadit');

    // a job, který si řekne o čtení, to zděděné právo přebíjí
    const narrowed = parseJobs(wf(
      'permissions:', '  contents: write',
      'jobs:', '  a:', '    permissions:', '      contents: read',
      '    steps:', '      - uses: actions/checkout@v4',
      '        with:', '          persist-credentials: false',
      '      - run: npm ci', '      - run: make all',
    ));
    assert.deepEqual(jobComplaints(narrowed[0], 'x'), [], 'čtoucí job smí stahovat repozitář i stavět projekt');

    // …a zapisující job bez checkoutu a bez závislostí projít musí
    const publish = parseJobs(wf(
      'jobs:', '  b:', '    permissions:', '      contents: write',
      '    steps:', '      - uses: actions/download-artifact@v4',
      '      - run: gh release create "$GITHUB_REF_NAME" --notes-file release-notes.md',
    ));
    assert.deepEqual(jobComplaints(publish[0], 'x'), [], 'samotné `gh` z image runneru je v pořádku');

    /*
     * Chybějící `permissions:` není „bez práv", je to „výchozí práva repozitáře".
     * `write` tu nikde nestojí, takže by to kontrola výš pustila — a job by dostal
     * token, který smí podle nastavení repozitáře i zapisovat.
     */
    const cleanCheckout = ['    steps:', '      - uses: actions/checkout@v4', '        with:', '          persist-credentials: false', '      - run: npm ci'];
    const undeclared = parseJobs(wf('jobs:', '  a:', ...cleanCheckout));
    assert.equal(undeclared[0].contents, null, 'bez bloku `permissions:` nemá job žádné vlastní právo');
    const undeclaredSays = jobComplaints(undeclared[0], 'x');
    assert.equal(undeclaredSays.length, 1, `job s kódem projektu a bez \`permissions:\` má vyvolat jednu stížnost, ne ${undeclaredSays.length}`);
    assert.match(undeclaredSays[0], /výchozí token/, 'a říct, že dostane výchozí token repozitáře');
    /*
     * Kód projektu se pozná dvěma cestami (checkout, nebo `npm`/`make`/`node` v `run:`)
     * a každá musí stížnost vyvolat SAMA. Vzorek výš má obě, takže by prošel,
     * i kdyby jedna z nich zmizela.
     */
    for (const [label, steps] of [
      ['jen checkout', ['    steps:', '      - uses: actions/checkout@v4', '        with:', '          persist-credentials: false']],
      ['jen `npm ci`', ['    steps:', '      - run: npm ci']],
      ['jen `node` nad staženým artefaktem', ['    steps:', '      - uses: actions/download-artifact@v4', '      - run: node artifact.js']],
      ['jednořádkové `run: make`', ['    steps:', '      - run: make']],
    ] as const) {
      const says = jobComplaints(parseJobs(wf('jobs:', '  a:', ...steps))[0], 'x');
      assert.equal(says.length, 1, `${label} bez \`permissions:\` má vyvolat jednu stížnost, ne ${says.length}`);
      assert.match(says[0], /výchozí token/, `${label}: stížnost má být o výchozím tokenu`);
    }
    // tentýž job bez kódu projektu (jen `gh`) nevadí — výchozí token tu nemá kdo ukrást
    assert.deepEqual(
      jobComplaints(parseJobs(wf('jobs:', '  a:', '    steps:', '      - run: gh --version'))[0], 'x'), [],
      'job bez kódu projektu si práva psát nemusí',
    );
    // prázdný blok je naopak výslovné „nic": `permissions: {}` nahoře i u jobu
    const none = parseJobs(wf('permissions: {}', 'jobs:', '  a:', ...cleanCheckout));
    assert.equal(none[0].contents, 'none', '`permissions: {}` znamená žádná práva, ne chybějící blok');
    assert.deepEqual(jobComplaints(none[0], 'x'), [], 'job zděděný z `permissions: {}` je v pořádku');
    const jobNone = parseJobs(wf('permissions: write-all', 'jobs:', '  a:', '    permissions: {}', ...cleanCheckout));
    assert.equal(jobNone[0].contents, 'none', 'prázdný blok u jobu přebíjí `write-all` workflow (GitHub bloky neslučuje)');
  }

  /*
   * Spouštěče. `pull_request_target` běží v kontextu CÍLOVÉHO repozitáře —
   * s tokenem, který smí zapisovat, a se secrets — a stačí mu stáhnout kód
   * z PR, aby ho z forku spustil kdokoli (tady navíc s postinstall skripty
   * celého `npm ci`). `workflow_run` je jeho sourozenec: běží po jiném workflow,
   * zase s právy cílového repozitáře, a typicky si stáhne artefakt, který
   * vyrobil kód z PR. PR testy proto jedou na `pull_request`, a ty dva
   * spouštěče nesmí do žádného workflow přibýt ani omylem.
   */
  const triggersOf = (yamlText: string): string[] => {
    const on = (parseYaml(yamlText) as { on?: unknown } | null)?.on;
    if (typeof on === 'string') return [on];
    if (Array.isArray(on)) return on.filter((t): t is string => typeof t === 'string');
    if (on !== null && typeof on === 'object') return Object.keys(on);
    return [];
  };
  const PRIVILEGED_TRIGGERS = ['pull_request_target', 'workflow_run'];
  const triggerComplaints = (yamlText: string, where: string): string[] =>
    triggersOf(yamlText)
      .filter((t) => PRIVILEGED_TRIGGERS.includes(t))
      .map((t) => `${where}: \`${t}\` pouští kód z PR s tokenem cílového repozitáře — použij \`pull_request\``);

  // všechny tři zápisy `on:`, a klíč `on` musí zůstat řetězcem (YAML 1.1 by z něj udělal `true`)
  assert.deepEqual(triggersOf('on: pull_request_target\njobs: {}'), ['pull_request_target']);
  assert.deepEqual(triggersOf('on: [push, pull_request_target]\njobs: {}'), ['push', 'pull_request_target']);
  assert.deepEqual(
    triggersOf('on:\n  pull_request_target:\n    branches: [main]\n  push:\njobs: {}'),
    ['pull_request_target', 'push'],
  );
  assert.deepEqual(triggersOf('jobs: {}'), [], 'workflow bez `on:` nemá žádný spouštěč');

  /*
   * A samotné odmítnutí, na vzorcích — ne až na souborech v repozitáři. Ty žádný
   * zakázaný spouštěč nemají, takže kontrola nad nimi by prošla, i kdyby odmítání
   * vůbec nebylo.
   */
  for (const yamlText of [
    'on: pull_request_target\njobs: {}',
    'on: [push, pull_request_target]\njobs: {}',
    'on:\n  pull_request_target:\n    types: [opened]\njobs: {}',
    'on:\n  workflow_run:\n    workflows: [ci]\n    types: [completed]\njobs: {}',
  ]) {
    const says = triggerComplaints(yamlText, 'x');
    assert.equal(says.length, 1, `zakázaný spouštěč má vyvolat jednu stížnost:\n${yamlText}`);
    assert.match(says[0], /pull_request_target|workflow_run/, 'a jmenovat, který spouštěč to je');
  }
  assert.deepEqual(
    triggerComplaints('on:\n  pull_request:\n    branches: [main]\n  push:\njobs: {}', 'x'), [],
    '`pull_request` (i vedle `push`) projít musí',
  );

  /*
   * Job přeskočený přes `if:` GitHub hlásí jako Success — i u povinné kontroly.
   * Ve workflow na `pull_request` by tak jiná událost na témže commitu (třeba
   * přepsaný název PR) vyrobila zelenou kontrolu stejného jména přes spadlý
   * nebo ještě běžící test. PR workflow proto žádné `if:` u jobu nemá: každá
   * jeho kontrola je skutečný běh.
   */
  const skippableJobs = (yamlText: string, where: string): string[] => {
    if (!triggersOf(yamlText).includes('pull_request')) return [];
    const jobs = (parseYaml(yamlText) as { jobs?: Record<string, { if?: unknown } | null> } | null)?.jobs ?? {};
    return Object.entries(jobs)
      .filter(([, job]) => job !== null && typeof job === 'object' && job.if !== undefined)
      .map(([name]) => `${where} (${name}): \`if:\` u jobu na pull_request — přeskočený job se hlásí jako Success a překryje skutečný test`);
  };
  {
    const pr = 'on:\n  pull_request:\n    types: [opened, edited]\n';
    const says = skippableJobs(`${pr}jobs:\n  overit:\n    if: github.event.action != 'edited'\n    runs-on: ubuntu-latest\n`, 'x');
    assert.equal(says.length, 1, `job s \`if:\` na pull_request má vyvolat jednu stížnost, ne ${says.length}`);
    assert.match(says[0], /Success/, 'a říct, proč vadí');
    assert.deepEqual(skippableJobs(`${pr}jobs:\n  overit:\n    runs-on: ubuntu-latest\n`, 'x'), [], 'job bez `if:` projde');
    // mimo pull_request (vydání na tag) `if:` nevadí — tam žádná kontrola PR nevzniká
    assert.deepEqual(
      skippableJobs("on:\n  push:\n    tags: ['v*']\njobs:\n  vydat:\n    if: github.ref_type == 'tag'\n", 'x'), [],
      'na push `if:` smí být',
    );
  }

  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  let prWorkflows = 0;
  assert.ok(files.length > 0, 'nenašel se žádný workflow — test by nic nehlídal');
  let scripts = 0;
  let checkouts = 0;
  for (const file of files) {
    const where = `.github/workflows/${file}`;
    const text = readFileSync(join(dir, file), 'utf8');
    const found1 = [...triggerComplaints(text, where), ...skippableJobs(text, where)];
    assert.equal(found1.length, 0, found1[0]);
    if (triggersOf(text).includes('pull_request')) prWorkflows += 1;
    for (const script of runScripts(text)) {
      scripts += 1;
      const found2 = complaints(script, where);
      assert.equal(found2.length, 0, found2[0]);
    }
    for (const job of parseJobs(text)) {
      const found3 = jobComplaints(job, where);
      assert.equal(found3.length, 0, found3[0]);
      checkouts += job.steps.filter((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout')).length;
    }
  }
  assert.ok(scripts > 0, 'v žádném workflow se nenašel `run:` — parser asi nedošel k `jobs`');
  // kdyby `uses:` přestalo docházet až ke krokům, kontrola stavby by tiše nic nedělala
  assert.ok(checkouts > 0, 'v žádném workflow se nenašel checkout — parser asi nedošel ke krokům `uses:`');
  // kdyby parser spouštěčů přestal číst `on:`, kontrola zakázaných spouštěčů by tiše nic nehlídala
  assert.ok(prWorkflows > 0, 'žádný workflow neběží na `pull_request` — buď zmizely PR testy, nebo parser nečte `on:`');
  console.log(
    `PASS workflow — run: bez dosazovaných výrazů, spolknutých návratových kódů a npx (${scripts} skriptů), `
    + `joby s kódem projektu s výslovnými právy, PR testy na pull_request (ne pull_request_target ani workflow_run) a bez přeskočitelných jobů`,
  );
}

/*
 * Nadpis sekce z CHANGELOG.md teče do `gh release create --title`, a cestou se
 * píše do GITHUB_OUTPUT jako `title=…`. Řídicí znak by ten řádek rozbil, takže
 * `release-notes.ts` takový nadpis odmítá — a protože se skript v `make all`
 * jinak vůbec nespouští, hlídá ho až tenhle test. Jede jako podproces nad
 * dočasným CHANGELOGem (skript čte `CHANGELOG.md` relativně ke cwd).
 *
 * Tenhle blok už jednou zmizel při přepisu sousedního strážce a nikomu to
 * nespadlo — jediné, co po něm zbylo, byly nepoužité importy. Pokud ho někdy
 * budeš mazat, smaž s ním i ten guard v `release-notes.ts`; jinak zůstane
 * kontrola, kterou nikdo nespouští, a selže až na tagu, v jobu s `contents:
 * write`.
 */
{
  const tmp = mkdtempSync(join(tmpdir(), 'flek-notes-'));
  const script = join(ROOT, 'scripts/release-notes.ts');
  /*
   * Ne `npx`: cwd je mimo repozitář, takže by `tsx` z `node_modules` nenašel
   * a v CI by si ho STÁHL z registru — cizí nevypnutý kód v release jobu,
   * který má `contents: write` a token z checkoutu. Voláme rovnou node
   * s CLI z lockfilu; když tam není, test radši spadne, než aby něco tahal.
   */
  const tsxCli = join(ROOT, 'node_modules/tsx/dist/cli.mjs');
  assert.ok(existsSync(tsxCli), 'tsx z node_modules nenalezen — `npm ci` neproběhl?');
  const run = (heading: string): { status: number | null; out: string; err: string } => {
    writeFileSync(join(tmp, 'CHANGELOG.md'), `${heading}\n\nTělo vydání.\n`);
    const r = spawnSync(process.execPath, [tsxCli, script, 'v9.9.9', join(tmp, 'notes.md')], {
      cwd: tmp, encoding: 'utf8',
    });
    return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
  };

  const good = run('## v9.9.9 — Čistý název vydání');
  assert.equal(good.status, 0, `čistý nadpis musí projít (stderr: ${good.err})`);
  assert.equal(good.out, 'v9.9.9 — Čistý název vydání', 'název se vypisuje na stdout beze změny');

  const bell = String.fromCharCode(7);
  const bad = run(`## v9.9.9 — Název s${bell}řídicím znakem`);
  assert.equal(bad.status, 2, 'nadpis s řídicím znakem musí vydání zastavit');
  assert.match(bad.err, /řídicí znaky/, 'a říct proč');

  // chybějící sekce zůstává chybou i nadále (starší strážce, tentýž kód)
  assert.equal(run('## v0.0.1 — Jiná verze').status, 2, 'chybějící sekce pro tag musí skončit dvojkou');
  console.log('PASS vydání — nadpis s řídicím znakem release zastaví, čistý projde');
}

console.log('OK: vše prošlo');
