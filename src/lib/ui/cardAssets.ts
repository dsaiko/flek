/**
 * cardAssets.ts — mapování karet enginu na assety a názvy (jen UI vrstva)
 *
 * Kódy souborů jsou shodné napříč sadami: <RANK><SUIT>
 *   RANK: 7 8 9 T(desítka) U(spodek) O(svršek) K(král) D(eso)
 *   SUIT: H(červené) L(zelené) B(kule) A(žaludy)
 */

import { rankOf, suitOf, type Card, type Suit } from '../cards';
import { currentLang } from './i18n';
import { suitArt, SUIT_ART_COLORS as C, SUIT_ART_VIEWBOX } from './suitArt';

const RANK_CODE = ['7', '8', '9', 'T', 'U', 'O', 'K', 'D'] as const;
const SUIT_CODE = ['H', 'L', 'B', 'A'] as const;

export type Pattern = 'modern' | 'history';

export function cardCode(c: Card): string {
  return `${RANK_CODE[rankOf(c)]}${SUIT_CODE[suitOf(c)]}`;
}

export function cardSrc(c: Card, pattern: Pattern): string {
  if (pattern === 'history') return `/cards/history/${cardCode(c)}.webp`;
  const lang = currentLang();
  const set =
    lang === 'en' ? 'modern-en' : lang === 'de' ? 'modern-de' : lang === 'fr' ? 'modern-fr' : 'modern';
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
/* francouzská sada má indexy V/D/R/A, takže i názvy jsou francouzské figury */
const SUIT_NAME_FR = ['cœur', 'feuille', 'grelot', 'gland'];
const RANK_NAME_FR = ['sept', 'huit', 'neuf', 'dix', 'valet', 'dame', 'roi', 'as'];

/**
 * Inline SVG symboly barev — stejné tvary jako na kartách (gen-cards.ts),
 * konzistentní s vizuálem sady. Vkládat přes innerHTML.
 */
export function suitIcon(s: Suit, size = 20): string {
  /*
   * Táž kresba jako na kartách (panel „3a Klasické"), jen plochá: v pár desítkách
   * pixelů by se kontura a stínování slily do skvrny. Barva se bere z předlohy,
   * ať ikonka v popisku závazku odpovídá tomu, co hráč vidí na kartě.
   */
  const flat: Record<Suit, { fill: string; detail?: string }> = [
    { fill: C.heartBody },                          // červené
    { fill: C.leafBody, detail: C.leafVein },       // zelené
    { fill: C.ballBody, detail: C.gold },           // kule
    { fill: C.acornNut, detail: C.acornCap },       // žaludy
  ];
  const { fill, detail } = flat[s];
  return `<svg viewBox="${SUIT_ART_VIEWBOX}" width="${size}" height="${size}" style="vertical-align:-0.22em" aria-hidden="true">${suitArt(SUIT_CODE[s], { mono: fill, detail })}</svg>`;
}

export function suitName(s: Suit): string {
  const lang = currentLang();
  if (lang === 'en') return SUIT_NAME_EN[s]!;
  if (lang === 'de') return SUIT_NAME_DE[s]!;
  if (lang === 'fr') return SUIT_NAME_FR[s]!;
  return SUIT_NAME_CS[s]!;
}

export function cardName(c: Card): string {
  const lang = currentLang();
  if (lang === 'en') return `${RANK_NAME_EN[rankOf(c)]} of ${SUIT_NAME_EN[suitOf(c)]}`;
  if (lang === 'de') return `${SUIT_NAME_DE[suitOf(c)]} ${RANK_NAME_DE[rankOf(c)]}`;
  if (lang === 'fr') return `${RANK_NAME_FR[rankOf(c)]} de ${SUIT_NAME_FR[suitOf(c)]}`;
  return `${SUIT_NAME_CS[suitOf(c)]} ${RANK_NAME_CS[rankOf(c)]}`;
}
