/**
 * prep-history-cards.ts — příprava webových odvozenin historické sady karet
 *
 * Vstup:  cards/history/<RANK><SUIT>.png  (originální PD skeny, plná velikost)
 * Výstup: public/cards/history/<RANK><SUIT>.webp
 *
 * Kroky: ořez pozadí skeneru → sjednocení výšky → zaoblené rohy (průhlednost) → WebP.
 *
 * Spuštění: npx tsx scripts/prep-history-cards.ts
 * Licence: MIT © 2026 Dušan Saiko (skeny samotné jsou public domain, viz cards/history/README.md)
 */

import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cards', 'history');
const OUT = join(ROOT, 'public', 'cards', 'history');

const TARGET_HEIGHT = 720; // dost pro HiDPI zobrazení karty ~180 px na výšku
const CORNER_RADIUS_PCT = 0.045; // poměr rádiusu rohu k šířce karty
const INSET_PCT = 0.01; // jemný vnitřní ořez — nechá přirozený okraj papíru
const WEBP_QUALITY = 82;

async function processCard(file: string): Promise<{ file: string; w: number; h: number; kb: number }> {
  const srcPath = join(SRC, file);

  // 1) ořez pozadí skeneru (světle šedá plocha kolem karty)
  const trimmed = await sharp(srcPath)
    .trim({ threshold: 35 }) // tolerantní práh — hrany karet jsou nerovné
    .toBuffer();

  // 2) dodatečný vnitřní ořez (bílé hrany karty na skenu) + sjednocení výšky
  const t = await sharp(trimmed).metadata();
  const ix = Math.round((t.width ?? 0) * INSET_PCT);
  const iy = Math.round((t.height ?? 0) * INSET_PCT);
  const resized = sharp(trimmed)
    .extract({ left: ix, top: iy, width: (t.width ?? 0) - 2 * ix, height: (t.height ?? 0) - 2 * iy })
    .resize({ height: TARGET_HEIGHT });
  const meta = await resized.toBuffer({ resolveWithObject: true });
  const { width = 0, height = 0 } = meta.info;

  // 3) zaoblené rohy přes SVG masku + jemný stín hrany (zatónuje zbytky bílého okraje
  //    skenu do přirozeného vzhledu hrany karty)
  const r = Math.round(width * CORNER_RADIUS_PCT);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}"/></svg>`,
  );
  const edgeShade = Buffer.from(
    `<svg width="${width}" height="${height}">
       <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${r}" ry="${r}"
             fill="none" stroke="rgba(74,58,40,0.38)" stroke-width="2.5"/>
       <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="${Math.max(2, r - 3)}" ry="${Math.max(2, r - 3)}"
             fill="none" stroke="rgba(74,58,40,0.16)" stroke-width="5"/>
     </svg>`,
  );

  const out = join(OUT, file.replace(/\.png$/i, '.webp'));
  const result = await sharp(meta.data)
    // skeny jsou samy o sobě tmavé — projasnit pro obrazovku
    .modulate({ brightness: 1.14, saturation: 1.06 })
    .composite([
      { input: edgeShade, blend: 'multiply' },
      { input: mask, blend: 'dest-in' },
    ])
    .webp({ quality: WEBP_QUALITY })
    .toFile(out);

  return { file, w: result.width, h: result.height, kb: Math.round(statSync(out).size / 1024) };
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();

// rychlá cesta: už vygenerováno (přegenerování vynutí `--force`)
const existing = readdirSync(OUT).filter((f) => /\.webp$/i.test(f));
if (existing.length === files.length && !process.argv.includes('--force')) {
  console.log(`OK: ${existing.length} karet už existuje v ${OUT} (přegenerování: --force)`);
  process.exit(0);
}
if (files.length !== 32) {
  console.warn(`Pozor: očekáváno 32 karet, nalezeno ${files.length}`);
}

const results = await Promise.all(files.map(processCard));
let total = 0;
for (const r of results) {
  total += r.kb;
  console.log(`${r.file.padEnd(8)} ${String(r.w).padStart(4)}×${r.h}  ${String(r.kb).padStart(4)} kB`);
}
console.log(`OK: ${results.length} karet → ${OUT} (celkem ${Math.round(total / 102.4) / 10} MB)`);
