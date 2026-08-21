/**
 * assets.ts — synchronizace karetních sad do public/cards/
 *
 * cards/modern, cards/modern-en (SVG) → public/cards/… (jen *.svg)
 * Historickou sadu (WebP) připravuje scripts/prep-history-cards.ts.
 * public/cards/ je generovaný adresář — není v gitu.
 */

import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const set of ['modern', 'modern-en', 'modern-de']) {
  const src = join(ROOT, 'cards', set);
  const out = join(ROOT, 'public', 'cards', set);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const f of readdirSync(src)) {
    if (f.endsWith('.svg')) {
      cpSync(join(src, f), join(out, f));
      n += 1;
    }
  }
  console.log(`OK: ${set} — ${n} SVG → public/cards/${set}`);
}
