/**
 * report.ts — záznam z hlášení chyby zpátky na sav (§51)
 *
 * Použití: npx tsx scripts/report.ts 'FLEK1:…'   (nebo celý text e-mailu)
 * Vypíše shrnutí a sav; ten se vloží v prohlížeči do localStorage pod klíč
 * `flek.match.v1` (a ve flek.settings.v1 nastaví tutéž variantu) a po obnovení
 * stránky hra naváže přesně tam, kde byl tester.
 */

import { decodeReport } from '../src/lib/match/report';

const input = process.argv.slice(2).join(' ');
if (!input.includes('FLEK1:')) {
  console.error('Použití: npx tsx scripts/report.ts \'FLEK1:…\'');
  process.exit(1);
}
const save = await decodeReport(input);
const s = save.state;
console.error(`varianta ${s.config.variant} · fáze ${s.phase.name} · hra č. ${s.handNo} · ${s.history.length} akcí od rozdání`);
console.log(JSON.stringify(save));
