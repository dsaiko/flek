/**
 * cards.ts — kódování karet, pořadí, body
 *
 * Karta = číslo 0..31: suit*8 + rank. Žádné třídy — plain data přes worker i síť.
 * České/anglické názvy jen v UI vrstvě (ui/cardNames.ts), engine pracuje s čísly.
 */

export type Suit = 0 | 1 | 2 | 3; // červené, zelené, kule, žaludy
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // 7,8,9,10(T),spodek(U),svršek(O),král(K),eso(D)
export type Card = number; // 0..31

export const SUITS: readonly Suit[] = [0, 1, 2, 3];
export const RANKS: readonly Rank[] = [0, 1, 2, 3, 4, 5, 6, 7];

export const CERVENE: Suit = 0;

export const R7: Rank = 0;
export const R8: Rank = 1;
export const R9: Rank = 2;
export const R10: Rank = 3;
export const SPODEK: Rank = 4;
export const SVRSEK: Rank = 5;
export const KRAL: Rank = 6;
export const ESO: Rank = 7;

export const suitOf = (c: Card): Suit => ((c >> 3) & 3) as Suit;
export const rankOf = (c: Card): Rank => (c & 7) as Rank;
export const card = (s: Suit, r: Rank): Card => (s << 3) | r;

/** Celý balíček 0..31 v kanonickém pořadí. */
export const DECK: readonly Card[] = Array.from({ length: 32 }, (_, i) => i);

/**
 * Síla karty v barevných hrách: eso > desítka > král > svršek > spodek > 9 > 8 > 7.
 * Index = rank, hodnota = síla (vyšší vyhrává). NIKDY nepoužívat pro betl/durch!
 */
export const TRUMP_ORDER: readonly number[] = [0, 1, 2, 6, 3, 4, 5, 7];

/**
 * Přirozené pořadí pro betl/durch: eso > král > svršek > spodek > 10 > 9 > 8 > 7.
 * Pozor na past: desítka je tady MEZI spodkem a devítkou.
 */
export const NATURAL_ORDER: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

export type OrderMode = 'trump' | 'natural';

/** Síla karty v rámci její barvy podle režimu hry. */
export const strength = (c: Card, mode: OrderMode): number =>
  (mode === 'trump' ? TRUMP_ORDER : NATURAL_ORDER)[rankOf(c)];

/** Bodová hodnota karty: esa a desítky po 10, jinak 0. */
export const pointsOf = (c: Card): number => {
  const r = rankOf(c);
  return r === ESO || r === R10 ? 10 : 0;
};

/** Součet bodů karet (bez bodů za poslední štych a hlášky). */
export const pointsOfCards = (cards: readonly Card[]): number =>
  cards.reduce((sum, c) => sum + pointsOf(c), 0);

/** Setřídění ruky pro stabilní stav (barva, pak sestupně síla v barevné hře). */
export const sortHand = (cards: readonly Card[]): Card[] =>
  cards.slice().sort((a, b) => suitOf(a) - suitOf(b) || strength(b, 'trump') - strength(a, 'trump'));

// ── bitové masky (interní rychlá reprezentace pro AI) ────────────────────────

export type CardMask = number; // bit i = karta i

export const toMask = (cards: readonly Card[]): CardMask =>
  cards.reduce((m, c) => m | (1 << c), 0) >>> 0;

export const fromMask = (mask: CardMask): Card[] => {
  const out: Card[] = [];
  for (let c = 0; c < 32; c += 1) if (mask & (1 << c)) out.push(c);
  return out;
};

export const SUIT_MASK: readonly CardMask[] = [0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000 >>> 0];
