/**
 * heuristics.ts — pravidlová AI pro „aukční" rozhodnutí a výchozí herní politiku
 * (docs/marias-design.md §5.4)
 *
 * Vstupem je vždy PlayerView (nikdy GameState). Prahy jsou v laditelné tabulce
 * podle obtížnosti — pocta volbě „IQ" z originálu FLEK!.
 */

import {
  CERVENE, ESO, KRAL, R10, R7, SVRSEK,
  card, pointsOf, rankOf, strength, suitOf,
  type Card, type Suit,
} from '../cards';
import { legalActions } from '../rules/legal';
import { winningPlay, beats } from '../rules/tricks';
import type { PlayerAction, PlayerView, Seat } from '../rules/types';
import { Random } from '../random';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Thresholds {
  /** minimální síla barvy pro dobrovolnou sedmu (délka trumfů) */
  sedmaTrumps: number;
  /** minimální odhad bodů pro hlášení kila */
  kiloEstimate: number;
  /** maximální počet „děr" pro betl */
  betlHoles: number;
  /** maximální počet děr pro durch (jistoty) */
  durchHoles: number;
  /** odhad bodů obrany, při kterém obrana flekuje hru */
  flekDefense: number;
}

const THRESHOLDS: Record<Difficulty, Thresholds> = {
  easy: { sedmaTrumps: 6, kiloEstimate: 120, betlHoles: 0, durchHoles: 0, flekDefense: 60 },
  normal: { sedmaTrumps: 5, kiloEstimate: 110, betlHoles: 1, durchHoles: 0, flekDefense: 50 },
  hard: { sedmaTrumps: 4, kiloEstimate: 100, betlHoles: 1, durchHoles: 1, flekDefense: 45 },
};

// ── hodnocení ruky ───────────────────────────────────────────────────────────

const bySuit = (hand: readonly Card[]): Card[][] => {
  const out: Card[][] = [[], [], [], []];
  for (const c of hand) out[suitOf(c)].push(c);
  return out;
};

/** Hrubý odhad uhratelných bodů s danou trumfovou barvou. */
export function estimatePoints(hand: readonly Card[], trump: Suit): number {
  const suits = bySuit(hand);
  let pts = 0;
  for (const s of [0, 1, 2, 3] as Suit[]) {
    const cards = suits[s];
    const hasAce = cards.some((c) => rankOf(c) === ESO);
    const hasTen = cards.some((c) => rankOf(c) === R10);
    if (hasAce) pts += 10;
    if (hasTen && (hasAce || cards.length >= 3 || s === trump)) pts += 10; // krytá desítka
    if (cards.some((c) => rankOf(c) === KRAL) && cards.some((c) => rankOf(c) === SVRSEK)) {
      pts += s === trump ? 40 : 20;
    }
  }
  // dlouhé trumfy táhnou body soupeřů + poslední štych
  pts += Math.max(0, suits[trump].length - 3) * 10;
  if (suits[trump].length >= 4) pts += 10;
  return pts;
}

/**
 * Počet „děr" pro betl: karty, které nejde podlézt — pro každou barvu spočti,
 * kolik mých karet je výš, než kolik nižších karet barvy zbývá jinde.
 * 0 děr = prakticky jistý betl (v přirozeném pořadí).
 */
export function betlHoles(hand: readonly Card[]): number {
  const suits = bySuit(hand);
  let holes = 0;
  for (const s of [0, 1, 2, 3] as Suit[]) {
    const mine = suits[s].map((c) => strength(c, 'natural')).sort((a, b) => a - b);
    // pro i-tou nejnižší moji kartu musí existovat aspoň i nižších karet mimo ruku
    for (let i = 0; i < mine.length; i += 1) {
      const lowerOutside = mine[i] - i; // nižších hodnot celkem mine[i], z toho i mých
      if (lowerOutside < 1) holes += 1;
    }
  }
  return holes;
}

/** Počet nejistých štychů pro durch (karty, které nemusí vyhrát). */
export function durchHoles(hand: readonly Card[]): number {
  const suits = bySuit(hand);
  let holes = 0;
  for (const s of [0, 1, 2, 3] as Suit[]) {
    const mine = suits[s].map((c) => strength(c, 'natural')).sort((a, b) => b - a);
    // i-tá nejvyšší musí být i-tá nejvyšší barvy celkově (7 - i)
    for (let i = 0; i < mine.length; i += 1) {
      if (mine[i] < 7 - i) holes += 1;
    }
  }
  return holes;
}

