/**
 * csp.ts — po buildu vymění ve CSP `'unsafe-inline'` za hashe inline skriptů
 *
 * Proč post-build: naše dvě inline `<script is:inline>` musí běžet PŘED
 * vykreslením (nastavení jazyka), takže z nich nesmí být odložený modul —
 * a Astro `is:inline` bloky nehashuje. S `'unsafe-inline'` je přitom
 * `script-src` proti injektáži úplně bezzubá (viz §19, i11): jediné
 * zapomenuté `esc()` nad obnoveným savem by znamenalo spuštění skriptu.
 *
 * Jádro (`withScriptHashes`) je čistá funkce, aby šla testovat bez buildu.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (body: string): string =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

/** Hashe všech inline `<script>` bloků ve stránce (v pořadí výskytu, bez duplikátů). */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const hash = sha256(m[1]);
    if (!out.includes(hash)) out.push(hash);
  }
  return out;
}

/**
 * Nahradí `'unsafe-inline'` v `script-src` hashi inline skriptů stránky.
 * Ostatní direktivy (a `style-src`, kde inline styly zůstávají) nechává být.
 */
export function withScriptHashes(html: string): string {
  const hashes = inlineScriptHashes(html);
  return html.replace(
    /(content=")([^"]*?)(")/g,
    (whole, open: string, policy: string, close: string) => {
      if (!policy.includes('script-src')) return whole;
      const patched = policy
        .split(';')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed.startsWith('script-src')) return part;
          // odfiltruj i hashe z dřívějšího běhu — krok musí být idempotentní
          const sources = trimmed
            .split(/\s+/)
            .filter((x) => x !== "'unsafe-inline'" && !/^'sha(256|384|512)-/.test(x));
          return ` ${[...sources, ...hashes].join(' ')}`;
        })
        .join(';');
      return `${open}${patched}${close}`;
    },
  );
}

// ── CLI: přepiš všechny HTML soubory v dist/ ────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
    });
  let patched = 0;
  for (const file of walk(dist)) {
    const html = readFileSync(file, 'utf8');
    const next = withScriptHashes(html);
    if (next !== html) {
      writeFileSync(file, next);
      patched += 1;
      console.log(`CSP hashe → ${file} (${inlineScriptHashes(html).length} inline skriptů)`);
    }
  }
  console.log(`OK: CSP bez 'unsafe-inline' v ${patched} souboru/ech`);
}
