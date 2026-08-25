/**
 * engine.ts — čistý reducer zápasu (docs/marias-design.md §5.2–5.3)
 *
 * apply(state, action) → nový stav; deterministické, bez vedlejších efektů.
 * Legalitu validuje výhradně členstvím v legalActions(view(state, seat)) —
 * pravidla se nikde nederivují podruhé. I rozdání je akce (`deal` se seedem),
 * takže replay celého zápasu = history.reduce(apply, initialState).
 */

import { DECK, sortHand, suitOf, type Card } from '../cards';
import { Random } from '../random';
import { legalActions, actionMatchesLegal } from './legal';
import { settle } from './scoring';
import { trickWinner } from './tricks';
import type {
  Contract,
  FlekState,
  GameState,
  PlayerAction,
  RulesConfig,
  Seat,
  Standing,
} from './types';
import { IllegalActionError, InvariantError, defendersOf, forhont, nextSeat } from './types';
import { view } from './view';

// ── inicializace ─────────────────────────────────────────────────────────────

export function initialState(config: RulesConfig, firstDealer: Seat = 2): GameState {
  return {
    config,
    dealer: firstDealer,
    seed: 0,
    hands: [[], [], []],
    unseen: [],
    talon: [],
    talonOwner: null,
    revealedTrump: null,
    talonKnowledge: [[], [], []],
    history: [],
    handResults: [],
    ledger: [0, 0, 0],
    handNo: 0,
    contract: null,
    phase: { name: 'idle' },
  };
}

// ── rozdání ──────────────────────────────────────────────────────────────────

function deal(state: GameState, seed: number, config?: RulesConfig): GameState {
  const cfg = config ?? state.config;
  const dealer = state.phase.name === 'idle' ? state.dealer : nextSeat(state.dealer);
  const f = forhont(dealer);
  const [d1, d2] = defendersOf(f);
  const deck = new Random(seed).shuffled(DECK);

  const hands: [Card[], Card[], Card[]] = [[], [], []];
  let unseen: Card[] = [];
  let talon: Card[] = [];

  if (cfg.variant === 'voleny') {
    // forhont 7 (volí trumf), obránci 5+5, forhontových dalších 5 leží stranou
    // („z lidu"), obránci 5+5 → forhont 7+5=12, ostatní 10; talon vznikne odhozem
    hands[f] = deck.slice(0, 7);
    hands[d1] = deck.slice(7, 12);
    hands[d2] = deck.slice(12, 17);
    unseen = deck.slice(17, 22);
    hands[d1] = hands[d1].concat(deck.slice(22, 27));
    hands[d2] = hands[d2].concat(deck.slice(27, 32));
  } else {
    // licitovaný: 5+5 každému, talon 2 lícem dolů; vítěz licitace ho zvedne
    hands[f] = deck.slice(0, 5);
    hands[d1] = deck.slice(5, 10);
    hands[d2] = deck.slice(10, 15);
    hands[f] = hands[f].concat(deck.slice(15, 20));
    hands[d1] = hands[d1].concat(deck.slice(20, 25));
    hands[d2] = hands[d2].concat(deck.slice(25, 30));
    talon = deck.slice(30, 32);
  }

  return {
    ...state,
    config: cfg,
    dealer,
    seed,
    hands: [sortHand(hands[0]), sortHand(hands[1]), sortHand(hands[2])],
    unseen,
    talon,
    talonOwner: null,
    revealedTrump: null,
    talonKnowledge: [[], [], []],
    handNo: state.handNo + 1,
    contract: null,
    phase:
      cfg.variant === 'voleny'
        ? { name: 'choose-trump' }
        : { name: 'bidding', bids: [], toAct: d1, best: null },
  };
}

// ── pomocné přechody ─────────────────────────────────────────────────────────

/** Držitel licitace: poslední přihazující, jinak forhont (implicitní hra). */
function biddingHolder(state: GameState & { phase: { name: 'bidding' } }): Seat {
  for (let i = state.phase.bids.length - 1; i >= 0; i -= 1) {
    const b = state.phase.bids[i];
    if (b.bid !== 'pass') return b.seat;
  }
  return forhont(state.dealer);
}

