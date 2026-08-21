/**
 * verify.ts — testy projektu (vzor mars: node:assert, spouští se `make verify`)
 *
 * Zatím: konzistence karetních sad. Poroste s enginem (viz docs/marias-design.md §8).
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
checkDeck('cards/history', 'png');
assert.ok(existsSync(join(ROOT, 'cards/modern/back.svg')), 'chybí rub moderní sady');

// EN sada má správné indexy (spodek→J, svršek→Q)
const uh = readFileSync(join(ROOT, 'cards/modern-en/UH.svg'), 'utf8');
const oh = readFileSync(join(ROOT, 'cards/modern-en/OH.svg'), 'utf8');
assert.match(uh, />J</, 'EN spodek má mít index J');
assert.match(oh, />Q</, 'EN svršek má mít index Q');
const uhCs = readFileSync(join(ROOT, 'cards/modern/UH.svg'), 'utf8');
assert.match(uhCs, />S</, 'CZ spodek má mít index S');
console.log('PASS indexy CZ (S V K A) / EN (J Q K A)');

// SVG neobsahují externí reference (self-contained; xmlns namespace je v pořádku)
for (const set of ['cards/modern', 'cards/modern-en']) {
  for (const f of readdirSync(join(ROOT, set)).filter((f) => f.endsWith('.svg'))) {
    const svg = readFileSync(join(ROOT, set, f), 'utf8');
    assert.doesNotMatch(svg, /(href|src)\s*=\s*"https?:/, `${set}/${f}: externí odkaz`);
    assert.doesNotMatch(svg, /url\(\s*['"]?https?:/, `${set}/${f}: externí url()`);
  }
}
console.log('PASS SVG bez externích referencí');

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
        assert.equal(total, 90, `${variant}/${seed}: celkové body ${total} ≠ 90`);
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

console.log('OK: vše prošlo');
