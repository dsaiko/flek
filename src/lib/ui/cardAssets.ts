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
  const lang = currentLang();
  const set = lang === 'en' ? 'modern-en' : lang === 'de' ? 'modern-de' : 'modern';
  return `/cards/${set}/${cardCode(c)}.svg`;
}

/** Rub karty — historická sada vlastní rub nemá, sdílí moderní. */
export function backSrc(): string {
  return '/cards/modern/back.svg';
}

const SUIT_NAME_CS = ['červené', 'zelené', 'kule', 'žaludy'];
const SUIT_NAME_EN = ['hearts', 'leaves', 'bells', 'acorns'];
const SUIT_NAME_DE = ['Herz', 'Grün', 'Schellen', 'Eichel'];
const RANK_NAME_CS = ['sedma', 'osma', 'devítka', 'desítka', 'spodek', 'svršek', 'král', 'eso'];
const RANK_NAME_EN = ['seven', 'eight', 'nine', 'ten', 'unter', 'ober', 'king', 'ace'];
const RANK_NAME_DE = ['Sieben', 'Acht', 'Neun', 'Zehn', 'Unter', 'Ober', 'König', 'Ass'];

/**
 * Inline SVG symboly barev — stejné tvary jako na kartách (gen-cards.ts),
 * konzistentní s vizuálem sady. Vkládat přes innerHTML.
 */
export function suitIcon(s: Suit, size = 20): string {
  const bodies = [
    // červené
    `<path d="M0 30 C-3 21 -10 12 -18 5 C-29 -3 -33 -13 -30 -21 C-27 -30 -19 -34 -12 -33 C-6 -32 -2 -27 0 -21 C2 -27 6 -32 12 -33 C19 -34 27 -30 30 -21 C33 -13 29 -3 18 5 C10 12 3 21 0 30 Z" fill="#c62828"/>`,
    // zelené
    `<path d="M0 -34 C9 -26 21 -13 21 1 C21 17 11 29 0 34 C-11 29 -21 17 -21 1 C-21 -13 -9 -26 0 -34 Z" fill="#2e7d32"/><path d="M0 -24 L0 24" stroke="#1b4d1f" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.55"/>`,
    // kule
    `<circle cx="0" cy="-2" r="27" fill="#edaa17" stroke="#8a5a00" stroke-width="3"/><path d="M-25 -8 Q0 4 25 -8" stroke="#8a5a00" stroke-width="3" fill="none"/><path d="M0 10 L5.5 16.5 L0 23 L-5.5 16.5 Z" fill="#8a5a00"/>`,
    // žaludy
    `<path d="M-17 -8 C-17 8 -9 25 0 32 C9 25 17 8 17 -8 Q0 -14 -17 -8 Z" fill="#6a8f3c"/><path d="M-19 -7 Q-19 -26 0 -26 Q19 -26 19 -7 Q0 -13 -19 -7 Z" fill="#7a4f2b"/>`,
  ];
  return `<svg viewBox="-34 -40 68 78" width="${size}" height="${size}" style="vertical-align:-0.22em" aria-hidden="true">${bodies[s]}</svg>`;
}

export function suitName(s: Suit): string {
  const lang = currentLang();
  return lang === 'en' ? SUIT_NAME_EN[s] : lang === 'de' ? SUIT_NAME_DE[s] : SUIT_NAME_CS[s];
}

export function cardName(c: Card): string {
  const lang = currentLang();
  if (lang === 'en') return `${RANK_NAME_EN[rankOf(c)]} of ${SUIT_NAME_EN[suitOf(c)]}`;
  if (lang === 'de') return `${SUIT_NAME_DE[suitOf(c)]} ${RANK_NAME_DE[rankOf(c)]}`;
  return `${SUIT_NAME_CS[suitOf(c)]} ${RANK_NAME_CS[rankOf(c)]}`;
}
