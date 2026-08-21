/**
 * types.ts — datový model enginu (viz docs/marias-design.md §5.1)
 *
 * Vše plain JSON (žádné třídy, Map, funkce) — bezpečně serializovatelné přes
 * Web Worker, localStorage i budoucí síť. Engine = čistý reducer nad těmito typy.
 */

import type { Card, Suit } from '../cards';

export type Seat = 0 | 1 | 2;
export type Variant = 'voleny' | 'licitovany';
export type GameMode = 'hra' | 'betl' | 'durch';

/** Sedadlo po rozdávajícím — mluví a vynáší první. */
export const forhont = (dealer: Seat): Seat => (((dealer + 1) % 3) as Seat);
export const nextSeat = (s: Seat): Seat => (((s + 1) % 3) as Seat);

// ── kontrakt ─────────────────────────────────────────────────────────────────

export interface Contract {
  mode: GameMode;
  trump: Suit | null; // null pro betl/durch
  declarer: Seat;
  /** Kdo hlásil sedmu: aktér, NEBO obránce (sedma proti). null = nehlášena. */
  sedma: Seat | null;
  /** Kdo hlásil kilo/sto: aktér, NEBO obránce (sto proti). null = nehlášeno. */
  kilo: Seat | null;
  /** Závazek „dvě sedmy" (jen licitovaný, jen aktér; config.enableDveSedmy). */
  dveSedmy: boolean;
}

/** Částečný kontrakt během aukce, než padne finální `declare`. */
export interface Standing {
  declarer: Seat;
  mode: GameMode | null;
  trump: Suit | null;
  /** Licitovaný: vysoutěžený závazek (deklarace ho musí pokrýt); volený null. */
  bid: BidLevel | null;
}

// ── licitace (licitovaný mariáš; žebříček dle ČSM čl. I) ────────────────────

export interface BidLevel {
  kind: 'sedma' | 'sto' | 'sto-sedma' | 'betl' | 'durch' | 'dve-sedmy' | 'dve-sedmy-sto';
  /** Červený trumf (u betl/durch vždy false — nemají trumf). */
  cervena: boolean;
}

/**
 * Pořadí v licitačním žebříčku (vyšší index = vyšší závazek); -1 = nelegální kombinace.
 * 1 sedma, 2 sedma červená, 3 sto, 4 sto a sedma, 5 sto červených, 6 sto a sedma
 * červených, 7 betl, 8 durch, 9 dvě sedmy, 10 dvě sedmy a sto, 11 dvě sedmy červená,
 * 12 dvě sedmy červená a sto.
 */
export function bidRank(b: BidLevel): number {
  switch (b.kind) {
    case 'sedma': return b.cervena ? 2 : 1;
    case 'sto': return b.cervena ? 5 : 3;
    case 'sto-sedma': return b.cervena ? 6 : 4;
    case 'betl': return b.cervena ? -1 : 7;
    case 'durch': return b.cervena ? -1 : 8;
    case 'dve-sedmy': return b.cervena ? 11 : 9;
    case 'dve-sedmy-sto': return b.cervena ? 12 : 10;
  }
}

export interface BidEntry {
  seat: Seat;
  bid: BidLevel | 'pass';
}

// ── fleky ────────────────────────────────────────────────────────────────────

export type FlekTarget = 'hra' | 'sedma' | 'kilo' | 'betl' | 'durch' | 'dveSedmy';

/**
 * Sémantika: `flek{target}` zvyšuje jednu komponentu (a maže `passed`);
 * `good` = pas na VŠECHNY aktuálně otevřené komponenty. Fáze končí, když všechna
 * oprávněná sedadla pasovala od posledního zvýšení. Zvyšovat komponentu smí jen
 * strana, která na ní nezvyšovala naposled.
 */