/** Nejlepší trumfová barva z daných karet (délka, síla, hlášky). */
export function bestTrumpSuit(cards: readonly Card[], full: readonly Card[]): Suit {
  const suits = bySuit(full);
  let best: Suit = 0;
  let bestScore = -1;
  for (const s of [0, 1, 2, 3] as Suit[]) {
    const inChoice = cards.some((c) => suitOf(c) === s);
    if (!inChoice) continue; // trumf musí být mezi kartami, ze kterých se volí
    const cs = suits[s];
    let score = cs.length * 10 + cs.reduce((x, c) => x + strength(c, 'trump'), 0);
    if (cs.some((c) => rankOf(c) === KRAL) && cs.some((c) => rankOf(c) === SVRSEK)) score += 25;
    if (bestScore < score) { bestScore = score; best = s; }
  }
  return best;
}

// ── rozhodování (aukce) ──────────────────────────────────────────────────────

/**
 * Heuristické rozhodnutí pro všechny neherní fáze. Vybírá VÝHRADNĚ z legálních
 * akcí — nikdy nevrací akci mimo legalActions(view).
 */
export function decideAuction(v: PlayerView, difficulty: Difficulty, rng: Random): PlayerAction {
  const legal = legalActions(v);
  if (legal.length === 0) throw new Error('decideAuction: žádná legální akce');
  if (legal.length === 1) return legal[0];
  const t = THRESHOLDS[difficulty];
  const hand = v.hand;

  switch (v.phase.name) {
    case 'choose-trump': {
      const trump = bestTrumpSuit(hand, hand);
      const pick = hand.filter((c) => suitOf(c) === trump)
        .sort((a, b) => strength(a, 'trump') - strength(b, 'trump'))[0];
      return legal.find((a) => a.type === 'choose-trump' && a.card === pick) ?? legal[0];
    }

    case 'discard-talon': {
      const st = v.phase.standing;
      const mode = st.mode ?? 'hra';
      const pair = chooseDiscard(hand, st.trump, mode);
      return (
        legal.find(
          (a) => a.type === 'discard' && a.cards.includes(pair[0]) && a.cards.includes(pair[1]),
        ) ?? legal[0]
      );
    }

    case 'declare': {
      const st = v.phase.standing;
      const declares = legal.filter((a) => a.type === 'declare');
      if (st.mode === 'betl' || st.mode === 'durch') return declares[0];

      // zvaž betl/durch (volený)
      const bh = betlHoles(hand);
      const dh = durchHoles(hand);
      const durchOpt = declares.find((a) => a.type === 'declare' && a.mode === 'durch');
      const betlOpt = declares.find((a) => a.type === 'declare' && a.mode === 'betl');
      if (durchOpt && dh <= t.durchHoles) return durchOpt;
      if (betlOpt && bh <= t.betlHoles) return betlOpt;

      // hra: sedma/kilo dle síly
      const trump = st.trump;
      const wantSedma =
        trump !== null &&
        hand.includes(card(trump, R7)) &&
        hand.filter((c) => suitOf(c) === trump).length >= t.sedmaTrumps;
      const wantKilo = trump !== null && estimatePoints(hand, trump) >= t.kiloEstimate;
      const match = declares.filter((a) => a.type === 'declare' && a.mode === 'hra')
        .filter((a) => a.type === 'declare' && a.sedma === wantSedma && a.kilo === wantKilo);
      if (match.length > 0) return match[0];
      const plain = declares.find((a) => a.type === 'declare' && a.mode === 'hra' && !a.sedma && !a.kilo);
      return plain ?? declares[0];
    }

    case 'bidding': {
      // konzervativní licitace: přihazuj jen na silné kombinace
      const bh = betlHoles(hand);
      const dh = durchHoles(hand);
      const options = legal.filter((a) => a.type === 'bid' && a.bid !== 'pass');
      const pass = legal.find((a) => a.type === 'bid' && a.bid === 'pass') ?? legal[0];
      const want = (kind: string, cervena: boolean) =>
        options.find((a) => a.type === 'bid' && a.bid !== 'pass' && a.bid.kind === kind && a.bid.cervena === cervena);

      if (dh <= t.durchHoles && want('durch', false)) return want('durch', false) as PlayerAction;
      if (bh <= t.betlHoles && want('betl', false)) return want('betl', false) as PlayerAction;

      for (const s of [0, 1, 2, 3] as Suit[]) {
        const cs = hand.filter((c) => suitOf(c) === s);
        const sedmaOk = hand.includes(card(s, R7)) && cs.length >= t.sedmaTrumps;
        const kiloOk = estimatePoints(hand, s) >= t.kiloEstimate;
        const cervena = s === CERVENE;
        if (sedmaOk && kiloOk && want('sto-sedma', cervena)) return want('sto-sedma', cervena) as PlayerAction;
        if (kiloOk && want('sto', cervena)) return want('sto', cervena) as PlayerAction;
        if (sedmaOk && want('sedma', cervena)) return want('sedma', cervena) as PlayerAction;
      }
      return pass;
    }

    case 'takeover': {
      const good = legal.find((a) => a.type === 'takeover' && a.claim === 'good') as PlayerAction;
      const durchOpt = legal.find((a) => a.type === 'takeover' && a.claim === 'durch');
      const betlOpt = legal.find((a) => a.type === 'takeover' && a.claim === 'betl');
      if (durchOpt && durchHoles(hand) <= t.durchHoles) return durchOpt;
      if (betlOpt && betlHoles(hand) <= t.betlHoles) return betlOpt;
      return good;
    }

    case 'fleks': {
      const good = legal.find((a) => a.type === 'good') as PlayerAction;
      const contract = v.contract;
      if (!contract) return good;
      const iAmDeclarer = v.seat === contract.declarer;

      // obrana: flek na hru při silné ruce; flek na sedmu s trumfy proti
      if (!iAmDeclarer && contract.mode === 'hra' && contract.trump !== null) {
        const myPts = estimatePoints(hand, contract.trump);
        const flekHra = legal.find((a) => a.type === 'flek' && a.target === 'hra');
        if (flekHra && myPts >= t.flekDefense) return flekHra;
        const flekSedma = legal.find((a) => a.type === 'flek' && a.target === 'sedma');
        const myTrumps = hand.filter((c) => suitOf(c) === contract.trump);
        if (flekSedma && myTrumps.length >= 4) return flekSedma;
      }
      // aktér: re jen výjimečně (velmi silná ruka)
      if (iAmDeclarer && contract.mode === 'hra' && contract.trump !== null) {
        const re = legal.find((a) => a.type === 'flek' && a.target === 'hra');
        if (re && estimatePoints(hand, contract.trump) >= t.kiloEstimate + 10 && rng.next() < 0.5) return re;
      }
      return good;
    }

    default:
      return legal[rng.int(legal.length)];
  }
}

