/**
 * tricks.ts — legalita a vyhodnocení štychu (docs/marias-design.md §5.3)
 *
 * Jediné místo, kde žijí přebíjecí povinnosti — importuje je engine (legalita),
 * AI determinizer (odvození omezení z historie) i playout politika.
 *
 * Pravidla (barevná hra):
 *  1. urči aktuálně vítěznou kartu štychu
 *  2. máš-li barvu výnosu: musíš ji ctít a přebít vítěznou kartu, pokud přebít lze
 *     a máš čím (po přebití trumfem už barvu jen ctíš — žádná barevná karta trumf nepřebije)
 *  3. bez barvy: povinný trumf; vítězí-li trumf, povinnost přetrumfnout, máš-li čím
 *  4. bez barvy i trumfu: libovolná karta
 * Betl/durch: bod 2 s přirozeným pořadím (pozor: desítka mezi spodkem a 9!), bez bodu 3.
 */

import { type Card, type Suit, strength, suitOf, type OrderMode } from '../cards';
import type { GameMode, Seat, TrickPlay } from './types';

export const orderMode = (mode: GameMode): OrderMode => (mode === 'hra' ? 'trump' : 'natural');

/**
 * Přebije kandidát aktuálně vítěznou kartu? (ledSuit = barva výnosu)
 * Vyšší v téže barvě vyhrává; trumf přebíjí netrumfovou; barva mimo výnos
 * i mimo trumf nevyhrává nikdy.
 */
export function beats(candidate: Card, winning: Card, trump: Suit | null, mode: GameMode): boolean {
  const om = orderMode(mode);
  const cs = suitOf(candidate);
  const ws = suitOf(winning);
  if (cs === ws) return strength(candidate, om) > strength(winning, om);
  if (trump !== null && cs === trump) return true; // trumf přebíjí jinou barvu
  return false;
}

/** Aktuálně vítězná karta štychu (štych nesmí být prázdný). */
export function winningPlay(trick: readonly TrickPlay[], trump: Suit | null, mode: GameMode): TrickPlay {
  let best = trick[0];
  for (let i = 1; i < trick.length; i += 1) {
    if (beats(trick[i].card, best.card, trump, mode)) best = trick[i];
  }
  return best;
}

export function trickWinner(trick: readonly TrickPlay[], trump: Suit | null, mode: GameMode): Seat {
  return winningPlay(trick, trump, mode).seat;
}

/**
 * Legální karty z ruky do rozehraného štychu. Pro prázdný štych (výnos) je legální cokoliv.
 */
export function legalPlays(
  hand: readonly Card[],
  trick: readonly TrickPlay[],
  trump: Suit | null,
  mode: GameMode,
): Card[] {
  if (trick.length === 0) return hand.slice();

  const ledSuit = suitOf(trick[0].card);
  const winning = winningPlay(trick, trump, mode).card;

  const inLed = hand.filter((c) => suitOf(c) === ledSuit);
  if (inLed.length > 0) {
    // ctít barvu; přebít, pokud to barva výnosu vůbec dokáže a máme čím
    const beating = inLed.filter((c) => beats(c, winning, trump, mode));
    return beating.length > 0 ? beating : inLed;
  }

  if (mode === 'hra' && trump !== null) {
    const trumps = hand.filter((c) => suitOf(c) === trump);
    if (trumps.length > 0) {
      // povinný trumf; vítězí-li trumf, povinnost přetrumfnout, máme-li čím
      const overtrumps = trumps.filter((c) => beats(c, winning, trump, mode));
      return overtrumps.length > 0 ? overtrumps : trumps;
    }
  }

  return hand.slice();
}
