/**
 * discardWarnings.ts — čistá logika varování před odhozem do talonu
 * (bez DOM, aby se dala testovat; texty přiřazuje table.ts)
 *
 * Varování jsou poradní: pravidla ČSM odhoz půlky hlášky dovolují a odhoz
 * esa/desítky jen uzamkne závazek na betl/durch. Hráč je ale musí vidět.
 */

import { KRAL, SVRSEK, card, pointsOf, rankOf, suitOf, type Card, type Suit } from '../cards';

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

  const rest = hand.filter((c) => !discard.includes(c));
  const before = marriagesIn(hand);
  const after = marriagesIn(rest);
  for (const s of before) {
    if (!after.includes(s)) out.push({ kind: 'marriage', suit: s });
  }
  // půlka hlášky se v ruce nedrží celá, ale odhoz ji přesto znemožní navždy
  for (const c of discard) {
    const r = rankOf(c);
    if (r !== KRAL && r !== SVRSEK) continue;
    const s = suitOf(c);
    if (before.includes(s)) continue; // už pokryto výše
    const partner = card(s, r === KRAL ? SVRSEK : KRAL);
    if (discard.includes(partner)) out.push({ kind: 'marriage', suit: s });
  }
  return out;
}
