/**
 * gen-cards.ts — generátor moderních SVG sad 32 mariášových karet (německé barvy)
 *
 * Dvě sady podle Claude Design „Kolo 6 — Moderní karty" (§49):
 *   cards/modern-barevna/  6b „Barevná" — celá karta v barvě, barvu poznáš
 *                          i z nejužšího proužku ve vějíři
 *   cards/modern-lidova/   6c „Lidová" — krémový papír, patkové písmo,
 *                          figury dvouhlavé jako tradiční karty
 *
 * Obě mají čitelný roh (hodnota a znak barvy pod sebou — ve vějíři je vidět
 * jen levý pruh karty) a mezinárodní indexy J / Q / K / A, takže nepotřebují
 * jazykové varianty. Pojmenování shodné s historickou sadou (cards/history):
 *   RANK: 7 8 9 T(desítka) U(spodek) O(svršek) K(král) D(eso)
 *   SUIT: H(červené) L(zelené) B(kule) A(žaludy)
 *
 * Karty jsou zakomitovaný výstup — upravuje se generátor, ne soubory
 * (`make cards`; verify hlídá, že se generátor a soubory nerozešly).
 *
 * Licence: MIT © 2026 Dušan Saiko
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type SuitCode = 'H' | 'L' | 'B' | 'A';
type RankCode = '7' | '8' | '9' | 'T' | 'U' | 'O' | 'K' | 'D';
export type DeckId = 'modern-barevna' | 'modern-lidova';

export const DECKS: readonly DeckId[] = ['modern-barevna', 'modern-lidova'];
export const RANK_CODES: readonly RankCode[] = ['7', '8', '9', 'T', 'U', 'O', 'K', 'D'];
export const SUIT_CODES: readonly SuitCode[] = ['H', 'L', 'B', 'A'];

const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const SUIT: Record<SuitCode, { name: string; color: string; ink: string }> = {
  // color = barva karty (podklad Barevné, znaky Lidové); ink = tmavší písmo Lidové
  H: { name: 'červené', color: '#d6313a', ink: '#c42630' },
  L: { name: 'zelené', color: '#2f8a4e', ink: '#237040' },
  B: { name: 'kule', color: '#e39a00', ink: '#a66d00' },
  A: { name: 'žaludy', color: '#8a5530', ink: '#7a4a28' },
};

const RANK: Record<RankCode, { name: string; index: string }> = {
  '7': { name: 'sedma', index: '7' },
  '8': { name: 'osma', index: '8' },
  '9': { name: 'devítka', index: '9' },
  T: { name: 'desítka', index: '10' },
  U: { name: 'spodek', index: 'J' },
  O: { name: 'svršek', index: 'Q' },
  K: { name: 'král', index: 'K' },
  D: { name: 'eso', index: 'A' },
};

/**
 * Znak barvy v rámu 64×64. `f` je hlavní výplň: bílá na Barevné kartě, barva
 * barvy na figuře Barevné a všude na Lidové. Detaily (stín srdce, žilky listu,
 * pás kule, čepička žaludu) mají pevnou tmavší barvu.
 */
function symbol(s: SuitCode, f: string): string {
  switch (s) {
    case 'H':
      return `<path fill="${f}" d="M32 57C12 43 4 31 4 20.5 4 11.5 11 5 19.5 5 25 5 29.5 8.5 32 13 34.5 8.5 39 5 44.5 5 53 5 60 11.5 60 20.5 60 31 52 43 32 57Z"></path>`
        + '<path fill="#9e1f27" opacity=".35" d="M32 57C44 48.5 60 35 60 20.5 60 14 56.5 9 51 6.5 55 12 55 20 50 29 45 38 38 47 32 57Z"></path>';
    case 'L':
      return `<path fill="${f}" d="M32 3C44 13 58 22 58 36 58 46 50 52.5 40.5 52.5 37.5 52.5 35.2 51.6 33.6 50.2L34.6 61H29.4L30.4 50.2C28.8 51.6 26.5 52.5 23.5 52.5 14 52.5 6 46 6 36 6 22 20 13 32 3Z"></path>`
        + '<path fill="none" stroke="#1d5e33" stroke-width="2.6" stroke-linecap="round" d="M32 14V49M32 25l-7-5.5M32 25l7-5.5M32 35l-9-6.5M32 35l9-6.5"></path>';
    case 'B':
      return `<circle cx="32" cy="32" r="25" fill="${f}"></circle>`
        + '<path fill="#a86f00" d="M7.7 26H56.3A25 25 0 0 1 56.3 38H7.7A25 25 0 0 1 7.7 26Z"></path>'
        + `<circle cx="20" cy="32" r="2.2" fill="${f}"></circle><circle cx="32" cy="32" r="2.2" fill="${f}"></circle><circle cx="44" cy="32" r="2.2" fill="${f}"></circle>`;
    case 'A':
      return '<rect x="29.5" y="3" width="5" height="10" rx="2.5" fill="#5c3719"></rect>'
        + `<path fill="${f}" d="M17 30C17 45 25 55 32 61 39 55 47 45 47 30Z"></path>`
        + '<path fill="#5c3719" d="M13 33C13 20 21 11.5 32 11.5S51 20 51 33Z"></path>'
        + `<path fill="none" stroke="${f}" stroke-width="2" opacity=".55" d="M20 20L28 33M28 13.5L38 33M38 13.5L46 26M44 20L36 33M36 13L26 33M26 14L18 27"></path>`;
  }
}

