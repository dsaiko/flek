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
 *           npx tsx scripts/gen-cards.ts de     → cards/modern-de/ (německé indexy U O K A)
 * Licence: MIT © 2026 Dušan Saiko
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suitArt } from '../src/lib/ui/suitArt';

const LANG: 'cs' | 'en' | 'de' | 'fr' =
  process.argv[2] === 'en' ? 'en' : process.argv[2] === 'de' ? 'de' : process.argv[2] === 'fr' ? 'fr' : 'cs';
const OUT = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'cards',
  LANG === 'en' ? 'modern-en' : LANG === 'de' ? 'modern-de' : LANG === 'fr' ? 'modern-fr' : 'modern',
);

// ── geometrie karty ──────────────────────────────────────────────────────────
// tradiční mariášový formát 62×106 mm
const W = 240;
const H = 410;
const CX = W / 2; // 120
const CY = H / 2; // 205

/*
 * Kresba z panelu „3a Klasické" je v rámu 64×64, ale sama zabírá jen ~50 jednotek
 * na výšku — starší symboly měly ~66. Měřítka jsou proto o třetinu vyšší, aby
 * pip na kartě vyšel stejně velký jako dřív (0.74×66 ≈ 0.98×50).
 */
const PIP_SCALE = 0.98;
const ACE_SCALE = 3.7;
const FIGURE_SCALE = 1.12; // zvětšení postaviček uvnitř panelu

