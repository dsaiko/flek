/**
 * scoring.ts — vyhodnocení odehrané hry a zúčtování (docs/marias-design.md §5.3)
 *
 * Komponenty (hra, sedma, kilo, betl, durch) se vyhrávají/prohrávají NEZÁVISLE,
 * každá se svým flekovým multiplikátorem 2^level. Platí se po stranách: prohrávající
 * strana platí — aktér platí/inkasuje dvojnásobek (proti dvěma), obránci po jednom.
 */

import { CERVENE, R7, pointsOf, card, type Suit } from '../cards';
import type {
  ComponentResult,
  Contract,
  FlekTarget,
  HandResult,
  RulesConfig,
  Seat,
  TrickPlay,
} from './types';
import { defendersOf } from './types';

export interface PlayedTrick {
  plays: TrickPlay[];
  winner: Seat;
}

export interface SettleInput {
  handNo: number;
  config: RulesConfig;
  contract: Contract;
  flekLevels: Partial<Record<FlekTarget, number>>;
  /** 10 odehraných štychů v pořadí. */
  tricks: PlayedTrick[];
  marriages: { seat: Seat; suit: Suit }[];
}

const isDeclarerSide = (seat: Seat, declarer: Seat): boolean => seat === declarer;

/** Body z karet po stranách: esa + desítky + 10 za poslední štych. */
export function cardPoints(input: SettleInput): { declarer: number; defenders: number } {
  const { contract, tricks } = input;
  let declarer = 0;
  let defenders = 0;
  for (const t of tricks) {
    const pts = t.plays.reduce((s, p) => s + pointsOf(p.card), 0);
    if (isDeclarerSide(t.winner, contract.declarer)) declarer += pts;
    else defenders += pts;
  }
  const last = tricks[tricks.length - 1];
  if (last) {
    if (isDeclarerSide(last.winner, contract.declarer)) declarer += 10;
    else defenders += 10;
  }
  return { declarer, defenders };
}

/** Body z hlášek po stranách (20, v trumfech 40). */
export function marriagePoints(input: SettleInput): { declarer: number; defenders: number } {
  const { contract, marriages } = input;
  let declarer = 0;
  let defenders = 0;
  for (const m of marriages) {
    const pts = contract.trump !== null && m.suit === contract.trump ? 40 : 20;
    if (isDeclarerSide(m.seat, contract.declarer)) declarer += pts;
    else defenders += pts;
  }
  return { declarer, defenders };
}

/**
 * Vyhodnocení závazku Sto dle Obecných pravidel ČSM (čl. IV.4 a V.5):
 *  - do hranice 100 se započítává JEN JEDNA hláška (ta nejvyšší) → splněno = 60 bodů
 *    s trumfovou hláškou, 80 s jinou (bez hlášky sto uhrát nelze — karty dají max 90)
 *  - uhráno: sazba za každých započatých 10 bodů od 100 VÝŠE, včetně dalších hlášek
 *    (přesně 100 → 1×, 110 → 2×, ...)
 *  - prohráno: sazba za každých 10 bodů chybějících do 100 + za každých 10 bodů,
 *    které obrana získala hláškami
 *  - scaling 'linear' = oficiální ČSM (násobky sazby); 'double' = hospodská varianta
 *    (každý krok zdvojnásobuje: 100 → 1×, 110 → 2×, 120 → 4×)
 * Všechny bodové hodnoty jsou násobky 10, kroky jsou proto celočíselné.
 */
export function kiloSteps(
  holderCardPts: number,
  holderMarriages: readonly number[],
  opponentMarriagePts: number,
): { fulfilled: boolean; steps: number; measured: number } {
  const best = holderMarriages.length > 0 ? Math.max(...holderMarriages) : 0;
  const threshold = holderCardPts + best;
  if (threshold >= 100) {
    const total = holderCardPts + holderMarriages.reduce((a, b) => a + b, 0);
    return { fulfilled: true, steps: 1 + Math.floor((total - 100) / 10), measured: total };
  }
  return {
    fulfilled: false,
    steps: (100 - threshold) / 10 + opponentMarriagePts / 10,
    measured: threshold,
  };
}

export const stepsToMultiplier = (steps: number, scaling: 'double' | 'linear'): number =>
  scaling === 'double' ? 2 ** (steps - 1) : steps;

interface SedmaFacts {
  /** Trumfová sedma zahraná v posledním štychu (kým), pokud vůbec. */
  playedBy: Seat | null;
  /** Vyhrála trumfová sedma poslední štych? */
  won: boolean;
  lastWinner: Seat | null;
}

function sedmaFacts(input: SettleInput): SedmaFacts {
  const { contract, tricks } = input;
  const last = tricks[tricks.length - 1];
  if (!last || contract.trump === null) return { playedBy: null, won: false, lastWinner: last?.winner ?? null };
  const seven = card(contract.trump, R7);
  const play = last.plays.find((p) => p.card === seven);
  return {
    playedBy: play ? play.seat : null,
    won: play !== undefined && last.winner === play.seat,
    lastWinner: last.winner,
  };
}

