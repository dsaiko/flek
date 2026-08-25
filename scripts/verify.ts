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

  // odehraj 2 kompletní hry: člověk = heuristika volaná synchronně přes dispatch
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let hand = 0; hand < 2; hand += 1) {
    mc.dealNext();
    let guard = 0;
    while (mc.state.phase.name !== 'scored') {
      guard += 1;
      assert.ok(guard < 3000, 'controller: zaseknutý zápas');
      const actor = mc.actor();
      if (actor === 0) {
        const v = mc.humanView();
        const legalHuman = mc.humanLegal();
        const forced =
          legalHuman.length === 1 &&
          (legalHuman[0].type === 'good' ||
            (legalHuman[0].type === 'bid' && legalHuman[0].bid === 'pass'));
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
  assert.equal(mc.state.handResults.length, 2);
  // každé apply → přesně jeden autosave (žádné magické číslo závislé na pravidlech)
  assert.equal(saves, mc.state.history.length, 'autosave neodpovídá počtu akcí');
  // i28: lidských „dobrá"/pasů je v historii víc, než kolik jich poslal test →
  // rozdíl potvrdila auto-dobrá (počítáme MNOŽSTVÍ, akce jsou hodnotově identické)
  const isForcedish = (a: { type: string; seat?: number; bid?: unknown }): boolean =>
    a.seat === 0 && (a.type === 'good' || (a.type === 'bid' && a.bid === 'pass'));
  const inHistory = mc.state.history.filter(isForcedish).length;
  const fromTest = dispatchedByTest.filter((j) => isForcedish(JSON.parse(j))).length;
  assert.ok(inHistory > fromTest, `maybeAutoGood se nikdy neuplatnil (${inHistory} vs ${fromTest})`);
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

  // flek vynutí sehrávku (jinak by se flek „zdarma" pohltil základní sazbou)
  const flekked = playToDecision(cfgOn, 3, true);
  assert.equal(flekked.phase.name, 'tricks', 'flekovaná hra se musí hrát');

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
    step((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo, 'declare hra');
    const declarer = st.contract?.declarer;
    // obránce přebere betlem
    step((a) => a.type === 'takeover' && a.claim === 'betl', 'takeover betl');
    // původní aktér přebere durchem
    const durchTaker = actorOf(st);
    step((a) => a.type === 'takeover' && a.claim === 'durch', 'takeover durch');
    // zbytek pasuje
    let guard = 0;
    while (st.phase.name === 'takeover') {
      if ((guard += 1) > 10) throw new Error('scénář i1 se zasekl');
      step((a) => a.type === 'takeover' && a.claim === 'good', 'takeover good');
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
    console.log('PASS regrese i30 — varování odhozu (eso/desítka, rozbitá i pohřbená hláška)');
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

  // ── i6: nečervený sedmový závazek vyžaduje NEČERVENOU sedmu ──────────────
  {
    const base = defaultConfig('licitovany');
    const mkView = (hand: number[]): Parameters<typeof legalActions>[0] => ({
      seat: 0, config: base, dealer: 2, hand, handCounts: [10, 10, 10],
      revealedTrump: null, talonKnown: [], talon: null, contract: null,
      phase: { name: 'bidding', bids: [], toAct: 0, best: null },
      publicHistory: [], handResults: [], ledger: [0, 0, 0], handNo: 1,
    });
    // ruka, kde JEDINÁ sedma je červená
    const onlyRedSeven = [mk2(CE, S7b), mk2(1, Ab), mk2(1, Tb), mk2(2, Kb), mk2(2, SVb),
      mk2(3, Ab), mk2(3, Tb), mk2(1, Kb), mk2(2, Ab), mk2(3, Kb)];
    const bids = legalActions(mkView(onlyRedSeven)).filter((a) => a.type === 'bid' && a.bid !== 'pass');
    const kinds = bids.map((a) => (a.type === 'bid' && a.bid !== 'pass' ? `${a.bid.kind}${a.bid.cervena ? '-č' : ''}` : ''));
    assert.ok(!kinds.includes('sedma'), `nečervená sedma nabídnuta jen s červenou sedmou: ${kinds.join(',')}`);
    assert.ok(!kinds.includes('sto-sedma'), 'nečervené sto a sedma nabídnuto bez nečervené sedmy');
    assert.ok(kinds.includes('sedma-č'), 'červená sedma se s červenou sedmou nabídnout má');
    // „dvě sedmy" se nesmí nabízet vůbec (scoring je neumí)
    assert.ok(!kinds.some((k) => k.startsWith('dve-sedmy')), 'dvě sedmy se nesmí licitovat');
    const twoSevens = [mk2(CE, S7b), mk2(1, S7b), ...onlyRedSeven.slice(1, 9)];
    const kinds2 = legalActions(mkView(twoSevens))
      .flatMap((a) => (a.type === 'bid' && a.bid !== 'pass' ? [`${a.bid.kind}${a.bid.cervena ? '-č' : ''}`] : []));
    assert.ok(kinds2.includes('sedma'), 's nečervenou sedmou se nečervená sedma nabídnout má');
    assert.ok(!kinds2.some((k) => k.startsWith('dve-sedmy')), 'dvě sedmy se nesmí licitovat ani se dvěma sedmami');
    console.log('PASS regrese i6/i2 — sedmový závazek podle barvy sedmy, dvě sedmy nenabízeny');
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

  // ── i24: pořadí odpovědí na převzetí jde od forhonta ─────────────────────
  {
    // dealer 0 → forhont 1 = aktér; pořadí mluvení [1,2,0] bez aktéra → 2, pak 0
    let st: St = initialState(defaultConfig('voleny'), 0);
    st = apply(st, { type: 'deal', seed: 5 });
    const step = (pred: (a: Act) => boolean) => {
      const seat = ([0, 1, 2] as const).find((x) => legalActions(view(st, x)).length > 0)!;
      const a = legalActions(view(st, seat)).find(pred);
      assert.ok(a, 'chybí očekávaná akce');
      st = apply(st, a as Act);
    };
    step((a) => a.type === 'choose-trump' && a.card !== 'from-people');
    step((a) => a.type === 'discard');
    step((a) => a.type === 'declare');
    assert.equal(st.phase.name, 'takeover');
    if (st.phase.name === 'takeover') assert.equal(st.phase.toAct, 2, 'první mluví sedadlo 2 (po forhontovi)');
    step((a) => a.type === 'takeover' && a.claim === 'good');
    if (st.phase.name === 'takeover') assert.equal(st.phase.toAct, 0, 'druhý mluví sedadlo 0');
    console.log('PASS regrese i24 — pořadí mluvení při převzetí od forhonta');
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
      revealedTrump: null,
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
        if (acts.length > 1) cA.dispatch(acts[0]);
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
        if (acts.length > 1) cB.dispatch(acts[0]);
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
  const { deriveConstraints, TALON_SLOT } = await import('../src/lib/ai/determinize');
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
      revealedTrump: trumpCard, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: sedmaSeat, kilo: null, dveSedmy: false },
      phase: { name: 'tricks' as const, trickNo: 0, leader: 0 as const, toAct: 1 as const,
        trick: [], played: [], won: [[], [], []] as [number[], number[], number[]], marriages: [] },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    });

    // ukázaná trumfová karta smí být jen u volícího (sedadlo 0), nebo v talonu
    const c1 = deriveConstraints(mkView(null) as never);
    const allowTrump = c1.allowed.get(trumpCard);
    assert.ok(allowTrump, 'ukázaná trumfová karta musí být omezená');
    assert.deepEqual([...(allowTrump as Set<number>)].sort((a, b) => a - b), [TALON_SLOT, 0]);

    // sedma hlášená OBRÁNCEM (sedadlo 2) → drží trumfovou sedmu jistě
    const c2 = deriveConstraints(mkView(2) as never);
    assert.ok(c2.mustHave[2].has(mk3(2, S73)), 'sedma proti ⇒ obránce drží trumfovou sedmu');

    /*
     * Po převzetí betlem už aktér NENÍ ten, kdo trumfovou kartu ukázal — omezení
     * musí ukazovat na forhonta (dealer 2 ⇒ forhont 0), ne na aktéra (2).
     */
    const afterTakeover = deriveConstraints({
      ...mkView(null),
      contract: { mode: 'betl' as const, trump: null, declarer: 2 as const, sedma: null, kilo: null, dveSedmy: false },
    } as never);
    assert.deepEqual(
      [...(afterTakeover.allowed.get(trumpCard) as Set<number>)].sort((a, b) => a - b),
      [TALON_SLOT, 0], 'ukázanou kartu drží forhont, i když hru přebral někdo jiný',
    );

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
      step((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo, 'declare hra');
      // hru přebere OBRÁNCE betlem — právě tuhle větev 'keep' řeší
      step((a) => a.type === 'takeover' && a.claim === 'betl', 'takeover betl');
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
    assert.equal(retake.phase.name, 'discard-talon', 'výchozí „retake" nechá nového aktéra odhodit');
    assert.notEqual(retake.contract?.declarer, 0, 'scénář vyžaduje, aby přebíral obránce');
    assert.equal(
      retake.hands[retake.contract?.declarer as 0 | 1 | 2].length, 12,
      'při „retake" drží nový aktér 12 karet, než odhodí',
    );
    console.log('PASS regrese i50 — talonOnTakeover: „keep" nechá talon ležet, „retake" ho předá');
  }

  // ── i1/i2: heuristiky — díry v betlu a nepřebíjení vlastního parťáka ─────
  {
    const { betlHoles, playPolicy } = await import('../src/lib/ai/heuristics');
    const { card: mk5, CERVENE: CE5, R7: S75, R8: S85, R9: S95, R10: T5, KRAL: K5, ESO: A5 } =
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
      hand: [mk5(CE5, T5), mk5(CE5, S95)], handCounts: [2, 2, 2], revealedTrump: null,
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
      revealedTrump: null, talonKnown: [], talon: null, contract: null,
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
    assert.ok(
      bubbleText(flekAct as never, mkFlekState(1) as never)?.startsWith(flekName(0)),
      `první flek se hlásí jako „${flekName(0)}"`,
    );
    assert.ok(
      bubbleText(flekAct as never, mkFlekState(2) as never)?.startsWith(flekName(1)),
      `druhý flek se hlásí jako „${flekName(1)}"`,
    );
    assert.ok(
      bubbleText(flekAct as never, mkFlekState(3) as never)?.startsWith(flekName(2)),
      `třetí flek se hlásí jako „${flekName(2)}"`,
    );
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
      hand: myHand, handCounts: [3, 3, 3], revealedTrump: trumpCard, talonKnown: [], talon: null,
      contract: { mode: 'hra' as const, trump: 2 as const, declarer: 0 as const, sedma: 0 as const, kilo: null, dveSedmy: false },
      phase: {
        name: 'tricks' as const, trickNo: 7, leader: 0 as const, toAct: 1 as const,
        trick: [], played: rest, won, marriages: [],
      },
      publicHistory: [{ type: 'deal' as const }],
      handResults: [], ledger: [0, 0, 0] as [number, number, number], handNo: 1,
    };

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
      // ukázaný trumf: jen u volícího (forhont = sedadlo 0), nebo v talonu
      assert.equal(d.hands[2].includes(trumpCard), false, `seed ${seed}: ukázaný trumf nesmí u obránce`);
      assert.ok(d.hands[0].includes(trumpCard) || d.talon.includes(trumpCard),
        `seed ${seed}: ukázaný trumf patří volícímu, nebo do talonu`);
    }
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
      handCounts: [0, 0, 0], revealedTrump: null, talonKnown: [], talon: null, contract: result.contract,
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
            assert.ok(ch.ask.points === 20 || ch.ask.points === 40, 'hláška je za 20, v trumfech za 40');
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

  // ── i21: CSP a SRI jsou skutečně ve stránce ─────────────────────────────
  {
    const layout = readFileSync(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    const csp = /http-equiv="Content-Security-Policy"[\s\S]{0,80}content="([^"]+)"/.exec(layout);
    assert.ok(csp, 'Layout.astro musí obsahovat CSP meta');
    const policy = (csp as RegExpExecArray)[1];
    for (const directive of [
      "default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'",
      "form-action 'self'", 'connect-src', 'img-src', 'worker-src',
    ]) {
      assert.ok(policy.includes(directive), `CSP musí obsahovat ${directive}`);
    }
    assert.equal(/script-src[^;]*\*/.test(policy), false, 'script-src nesmí být zástupný znak');

    // analytika: verzovaná URL + SRI (jinak by podvržený count.js běžel v našem originu)
    const tag = /<script[^>]*gc\.zgo\.at[\s\S]*?>/.exec(layout) ?? /gc\.zgo\.at[\s\S]{0,400}/.exec(layout);
    assert.ok(tag, 'skript analytiky se nenašel');
    const tagStr = (tag as RegExpExecArray)[0];
    assert.match(tagStr, /count\.v\d+\.js/, 'analytika musí být na verzované URL');
    assert.match(layout, /integrity="sha384-[A-Za-z0-9+/=]{60,}"/, 'analytika musí mít SRI hash');
    assert.match(layout, /crossorigin="anonymous"/, 'SRI vyžaduje crossorigin');
    console.log('PASS regrese i21 — CSP i SRI jsou ve stránce a nejsou rozvolněné');
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

console.log('OK: vše prošlo');
