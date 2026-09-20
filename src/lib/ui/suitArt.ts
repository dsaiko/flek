/**
 * suitArt.ts — kresba čtyř barev (listy, kule, srdce, žaludy)
 *
 * Předloha: Claude Design, projekt „Návrh grafiky pro Marias", panel **3a
 * Klasické** („vychází z 2a, barvy a kontura podle tradičního vzoru"). Cesty
 * jsou převzaté ZNAKU PO ZNAKU, ať jde předloha kdykoli znovu porovnat; posouvá
 * se jen počátek, aby symbol seděl na (0,0) tak, jak ho kreslí zbytek kódu.
 *
 * Proč jeden modul: symbol se kreslí na dvou místech — na generované karty
 * (`scripts/gen-cards.ts`) a jako inline ikonka do popisků závazku
 * (`cardAssets.ts`). Do teď to byly dvě ručně udržované kopie a už se rozešly
 * (žilka listu měla v generátoru tři tahy, v ikonce jeden).
 *
 * Předloha je plnobarevná s černou konturou. Figurové karty a malé ikonky ale
 * potřebují plochou siluetu, takže `mono` varianty jsou z týchž obrysů
 * ODVOZENÉ — v panelu 3a nejsou.
 */

export type SuitCode = 'A' | 'B' | 'H' | 'L';

/** Barvy z panelu 3a — ať je jasné, odkud každý odstín je. */
export const SUIT_ART_COLORS = {
  leafBody: '#2d6b46',
  leafVein: '#1a4a2d',
  ballBody: '#c8302a',
  ballShade: '#8a1f1a',
  heartBody: '#c8302a',
  heartShade: '#8a1f1a',
  acornNut: '#a8321e',
  acornShade: '#6e1d12',
  acornCap: '#2f8a3a',
  gold: '#e1b600',
  ink: '#1c2127',
  cream: '#f6f0dc',
} as const;

const { ink, gold, cream } = SUIT_ART_COLORS;

/* Obrysy (silueta) — z nich se skládá i plochá `mono` varianta. */
const LEAF = 'M32 6c9 9 16 19 16 30 0 8-6 14-14 15v7h-4v-7C22 50 16 44 16 36 16 25 23 15 32 6z';
const LEAF_VEINS = 'M32 14v37M32 26l-7-6M32 36l8-7';
const BALL_BAND = 'M8.5 27h47c.4 1.6.5 3.3.5 5s-.1 3.4-.5 5h-47a24 24 0 0 1 0-10z';
const BALL_TEETH = 'M18 30h3v4h-3zM24 30h3v4h-3zM30.5 30h3v4h-3zM37 30h3v4h-3zM43 30h3v4h-3z';
const BALL_NUBS = 'M32 12c2 3 3 5 3 7s-1 3-3 3-3-1-3-3 1-4 3-7zM32 52c-2-3-3-5-3-7s1-3 3-3 3 1 3 3-1 4-3 7z';
const HEART = 'M32 57S7 41 7 24C7 15 13 9 21 9c5 0 9 3 11 7 2-4 6-7 11-7 8 0 14 6 14 15 0 17-25 33-25 33z';
const ACORN_NUT = 'M32 23c10 0 16 8 16 17 0 9-7 15-14 17l-2 3-2-3c-7-2-14-8-14-17 0-9 6-17 16-17z';
const ACORN_CAP = 'M17 27c0-8 6-14 15-14s15 6 15 14c0 2-1 3-3 3H20c-2 0-3-1-3-3z';
const ACORN_HATCH = 'M20 23h24M22 19h20M26 15.5h12M24 27v-4M32 27v-4M40 27v-4M28 23v-4M36 23v-4';

