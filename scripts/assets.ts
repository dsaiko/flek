/**
 * assets.ts — synchronizace karetních sad do public/cards/
 *
 * cards/modern-barevna, cards/modern-lidova (SVG) → public/cards/… (jen *.svg)
 * Historickou sadu (WebP) připravuje scripts/prep-history-cards.ts.
 * public/cards/ je generovaný adresář — není v gitu.
 *
 * public/icons/ — PNG ikony pro web spuštěný z plochy (manifest.json,
 * apple-touch-icon), vyrobené z public/favicon.svg. Taky generované, ne v gitu.
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SETS = ['modern-barevna', 'modern-lidova'];
// sady, které už neexistují (modern, modern-en/-de/-fr do 0.0.18): public/ není
// v gitu, takže by v něm zůstaly a `make deploy` by je dál nahrával na web
mkdirSync(join(ROOT, 'public', 'cards'), { recursive: true }); // čistý checkout ho ještě nemá
for (const dir of readdirSync(join(ROOT, 'public', 'cards'), { withFileTypes: true })) {
  if (dir.isDirectory() && dir.name.startsWith('modern') && !SETS.includes(dir.name)) {
    rmSync(join(ROOT, 'public', 'cards', dir.name), { recursive: true, force: true });
    console.log(`OK: public/cards/${dir.name} — stará sada smazána`);
  }
}
for (const set of SETS) {
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

/*
 * Ikony na plochu. Favicon má průhledné rohy (zaoblený rám), a iOS i Android
 * si ikonu zaoblí samy — průhledné rohy by zčernaly nebo zbělaly. Proto se
 * podkládá barvou rámu. Maskovatelná 512 je tatáž: karta leží uvnitř
 * bezpečné zóny (80 % středu), takže ji ořez do kruhu nepoškodí.
 */
{
  const out = join(ROOT, 'public', 'icons');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const svg = readFileSync(join(ROOT, 'public', 'favicon.svg'));
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    // favicon je 32 px při 72 dpi — hustota tak, aby vektor vyšel přesně na cílovou velikost
    await sharp(svg, { density: (72 * size) / 32 }).resize(size, size).flatten({ background: '#1c2127' }).png().toFile(join(out, name));
  }
  console.log('OK: ikony na plochu → public/icons (192, 512, apple-touch 180)');
}