/** Kompletní zúčtování odehrané hry → HandResult (delta se sumou 0). */
export function settle(input: SettleInput): HandResult {
  const { config, contract, flekLevels } = input;
  const s = config.sazby;
  const cerveny = contract.trump === CERVENE ? s.cervenyMultiplier : 1;
  const components: ComponentResult[] = [];

  const cp = cardPoints(input);
  const mp = marriagePoints(input);

  const flek = (t: FlekTarget): number => 2 ** (flekLevels[t] ?? 0);

  const push = (
    target: FlekTarget,
    wonBy: 'declarer' | 'defenders',
    baseRate: number,
    flekMultiplier: number,
    extraMultiplier: number,
    silent: boolean,
    note?: string,
  ) => {
    components.push({
      target,
      wonBy,
      baseRate,
      flekMultiplier,
      extraMultiplier,
      amount: baseRate * flekMultiplier * extraMultiplier,
      silent,
      ...(note !== undefined ? { note } : {}),
    });
  };

  if (contract.mode === 'hra') {
    // ── hra: více bodů vyhrává; při rovnosti prohrává aktér ──
    const declarerTotal = cp.declarer + mp.declarer;
    const defendersTotal = cp.defenders + mp.defenders;
    push('hra', declarerTotal > defendersTotal ? 'declarer' : 'defenders', s.hra, flek('hra'), cerveny, false);

    // ── sedma (hlášená / tichá / zabitá) ──
    const sf = sedmaFacts(input);
    if (contract.sedma !== null) {
      const holderIsDeclarer = contract.sedma === contract.declarer;
      const fulfilled = sf.playedBy === contract.sedma && sf.won;
      const wonBy = fulfilled === holderIsDeclarer ? 'declarer' : 'defenders';
      const note = sf.playedBy === contract.sedma && !sf.won ? 'zabitá sedma' : undefined;
      push('sedma', wonBy, s.sedma, flek('sedma'), cerveny, false, note);
    } else if (sf.playedBy !== null) {
      // tichá sedma: nehlášená trumfová 7 v posledním štychu — uhraná, nebo zabitá
      const holderIsDeclarer = sf.playedBy === contract.declarer;
      const wonBy = sf.won === holderIsDeclarer ? 'declarer' : 'defenders';
      push('sedma', wonBy, s.tichaSedma, 1, cerveny, true, sf.won ? 'tichá sedma' : 'zabitá tichá sedma');
    }

    // ── kilo (hlášené / tiché) — dle Obecných pravidel ČSM čl. IV.4 + V.5 ──
    const marriageValues = (side: 'declarer' | 'defenders'): number[] =>
      input.marriages
        .filter((m) => isDeclarerSide(m.seat, contract.declarer) === (side === 'declarer'))
        .map((m) => (contract.trump !== null && m.suit === contract.trump ? 40 : 20));

    const assessKilo = (holder: 'declarer' | 'defenders') => {
      const other = holder === 'declarer' ? 'defenders' : 'declarer';
      return kiloSteps(
        holder === 'declarer' ? cp.declarer : cp.defenders,
        marriageValues(holder),
        marriageValues(other).reduce((a, b) => a + b, 0),
      );
    };

    if (contract.kilo !== null) {
      const holder = contract.kilo === contract.declarer ? ('declarer' as const) : ('defenders' as const);
      const k = assessKilo(holder);
      const wonBy = k.fulfilled ? holder : holder === 'declarer' ? 'defenders' : 'declarer';
      push(
        'kilo', wonBy, s.kilo, flek('kilo'),
        cerveny * stepsToMultiplier(k.steps, s.kiloScaling), false,
        k.fulfilled ? `kilo ${k.measured}` : `kilo nedohráno (${k.measured})`,
      );
    } else {
      // tiché kilo: nehlášených ≥100 bodů (nejvýše jedna strana — celkem je max 190)
      for (const side of ['declarer', 'defenders'] as const) {
        const k = assessKilo(side);
        if (k.fulfilled) {
          push('kilo', side, s.ticheKilo, 1, cerveny * stepsToMultiplier(k.steps, s.kiloScaling), true, `tiché kilo ${k.measured}`);
        }
      }
    }
  } else {
    // ── betl / durch ── (bez trumfu, bez bodů, bez červeného násobku)
    const declarerTricks = input.tricks.filter((t) => t.winner === contract.declarer).length;
    const fulfilled = contract.mode === 'betl' ? declarerTricks === 0 : declarerTricks === 10;
    push(
      contract.mode,
      fulfilled ? 'declarer' : 'defenders',
      contract.mode === 'betl' ? s.betl : s.durch,
      flek(contract.mode),
      1,
      false,
    );
  }

  // ── rozpočtení na hráče: prohrávající strana platí; aktér vždy za dva ──
  const delta: [number, number, number] = [0, 0, 0];
  const [d1, d2] = defendersOf(contract.declarer);
  for (const c of components) {
    if (c.wonBy === 'declarer') {
      delta[contract.declarer] += 2 * c.amount;
      delta[d1] -= c.amount;
      delta[d2] -= c.amount;
    } else {
      delta[contract.declarer] -= 2 * c.amount;
      delta[d1] += c.amount;
      delta[d2] += c.amount;
    }
  }

  return {
    handNo: input.handNo,
    contract,
    cardPoints: cp,
    marriagePoints: mp,
    components,
    delta,
  };
}

/** Pomůcka pro testy a statistiky: celkový součet karetních bodů musí být 90. */
export function totalCardPoints(tricks: PlayedTrick[]): number {
  return tricks.reduce((s, t) => s + t.plays.reduce((x, p) => x + pointsOf(p.card), 0), 0) + 10;
}

