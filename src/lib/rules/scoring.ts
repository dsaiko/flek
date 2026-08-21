/**
 * scoring.ts — vyhodnocení odehrané hry a zúčtování (docs/marias-design.md §5.3)
 *
 * Komponenty (hra, sedma, kilo, betl, durch) se vyhrávají/prohrávají NEZÁVISLE,
 * každá se svým flekovým multiplikátorem 2^level. Platí se po stranách: prohrávající
 * strana platí — aktér platí/inkasuje dvojnásobek (proti dvěma), obránci po jednom.
 */

import { CERVENE, ESO, R7, R10, pointsOf, rankOf, suitOf, card, type Card, type Suit } from '../cards';
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

/** Kilo škálování: násobek podle bodů (za každých 10 bodů nad/pod 100). */
export function kiloMultiplier(points: number, scaling: 'double' | 'linear'): number {
  // uhráno: 100–109 → 1 krok 0; 110–119 → krok 1; ...
  // prohráno: 90–99 → krok 0; 80–89 → krok 1; ...  (vždy aspoň základní sazba)
  const steps = points >= 100 ? Math.floor((points - 100) / 10) : Math.ceil((100 - points) / 10) - 1;
  return scaling === 'double' ? 2 ** steps : 1 + steps;
}

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

    // ── kilo (hlášené / tiché) ──
    const pointsFor = (side: 'declarer' | 'defenders'): number =>
      side === 'declarer'
        ? cp.declarer + (config.countMarriagesIntoKilo ? mp.declarer : 0)
        : cp.defenders + (config.countMarriagesIntoKilo ? mp.defenders : 0);

    if (contract.kilo !== null) {
      const holderIsDeclarer = contract.kilo === contract.declarer;
      const pts = pointsFor(holderIsDeclarer ? 'declarer' : 'defenders');
      const fulfilled = pts >= 100;
      const wonBy = fulfilled === holderIsDeclarer ? 'declarer' : 'defenders';
      push('kilo', wonBy, s.kilo, flek('kilo'), cerveny * kiloMultiplier(pts, s.kiloScaling), false, `kilo ${pts}`);
    } else {
      // tiché kilo: nehlášených ≥100 bodů (nejvýše jedna strana — celkem je max 190)
      for (const side of ['declarer', 'defenders'] as const) {
        const pts = pointsFor(side);
        if (pts >= 100) {
          push('kilo', side, s.ticheKilo, 1, cerveny * kiloMultiplier(pts, s.kiloScaling), true, `tiché kilo ${pts}`);
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

// re-export pro konzumenty scoringu
export { ESO, R10, rankOf, suitOf };
