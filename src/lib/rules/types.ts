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
 * Flekování po KOLECH (Obecná pravidla ČSM čl. V/4): v kole se vyjádří celá
 * strana (obrana oba hráči, volící strana jeden), a „v daném kole schvalování
 * se lze vyjadřovat již jen k tomu závazku, který v předchozím kole protistrana
 * flekovala". Kolo 0 je úvodní komentování OBRANOU — jen v něm smí obránci
 * hlásit sedmu/sto proti (čl. VII/1). „Flekování je ukončeno schválením
 * (neflekováním) závazku některou ze stran": kolo bez zvýšení fázi ukončí.
 */
export interface FlekState {
  /** 0 = bez fleku; 1 = flek, 2 = re, 3 = tutti, ... multiplikátor = 2^level */
  levels: Partial<Record<FlekTarget, number>>;
  lastRaiser: Partial<Record<FlekTarget, Seat>>;
  toAct: Seat;
  /**
   * Kdo v TOMTO kole domluvil: buď schválil („dobrá"), nebo zvýšil a nezbyla
   * mu otevřená komponenta, kterou by ještě směl zvýšit (`raisableFleks`).
   * Kdo zvýšil jednu ze dvou otevřených, tady schválně NENÍ — drží slovo dál
   * (čl. V/4: každý z kombinovaných závazků se flekuje samostatně).
   */
  spoke: Seat[];
  /** Co smí strana na tahu v tomhle kole zvyšovat (co zvýšila protistrana). */
  open: FlekTarget[];
  /** Co se v tomhle kole zvýšilo nebo ohlásilo — otevře to příští kolo. */
  raised: FlekTarget[];
  /** 0 = úvodní komentování obranou. */
  round: number;
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
  /**
   * Strop výsledné sazby za jednu hru — „limit" (Obecná pravidla čl. V/8,
   * 500× základ). Platí na to, co si dva hráči za rozdání vyrovnají.
   */
  limit: number;
  /**
   * „Zvýšený limit" (750×): platí, když se do flekování zapojili OBA hráči
   * obrany (volený B/15, licitovaný čl. II/18).
   */
  limitRaised: number;
}

export interface RulesConfig {
  variant: Variant;
  sazby: Sazby;
  // house rules
  talonForbidsTrump: boolean;
  talonOnTakeover: 'retake' | 'keep';
  enableDveSedmy: boolean; // jen licitovaný
  /** Hospodské pravidlo (i FLEK!): neflekovaná prostá hra se nehraje — platí se rovnou aktérovi. */
  autoSettlePlainHra: boolean;
  /**
   * „Flekovaná hra se bez »re« nehraje" (ČSM volený B/19): aktér, který flek
   * na holou hru nezvedl, ji rovnou platí obraně. Licitovaná pravidla tohle
   * ustanovení nemají, proto je to přepínač a ne konstanta.
   */
  autoSettleFlekkedHra: boolean;
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
  /** Strop, který se na výplatu opravdu uplatnil (čl. V/8); jinak chybí. */
  limit?: number;
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
  /**
   * Volený, fáze převzetí (Obecná pravidla čl. VII/1):
   *  - `good`  — aktér se ptá „Barva?", obránce barvu schvaluje
   *  - `take`  — obránce „sebere odložený talon": zvedne ho, odhodí jiný a
   *              TEPRVE PAK ohlásí betl či durch (volí s dvanácti kartami)
   *  - `betl`/`durch` — aktér hlásí hru bez trumfů rovnou (talon už odhodil);
   *              `durch` je i nárok, kterým se „z ohlášeného Betla" přebírá dál
   */
  | { type: 'takeover'; seat: Seat; claim: 'betl' | 'durch' | 'good' | 'take' }
  | { type: 'flek'; seat: Seat; target: FlekTarget }
  | { type: 'good'; seat: Seat }
  /** Obránce během flekování hlásí sedmu/sto PROTI (než na komponentu padne flek). */
  | { type: 'announce-proti'; seat: Seat; sedma: boolean; kilo: boolean }
  | { type: 'play'; seat: Seat; card: Card; announceMarriage: boolean }
  /**
   * Vzdání rozehrané hry (house rule, §5.5.2): kdo vzdá, platí oběma soupeřům
   * sazbu stojícího závazku včetně fleků. Spoluhráč za jeho rozhodnutí neplatí.
   */
  | { type: 'concede'; seat: Seat };

/**
 * PublicAction — akce s redigovanými skrytými payloady (pro PlayerView.publicHistory):
 *   deal         → bez seedu
 *   discard      → bez karet
 *   choose-trump → bez totožnosti karty; veřejné je jen „z ruky / z lidu"
 * Ostatní akce jsou veřejné beze změny.
 */
export type PublicAction =
  | { type: 'deal' }
  | { type: 'discard'; seat: Seat }
  | { type: 'choose-trump'; seat: Seat; card: 'from-people' | 'hidden' }
  | Exclude<PlayerAction, { type: 'deal' } | { type: 'discard' } | { type: 'choose-trump' }>;

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
  /**
   * Trumfová karta, kterou forhont zvolil (volený mariáš). Leží stranou
   * LÍCEM DOLŮ (ČSM, Obecná pravidla Čl. VII/1) — i u volby „z lidu" —, takže
   * je to SKRYTÁ informace: `view()` ji dává jen volícímu a `redact()` ji
   * z historie vynechává. Ve stavu se drží, protože u „z lidu" ji akce nenese
   * (jen `'from-people'`) a volící ji potřebuje vidět.
   */
  revealedTrump: Card | null;
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
  /** Zvolená trumfová karta — jen ve VLASTNÍM pohledu volícího, jinak null (viz GameState.revealedTrump). */
  revealedTrump: Card | null;
  /** Kolik karet leží v neprohlédnutém balíčku („z lidu") — veřejná informace. */
  unseenCount: number;
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