/** Znak barvy umístěný na kartu: střed (x, y), natočení, velikost v px (rám 64). */
const placed = (s: SuitCode, f: string, x: number, y: number, size: number, rot = 0): string =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${size / 64}) translate(-32 -32)">${symbol(s, f)}</g>`;

/**
 * Rozmístění znaků na číselných kartách (střed karty 120 × 205). Spodní půlka
 * je vzhůru nohama, jako na skutečných kartách.
 */
const PIPS: Record<'7' | '8' | '9' | 'T', readonly [number, number][]> = {
  '7': [[80, 100], [160, 100], [120, 152], [80, 205], [160, 205], [80, 310], [160, 310]],
  '8': [[80, 100], [160, 100], [120, 152], [80, 205], [160, 205], [120, 258], [80, 310], [160, 310]],
  '9': [[80, 95], [160, 95], [80, 170], [160, 170], [120, 205], [80, 240], [160, 240], [80, 315], [160, 315]],
  T: [[80, 95], [160, 95], [120, 132], [80, 170], [160, 170], [80, 240], [160, 240], [120, 278], [80, 315], [160, 315]],
};

const CROWN = 'M4 30L0 6 16 18 30 0 44 18 60 6 56 30Z';

interface Style {
  /** podklad karty (bez rohů a obsahu) */
  base: (s: SuitCode) => string;
  /** písmo indexu v rohu */
  font: string;
  weight: string;
  indexFill: (s: SuitCode) => string;
  /** výplň znaku v rohu a na číselných kartách */
  pipFill: (s: SuitCode) => string;
  ace: (s: SuitCode) => string;
  figure: (s: SuitCode, r: 'U' | 'O' | 'K') => string;
  back: string;
}

const GRADIENT = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"></stop><stop offset="1" stop-color="#000" stop-opacity=".12"></stop></linearGradient></defs>';

const BAREVNA: Style = {
  base: (s) => GRADIENT
    + `<rect x="0" y="0" width="240" height="410" rx="16" fill="${SUIT[s].color}"></rect>`
    + '<rect x="0" y="0" width="240" height="410" rx="16" fill="url(#g)"></rect>'
    + '<rect x="8" y="8" width="224" height="394" rx="11" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.5"></rect>',
  font: SANS,
  weight: '800',
  indexFill: () => '#ffffff',
  pipFill: () => '#ffffff',
  ace: (s) => '<circle cx="120" cy="205" r="92" fill="#000" fill-opacity=".10"></circle>'
    + placed(s, '#ffffff', 120, 205, 140),
  // bílé pole s velkým písmenem; K nese korunu, Q má znak nad písmenem, J pod ním
  figure: (s, r) => {
    const c = SUIT[s].color;
    let out = '<rect x="54" y="62" width="132" height="286" rx="18" fill="#ffffff"></rect>'
      + `<text x="120" y="248" text-anchor="middle" font-family="${SANS}" font-size="128" font-weight="800" fill="${c}">${RANK[r].index}</text>`;
    if (r === 'K') out += `<path transform="translate(88 92.8) scale(${64 / 60})" fill="${c}" d="${CROWN}"></path>` + placed(s, c, 120, 292, 44);
    else if (r === 'O') out += placed(s, c, 120, 110, 52);
    else out += placed(s, c, 120, 292, 52);
    return out;
  },
  back: '<defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="20" fill="#1d3a5c"></rect><path d="M0 10H20M10 0V20" stroke="#e1b600" stroke-opacity=".22" stroke-width="1"></path></pattern></defs>'
    + '<rect x="0" y="0" width="240" height="410" rx="16" fill="#ffffff"></rect>'
    + '<rect x="8" y="8" width="224" height="394" rx="11" fill="url(#p)"></rect>'
    + '<circle cx="120" cy="205" r="38" fill="#1d3a5c" stroke="#e1b600" stroke-width="2"></circle>'
    + `<text x="120" y="222" text-anchor="middle" font-family="${SERIF}" font-size="46" font-weight="700" fill="#e1b600">M</text>`,
};

