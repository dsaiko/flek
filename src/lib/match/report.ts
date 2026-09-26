/**
 * report.ts — záznam rozehrané hry do hlášení chyby (§51)
 *
 * Tester popíše, co se stalo, a hra k tomu přidá záznam, ze kterého jde
 * situace zopakovat přesně — bez „nevím, co jsem mačkal". Záznam je sav
 * (`{ v, state }`, týž tvar jako v localStorage) s historií oříznutou na
 * aktuální hru, zkomprimovaný (deflate) a zakódovaný do base64url, aby se
 * vešel do odkazu `mailto:`. Jména hráčů ani nic jiného v něm nejsou —
 * `GameState` je nenese.
 *
 * Zpátky: `npx tsx scripts/report.ts '<FLEK1:…>'` vypíše sav k vložení do
 * localStorage (klíč `flek.match.v1`).
 */

import type { GameState } from '../rules/types';
import { VERSION, validateSave } from './persist';

export const REPORT_PREFIX = 'FLEK1:';

/** Historie jen od posledního rozdání — předchozí hry k zopakování chyby netřeba. */
export function trimToHand(state: GameState): GameState {
  let start = 0;
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    if (state.history[i].type === 'deal') { start = i; break; }
  }
  return { ...state, history: state.history.slice(start) };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};

/** Stav → `FLEK1:…` (deflate + base64url). */
export async function encodeReport(state: GameState): Promise<string> {
  const json = JSON.stringify({ v: VERSION, state: trimToHand(state) });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return REPORT_PREFIX + toBase64Url(packed);
}

/**
 * `FLEK1:…` → sav. Záznam musí projít týmiž kontrolami jako načtení hry
 * (`validateSave`); co by hra sama nepřijala, se odmítne.
 */
export async function decodeReport(blob: string): Promise<{ v: number; state: GameState }> {
  const at = blob.indexOf(REPORT_PREFIX);
  if (at < 0) throw new Error('záznam nezačíná FLEK1:');
  const body = blob.slice(at + REPORT_PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0] ?? '';
  const json = new TextDecoder().decode(await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw')));
  const parsed = JSON.parse(json) as { v: number; state: unknown };
  const state = validateSave(parsed);
  if (state === null) throw new Error('záznam neprošel kontrolou savu');
  return { v: parsed.v, state };
}

export interface ReportInfo {
  appVersion: string;
  when: string;
  userAgent: string;
  viewport: string;
  flags: string;
  lang: string;
  variant: string;
  pattern: string;
  difficulty: string;
  phase: string;
  handNo: number;
  record: string;
}

/**
 * Tělo e-mailu: popis od hráče a pod čarou údaje pro zopakování. Čistá
 * funkce (bez DOM), ať jde otestovat, co přesně odchází — hlavně že v tom
 * není jméno hráče ani nic, co by hráč nečekal.
 */
export function reportBody(description: string, i: ReportInfo): string {
  return [
    description.trim() || '(bez popisu)',
    '',
    '--- údaje pro zopakování, prosím neupravovat ---',
    `Flek! ${i.appVersion} · ${i.when}`,
    `Zařízení: ${i.userAgent}`,
    `Okno: ${i.viewport} · ${i.flags}`,
    `Jazyk: ${i.lang} · varianta: ${i.variant} · karty: ${i.pattern} · IQ: ${i.difficulty}`,
    `Stav: ${i.phase} · hra č. ${i.handNo}`,
    `Záznam: ${i.record}`,
  ].join('\n');
}

export const REPORT_ADDRESS = 'flek@saiko.cz';

export function reportMailto(subject: string, body: string): string {
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
