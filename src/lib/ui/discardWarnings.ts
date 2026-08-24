/**
 * discardWarnings.ts — čistá logika varování před odhozem do talonu
 * (bez DOM, aby se dala testovat; texty přiřazuje table.ts)
 *
 * Varování jsou poradní: pravidla ČSM odhoz půlky hlášky dovolují a odhoz
 * esa/desítky jen uzamkne závazek na betl/durch. Hráč je ale musí vidět.
 */

import { KRAL, SVRSEK, card, pointsOf, type Card, type Suit } from '../cards';

export type DiscardWarning =
  | { kind: 'valuable' }
  | { kind: 'marriage'; suit: Suit };

/** Barvy, ve kterých ruka drží celou hlášku (král + svršek). */
export function marriagesIn(hand: readonly Card[]): Suit[] {
  const out: Suit[] = [];
  for (const s of [0, 1, 2, 3] as Suit[]) {
    if (hand.includes(card(s, KRAL)) && hand.includes(card(s, SVRSEK))) out.push(s);
  }
  return out;
}

/**
 * Co je na zamýšleném odhozu riskantní.
 *  - `valuable`: eso/desítka v talonu ⇒ půjde hrát jen betl/durch
 *  - `marriage`: odhoz rozbije (nebo do talonu pohřbí) drženou hlášku
 */
export function discardWarnings(hand: readonly Card[], discard: readonly Card[]): DiscardWarning[] {
  const out: DiscardWarning[] = [];
  if (discard.some((c) => pointsOf(c) > 0)) out.push({ kind: 'valuable' });

  /*
   * Odhoz zabije hlášku, když ji ruka držela celou a po odhozu už ne — pokrývá
   * to obě varianty: rozbití (jedna půlka do talonu) i pohřbení obou půlek.
   * Půlku hlášky, kterou ruka celou nedrží, odhoz o nic nepřipraví.
   */
  const rest = hand.filter((c) => !discard.includes(c));
  const after = marriagesIn(rest);
  for (const s of marriagesIn(hand)) {
    if (!after.includes(s)) out.push({ kind: 'marriage', suit: s });
  }
  return out;
}