/** Sedadla v pořadí mluvení (od forhonta), bez vyjmenovaných. */
function speakingOrder(dealer: Seat, skip: Seat): Seat[] {
  const start = forhont(dealer);
  return [start, nextSeat(start), nextSeat(nextSeat(start))].filter((s) => s !== skip);
}

function startFleks(state: GameState, contract: Contract): GameState {
  const fleks: FlekState = {
    levels: {},
    lastRaiser: {},
    toAct: forhont(state.dealer),
    passed: [],
  };
  return { ...state, contract, phase: { name: 'fleks', fleks } };
}

function startTricks(state: GameState): GameState {
  const contract = state.contract;
  if (!contract) throw new InvariantError('startTricks bez kontraktu');
  // do prvního štychu vynáší forhont; u betla/durcha aktér (Obecná čl. II.6)
  const leader = contract.mode === 'hra' ? forhont(state.dealer) : contract.declarer;
  return {
    ...state,
    phase: {
      name: 'tricks', trickNo: 0, leader, toAct: leader,
      trick: [], played: [], won: [[], [], []], marriages: [],
    },
  };
}

/** Ukončení převzetí (volený): vyřeší talon a kontrakt podle vítěze. */
function resolveTakeover(state: GameState, standing: Standing): GameState {
  const original = state.contract;
  if (!original) throw new InvariantError('takeover bez kontraktu');

  // nikdo nepřihodil vyšší závazek — hraje se původní kontrakt beze změny
  if (standing.declarer === original.declarer && standing.mode === original.mode) {
    return startFleks(state, original);
  }

  // hru přebral betlem/durchem obránce — NEBO ji přebral sám aktér
  // (po cizím betlu smí ohlásit durch; jeho nárok se nesmí zahodit)
  const contract: Contract = {
    mode: standing.mode as 'betl' | 'durch',
    trump: null,
    declarer: standing.declarer,
    sedma: null,
    kilo: null,
    dveSedmy: false,
  };

  // původní aktér už talon odhodil a drží 10 karet; talon znovu nebere
  if (standing.declarer === original.declarer || state.config.talonOnTakeover === 'keep') {
    return startFleks(state, contract);
  }

  // retake: nový aktér zvedne talon (vidí ho) a odhodí dvě karty
  const s = { ...state, contract };
  const hands = s.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
  hands[contract.declarer] = sortHand(hands[contract.declarer].concat(s.talon));
  const talonKnowledge = s.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
  for (const c of s.talon) {
    if (!talonKnowledge[contract.declarer].includes(c)) talonKnowledge[contract.declarer].push(c);
  }
  return {
    ...s,
    hands,
    talon: [],
    talonOwner: null,
    talonKnowledge,
    phase: {
      name: 'discard-talon',
      standing: { declarer: contract.declarer, mode: contract.mode, trump: null, bid: null },
    },
  };
}

// ── invarianty ───────────────────────────────────────────────────────────────

export function assertValid(state: GameState): void {
  const inPlay =
    state.phase.name !== 'idle' && state.phase.name !== 'scored';
  if (inPlay) {
    const seen = new Set<Card>();
    const add = (cards: readonly Card[], where: string) => {
      for (const c of cards) {
        // POZOR na relační porovnání: `null < 0` je false, takže bez
        // Number.isInteger by nečíselná karta prošla a `suitOf` by z ní
        // udělala kartu 0 (červenou sedmu) ležící zároveň v ruce
        if (!Number.isInteger(c) || c < 0 || c > 31 || seen.has(c)) {
          throw new InvariantError(`karta ${String(c)} dvakrát/mimo rozsah (${where})`);
        }
        seen.add(c);
      }
    };
    add(state.hands[0], 'hand0');
    add(state.hands[1], 'hand1');
    add(state.hands[2], 'hand2');
    add(state.unseen, 'unseen');
    add(state.talon, 'talon');
    if (state.phase.name === 'tricks') {
      add(state.phase.trick.map((p) => p.card), 'trick');
      for (const w of state.phase.won) add(w, 'won');
    }
    if (seen.size !== 32) throw new InvariantError(`karet ve hře ${seen.size}, má být 32`);
  }
  const ledgerSum = state.ledger[0] + state.ledger[1] + state.ledger[2];
  if (ledgerSum !== 0) throw new InvariantError(`konto není zero-sum (${ledgerSum})`);
  if (state.talon.length !== 0 && state.talon.length !== 2) {
    throw new InvariantError(`talon má ${state.talon.length} karet`);
  }
}