/** Plnobarevná předloha přesně tak, jak je v panelu 3a. */
const FULL: Record<SuitCode, string> = {
  L: [
    `<path fill="${SUIT_ART_COLORS.leafBody}" d="${LEAF}"/>`,
    `<path stroke="${SUIT_ART_COLORS.leafVein}" stroke-width="2" fill="none" d="${LEAF_VEINS}"/>`,
  ].join(''),
  B: [
    `<circle cx="32" cy="32" r="24" fill="${SUIT_ART_COLORS.ballBody}" stroke="${ink}" stroke-width="2"/>`,
    `<path fill="${SUIT_ART_COLORS.ballShade}" d="M32 8a24 24 0 0 1 0 48z" opacity=".5"/>`,
    `<path fill="${gold}" stroke="${ink}" stroke-width="1.5" d="${BALL_BAND}"/>`,
    `<path fill="${ink}" d="${BALL_TEETH}"/>`,
    `<path fill="${ink}" d="${BALL_NUBS}"/>`,
    `<path fill="${cream}" opacity=".6" d="M20 17a5 3 0 0 1 8-3c-3 0-6 1-8 3z"/>`,
  ].join(''),
  H: [
    `<path fill="${SUIT_ART_COLORS.heartBody}" stroke="${ink}" stroke-width="2" stroke-linejoin="round" d="${HEART}"/>`,
    `<path fill="${SUIT_ART_COLORS.heartShade}" d="M32 16c2-4 6-7 11-7 8 0 14 6 14 15 0 17-25 33-25 33z" opacity=".5"/>`,
    `<path fill="${cream}" opacity=".75" d="M14 22c0-5 3-8 7-9-2 3-3 6-3 9-1 2-3 2-4 0z"/>`,
  ].join(''),
  A: [
    `<path fill="${SUIT_ART_COLORS.acornNut}" stroke="${ink}" stroke-width="2" stroke-linejoin="round" d="${ACORN_NUT}"/>`,
    `<path fill="${SUIT_ART_COLORS.acornShade}" d="M32 23c10 0 16 8 16 17 0 9-7 15-14 17l-2 3V23z" opacity=".5"/>`,
    `<path fill="${SUIT_ART_COLORS.acornCap}" stroke="${ink}" stroke-width="2" stroke-linejoin="round" d="${ACORN_CAP}"/>`,
    `<path stroke="${ink}" stroke-width="1.5" fill="none" d="${ACORN_HATCH}"/>`,
    `<path fill="${gold}" stroke="${ink}" stroke-width="1.5" d="M30 5h4v9h-4z"/>`,
    `<path fill="${gold}" d="M28 34c-2 6 0 12 4 16-5-3-7-10-4-16z"/>`,
  ].join(''),
};

/**
 * Plochá silueta pro místa, kde plnobarevná kresba neobstojí: emblém na hrudi
 * figury (bílý na tmavém oděvu) a drobná ikonka v popisku závazku. Kontura ani
 * stínování se nekreslí — v malé velikosti by se slily do skvrny.
 */
function mono(code: SuitCode, fill: string, detail?: string): string {
  switch (code) {
    case 'L':
      return `<path fill="${fill}" d="${LEAF}"/>` +
        (detail ? `<path stroke="${detail}" stroke-width="2" fill="none" d="${LEAF_VEINS}"/>` : '');
    case 'B':
      return `<circle cx="32" cy="32" r="24" fill="${fill}"/>` +
        (detail
          ? `<path fill="${detail}" d="${BALL_BAND}"/><path fill="${fill}" d="${BALL_TEETH}"/>`
          : '') +
        `<path fill="${detail ?? fill}" d="${BALL_NUBS}"/>`;
    case 'H':
      return `<path fill="${fill}" d="${HEART}"/>`;
    case 'A':
      return `<path fill="${fill}" d="${ACORN_NUT}"/>` +
        `<path fill="${detail ?? fill}" d="${ACORN_CAP}"/>` +
        (detail ? `<path stroke="${fill}" stroke-width="1.5" fill="none" d="${ACORN_HATCH}"/>` : '');
  }
}

/**
 * Tělo symbolu vycentrované na (0,0). Předloha kreslí do čtverce 64×64 se
 * středem (32,32), takže se jen posune počátek — cesty zůstávají doslova takové,
 * jaké je navrhl panel 3a.
 */
export function suitArt(code: SuitCode, opts: { mono?: string; detail?: string } = {}): string {
  const body = opts.mono === undefined ? FULL[code] : mono(code, opts.mono, opts.detail);
  return `<g transform="translate(-32 -32)">${body}</g>`;
}

/** Rám, do kterého se `suitArt` vejde i se stínem kontury. */
export const SUIT_ART_VIEWBOX = '-32 -32 64 64';

/**
 * Identita barvy v UI: rohový index karty, oděv figur, tinty.
 *
 * ZÁMĚRNĚ to nejsou odstíny z `SUIT_ART_COLORS`. Je to identita barvy, ne barva
 * kresby. Panel 3a kreslí kuli jako ČERVENOU rouli se zlatým pásem a žalud jako
 * červený oříšek se zeleným kloboučkem — kdyby se podle těla obarvil i index,
 * měla by kule sedmu k nerozeznání od srdcové. A „červená" v mariáši
 * zdvojnásobuje sazby (čl. II/3), takže je to přesně ta dvojice, která se plést
 * nesmí. Kuli drží pohromadě zlatá ze pásu, žaludy hnědá; rozlišuje tedy tvar
 * A index. Kdo to chce přebarvit podle kresby, ať napřed vygeneruje 7B vedle 7H
 * a podívá se.
 */
export const SUIT_IDENT: Record<SuitCode, { color: string; index: string }> = {
  H: { color: '#c62828', index: '#c62828' },
  L: { color: '#2e7d32', index: '#2e7d32' },
  B: { color: '#c8890a', index: '#a06d00' },
  A: { color: '#7a4f2b', index: '#6d4c2b' },
};

/** Emblém na hrudi figury: bílá silueta na tmavém oděvu, detail v barvě suitu. */
export const FIGURE_EMBLEM = '#ffffff';
