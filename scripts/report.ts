/**
 * report.ts — záznam z hlášení chyby zpátky na sav (§51)
 *
 * Použití:  pbpaste | npx tsx scripts/report.ts      (celý text e-mailu ze schránky)
 *           npx tsx scripts/report.ts FLEK1:…        (jen samotný záznam)
 *
 * Celý e-mail jde VÝHRADNĚ přes stdin: jeho text píše tester, a kdyby se
 * vkládal do příkazové řádky (třeba v apostrofech), popis s `'; příkaz; #`
 * by shell spustil dřív, než se sem vůbec dostane. Argument proto smí být
 * jen samotný záznam ve tvaru base64url, nic jiného se nepřijme.
 *
 * Vypíše shrnutí a sav; ten se vloží v prohlížeči do localStorage pod klíč
 * `flek.match.v1` (a ve flek.settings.v1 nastaví tutéž variantu) a po obnovení
 * stránky hra naváže přesně tam, kde byl tester.
 */

import { readFileSync } from 'node:fs';
import { decodeReport } from '../src/lib/match/report';

const arg = process.argv[2];
let input: string;
if (arg !== undefined) {
  if (process.argv.length > 3 || !/^FLEK1:[A-Za-z0-9_-]+$/.test(arg)) {
    console.error('Argument smí být jen záznam FLEK1:… — celý e-mail pošli přes stdin: pbpaste | npx tsx scripts/report.ts');
    process.exit(1);
  }
  input = arg;
} else {
  input = readFileSync(0, 'utf8');
}
if (!input.includes('FLEK1:')) {
  console.error('Na vstupu není záznam FLEK1:… (pbpaste | npx tsx scripts/report.ts)');
  process.exit(1);
}
const save = await decodeReport(input);
const s = save.state;
console.error(`varianta ${s.config.variant} · fáze ${s.phase.name} · hra č. ${s.handNo} · ${s.history.length} akcí od rozdání`);
console.log(JSON.stringify(save));