// ── reducer ──────────────────────────────────────────────────────────────────

export function apply(state: GameState, action: PlayerAction): GameState {
  // validace: jediný zdroj pravdy legality
  const seat: Seat = action.type === 'deal' ? 0 : action.seat;
  if (!actionMatchesLegal(action, legalActions(view(state, seat)))) {
    throw new IllegalActionError(`nelegální akce ${action.type} ve fázi ${state.phase.name}`, action);
  }

  let next = reduce(state, action);
  next = { ...next, history: [...state.history, action] };
  assertValid(next);
  return next;
}

function reduce(state: GameState, action: PlayerAction): GameState {
  const phase = state.phase;

  switch (action.type) {
    case 'deal':
      return deal(state, action.seed, action.config);

    case 'choose-trump': {
      // volený: trumf z prvních 7, nebo „z lidu" — první karta neprohlédnutého
      // balíčku (deterministické ze seedu); poté forhont zvedne zbylých 5
      const trumpCard = action.card === 'from-people' ? state.unseen[0] : action.card;
      const trump = suitOf(trumpCard);
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = sortHand(hands[action.seat].concat(state.unseen));
      return {
        ...state,
        hands,
        unseen: [],
        revealedTrump: trumpCard, // ukázaná karta je veřejná (i „z lidu")
        phase: {
          name: 'discard-talon',
          standing: { declarer: action.seat, mode: null, trump, bid: null },
        },
      };
    }

    case 'bid': {
      if (phase.name !== 'bidding') throw new InvariantError('bid mimo bidding');
      const bids = [...phase.bids, { seat: action.seat, bid: action.bid }];
      const withBids = { ...state, phase: { ...phase, bids } };

      if (action.bid !== 'pass') {
        // nový držitel; slovo dostává další v pořadí (mimo držitele)
        return {
          ...withBids,
          phase: { ...withBids.phase, best: action.bid, toAct: nextNonHolder(action.seat, action.seat) },
        };
      }

      // pass: konec, když oba ne-držitelé pasovali od posledního přihození
      const holder = biddingHolder(withBids as GameState & { phase: { name: 'bidding' } });
      let trailingPasses = 0;
      for (let i = bids.length - 1; i >= 0 && bids[i].bid === 'pass'; i -= 1) trailingPasses += 1;
      if (trailingPasses >= 2) {
        // vítěz zvedá talon a odhazuje
        const hands = withBids.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
        hands[holder] = sortHand(hands[holder].concat(withBids.talon));
        const talonKnowledge = withBids.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
        for (const c of withBids.talon) talonKnowledge[holder].push(c);
        const best = phase.best;
        const standing: Standing = {
          declarer: holder,
          mode: best === null ? null : best.kind === 'betl' || best.kind === 'durch' ? best.kind : null,
          trump: best?.cervena ? 0 : null,
          bid: best,
        };
        return {
          ...withBids,
          hands,
          talon: [],
          talonOwner: null,
          talonKnowledge,
          phase: { name: 'discard-talon', standing },
        };
      }
      return {
        ...withBids,
        phase: { ...withBids.phase, toAct: nextNonHolder(action.seat, holder) },
      };
    }

    case 'discard': {
      if (phase.name !== 'discard-talon') throw new InvariantError('discard mimo fázi');
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = hands[action.seat].filter((c) => !action.cards.includes(c));
      const talonKnowledge = state.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
      for (const c of action.cards) {
        if (!talonKnowledge[action.seat].includes(c)) talonKnowledge[action.seat].push(c);
      }
      return {
        ...state,
        hands,
        talon: [...action.cards],
        talonOwner: action.seat,
        talonKnowledge,
        phase: { name: 'declare', standing: phase.standing },
      };
    }

    case 'declare': {
      if (phase.name !== 'declare') throw new InvariantError('declare mimo fázi');
      const st = phase.standing;
      const trump = action.mode === 'hra' ? (st.trump ?? action.trump ?? null) : null;
      const contract: Contract = {
        mode: action.mode,
        trump,
        declarer: action.seat,
        sedma: action.sedma ? action.seat : null,
        kilo: action.kilo ? action.seat : null,
        dveSedmy: action.dveSedmy ?? false,
      };
      const s = { ...state, contract };
      if (state.config.variant === 'voleny' && st.mode === null) {
        // po deklaraci mohou obránci hru přebrat betlem/durchem (v pořadí mluvení)
        const toAct = speakingOrder(state.dealer, action.seat)[0];
        return {
          ...s,
          phase: {
            name: 'takeover', toAct, passed: [],
            standing: { declarer: action.seat, mode: action.mode, trump, bid: null },
          },
        };
      }
      return startFleks(s, contract);
    }

    case 'takeover': {
      if (phase.name !== 'takeover') throw new InvariantError('takeover mimo fázi');
      if (action.claim === 'good') {
        const passed = [...phase.passed, action.seat];
        const others = speakingOrder(state.dealer, phase.standing.declarer);
        if (others.every((o) => passed.includes(o))) {
          return resolveTakeover(state, phase.standing);
        }
        const nextTo = others.find((o) => !passed.includes(o)) as Seat;
        return { ...state, phase: { ...phase, passed, toAct: nextTo } };
      }
      // vyšší nárok: nový držitel, pasy se ruší, slovo dostávají ostatní
      const standing: Standing = { declarer: action.seat, mode: action.claim, trump: null, bid: null };
      const others = speakingOrder(state.dealer, action.seat);
      return { ...state, phase: { name: 'takeover', standing, passed: [], toAct: others[0] } };
    }

    case 'flek': {
      if (phase.name !== 'fleks') throw new InvariantError('flek mimo fázi');
      const f = phase.fleks;
      const levels = { ...f.levels, [action.target]: (f.levels[action.target] ?? 0) + 1 };
      const lastRaiser = { ...f.lastRaiser, [action.target]: action.seat };
      return {
        ...state,
        phase: {
          name: 'fleks',
          fleks: { levels, lastRaiser, passed: [], toAct: nextSeat(action.seat) },
        },
      };
    }

    case 'announce-proti': {
      if (phase.name !== 'fleks' || !state.contract) throw new InvariantError('proti mimo fázi');
      const contract: Contract = {
        ...state.contract,
        sedma: action.sedma ? action.seat : state.contract.sedma,
        kilo: action.kilo ? action.seat : state.contract.kilo,
      };
      return {
        ...state,
        contract,
        phase: {
          name: 'fleks',
          fleks: { ...phase.fleks, passed: [], toAct: nextSeat(action.seat) },
        },
      };
    }

    case 'good': {
      if (phase.name !== 'fleks') throw new InvariantError('good mimo fázi');
      const passed = [...phase.fleks.passed, action.seat];
      if (new Set(passed).size >= 3) {
        // hospodské pravidlo: neflekovaná prostá hra se nehraje — platí se rovnou
        const c = state.contract;
        if (
          state.config.autoSettlePlainHra &&
          c !== null && c.mode === 'hra' && c.sedma === null && c.kilo === null &&
          Object.keys(phase.fleks.levels).length === 0
        ) {
          return settlePlainHra(state, c);
        }
        return startTricks(state);
      }
      return {
        ...state,
        phase: { name: 'fleks', fleks: { ...phase.fleks, passed, toAct: nextSeat(action.seat) } },
      };
    }

    case 'play': {
      if (phase.name !== 'tricks' || !state.contract) throw new InvariantError('play mimo fázi');
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = hands[action.seat].filter((c) => c !== action.card);
      const trick = [...phase.trick, { seat: action.seat, card: action.card }];
      const marriages = action.announceMarriage
        ? [...phase.marriages, { seat: action.seat, suit: suitOf(action.card) }]
        : phase.marriages;

      if (trick.length < 3) {
        return {
          ...state, hands,
          phase: { ...phase, trick, marriages, toAct: nextSeat(action.seat) },
        };
      }

      // štych dokončen
      const winner = trickWinner(trick, state.contract.trump, state.contract.mode);
      const won = phase.won.map((w) => w.slice()) as [Card[], Card[], Card[]];
      won[winner].push(...trick.map((p) => p.card));
      const played = [...phase.played, { plays: trick, winner }];

      // betl padá prvním štychem aktéra, durch první ztrátou — hra se skládá hned
      const earlyEnd =
        (state.contract.mode === 'betl' && winner === state.contract.declarer) ||
        (state.contract.mode === 'durch' && winner !== state.contract.declarer);

      if (phase.trickNo === 9 || earlyEnd) {
        // konec hry → zúčtování
        const flekLevels = flekLevelsFromHistory(state);
        const result = settle({
          handNo: state.handNo,
          config: state.config,
          contract: state.contract,
          flekLevels,
          tricks: played,
          marriages,
        });
        const ledger: [number, number, number] = [
          state.ledger[0] + result.delta[0],
          state.ledger[1] + result.delta[1],
          state.ledger[2] + result.delta[2],
        ];
        return {
          ...state,
          hands,
          ledger,
          handResults: [...state.handResults, result],
          phase: { name: 'scored', result },
        };
      }

      return {
        ...state, hands,
        phase: {
          ...phase, trickNo: phase.trickNo + 1, leader: winner, toAct: winner,
          trick: [], played, won, marriages,
        },
      };
    }
  }
}

