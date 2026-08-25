/**
 * determinize.ts — vzorkování skrytých rukou konzistentní s pozorováním
 * (docs/marias-design.md §5.4)
 *
 * Z veřejné historie odvodí omezení (odhalené prázdné barvy, držené hlášky)
 * a rozdá neviděné karty tak, aby jim vyhověly. Přebíjecí logiku NEduplikuje —
 * konzervace karet drží z konstrukce (rozdává se z poolu neviděných karet).
 * Vzorkování má garantované ukončení: rejection sampling → greedy
 * most-constrained-first → postupné uvolnění omezení (se zálogováním).
 */

import { ESO, R10, rankOf, suitOf, type Card, type Suit } from '../cards';
import { Random } from '../random';
import type { GameState, PlayerView, Seat, TrickPlay } from '../rules/types';
import { forhont } from '../rules/types';

/** Kam smí karta padnout: sedadlo 0–2, nebo talon (-1). */
export const TALON_SLOT = -1;

export interface Constraints {
  /** voids[seat] = množina barev, které hráč prokazatelně nemá. */
  voids: [Set<Suit>, Set<Suit>, Set<Suit>];
  /** mustHave[seat] = karty, které hráč prokazatelně drží (hlášky, sedma proti). */
  mustHave: [Set<Card>, Set<Card>, Set<Card>];
  /**
   * Karty, u kterých veřejná informace omezuje MOŽNÁ místa (sedadlo/talon):
   *  - ukázaná trumfová karta (i „z lidu") je v ruce forhonta, nebo v talonu
   *  - hlášená sedma aktéra je v jeho ruce, nebo (teoreticky) v talonu
   */
  allowed: Map<Card, Set<number>>;
}

/** Odvození omezení z veřejné historie aktuální hry. */
export function deriveConstraints(v: PlayerView): Constraints {
  const voids: Constraints['voids'] = [new Set(), new Set(), new Set()];
  const mustHave: Constraints['mustHave'] = [new Set(), new Set(), new Set()];
  const allowed: Constraints['allowed'] = new Map();
  const contract = v.contract;
  const trump = contract?.trump ?? null;
  const mode = contract?.mode ?? 'hra';

  // najdi akce od posledního dealu
  let start = 0;
  for (let i = v.publicHistory.length - 1; i >= 0; i -= 1) {
    if (v.publicHistory[i].type === 'deal') { start = i + 1; break; }
  }

  const played = new Set<Card>();
  let trick: TrickPlay[] = [];
  for (let i = start; i < v.publicHistory.length; i += 1) {
    const a = v.publicHistory[i];
    if (a.type !== 'play') continue;
    played.add(a.card);
    if (a.announceMarriage) {
      // hlásil hlášku ⇒ v tu chvíli držel partnerskou kartu (KRAL=6 ↔ SVRSEK=5)
      const other = ((suitOf(a.card) << 3) | (rankOf(a.card) === 6 ? 5 : 6)) as Card;
      if (!played.has(other)) mustHave[a.seat].add(other);
    }
    if (trick.length > 0) {
      const led = suitOf(trick[0].card);
      if (suitOf(a.card) !== led) {
        voids[a.seat].add(led);
        // v barevné hře bez barvy platí povinný trumf — netrumfl ⇒ nemá trumf
        if (mode === 'hra' && trump !== null && suitOf(a.card) !== trump) {
          voids[a.seat].add(trump);
        }
      }
    }
    trick.push({ seat: a.seat, card: a.card });
    if (trick.length === 3) trick = [];
  }

  /*
   * Veřejně ukázaná trumfová karta (i „z lidu") skončila v ruce toho, kdo
   * volil — nebo v jeho odhozu do talonu.
   */
  if (v.revealedTrump !== null && !played.has(v.revealedTrump)) {
    const seats = new Set<number>([forhont(v.dealer), TALON_SLOT]);
    /*
     * Při převzetí betlem/durchem s house rule 'retake' zvedne nový aktér
     * forhontův talon — ukázaná karta tak může skončit i v JEHO ruce.
     */
    if (
      contract !== null && contract.declarer !== forhont(v.dealer) &&
      v.config.talonOnTakeover === 'retake'
    ) {
      seats.add(contract.declarer);
    }
    allowed.set(v.revealedTrump, seats);
  }

  /*
   * Hlášená sedma: držitel ji prokazatelně MÁ V RUCE — deklarace se podává až
   * PO odhozu a legalita ji vyžaduje v ruce, takže v talonu být nemůže.
   */
  if (contract !== null && contract.sedma !== null && trump !== null) {
    const seven = ((trump << 3) | 0) as Card; // R7 = 0
    if (!played.has(seven)) mustHave[contract.sedma].add(seven);
  }

  // hlášky splněné zahráním druhé karty ⇒ mustHave už jen dosud nezahrané
  for (const s of [0, 1, 2] as Seat[]) {
    for (const c of [...mustHave[s]]) if (played.has(c)) mustHave[s].delete(c);
  }
  for (const c of [...allowed.keys()]) if (played.has(c)) allowed.delete(c);
  return { voids, mustHave, allowed };
}

export interface Determinization {
  hands: [Card[], Card[], Card[]];
  talon: Card[];
}

/**
 * Rozdej neviděné karty ostatním hráčům (a případně do talonu) konzistentně
 * s omezeními. Vrací determinizaci; nikdy neselže (poslední záchrana =
 * uvolnění omezení).
 */
