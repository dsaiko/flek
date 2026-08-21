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
const WEBP_QUALITY = 82;

async function processCard(file: string): Promise<{ file: string; w: number; h: number; kb: number }> {
  const srcPath = join(SRC, file);

  // 1) ořez pozadí skeneru (světle šedá plocha kolem karty)
  const trimmed = await sharp(srcPath)
    .trim({ threshold: 35 }) // tolerantní práh — hrany karet jsou nerovné
    .toBuffer();

  // 2) sjednocení výšky
  const resized = sharp(trimmed).resize({ height: TARGET_HEIGHT });
  const meta = await resized.toBuffer({ resolveWithObject: true });
  const { width = 0, height = 0 } = meta.info;

  // 3) zaoblené rohy přes SVG masku
  const r = Math.round(width * CORNER_RADIUS_PCT);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}"/></svg>`,
  );

  const out = join(OUT, file.replace(/\.png$/i, '.webp'));
  const result = await sharp(meta.data)
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: WEBP_QUALITY })
    .toFile(out);

  return { file, w: result.width, h: result.height, kb: Math.round(statSync(out).size / 1024) };
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
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