export interface FlekState {
  /** 0 = bez fleku; 1 = flek, 2 = re, 3 = tutti, ... multiplikátor = 2^level */
  levels: Partial<Record<FlekTarget, number>>;
  lastRaiser: Partial<Record<FlekTarget, Seat>>;
  toAct: Seat;
  /** Kdo od posledního zvýšení řekl „dobrá". */
  passed: Seat[];
}

// ── sazby a konfigurace ──────────────────────────────────────────────────────

export interface Sazby {
  // všechna pole number — hodnoty jsou defaulty presetů, ne literální typy
  hra: number;
  sedma: number;
  tichaSedma: number;
  kilo: number;
  ticheKilo: number;
  betl: number;
  durch: number;
  dveSedmy: number;
  kiloScaling: 'double' | 'linear'; // za každých 10 bodů nad/pod 100
  cervenyMultiplier: number; // jen barevné hry (hra/sedma/kilo)
  maxFlekLevel: number; // 5 = kalhoty, 6 = kajzr
}

export interface RulesConfig {
  variant: Variant;
  sazby: Sazby;
  // house rules
  talonForbidsTrump: boolean;
  talonOnTakeover: 'retake' | 'keep';
  enableDveSedmy: boolean; // jen licitovaný
}

// ── výsledek hry ─────────────────────────────────────────────────────────────

export type FlekComponent = FlekTarget;

export interface ComponentResult {
  target: FlekComponent;
  /** Kdo komponentu vyhrál: 'declarer' | 'defenders'. */
  wonBy: 'declarer' | 'defenders';
  baseRate: number;
  /** 2^flekLevel */
  flekMultiplier: number;
  /** červený trumf ap.; výsledná hodnota = baseRate * flekMultiplier * extraMultiplier */
  extraMultiplier: number;
  /** kladná hodnota komponenty v jednotkách (před rozpočtením na hráče) */
  amount: number;
  /** tichá varianta (tichá sedma / tiché kilo)? */
  silent: boolean;
  note?: string; // např. 'zabitá sedma', 'kilo 110'
}

export interface HandResult {
  handNo: number;
  contract: Contract;
  /** body stran v barevné hře (esa+desítky+poslední štych; hlášky zvlášť) */
  cardPoints: { declarer: number; defenders: number };
  marriagePoints: { declarer: number; defenders: number };
  components: ComponentResult[];
  /** změna konta per sedadlo; suma = 0 */
  delta: [number, number, number];
}

// ── akce hráčů ───────────────────────────────────────────────────────────────

export type PlayerAction =
  /** Systémová akce: nové rozdání (jediný zdroj náhody — seed). */
  | { type: 'deal'; seed: number; config?: RulesConfig }
  /** Volený: volba trumfu z prvních 7 ('from-people' = naslepo z druhého balíčku). */
  | { type: 'choose-trump'; seat: Seat; card: Card | 'from-people' }
  /** Licitovaný. */
  | { type: 'bid'; seat: Seat; bid: BidLevel | 'pass' }
  | { type: 'discard'; seat: Seat; cards: [Card, Card] }
  | { type: 'declare'; seat: Seat; mode: GameMode; sedma: boolean; kilo: boolean; dveSedmy?: boolean;
      /** Licitovaný s nefixovaným trumfem: volba trumfu při deklaraci. */
      trump?: Suit }
  /** Volený: reakce obránců — dobrá, nebo převzetí betlem/durchem. */
  | { type: 'takeover'; seat: Seat; claim: 'betl' | 'durch' | 'good' }
  | { type: 'flek'; seat: Seat; target: FlekTarget }
  | { type: 'good'; seat: Seat }
  /** Obránce během flekování hlásí sedmu/sto PROTI (než na komponentu padne flek). */
  | { type: 'announce-proti'; seat: Seat; sedma: boolean; kilo: boolean }
  | { type: 'play'; seat: Seat; card: Card; announceMarriage: boolean };