export function determinize(v: PlayerView, rng: Random): Determinization {
  const me = v.seat;
  const phase = v.phase;
  if (phase.name !== 'tricks') throw new Error('determinize: jen pro sehrávku');

  const constraints = deriveConstraints(v);

  // pool neviděných karet: 32 − moje ruka − zahrané − MŮJ aktuální talon.
  // Pozn.: v.talonKnown může obsahovat i karty, které po převzetí talonu drží
  // soupeř v ruce — ty ve hře JSOU, proto se z poolu nevyřazují (v1 se jen
  // ztrácí informace o jejich držiteli, konzervace karet má přednost).
  const seen = new Set<Card>(v.hand);
  for (const w of phase.won) for (const c of w) seen.add(c);
  for (const p of phase.trick) seen.add(p.card);
  for (const c of v.talon ?? []) seen.add(c);
  const pool = Array.from({ length: 32 }, (_, i) => i as Card).filter((c) => !seen.has(c));

  // cílové velikosti rukou ostatních
  const needs: [number, number, number] = [...v.handCounts] as [number, number, number];
  needs[me] = 0;
  const talonSize = pool.length - needs[0] - needs[1] - needs[2];

  // talon nesmí obsahovat esa/desítky (jen u barevných her; můj odhoz už je v seen)
  const talonBanValuable = v.contract?.mode === 'hra' && talonSize > 0 && v.talon === null;

  const trySample = (relaxLevel: number): Determinization | null => {
    const cards = rng.shuffled(pool);
    const hands: [Card[], Card[], Card[]] = [[], [], []];
    const talon: Card[] = [];

    // 1) mustHave přiděl napevno
    const remaining: Card[] = [];
    for (const c of cards) {
      let placed = false;
      for (const s of [0, 1, 2] as Seat[]) {
        if (s !== me && constraints.mustHave[s].has(c) && hands[s].length < needs[s]) {
          hands[s].push(c);
          placed = true;
          break;
        }
      }
      if (!placed) remaining.push(c);
    }

    // 2) zbytek greedy: nejdřív nejomezenější karty (kolik sedadel je smí vzít)
    const canTake = (s: Seat, c: Card): boolean => {
      if (s === me || hands[s].length >= needs[s]) return false;
      if (relaxLevel < 1 && constraints.voids[s].has(suitOf(c))) return false;
      const allow = constraints.allowed.get(c);
      if (relaxLevel < 1 && allow !== undefined && !allow.has(s)) return false;
      return true;
    };
    const options = (c: Card): Seat[] => {
      const seats = ([0, 1, 2] as Seat[]).filter((s) => canTake(s, c));
      const allow = constraints.allowed.get(c);
      const talonOk =
        talon.length < talonSize &&
        (relaxLevel >= 2 || !talonBanValuable || (rankOf(c) !== ESO && rankOf(c) !== R10)) &&
        (relaxLevel >= 1 || allow === undefined || allow.has(TALON_SLOT));
      return talonOk ? [...seats, -1 as unknown as Seat] : seats;
    };
    const ordered = remaining.slice().sort((a, b) => options(a).length - options(b).length);
    for (const c of ordered) {
      const opts = options(c);
      if (opts.length === 0) return null;
      const pick = opts[rng.int(opts.length)];
      if ((pick as number) === -1) talon.push(c);
      else hands[pick].push(c);
    }
    if (talon.length !== talonSize) return null;
    for (const s of [0, 1, 2] as Seat[]) if (s !== me && hands[s].length !== needs[s]) return null;
    hands[me] = v.hand.slice();
    return { hands, talon };
  };

  for (let relax = 0; relax <= 2; relax += 1) {
    const tries = relax === 0 ? 40 : 20;
    for (let i = 0; i < tries; i += 1) {
      const d = trySample(relax);
      if (d !== null) {
        if (relax > 0) {
          // eslint-disable-next-line no-console
          console.warn(`determinize: uvolněná omezení (level ${relax})`);
        }
        return d;
      }
    }
  }
  throw new Error('determinize: nelze rozdat (nemělo by nastat)');
}

/**
 * Sestav plný GameState z pohledu + determinizace — pro simulaci v ISMCTS.
 * Historie = veřejná (stačí: settle čte jen fleky, sehrávka běží z fáze).
 */
export function buildState(v: PlayerView, d: Determinization): GameState {
  /*
   * Historie se v zápase kumuluje, ale čte se z ní VŽDY jen úsek po posledním
   * `deal` (fleky, omezení). Simulace ji přitom kopíruje (`apply`) a mapuje
   * (`view`) desetitisíckrát za tah, takže starší hry jsou čistá režie.
   */
  let handStart = 0;
  for (let i = v.publicHistory.length - 1; i >= 0; i -= 1) {
    if (v.publicHistory[i].type === 'deal') { handStart = i; break; }
  }
  return {
    config: v.config,
    dealer: v.dealer,
    seed: 0,
    hands: d.hands,
    unseen: [],
    talon: v.talon !== null ? v.talon.slice() : d.talon,
    talonOwner: null,
    revealedTrump: v.revealedTrump,
    talonKnowledge: [[], [], []],
    history: v.publicHistory.slice(handStart) as unknown as GameState['history'],
    handResults: [],
    ledger: [0, 0, 0],
    handNo: v.handNo,
    contract: v.contract,
    phase: v.phase,
  };
}
