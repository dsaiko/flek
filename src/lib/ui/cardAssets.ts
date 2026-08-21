/**
 * cardAssets.ts — mapování karet enginu na assety a názvy (jen UI vrstva)
 *
 * Kódy souborů jsou shodné napříč sadami: <RANK><SUIT>
 *   RANK: 7 8 9 T(desítka) U(spodek) O(svršek) K(král) D(eso)
 *   SUIT: H(červené) L(zelené) B(kule) A(žaludy)
 */

import { rankOf, suitOf, type Card, type Suit } from '../cards';
import { currentLang } from './i18n';

const RANK_CODE = ['7', '8', '9', 'T', 'U', 'O', 'K', 'D'] as const;
const SUIT_CODE = ['H', 'L', 'B', 'A'] as const;

export type Pattern = 'modern' | 'history';

export function cardCode(c: Card): string {
  return `${RANK_CODE[rankOf(c)]}${SUIT_CODE[suitOf(c)]}`;
}

export function cardSrc(c: Card, pattern: Pattern): string {
  if (pattern === 'history') return `/cards/history/${cardCode(c)}.webp`;
  const set = currentLang() === 'en' ? 'modern-en' : 'modern';
  return `/cards/${set}/${cardCode(c)}.svg`;
}

/** Rub karty — historická sada vlastní rub nemá, sdílí moderní. */
export function backSrc(): string {
  return '/cards/modern/back.svg';
}

const SUIT_NAME_CS = ['červené', 'zelené', 'kule', 'žaludy'];
const SUIT_NAME_EN = ['hearts', 'leaves', 'bells', 'acorns'];
const RANK_NAME_CS = ['sedma', 'osma', 'devítka', 'desítka', 'spodek', 'svršek', 'král', 'eso'];
const RANK_NAME_EN = ['seven', 'eight', 'nine', 'ten', 'unter', 'ober', 'king', 'ace'];

export const SUIT_SYMBOL = ['♥', '🍃', '🔔', '🌰'] as const;

export function suitName(s: Suit): string {
  return currentLang() === 'en' ? SUIT_NAME_EN[s] : SUIT_NAME_CS[s];
}

export function cardName(c: Card): string {
  return currentLang() === 'en'
    ? `${RANK_NAME_EN[rankOf(c)]} of ${SUIT_NAME_EN[suitOf(c)]}`
    : `${SUIT_NAME_CS[suitOf(c)]} ${RANK_NAME_CS[rankOf(c)]}`;
}