/**
 * PublicAction — akce s redigovanými skrytými payloady (pro PlayerView.publicHistory):
 *   deal    → bez seedu
 *   discard → bez karet
 * Ostatní akce jsou veřejné beze změny; karta z choose-trump je veřejná
 * (z ruky ukázaná / z lidu otočená).
 */
export type PublicAction =
  | { type: 'deal' }
  | { type: 'discard'; seat: Seat }
  | Exclude<PlayerAction, { type: 'deal' } | { type: 'discard' }>;

// ── stav hry ─────────────────────────────────────────────────────────────────

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export type Phase =
  | { name: 'idle' } // start zápasu — čeká na první `deal`
  | { name: 'choose-trump' } // jen volený
  | { name: 'bidding'; bids: BidEntry[]; toAct: Seat; best: BidLevel | null } // jen licitovaný
  | { name: 'discard-talon'; standing: Standing }
  | { name: 'declare'; standing: Standing }
  | { name: 'takeover'; toAct: Seat; standing: Standing; passed: Seat[] } // jen volený
  | { name: 'fleks'; fleks: FlekState }
  | {
      name: 'tricks';
      trickNo: number; // 0..9
      leader: Seat;
      toAct: Seat;
      trick: TrickPlay[];
      played: { plays: TrickPlay[]; winner: Seat }[]; // odehrané štychy (scoring: sedma, body)
      won: [Card[], Card[], Card[]];
      marriages: { seat: Seat; suit: Suit }[];
    }
  | { name: 'scored'; result: HandResult };

export interface GameState {
  config: RulesConfig; // immutable; změna až příští `deal` akcí
  dealer: Seat;
  seed: number; // seed aktuálního rozdání
  hands: [Card[], Card[], Card[]]; // autoritativní; skrývá se přes view()
  /**
   * Volený: forhontův druhý balíček (5 karet), ze kterého se volí „z lidu" —
   * do zvednutí je oddělený od ruky. Po zvednutí prázdné.
   */
  unseen: Card[];
  talon: Card[]; // aktuálně odložené karty (0 nebo 2)
  /** Kdo aktuální talon odložil (vidí ho); null = nikdo neodložil / leží z rozdání. */
  talonOwner: Seat | null;
  /** Které karty talonu/odhozu KTERÉ sedadlo fyzicky vidělo. */
  talonKnowledge: [Card[], Card[], Card[]];
  history: PlayerAction[]; // úplný log akcí vč. `deal` — replay celého zápasu
  handResults: HandResult[]; // archiv odehraných her
  ledger: [number, number, number]; // konto (suma delt z handResults), zero-sum
  handNo: number;
  contract: Contract | null; // finální; během aukce je autoritativní phase.standing
  phase: Phase;
}

// ── pohled hráče (redakce skrytých informací) ────────────────────────────────

export interface PlayerView {
  seat: Seat;
  config: RulesConfig;
  dealer: Seat;
  hand: Card[];
  handCounts: [number, number, number];
  /** Co JÁ vím o talonu/odhozu (vlastní odhoz, převzatý talon dle configu). */
  talonKnown: Card[];
  /** Aktuální talon, pokud jsem ho odložil já (jinak null). */
  talon: Card[] | null;
  contract: Contract | null;
  phase: Phase; // fáze neobsahují skrytá data (ruce/talon žijí mimo Phase)
  publicHistory: PublicAction[];
  handResults: HandResult[];
  ledger: [number, number, number];
  handNo: number;
}

// ── pomocné ──────────────────────────────────────────────────────────────────

/** Sedadla obránců k danému aktérovi. */
export const defendersOf = (declarer: Seat): [Seat, Seat] => [nextSeat(declarer), nextSeat(nextSeat(declarer))];

/** Jsou dvě sedadla na téže straně (obě obrana, nebo totéž sedadlo)? */
export const sameSide = (a: Seat, b: Seat, declarer: Seat): boolean =>
  (a === declarer) === (b === declarer);

export class IllegalActionError extends Error {
  constructor(message: string, public readonly action: PlayerAction) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}