// ── odhoz do talonu ──────────────────────────────────────────────────────────

function chooseDiscard(hand: readonly Card[], trump: Suit | null, mode: string): [Card, Card] {
  const candidates = hand.slice().sort((a, b) => discardScore(a, hand, trump, mode) - discardScore(b, hand, trump, mode));
  return [candidates[0], candidates[1]];
}

/** Nižší skóre = dřív odhodit. */
function discardScore(c: Card, hand: readonly Card[], trump: Suit | null, mode: string): number {
  if (mode === 'betl' || mode === 'durch') {
    // betl: zbavit se vysokých; durch: nízkých
    return mode === 'betl' ? -strength(c, 'natural') : strength(c, 'natural');
  }
  let score = strength(c, 'trump') * 2;
  if (pointsOf(c) > 0) score += 100; // esa/desítky nikdy (stejně nelegální)
  if (trump !== null && suitOf(c) === trump) score += 50;
  const partner = rankOf(c) === KRAL ? card(suitOf(c), SVRSEK) : rankOf(c) === SVRSEK ? card(suitOf(c), KRAL) : null;
  if (partner !== null && hand.includes(partner)) score += 30; // nerozbíjet hlášku
  const suitLen = hand.filter((x) => suitOf(x) === suitOf(c)).length;
  score -= (5 - Math.min(suitLen, 5)) * 3; // krátké barvy pryč (tvorba trhliny)
  return score;
}