/** Neflekovaná prostá hra: rovnou zúčtuj ve prospěch aktéra (nehraje se). */
function settlePlainHra(state: GameState, contract: Contract): GameState {
  const s = state.config.sazby;
  const cerveny = contract.trump === 0 ? s.cervenyMultiplier : 1;
  const amount = s.hra * cerveny;
  const [d1, d2] = defendersOf(contract.declarer);
  const delta: [number, number, number] = [0, 0, 0];
  delta[contract.declarer] = 2 * amount;
  delta[d1] = -amount;
  delta[d2] = -amount;
  const result: import('./types').HandResult = {
    handNo: state.handNo,
    contract,
    cardPoints: { declarer: 0, defenders: 0 },
    marriagePoints: { declarer: 0, defenders: 0 },
    components: [{
      target: 'hra', wonBy: 'declarer', baseRate: s.hra, flekMultiplier: 1,
      extraMultiplier: cerveny, amount, silent: false, note: 'dobrá — nehrálo se',
    }],
    delta,
  };
  return {
    ...state,
    ledger: [state.ledger[0] + delta[0], state.ledger[1] + delta[1], state.ledger[2] + delta[2]],
    handResults: [...state.handResults, result],
    phase: { name: 'scored', result },
  };
}

/** Finální úrovně fleků — z historie akcí aktuální hry (fleks fáze už neexistuje). */
function flekLevelsFromHistory(state: GameState): Partial<Record<import('./types').FlekTarget, number>> {
  const levels: Partial<Record<import('./types').FlekTarget, number>> = {};
  // projdi akce od posledního 'deal'
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'flek') levels[a.target] = (levels[a.target] ?? 0) + 1;
  }
  return levels;
}

/** Další hráč na slovu v licitaci (přeskakuje aktuálního držitele). */
function nextNonHolder(from: Seat, holder: Seat): Seat {
  let s = nextSeat(from);
  if (s === holder) s = nextSeat(s);
  return s;
}

// ── replay ───────────────────────────────────────────────────────────────────

export function replay(
  history: readonly PlayerAction[],
  config: RulesConfig,
  firstDealer: Seat = 2,
): GameState {
  return history.reduce<GameState>((s, a) => apply(s, a), initialState(config, firstDealer));
}
