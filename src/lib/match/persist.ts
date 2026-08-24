/**
 * persist.ts — autosave/resume zápasu (docs/marias-design.md §5.9)
 *
 * Celý GameState ve versované obálce { v, state }. Nevalidní/staré záznamy
 * se zahazují. localStorage chráněný try/catch (private mode, kvóty).
 */

import { assertValid } from '../rules/engine';
import type { GameState } from '../rules/types';

const KEY = 'flek.match.v1';
const VERSION = 1;

export function saveMatch(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, state }));
  } catch {
    /* kvóta/private mode — hra běží dál bez savu */
  }
}

const PHASE_NAMES = [
  'idle', 'choose-trump', 'bidding', 'discard-talon', 'declare',
  'takeover', 'fleks', 'tricks', 'scored',
];

const isSeat = (x: unknown): boolean => x === 0 || x === 1 || x === 2;
const isCardArray = (x: unknown): boolean =>
  Array.isArray(x) && x.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 31);
const isTriple = (x: unknown, item: (y: unknown) => boolean): boolean =>
  Array.isArray(x) && x.length === 3 && x.every(item);

/**
 * Kontrola obnoveného stavu — localStorage může obsahovat poškozený, starý
 * nebo cizí JSON a nevalidní stav by shodil celé UI. Kontroluje se KOMPLETNÍ
 * tvar stavu; semantiku (konzervace 32 karet, zero-sum konto, velikost talonu)
 * pak potvrdí `assertValid` z enginu.
 */
function looksLikeGameState(x: unknown): x is GameState {
  if (x === null || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const phase = s.phase as { name?: unknown } | null;
  const cfg = s.config as Record<string, unknown> | null;
  return (
    typeof cfg === 'object' && cfg !== null &&
    (cfg.variant === 'voleny' || cfg.variant === 'licitovany') &&
    typeof cfg.sazby === 'object' && cfg.sazby !== null &&
    isSeat(s.dealer) &&
    typeof s.seed === 'number' &&
    typeof s.handNo === 'number' &&
    isTriple(s.hands, isCardArray) &&
    isCardArray(s.unseen) &&
    isCardArray(s.talon) &&
    (s.talonOwner === null || isSeat(s.talonOwner)) &&
    isTriple(s.talonKnowledge, isCardArray) &&
    Array.isArray(s.history) && s.history.every((a) => typeof a === 'object' && a !== null && typeof (a as { type?: unknown }).type === 'string') &&
    Array.isArray(s.handResults) &&
    isTriple(s.ledger, (n) => typeof n === 'number' && Number.isFinite(n)) &&
    (s.contract === null || (typeof s.contract === 'object' && s.contract !== null)) &&
    typeof phase === 'object' && phase !== null &&
    typeof phase.name === 'string' && PHASE_NAMES.includes(phase.name)
  );
}

export function loadMatch(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown };
    if (parsed.v !== VERSION || !looksLikeGameState(parsed.state)) return null;
    assertValid(parsed.state); // semantická kontrola (karty, konto, talon)
    return parsed.state;
  } catch {
    return null;
  }
}

export function clearMatch(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
