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

/**
 * Politika může mít apostrofy HTML-escapované (`&#39;self&#39;`). Pozor: to
 * escapování obsahuje `;`, takže se politika NESMÍ dělit na direktivy dřív,
 * než se odescapuje — jinak se `script-src` vůbec nenajde.
 */
const decodeQuotes = (policy: string): string => policy.replace(/&#(?:39|x27);/g, "'");

/** Má direktiva `script-src` ještě `'unsafe-inline'`? (kontrola hotového artefaktu) */
export function scriptSrcAllowsInline(html: string): boolean {
  for (const m of html.matchAll(/content=("|')([\s\S]*?)\1/g)) {
    const policy = decodeQuotes(m[2]);
    if (!policy.includes('script-src')) continue;
    const directive = decodeQuotes(policy).split(';').find((d) => d.trim().startsWith('script-src'));
    if (directive?.includes("'unsafe-inline'")) return true;
  }
  return false;
}

/** Obsahuje stránka vůbec politiku se `script-src`? (jinak regex minul) */
export function hasScriptPolicy(html: string): boolean {
  return [...html.matchAll(/content=("|')([\s\S]*?)\1/g)]
    .some((m) => decodeQuotes(m[2]).includes('script-src'));
}

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
  // atribut může být v obou druzích uvozovek; apostrofy v `'self'` může
  // generátor zapsat i jako &#39;
  return html.replace(
    /content=("|')([\s\S]*?)\1/g,
    (whole, quote: string, raw: string) => {
      // odescapuj → oprav → zapiš s obyčejnými apostrofy (v atributu v "" jsou platné)
      const policy = decodeQuotes(raw);
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
      return `content=${quote}${patched}${quote}`;
    },
  );
}

// ── CLI: přepiš všechny HTML soubory v dist/ ────────────────────────────────

const fail = (msg: string): never => {
  console.error(`CHYBA CSP: ${msg}`);
  process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
    });
  const files = walk(dist);
  if (files.length === 0) fail('v dist/ nejsou žádné HTML soubory — build neproběhl?');

  let withPolicy = 0;
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    if (!hasScriptPolicy(html)) {
      // stránka bez CSP je taky chyba: politika je v Layoutu, takže ji má mít každá
      fail(`${file}: nenašel jsem CSP se script-src (přesunula se? mění se escapování?)`);
    }
    withPolicy += 1;
    const next = withScriptHashes(html);
    if (next !== html) writeFileSync(file, next);

    /*
     * KLÍČOVÉ: neúspěch nesmí být tichý. Kdyby regex minul (jiné uvozovky,
     * minifikace, přesunutá meta), dřív se vypsalo „OK … v 0 souborech" a
     * `make all` zůstal zelený, přičemž do produkce šla politika, proti které
     * je celý krok filed (viz §20).
     */
    const out = readFileSync(file, 'utf8');
    if (scriptSrcAllowsInline(out)) {
      fail(`${file}: script-src má pořád 'unsafe-inline' — zpevnění CSP neproběhlo`);
    }
    const expected = inlineScriptHashes(out).length;
    const got = (out.match(/'sha256-/g) ?? []).length;
    if (got < expected) {
      fail(`${file}: inline skriptů ${expected}, hashů v politice ${got} — něco se nezahashovalo`);
    }
    console.log(`CSP hashe → ${file} (${expected} inline skriptů)`);
  }
  console.log(`OK: script-src bez 'unsafe-inline' v ${withPolicy} souboru/ech`);
}
