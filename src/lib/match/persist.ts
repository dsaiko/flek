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

const CONTRACT_PHASES = ['fleks', 'tricks'];

const isSeat = (x: unknown): boolean => x === 0 || x === 1 || x === 2;
const isNum = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): boolean => typeof x === 'string';
const isCardArray = (x: unknown): boolean =>
  Array.isArray(x) && x.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 31);
const isTriple = (x: unknown, item: (y: unknown) => boolean): boolean =>
  Array.isArray(x) && x.length === 3 && x.every(item);
/**
 * Sazebník: chybějící sazba dá při zúčtování `NaN` a konto se rozsype, takže
 * nestačí „nějaký objekt".
 */
function isSazby(x: unknown): boolean {
  if (!isRecord(x)) return false;
  const z = x as Record<string, unknown>;
  const numbers = ['hra', 'sedma', 'tichaSedma', 'kilo', 'ticheKilo', 'betl', 'durch', 'dveSedmy',
    'cervenyMultiplier', 'maxFlekLevel'];
  return numbers.every((k) => isNum(z[k])) && (z.kiloScaling === 'double' || z.kiloScaling === 'linear');
}

/** Pozor: `typeof null === 'object'` — mapy fleků se z nich indexují. */
const isRecord = (x: unknown): boolean => x !== null && typeof x === 'object' && !Array.isArray(x);
const inRange = (x: unknown, lo: number, hi: number): boolean =>
  typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
const isCard = (x: unknown): boolean => inRange(x, 0, 31);
/** Jedna zahraná karta ve štychu — `card` MUSÍ být číslo, jinak z ní `suitOf` udělá kartu 0. */
const isPlay = (x: unknown): boolean =>
  isRecord(x) && isSeat((x as Record<string, unknown>).seat) && isCard((x as Record<string, unknown>).card);
const isPlayArray = (x: unknown): boolean => Array.isArray(x) && x.every(isPlay);
/** Dohraný štych: `{ plays, winner }` (Phase.tricks.played), NE pole karet. */
const isTrickResult = (x: unknown): boolean => {
  if (!isRecord(x)) return false;
  const t = x as Record<string, unknown>;
  return isPlayArray(t.plays) && (t.plays as unknown[]).length === 3 && isSeat(t.winner);
};

/** Payload fáze musí odpovídat jejímu jménu — UI na něj sahá bez dalších kontrol. */
function isValidPhase(p: Record<string, unknown>): boolean {
  const standingOk = (x: unknown): boolean => {
    if (!isRecord(x)) return false;
    const st = x as Record<string, unknown>;
    return isSeat(st.declarer) && (st.mode === null || isStr(st.mode)) &&
      (st.trump === null || isNum(st.trump)) && (st.bid === null || isRecord(st.bid));
  };
  switch (p.name) {
    case 'idle':
    case 'choose-trump':
      return true;
    case 'bidding':
      return Array.isArray(p.bids) && isSeat(p.toAct) && (p.best === null || isRecord(p.best));
    case 'discard-talon':
    case 'declare':
      return standingOk(p.standing);
    case 'takeover':
      return standingOk(p.standing) && isSeat(p.toAct) && Array.isArray(p.passed);
    case 'fleks': {
      if (!isRecord(p.fleks)) return false;
      const f = p.fleks as Record<string, unknown>;
      // levels jdou do 2**level v scoringu, lastRaiser do porovnání stran
      return isRecord(f.levels) && Object.values(f.levels as object).every((l) => inRange(l, 0, 16)) &&
        isRecord(f.lastRaiser) && Object.values(f.lastRaiser as object).every(isSeat) &&
        isSeat(f.toAct) && Array.isArray(f.passed) && (f.passed as unknown[]).every(isSeat);
    }
    case 'tricks':
      return isNum(p.trickNo) && isSeat(p.leader) && isSeat(p.toAct) &&
        isPlayArray(p.trick) &&
        // POZOR: `played` jsou DOHRANÉ ŠTYCHY { plays, winner }, ne karty
        Array.isArray(p.played) && p.played.every(isTrickResult) &&
        Array.isArray(p.marriages) && p.marriages.every(
          (m) => isRecord(m) && isSeat((m as Record<string, unknown>).seat) &&
            inRange((m as Record<string, unknown>).suit, 0, 3),
        ) &&
        isTriple(p.won, (w) => isCardArray(w));
    case 'scored':
      return isHandResult(p.result);
    default:
      return false;
  }
}

/**
 * Akce v historii — UI z nich staví hlášky (`renderMelds` indexuje `bySeat[a.seat]`)
 * a AI z nich odvozuje omezení, takže nestačí „objekt s type: string".
 */