const LIDOVA: Style = {
  base: (s) => '<rect x="1" y="1" width="238" height="408" rx="16" fill="#fbf6ea" stroke="#e3d9c3" stroke-width="2"></rect>'
    + `<rect x="10" y="10" width="220" height="390" rx="10" fill="none" stroke="${SUIT[s].color}" stroke-opacity=".5" stroke-width="1.2"></rect>`,
  font: SERIF,
  weight: '700',
  indexFill: (s) => SUIT[s].ink,
  pipFill: (s) => SUIT[s].color,
  ace: (s) => `<circle cx="120" cy="205" r="84" fill="none" stroke="${SUIT[s].color}" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="2 5"></circle>`
    + placed(s, SUIT[s].color, 120, 205, 120),
  // dvouhlavá figura: horní půlka, táž otočená o 180°, mezi nimi linka s kosočtvercem
  figure: (s, r) => {
    const { color: c, ink } = SUIT[s];
    const half = `<text x="120" y="176" text-anchor="middle" font-family="${SERIF}" font-size="96" font-weight="700" fill="${ink}">${RANK[r].index}</text>`
      + (r === 'K' ? `<path transform="translate(95 71) scale(${50 / 60})" fill="${c}" d="${CROWN}"></path>` : '')
      + (r === 'U' ? placed(s, c, 164, 168, 34) : placed(s, c, 76, 100, 34));
    return `<path d="M54 62H186V348H54Z" fill="${c}" fill-opacity=".07"></path>`
      + `<rect x="54" y="62" width="132" height="286" rx="4" fill="none" stroke="${c}" stroke-width="1.5"></rect>`
      + half + `<g transform="rotate(180 120 205)">${half}</g>`
      + `<line x1="66" y1="205" x2="174" y2="205" stroke="${c}" stroke-width="1.2"></line>`
      + `<path d="M120 197L128 205 120 213 112 205Z" fill="${c}"></path>`;
  },
  back: '<defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#7a2a26"></rect><path d="M12 2L22 12 12 22 2 12Z" fill="none" stroke="#fbf6ea" stroke-opacity=".3" stroke-width="1.2"></path><circle cx="12" cy="12" r="2" fill="#e1b600" fill-opacity=".6"></circle></pattern></defs>'
    + '<rect x="1" y="1" width="238" height="408" rx="16" fill="#fbf6ea" stroke="#e3d9c3" stroke-width="2"></rect>'
    + '<rect x="12" y="12" width="216" height="386" rx="9" fill="url(#p)"></rect>'
    + '<rect x="12" y="12" width="216" height="386" rx="9" fill="none" stroke="#e1b600" stroke-opacity=".7" stroke-width="1.5"></rect>',
};

const STYLES: Record<DeckId, Style> = { 'modern-barevna': BAREVNA, 'modern-lidova': LIDOVA };

const svg = (title: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 410" width="240" height="410"><title>${title}</title>${body}</svg>`;

/** Jedna karta jako SVG řetězec (deterministicky — verify ho porovnává se soubory). */
export function cardSvg(deck: DeckId, r: RankCode, s: SuitCode): string {
  const st = STYLES[deck];
  const ten = r === 'T';
  const corner = `<text x="30" y="52" text-anchor="middle" font-family="${st.font}" font-size="${ten ? 34 : 40}" font-weight="${st.weight}" fill="${st.indexFill(s)}" letter-spacing="${ten ? -2 : 0}">${RANK[r].index}</text>`
    + placed(s, st.pipFill(s), 30, 82, 30);
  let body: string;
  if (r === 'D') body = st.ace(s);
  else if (r === 'U' || r === 'O' || r === 'K') body = st.figure(s, r);
  else body = PIPS[r].map(([x, y]) => placed(s, st.pipFill(s), x, y, 46, y > 205 ? 180 : 0)).join('');
  // bez base: pozadí Barevné nese i <defs> s přechodem, ten musí být před prvním použitím
  return svg(`${RANK[r].name} ${SUIT[s].name}`,
    st.base(s) + corner + `<g transform="rotate(180 120 205)">${corner}</g>` + body);
}

export const backSvg = (deck: DeckId): string => svg('rub', STYLES[deck].back);

/** Všechny soubory sady: jméno → obsah. */
export function deckFiles(deck: DeckId): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of SUIT_CODES) for (const r of RANK_CODES) out.set(`${r}${s}.svg`, cardSvg(deck, r, s));
  out.set('back.svg', backSvg(deck));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'cards');
  for (const deck of DECKS) {
    const dir = join(root, deck);
    mkdirSync(dir, { recursive: true });
    const files = deckFiles(deck);
    for (const [name, content] of files) writeFileSync(join(dir, name), content);
    console.log(`OK: ${deck} — ${files.size} SVG → cards/${deck}`);
  }
}
