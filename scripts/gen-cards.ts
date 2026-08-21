/**
 * gen-cards.ts — generátor moderní SVG sady 32 mariášových karet (německé barvy)
 *
 * Výstup: cards/modern/<RANK><SUIT>.svg + back.svg + preview.html
 * Pojmenování shodné s historickou sadou (cards/history):
 *   RANK: 7 8 9 T(desítka) U(spodek) O(svršek) K(král) D(eso)
 *   SUIT: A(žaludy) B(kule) H(červené) L(zelené)
 *
 * Spuštění: npx tsx scripts/gen-cards.ts        → cards/modern/    (české indexy S V K A)
 *           npx tsx scripts/gen-cards.ts en     → cards/modern-en/ (anglické indexy J Q K A)
 * Licence: MIT © 2026 Dušan Saiko
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANG: 'cs' | 'en' = process.argv[2] === 'en' ? 'en' : 'cs';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cards', LANG === 'en' ? 'modern-en' : 'modern');

// ── geometrie karty ──────────────────────────────────────────────────────────
// tradiční mariášový formát 62×106 mm
const W = 240;
const H = 410;
const CX = W / 2; // 120
const CY = H / 2; // 205

const PIP_SCALE = 0.74;
const ACE_SCALE = 2.8;
const FIGURE_SCALE = 1.12; // zvětšení postaviček uvnitř panelu

const FONT = `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const INK = '#2f2f3a'; // silueta figur

// ── barvy (suity) ────────────────────────────────────────────────────────────
interface SuitDef {
  code: 'A' | 'B' | 'H' | 'L';
  nameCs: string;
  nameEn: string;
  color: string;   // hlavní barva (indexy, oděv figur, tinty)
  index: string;   // barva textu indexu (tmavší kvůli čitelnosti)
}

const SUITS: SuitDef[] = [
  { code: 'H', nameCs: 'červené', nameEn: 'hearts', color: '#c62828', index: '#c62828' },
  { code: 'L', nameCs: 'zelené', nameEn: 'leaves', color: '#2e7d32', index: '#2e7d32' },
  { code: 'B', nameCs: 'kule', nameEn: 'bells', color: '#c8890a', index: '#a06d00' },
  { code: 'A', nameCs: 'žaludy', nameEn: 'acorns', color: '#7a4f2b', index: '#6d4c2b' },
];

// ── symboly barev ────────────────────────────────────────────────────────────
// Každý symbol je vycentrovaný na (0,0), výška zhruba 64–68 jednotek.
// mono = základní barva siluety (např. bílý symbol na hrudi figury),
// detail = barva vnitřních detailů mono varianty (žilka listu, pásek kuly, čepička žaludu)

function heart(mono?: string): string {
  const fill = mono ?? '#c62828';
  return `<path d="M0 30 C-3 21 -10 12 -18 5 C-29 -3 -33 -13 -30 -21 C-27 -30 -19 -34 -12 -33 C-6 -32 -2 -27 0 -21 C2 -27 6 -32 12 -33 C19 -34 27 -30 30 -21 C33 -13 29 -3 18 5 C10 12 3 21 0 30 Z" fill="${fill}"/>`;
}

function leaf(mono?: string, detail?: string): string {
  const fill = mono ?? '#2e7d32';
  const veinColor = mono ? detail : '#1b4d1f';
  const vein = veinColor
    ? `<path d="M0 -24 L0 24 M0 -8 C-6 -4 -10 0 -12 6 M0 -2 C6 2 10 6 12 12" stroke="${veinColor}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="${mono ? 1 : 0.55}"/>`
    : '';
  return `<path d="M0 -34 C9 -26 21 -13 21 1 C21 17 11 29 0 34 C-11 29 -21 17 -21 1 C-21 -13 -9 -26 0 -34 Z" fill="${fill}"/>${vein}`;
}

function bell(mono?: string, detail?: string): string {
  if (mono) {
    const d = detail
      ? `<path d="M-25 -8 Q0 4 25 -8" stroke="${detail}" stroke-width="3" fill="none"/><path d="M0 10 L5.5 16.5 L0 23 L-5.5 16.5 Z" fill="${detail}"/>`
      : `<path d="M0 12 L6 19 L0 26 L-6 19 Z" fill="${mono}"/>`;
    return `<circle cx="0" cy="-2" r="27" fill="${mono}"/>${d}`;
  }
  return [
    `<circle cx="0" cy="-2" r="27" fill="#edaa17" stroke="#8a5a00" stroke-width="2.4"/>`,
    `<path d="M-25 -8 Q0 4 25 -8" stroke="#8a5a00" stroke-width="2.4" fill="none"/>`,
    `<circle cx="-9" cy="-13" r="6" fill="#ffffff" opacity="0.5"/>`,
    `<path d="M0 10 L5.5 16.5 L0 23 L-5.5 16.5 Z" fill="#8a5a00"/>`,
  ].join('');
}

function acorn(mono?: string, detail?: string): string {
  const nut = mono ?? '#6a8f3c';
  const cap = mono ? (detail ?? mono) : '#7a4f2b';
  const stem = mono ? '' : `<path d="M0 -26 Q3 -33 8 -36" stroke="#7a4f2b" stroke-width="3.4" stroke-linecap="round" fill="none"/>`;
  const shine = mono ? '' : `<path d="M-7 2 C-7 12 -4 20 0 25" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity="0.35"/>`;
  return [
    stem,
    `<path d="M-17 -8 C-17 8 -9 25 0 32 C9 25 17 8 17 -8 Q0 -14 -17 -8 Z" fill="${nut}"/>`,
    shine,
    `<path d="M-19 -7 Q-19 -26 0 -26 Q19 -26 19 -7 Q0 -13 -19 -7 Z" fill="${cap}"/>`,
  ].join('');
}

function symbol(code: SuitDef['code'], mono?: string, detail?: string): string {
  switch (code) {
    case 'H': return heart(mono);
    case 'L': return leaf(mono, detail);
    case 'B': return bell(mono, detail);
    case 'A': return acorn(mono, detail);
  }
}

function placedSymbol(code: SuitDef['code'], x: number, y: number, scale: number, rotate = 0, mono?: string, detail?: string): string {
  const rot = rotate ? ` rotate(${rotate})` : '';
  return `<g transform="translate(${x} ${y}) scale(${scale})${rot}">${symbol(code, mono, detail)}</g>`;
}

// ── hodnoty ──────────────────────────────────────────────────────────────────
interface RankDef {
  code: '7' | '8' | '9' | 'T' | 'U' | 'O' | 'K' | 'D';
  labelCs: string; // rohový index (česky)
  labelEn: string; // rohový index (anglicky; Unter→J, Ober→Q)
  nameCs: string;
  nameEn: string;
}

const RANKS: RankDef[] = [
  { code: '7', labelCs: '7', labelEn: '7', nameCs: 'sedma', nameEn: 'seven' },
  { code: '8', labelCs: '8', labelEn: '8', nameCs: 'osma', nameEn: 'eight' },
  { code: '9', labelCs: '9', labelEn: '9', nameCs: 'devítka', nameEn: 'nine' },
  { code: 'T', labelCs: '10', labelEn: '10', nameCs: 'desítka', nameEn: 'ten' },
  { code: 'U', labelCs: 'S', labelEn: 'J', nameCs: 'spodek', nameEn: 'unter (jack)' },
  { code: 'O', labelCs: 'V', labelEn: 'Q', nameCs: 'svršek', nameEn: 'ober (queen)' },
  { code: 'K', labelCs: 'K', labelEn: 'K', nameCs: 'král', nameEn: 'king' },
  { code: 'D', labelCs: 'A', labelEn: 'A', nameCs: 'eso', nameEn: 'ace' },
];

const rankLabel = (r: RankDef) => (LANG === 'en' ? r.labelEn : r.labelCs);

// ── rohové indexy (jen číslo/písmeno, bez mini symbolu) ─────────────────────
function cornerIndex(suit: SuitDef, rank: RankDef): string {
  const label = rankLabel(rank);
  const fontSize = label.length > 1 ? 24 : 30;
  const one = `<text x="28" y="44" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${suit.index}">${label}</text>`;
  return `<g>${one}</g><g transform="rotate(180 ${CX} ${CY})">${one}</g>`;
}

// ── pipové karty (7–10) ──────────────────────────────────────────────────────
const COL_L = 76;
const COL_R = 164;
const ROWS3 = [100, 205, 310];
const ROWS4 = [100, 170, 240, 310];

function pipPositions(code: RankDef['code']): [number, number][] {
  const cols = (rows: number[]) => rows.flatMap((y): [number, number][] => [[COL_L, y], [COL_R, y]]);
  switch (code) {
    case '7': return [...cols(ROWS3), [CX, 152]];
    case '8': return [...cols(ROWS3), [CX, 152], [CX, 258]];
    case '9': return [...cols(ROWS4), [CX, CY]];
    case 'T': return [...cols(ROWS4), [CX, 135], [CX, 275]];
    default: return [];
  }
}

function pipBody(suit: SuitDef, rank: RankDef): string {
  return pipPositions(rank.code)
    .map(([x, y]) => placedSymbol(suit.code, x, y, PIP_SCALE, y > CY ? 180 : 0))
    .join('\n  ');
}

// ── figury (spodek / svršek / král) ─────────────────────────────────────────
// Symbolická zkratka: král = koruna + symbol na hrudi (větší hlava);
// svršek (Ober) = symbol NAD postavou + klobouk;
// spodek (Unter) = prostá silueta, symbol POD ní.
function figureBody(suit: SuitDef, rank: RankDef): string {
  const parts: string[] = [];

  // panel
  parts.push(
    `<rect x="36" y="70" width="168" height="270" rx="14" fill="${suit.color}" fill-opacity="0.06" stroke="${suit.color}" stroke-opacity="0.3"/>`,
  );

  // obsah panelu zvětšený kolem jeho středu
  parts.push(`<g transform="translate(${CX} ${CY}) scale(${FIGURE_SCALE}) translate(${-CX} ${-CY})">`);

  if (rank.code === 'K') {
    parts.push(`<circle cx="${CX}" cy="186" r="24" fill="${INK}"/>`);
    parts.push(
      `<path d="M76 322 C80 270 96 222 120 220 C144 222 160 270 164 322 Z" fill="${suit.color}"/>`,
    );
    parts.push(placedSymbol(suit.code, CX, 272, 0.6, 0, '#ffffff', suit.color));
    parts.push(
      `<path d="M94 170 L94 144 L107 156 L120 138 L133 156 L146 144 L146 170 Z" fill="#e8b100" stroke="#a87c00" stroke-width="2"/>`,
      `<circle cx="94" cy="142" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
      `<circle cx="120" cy="136" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
      `<circle cx="146" cy="142" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
    );
  } else if (rank.code === 'O') {
    parts.push(placedSymbol(suit.code, CX, 140, 0.66));
    parts.push(`<circle cx="${CX}" cy="212" r="21" fill="${INK}"/>`);
    parts.push(
      `<path d="M101 194 A19 15 0 0 1 139 194 Z" fill="${suit.color}"/>`,
      `<ellipse cx="120" cy="194" rx="30" ry="5.5" fill="${suit.color}"/>`,
    );
    parts.push(
      `<path d="M80 322 C84 276 96 242 120 240 C144 242 156 276 160 322 Z" fill="${suit.color}"/>`,
    );
  } else if (rank.code === 'U') {
    parts.push(`<circle cx="${CX}" cy="140" r="21" fill="${INK}"/>`);
    parts.push(
      `<path d="M80 246 C84 208 96 172 120 170 C144 172 156 208 160 246 Z" fill="${suit.color}"/>`,
    );
    parts.push(placedSymbol(suit.code, CX, 290, 0.66));
  }

  parts.push('</g>');

  return parts.join('\n  ');
}

// ── eso: jen velký symbol na bílé kartě ──────────────────────────────────────
function aceBody(suit: SuitDef): string {
  return placedSymbol(suit.code, CX, CY, ACE_SCALE);
}

// ── sestavení karty ──────────────────────────────────────────────────────────
const LICENSE_COMMENT = `<!-- Flek! tribute · moderní mariášová sada · MIT © 2026 Dušan Saiko · https://flek.saiko.cz -->`;

function cardSvg(suit: SuitDef, rank: RankDef): string {
  let body: string;
  if (rank.code === 'D') body = aceBody(suit);
  else if (rank.code === 'U' || rank.code === 'O' || rank.code === 'K') body = figureBody(suit, rank);
  else body = pipBody(suit, rank);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${LICENSE_COMMENT}
<title>${LANG === 'en' ? `${rank.nameEn} of ${suit.nameEn}` : `${rank.nameCs} ${suit.nameCs}`}</title>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#ffffff" stroke="#d9d9e0" stroke-width="2"/>
  ${cornerIndex(suit, rank)}
  ${body}
</svg>
`;
}

// ── rub: čisté zelené šrafování ──────────────────────────────────────────────
function backSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${LICENSE_COMMENT}
<title>${LANG === 'en' ? 'card back' : 'rub karty'}</title>
<defs>
  <pattern id="lattice" width="24" height="24" patternUnits="userSpaceOnUse">
    <path d="M0 12 L12 0 L24 12 L12 24 Z" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.6"/>
  </pattern>
  <clipPath id="face"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14"/></clipPath>
</defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#1e5c38" stroke="#d9d9e0" stroke-width="2"/>
<g clip-path="url(#face)"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="url(#lattice)"/></g>
<rect x="13" y="13" width="${W - 26}" height="${H - 26}" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>
</svg>
`;
}

// ── náhled ───────────────────────────────────────────────────────────────────
function previewHtml(): string {
  const order = ['H', 'L', 'B', 'A'] as const;
  const rows = order
    .map((s) => {
      const cells = RANKS.map(
        (r) => `<img src="${r.code}${s}.svg" alt="${r.code}${s}" width="120">`,
      ).join('');
      return `<div class="row">${cells}</div>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="cs">
<meta charset="utf-8">
<title>Flek! — ${LANG === 'en' ? 'modern deck EN (preview)' : 'moderní sada (náhled)'}</title>
<style>
  body { background: #20242b; margin: 24px; font-family: ${FONT}; }
  h1 { color: #e8e8ee; font-size: 18px; font-weight: 600; }
  .row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  img { border-radius: 7px; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
</style>
<h1>Flek! — ${LANG === 'en' ? 'modern deck (EN indices J Q K A)' : 'moderní mariášová sada'} · MIT © 2026 Dušan Saiko</h1>
${rows}
<div class="row"><img src="back.svg" alt="rub" width="120"></div>
</html>
`;
}

// ── zápis ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
let count = 0;
for (const suit of SUITS) {
  for (const rank of RANKS) {
    writeFileSync(join(OUT, `${rank.code}${suit.code}.svg`), cardSvg(suit, rank));
    count += 1;
  }
}
writeFileSync(join(OUT, 'back.svg'), backSvg());
writeFileSync(join(OUT, 'preview.html'), previewHtml());
console.log(`OK: ${count} karet + back.svg + preview.html → ${OUT}`);
