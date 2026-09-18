/**
 * release-notes.ts — vytáhne z CHANGELOG.md sekci jednoho vydání
 *
 * Poznámky k vydání píšeme ručně (seznam commitů je pro hráče k ničemu), takže
 * jediný zdroj pravdy je CHANGELOG.md. Tohle z něj vybere sekci `## <tag> — …`:
 * nadpis jde na `--title`, zbytek na `--notes-file`.
 *
 *   tsx scripts/release-notes.ts v0.0.3 [výstupní soubor]
 *
 * Vypíše na stdout NÁZEV vydání, tělo zapíše do souboru (default release-notes.md).
 * Když sekce chybí, skončí s kódem 2 — volající pak může sáhnout po
 * `gh release create --generate-notes`, ale bez tichého vydání prázdné verze.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const tag = process.argv[2];
const out = process.argv[3] ?? 'release-notes.md';
if (tag === undefined || tag.length === 0) {
  console.error('POUŽITÍ: tsx scripts/release-notes.ts <tag> [soubor]');
  process.exit(1);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
/*
 * Nadpis sekce je `## <tag>` samotný, nebo `## <tag> — název`. Hranice se hledá
 * na přesnou shodu tagu, ne na `startsWith`, aby `v0.1` nechytlo `v0.10`.
 */
const isHeading = (line: string): string | null => {
  const m = /^##\s+(\S+)(?:\s+[—–-]\s+(.*))?$/.exec(line.trimEnd());
  return m === null ? null : m[1];
};

const start = lines.findIndex((l) => isHeading(l) === tag);
if (start === -1) {
  console.error(`CHYBA: CHANGELOG.md nemá sekci pro ${tag} — doplň ji a tag posuň`);
  process.exit(2);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (isHeading(lines[i]) !== null) { end = i; break; }
}

const title = lines[start].replace(/^##\s+/, '').trim();
/*
 * Titulek teče do `gh release create --title` v release.yml. Tam je předaný
 * proměnnou prostředí, takže shell v něm nic nevidí — ale řídicí znak by se
 * do GITHUB_OUTPUT zapsal tiše a rozbil by řádek `title=…`. Radši hlasitě
 * spadnout na překlepu v nadpisu než vydat vydání s useknutým názvem.
 */
if ([...title].some((ch) => (ch.codePointAt(0) ?? 0) < 32 || ch.codePointAt(0) === 127)) {
  console.error(`CHYBA: nadpis sekce ${tag} obsahuje řídicí znaky`);
  process.exit(2);
}
const body = lines.slice(start + 1, end).join('\n').trim();
if (body.length === 0) {
  console.error(`CHYBA: sekce ${tag} v CHANGELOG.md je prázdná`);
  process.exit(2);
}

writeFileSync(out, `${body}\n`);
console.log(title);