// ── herní politika (playout / fallback) ─────────────────────────────────────

/**
 * Rychlá herní politika: použitelná jako playout v ISMCTS i jako fallback,
 * když selže worker. Vybírá z legálních akcí.
 */
export function playPolicy(v: PlayerView, rng: Random): PlayerAction {
  const legal = legalActions(v);
  if (legal.length === 0) throw new Error('playPolicy: žádná legální akce');
  if (v.phase.name !== 'tricks' || v.contract === null) {
    return decideAuction(v, 'normal', rng);
  }
  const plays = legal.filter((a) => a.type === 'play');
  if (plays.length === 1) return plays[0];

  const { mode, trump, declarer } = v.contract;
  const trick = v.phase.trick;
  const iAmDeclarer = v.seat === declarer;

  const withMarriage = (c: Card): PlayerAction => {
    // hlášku hlas vždy, když to jde (body navíc)
    const m = plays.find((a) => a.type === 'play' && a.card === c && a.announceMarriage);
    return m ?? (plays.find((a) => a.type === 'play' && a.card === c) as PlayerAction);
  };
  const cards = [...new Set(plays.map((a) => (a.type === 'play' ? a.card : -1)))].filter((c) => c >= 0);

  if (mode === 'betl') {
    // aktér podlézá; obrana hraje vysoko (nechává aktéra brát)
    const sorted = cards.slice().sort((a, b) => strength(a, 'natural') - strength(b, 'natural'));
    if (iAmDeclarer) {
      if (trick.length === 0) return withMarriage(sorted[0]);
      const w = winningPlay(trick, null, 'betl').card;
      const under = sorted.filter((c) => !beats(c, w, null, 'betl'));
      return withMarriage(under.length > 0 ? under[under.length - 1] : sorted[0]);
    }
    return withMarriage(sorted[0]); // obrana: nejnižší (šetři vysoké na podlézání aktéra? zjednodušeno)
  }

  if (mode === 'durch') {
    const sorted = cards.slice().sort((a, b) => strength(b, 'natural') - strength(a, 'natural'));
    return withMarriage(iAmDeclarer ? sorted[0] : sorted[sorted.length - 1]);
  }

  // barevná hra
  const t = trump as Suit;
  const trickPts = trick.reduce((s, p) => s + pointsOf(p.card), 0);
  const sorted = cards.slice().sort((a, b) => strength(a, 'trump') - strength(b, 'trump'));

  if (trick.length === 0) {
    // výnos: eso z dlouhé barvy; jinak nízká karta z dlouhé netrumfové barvy
    const aces = cards.filter((c) => rankOf(c) === ESO && suitOf(c) !== t);
    if (aces.length > 0) return withMarriage(aces[0]);
    const nonTrump = sorted.filter((c) => suitOf(c) !== t && pointsOf(c) === 0);
    return withMarriage(nonTrump[0] ?? sorted[0]);
  }

  const w = winningPlay(trick, t, 'hra').card;
  const winning = cards.filter((c) => beats(c, w, t, 'hra'));
  const isLastInTrick = trick.length === 2;

  if (winning.length > 0 && (trickPts >= 10 || isLastInTrick)) {
    // ber štych nejlevnější vítěznou (poslední hráč bere jistotu; jinak jen s body)
    const cheap = winning.sort((a, b) => strength(a, 'trump') - strength(b, 'trump'))[0];
    return withMarriage(cheap);
  }
  // maž nebo zahoď: nejnižší bez bodů; když parťák štych drží, přimaž body
  const winnerSeat = winningPlay(trick, t, 'hra').seat;
  const partnerWinning = (winnerSeat === declarer) === iAmDeclarer;
  if (partnerWinning && isLastInTrick) {
    const points = cards.filter((c) => pointsOf(c) > 0 && !beats(c, w, t, 'hra'));
    if (points.length > 0) return withMarriage(points[0]); // mazej!
  }
  const cheapest = sorted.filter((c) => pointsOf(c) === 0)[0] ?? sorted[0];
  return withMarriage(cheapest);
}
