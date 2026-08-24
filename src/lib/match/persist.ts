/**
 * persist.ts — autosave/resume zápasu (docs/marias-design.md §5.9)
 *
 * Celý GameState ve versované obálce { v, state }. Nevalidní/staré záznamy
 * se zahazují. localStorage chráněný try/catch (private mode, kvóty).
 */

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

/**
 * Hrubá strukturální kontrola obnoveného stavu — localStorage může obsahovat
 * poškozený nebo cizí JSON a nevalidní stav by shodil celé UI.
 */
function looksLikeGameState(x: unknown): x is GameState {
  if (x === null || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const hands = s.hands as unknown;
  const ledger = s.ledger as unknown;
  const phase = s.phase as { name?: unknown } | null;
  return (
    typeof s.config === 'object' && s.config !== null &&
    typeof s.dealer === 'number' && s.dealer >= 0 && s.dealer <= 2 &&
    Array.isArray(hands) && hands.length === 3 && hands.every((h) => Array.isArray(h)) &&
    Array.isArray(ledger) && ledger.length === 3 && ledger.every((n) => typeof n === 'number') &&
    Array.isArray(s.history) && Array.isArray(s.handResults) &&
    Array.isArray(s.talon) && Array.isArray(s.talonKnowledge) &&
    typeof phase === 'object' && phase !== null && typeof phase.name === 'string'
  );
}

export function loadMatch(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown };
    if (parsed.v !== VERSION || !looksLikeGameState(parsed.state)) return null;
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