function isHistoryAction(x: unknown): boolean {
  if (!isRecord(x)) return false;
  const a = x as Record<string, unknown>;
  if (!isStr(a.type)) return false;
  // `deal` je jediná akce bez sedadla
  if (a.type === 'deal') return isNum(a.seed);
  if (!isSeat(a.seat)) return false;
  switch (a.type) {
    case 'choose-trump':
      return a.card === 'from-people' || isCard(a.card);
    case 'bid':
      return a.bid === 'pass' || isRecord(a.bid);
    case 'discard':
      return Array.isArray(a.cards) && a.cards.length === 2 && a.cards.every(isCard);
    case 'declare':
      return (a.mode === 'hra' || a.mode === 'betl' || a.mode === 'durch') &&
        typeof a.sedma === 'boolean' && typeof a.kilo === 'boolean';
    case 'takeover':
      return a.claim === 'betl' || a.claim === 'durch' || a.claim === 'good';
    case 'flek':
      return isStr(a.target);
    case 'play':
      return isCard(a.card) && typeof a.announceMarriage === 'boolean';
    case 'announce-proti':
      return typeof a.sedma === 'boolean' && typeof a.kilo === 'boolean';
    case 'good':
      return true;
    default:
      return false;
  }
}

/** Kontrakt řídí pravidla i zúčtování — musí být kompletní a v rozsahu. */
function isContract(x: unknown): boolean {
  if (x === null || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  return (
    (c.mode === 'hra' || c.mode === 'betl' || c.mode === 'durch') &&
    (c.trump === null || (isNum(c.trump) && (c.trump as number) >= 0 && (c.trump as number) <= 3)) &&
    isSeat(c.declarer) &&
    (c.sedma === null || isSeat(c.sedma)) &&
    (c.kilo === null || isSeat(c.kilo)) &&
    typeof c.dveSedmy === 'boolean'
  );
}

/**
 * Výsledek hry se vykresluje do zúčtování (včetně poznámek) — musí být
 * strukturálně v pořádku, jinak by podvržený sav dostal libovolný obsah do UI.
 */
function isHandResult(x: unknown): boolean {
  if (x === null || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  const side = (y: unknown): boolean => {
    if (y === null || typeof y !== 'object') return false;
    const o = y as Record<string, unknown>;
    return isNum(o.declarer) && isNum(o.defenders);
  };
  return (
    isNum(r.handNo) &&
    isContract(r.contract) &&
    side(r.cardPoints) && side(r.marriagePoints) &&
    isTriple(r.delta, isNum) &&
    // konto je hra s nulovým součtem — nesedící archiv je podvržený
    Math.abs((r.delta as number[]).reduce((a, b) => a + b, 0)) < 1e-9 &&
    Array.isArray(r.components) &&
    r.components.every((c) => {
      if (c === null || typeof c !== 'object') return false;
      const comp = c as Record<string, unknown>;
      return isStr(comp.target) && (comp.wonBy === 'declarer' || comp.wonBy === 'defenders') &&
        isNum(comp.baseRate) && isNum(comp.flekMultiplier) && isNum(comp.extraMultiplier) &&
        isNum(comp.amount) && typeof comp.silent === 'boolean' &&
        (comp.note === undefined || isStr(comp.note));
    })
  );
}

/**
 * Kontrola obnoveného stavu — localStorage může obsahovat poškozený, starý
 * nebo cizí JSON a nevalidní stav by shodil celé UI. Kontroluje se KOMPLETNÍ
 * tvar stavu včetně payloadu fáze a archivu odehraných her; semantiku
 * (konzervace 32 karet, zero-sum konto, velikost talonu) pak potvrdí
 * `assertValid` z enginu.
 */
function looksLikeGameState(x: unknown): x is GameState {
  if (x === null || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const phase = s.phase as { name?: unknown } | null;
  const cfg = s.config as Record<string, unknown> | null;
  return (
    typeof cfg === 'object' && cfg !== null &&
    (cfg.variant === 'voleny' || cfg.variant === 'licitovany') &&
    isSazby(cfg.sazby) &&
    isSeat(s.dealer) &&
    typeof s.seed === 'number' &&
    typeof s.handNo === 'number' &&
    isTriple(s.hands, isCardArray) &&
    isCardArray(s.unseen) &&
    isCardArray(s.talon) &&
    (s.talonOwner === null || isSeat(s.talonOwner)) &&
    isTriple(s.talonKnowledge, isCardArray) &&
    Array.isArray(s.history) && s.history.every(isHistoryAction) &&
    Array.isArray(s.handResults) && s.handResults.every(isHandResult) &&
    isTriple(s.ledger, (n) => typeof n === 'number' && Number.isFinite(n)) &&
    (s.revealedTrump === null || (isNum(s.revealedTrump) && (s.revealedTrump as number) >= 0 && (s.revealedTrump as number) <= 31)) &&
    // fáze závislé na kontraktu bez něj zamrznou (legalActions nevrátí nic)
    (CONTRACT_PHASES.includes(String((s.phase as { name?: unknown } | null)?.name))
      ? isContract(s.contract)
      : s.contract === null || isContract(s.contract)) &&
    typeof phase === 'object' && phase !== null &&
    typeof phase.name === 'string' && PHASE_NAMES.includes(phase.name) &&
    isValidPhase(phase as Record<string, unknown>)
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