const FONT = `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const INK = '#2f2f3a'; // silueta figur

// ── barvy (suity) ────────────────────────────────────────────────────────────
interface SuitDef {
  code: 'A' | 'B' | 'H' | 'L';
  nameCs: string;
  nameEn: string;
  nameDe: string;
  nameFr: string;
  color: string;   // hlavní barva (indexy, oděv figur, tinty)
  index: string;   // barva textu indexu (tmavší kvůli čitelnosti)
}

/*
 * `color`/`index` ZÁMĚRNĚ nekopírují odstíny z `SUIT_ART_COLORS`.
 *
 * Je to identita barvy, ne barva kresby. Panel 3a kreslí kuli jako ČERVENOU
 * rouli se zlatým pásem a žalud jako červený oříšek se zeleným kloboučkem.
 * Kdyby se podle těla obarvil i index, měla by kule červenou sedmu úplně
 * stejně jako srdce — a „červená" v mariáši zdvojnásobuje sazby (čl. II/3),
 * takže je to přesně ta dvojice, která se plést nesmí. Kuli drží pohromadě
 * zlatá ze pásu, žaludy hnědá. Rozlišuje tedy tvar A index; kdo to přebarví
 * podle kresby, ať napřed vygeneruje 7B vedle 7H a podívá se.
 */

const SUITS: SuitDef[] = [
  { code: 'H', nameCs: 'červené', nameEn: 'hearts', nameDe: 'Herz', nameFr: 'cœur', color: '#c62828', index: '#c62828' },
  { code: 'L', nameCs: 'zelené', nameEn: 'leaves', nameDe: 'Grün', nameFr: 'feuille', color: '#2e7d32', index: '#2e7d32' },
  { code: 'B', nameCs: 'kule', nameEn: 'bells', nameDe: 'Schellen', nameFr: 'grelot', color: '#c8890a', index: '#a06d00' },
  { code: 'A', nameCs: 'žaludy', nameEn: 'acorns', nameDe: 'Eichel', nameFr: 'gland', color: '#7a4f2b', index: '#6d4c2b' },
];

// ── symboly barev ────────────────────────────────────────────────────────────
// Kresba je v `src/lib/ui/suitArt.ts` (předloha: Claude Design, panel „3a
// Klasické"). Sdílí ji generátor i inline ikonky v UI — dřív to byly dvě ručně
// udržované kopie a rozešly se.

function symbol(code: SuitDef['code'], mono?: string, detail?: string): string {
  return suitArt(code, mono === undefined ? {} : { mono, detail });
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
  labelDe: string; // rohový index (německy; Unter→U, Ober→O, Ass→A)
  labelFr: string; // rohový index (francouzsky; Valet→V, Dame→D, Roi→R, As→A)
  nameCs: string;
  nameEn: string;
  nameDe: string;
  nameFr: string;
}

const RANKS: RankDef[] = [
  { code: '7', labelCs: '7', labelEn: '7', labelDe: '7', labelFr: '7', nameCs: 'sedma', nameEn: 'seven', nameDe: 'Sieben', nameFr: 'sept' },
  { code: '8', labelCs: '8', labelEn: '8', labelDe: '8', labelFr: '8', nameCs: 'osma', nameEn: 'eight', nameDe: 'Acht', nameFr: 'huit' },
  { code: '9', labelCs: '9', labelEn: '9', labelDe: '9', labelFr: '9', nameCs: 'devítka', nameEn: 'nine', nameDe: 'Neun', nameFr: 'neuf' },
  { code: 'T', labelCs: '10', labelEn: '10', labelDe: '10', labelFr: '10', nameCs: 'desítka', nameEn: 'ten', nameDe: 'Zehn', nameFr: 'dix' },
  { code: 'U', labelCs: 'S', labelEn: 'J', labelDe: 'U', labelFr: 'V', nameCs: 'spodek', nameEn: 'unter (jack)', nameDe: 'Unter', nameFr: 'valet' },
  { code: 'O', labelCs: 'V', labelEn: 'Q', labelDe: 'O', labelFr: 'D', nameCs: 'svršek', nameEn: 'ober (queen)', nameDe: 'Ober', nameFr: 'dame' },
  { code: 'K', labelCs: 'K', labelEn: 'K', labelDe: 'K', labelFr: 'R', nameCs: 'král', nameEn: 'king', nameDe: 'König', nameFr: 'roi' },
  { code: 'D', labelCs: 'A', labelEn: 'A', labelDe: 'A', labelFr: 'A', nameCs: 'eso', nameEn: 'ace', nameDe: 'Ass', nameFr: 'as' },
];

const rankLabel = (r: RankDef) =>
  LANG === 'en' ? r.labelEn : LANG === 'de' ? r.labelDe : LANG === 'fr' ? r.labelFr : r.labelCs;

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
    parts.push(placedSymbol(suit.code, CX, 272, 0.78, 0, '#ffffff', suit.color));
    parts.push(
      `<path d="M94 170 L94 144 L107 156 L120 138 L133 156 L146 144 L146 170 Z" fill="#e8b100" stroke="#a87c00" stroke-width="2"/>`,
      `<circle cx="94" cy="142" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
      `<circle cx="120" cy="136" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
      `<circle cx="146" cy="142" r="3.4" fill="#e8b100" stroke="#a87c00" stroke-width="1.6"/>`,
    );
  } else if (rank.code === 'O') {
    parts.push(placedSymbol(suit.code, CX, 140, 0.86));
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
    parts.push(placedSymbol(suit.code, CX, 290, 0.86));
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
<title>${cardTitle(suit, rank)}</title>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#ffffff" stroke="#d9d9e0" stroke-width="2"/>
  ${cornerIndex(suit, rank)}
  ${body}
</svg>
`;
}

// ── rub: čisté zelené šrafování ──────────────────────────────────────────────
/** Popisek karty v jazyce sady — francouzská sada nesmí mít české <title>. */
function cardTitle(suit: SuitDef, rank: RankDef): string {
  if (LANG === 'en') return `${rank.nameEn} of ${suit.nameEn}`;
  if (LANG === 'de') return `${suit.nameDe} ${rank.nameDe}`;
  if (LANG === 'fr') return `${rank.nameFr} de ${suit.nameFr}`;
  return `${rank.nameCs} ${suit.nameCs}`;
}

function backSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${LICENSE_COMMENT}
<title>${LANG === 'en' ? 'card back' : LANG === 'de' ? 'Kartenrücken' : 'rub karty'}</title>
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
