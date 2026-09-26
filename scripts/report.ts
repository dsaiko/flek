/**
 * report.ts — záznam z hlášení chyby zpátky na sav (§51)
 *
 * Použití:  pbpaste | npx tsx scripts/report.ts      (celý text e-mailu ze schránky)
 *           npx tsx scripts/report.ts hlaseni.txt    (e-mail uložený do souboru)
 *
 * Text e-mailu jde přes stdin nebo soubor, NIKDY jako argument: píše ho
 * tester, a kdyby se vkládal do příkazové řádky (třeba v apostrofech), popis
 * s `'; příkaz; #` by shell spustil dřív, než se sem vůbec dostane.
 *
 * Záznam (JSON se seznamem tahů) se přehraje enginem od rozdání; vypíše se
 * shrnutí a sav. Sav se vloží v prohlížeči do localStorage pod klíč
 * `flek.match.v1` (a ve flek.settings.v1 nastaví tutéž variantu) a po obnovení
 * stránky hra naváže přesně tam, kde byl tester.
 */

import { existsSync, readFileSync } from 'node:fs';
import { decodeReport } from '../src/lib/match/report';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !existsSync(args[0]))) {
  console.error('Text e-mailu pošli přes stdin (pbpaste | npx tsx scripts/report.ts) nebo jako cestu k souboru — ne jako argument.');
  process.exit(1);
}
const input = readFileSync(args.length === 1 ? args[0] : 0, 'utf8');
try {
  const save = decodeReport(input);
  const s = save.state;
  console.error(`varianta ${s.config.variant} · fáze ${s.phase.name} · hra č. ${s.handNo} · ${s.history.length} tahů od rozdání`);
  console.log(JSON.stringify(save));
} catch (e) {
  console.error(`Záznam nejde přehrát: ${(e as Error).message}`);
  process.exit(1);
}
