/**
 * persist.ts — autosave/resume zápasu (docs/marias-design.md §5.9)
 *
 * Celý GameState ve versované obálce { v, state }. Nevalidní/staré záznamy
 * se zahazují. localStorage chráněný try/catch (private mode, kvóty).
 */

import { assertValid } from '../rules/engine';
import { legalActions } from '../rules/legal';
import { view } from '../rules/view';
import type { BidLevel, GameState } from '../rules/types';
import { bidRank } from '../rules/types';

const KEY = 'flek.match.v1';
/**
 * Verze obálky savu.
 *
 * 2 přišla se sazbami `limit`/`limitRaised`: bez nich by zúčtování počítalo
 * s `undefined` a konto by se rozsypalo, a rozehraná hra z v1 navíc běží podle
 * jiného pořadí „Barva?" a deklarace.
 *
 * 3 je kvůli významu `FlekState.spoke` (§35/§36). Dřív tam sedadlo přistálo po
 * PRVNÍ akci, teď až když domluvilo. Rozehraný sav z v2 tedy nese sedadlo,
 * které podle starého pravidla „domluvilo" po jediném fleku — nový reduktor mu
 * už slovo nevrátí a flekovaná komponenta se vyúčtuje o stupeň níž. Migrovat
 * to nejde: co by hráč řekl, kdyby se ho byl engine zeptal, se dopočítat nedá.
 */
export const VERSION = 3;

/**
 * Smí se načíst obálka verze `v` se stavem ve fázi `phaseName`?
 *
 * `spoke` žije VÝHRADNĚ v payloadu fáze „fleks" — jinde v savu není. Sav z v2
 * v kterékoli jiné fázi tedy znamená pro nový reduktor přesně totéž co dřív
 * a zahodit ho není za co. A zahodit ho něco stojí: v klidu (`idle`, `scored`)
 * se ukládá právě proto, aby mezi návštěvami zůstalo konto a archiv
 * odehraných her — odmítnutý sav hráči vynuluje banku, další autosave starý
 * záznam přepíše a je nenávratně pryč. Nenačte se proto jen to jediné, co
 * opravdu nejde přenést: rozehraná komentovací kolečka.
 */
export function loadable(v: unknown, phaseName: unknown): boolean {
  if (v === VERSION) return true;
  return v === 2 && phaseName !== 'fleks';
}

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

/*
 * Fáze, které bez kontraktu zamrznou (legalActions nevrátí nic). Převzetí mezi
 * ně UŽ NEPATŘÍ: ve voleném se řeší hned po odhozu a před deklarací (Obecná
 * pravidla čl. VII/1), takže kontrakt v tu chvíli ještě neexistuje.
 */
const CONTRACT_PHASES = ['fleks', 'tricks'];

const isSeat = (x: unknown): boolean => x === 0 || x === 1 || x === 2;
const FLEK_TARGETS = ['hra', 'sedma', 'kilo', 'betl', 'durch', 'dveSedmy'];
const isFlekTarget = (x: unknown): boolean => typeof x === 'string' && FLEK_TARGETS.includes(x);
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
    'cervenyMultiplier', 'maxFlekLevel', 'limit', 'limitRaised'];
  return numbers.every((k) => isNum(z[k])) && (z.kiloScaling === 'double' || z.kiloScaling === 'linear') &&
    (z.originalKilo === undefined || typeof z.originalKilo === 'boolean');
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
    return isSeat(st.declarer) &&
      // mód teče přes resolveTakeover do contract.mode a odtud do t() —
      // neznámý klíč by shodil render a poškozený stav se autosavem zvěční
      (st.mode === null || st.mode === 'hra' || st.mode === 'betl' || st.mode === 'durch') &&
      // příhoz se ověřuje stejně jako v licitaci: `bidRank` na cizím tvaru vrátí
      // undefined a porovnání s minimem licitace tiše přestane platit
      (st.trump === null || inRange(st.trump, 0, 3)) && (st.bid === null || isBid(st.bid));
  };
  switch (p.name) {
    case 'idle':
    case 'choose-trump':
      return true;
    case 'bidding':
      return Array.isArray(p.bids) && p.bids.every(isBidEntry) &&
        isSeat(p.toAct) && (p.best === null || isBid(p.best));
    case 'discard-talon':
    case 'declare':
      return standingOk(p.standing);
    case 'takeover':
      /*
       * Mód `null` je legitimní: tak vypadá otázka „Barva?", než někdo
       * betl/durch nárokuje. Mód 'hra' ale ne — `resolveTakeover` by z něj
       * udělal bezbarvý kontrakt a hra by se dohrávala v přirozeném pořadí
       * a zúčtovala jako durch.
       */
      return standingOk(p.standing) && (p.standing as { mode?: unknown }).mode !== 'hra' &&
        isSeat(p.toAct) && Array.isArray(p.passed) && (p.passed as unknown[]).every(isSeat);
    case 'fleks': {
      if (!isRecord(p.fleks)) return false;
      const f = p.fleks as Record<string, unknown>;
      // levels jdou do 2**level v scoringu, lastRaiser do porovnání stran
      return isRecord(f.levels) && Object.values(f.levels as object).every((l) => inRange(l, 0, 16)) &&
        isRecord(f.lastRaiser) && Object.values(f.lastRaiser as object).every(isSeat) &&
        isSeat(f.toAct) && Array.isArray(f.spoke) && (f.spoke as unknown[]).every(isSeat) &&
        // `open` řídí nabídku fleků, `raised` otevírá příští kolo — cizí klíč
        // by dal flek na komponentu, kterou závazek nemá, a scoring by ji platil
        Array.isArray(f.open) && (f.open as unknown[]).every(isFlekTarget) &&
        Array.isArray(f.raised) && (f.raised as unknown[]).every(isFlekTarget) &&
        inRange(f.round, 0, 32);
    }
    case 'tricks':
      // hra končí na trickNo === 9; jiná hodnota (nebo neceločíselná) znamená
      // stav, ze kterého se nikdy nedostane k zúčtování
      return inRange(p.trickNo, 0, 9) && isSeat(p.leader) && isSeat(p.toAct) &&
        // tři karty = štych, který reducer okamžitě vyhodnocuje; v savu být nemůže
        isPlayArray(p.trick) && (p.trick as unknown[]).length <= 2 &&
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
      return a.bid === 'pass' || isBid(a.bid);
    case 'discard':
      return Array.isArray(a.cards) && a.cards.length === 2 && a.cards.every(isCard);
    case 'declare':
      return (a.mode === 'hra' || a.mode === 'betl' || a.mode === 'durch') &&
        typeof a.sedma === 'boolean' && typeof a.kilo === 'boolean';
    case 'takeover':
      return a.claim === 'betl' || a.claim === 'durch' || a.claim === 'good' || a.claim === 'take';
    case 'flek':
      return isFlekTarget(a.target);
    case 'play':
      return isCard(a.card) && typeof a.announceMarriage === 'boolean';
    case 'announce-proti':
      return typeof a.sedma === 'boolean' && typeof a.kilo === 'boolean';
    case 'good':
    case 'concede':
      return true;
    default:
      return false;
  }
}

const BID_KINDS = ['sedma', 'sto', 'sto-sedma', 'betl', 'durch', 'dve-sedmy', 'dve-sedmy-sto'];

/**
 * Závazek z licitace — `kind` se používá jako klíč popisků, `cervena` v sazbách.
 *
 * Porovnává se SYROVÁ hodnota, ne `String(...)`: `String(['durch'])` je taky
 * `'durch'`, a pole `JSON.parse` vyrobí přímo. Takový `kind` by prošel kolem
 * `switch`e v `bidRank`, ten by vrátil `undefined` a každé porovnání s minimem
 * licitace by bylo `false` — po vylicitovaném durchu by šlo ohlásit holou hru.
 *
 * A protože `bidRank` vrací -1 i pro kombinace, které licitace nikdy nevydá
 * (červený betl, červený durch), ověřuje se rovnou výsledek: co nemá kladné
 * místo v žebříčku, do savu nepatří.
 */
const isBid = (x: unknown): boolean => {
  if (!isRecord(x)) return false;
  const b = x as Record<string, unknown>;
  return typeof b.kind === 'string' && BID_KINDS.includes(b.kind) &&
    typeof b.cervena === 'boolean' && bidRank(b as unknown as BidLevel) > 0;
};

/** Záznam licitace: `legal.ts` i reducer z něj čtou `.seat` a `.bid`. */
const isBidEntry = (x: unknown): boolean => {
  if (!isRecord(x)) return false;
  const b = x as Record<string, unknown>;
  return isSeat(b.seat) && (b.bid === 'pass' || isBid(b.bid));
};

/** Kontrakt řídí pravidla i zúčtování — musí být kompletní a v rozsahu. */
/**
 * @param archived Kontrakt v ARCHIVU odehrané hry (`HandResult`), ne živý stav.
 *
 * Archiv smí být volnější v jediném bodě: vzdaná hra může skončit dřív, než
 * padla deklarace, takže „hra bez trumfu" je legitimní záznam („vzdáno, než
 * se komentovalo"). U ŽIVÉHO kontraktu to legitimní není — `legalPlays` by
 * přestal vynucovat trumf i přebití. Bez tohohle rozlišení by jediné vzdání
 * před deklarací udělalo z každého dalšího savu nenačitatelný.
 */
function isContract(x: unknown, archived = false): boolean {
  if (x === null || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  /*
   * Křížová konzistence, ne jen jednotlivá pole:
   *  - betl/durch s trumfem → `beats()` by nominovanou barvu brala jako trumf
   *    a štychy by padaly špatnému hráči
   *  - 'hra' bez trumfu → `legalPlays` přestane vynucovat trumf i přebití
   *  - sedma/kilo v bezbarvé hře → legalita by „hlášenou sedmu" držela v betlu
   */
  const trumpless = c.mode === 'betl' || c.mode === 'durch';
  if (trumpless && (c.trump !== null || c.sedma !== null || c.kilo !== null)) return false;
  if (c.mode === 'hra' && c.trump === null && !archived) return false;
  return (
    (c.mode === 'hra' || c.mode === 'betl' || c.mode === 'durch') &&
    // celé číslo: `trump: 0.5` by prošlo rozsahem, ale žádná barva se mu nerovná
    // (legalPlays by přestal vynucovat trumfy) a bitové operace by z něj udělaly jinou
    (c.trump === null || inRange(c.trump, 0, 3)) &&
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
    isContract(r.contract, true) &&
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
    (s.revealedTrump === null || isCard(s.revealedTrump)) &&
    // fáze závislé na kontraktu bez něj zamrznou (legalActions nevrátí nic)
    (CONTRACT_PHASES.includes(String((s.phase as { name?: unknown } | null)?.name))
      ? isContract(s.contract)
      : s.contract === null || isContract(s.contract)) &&
    typeof phase === 'object' && phase !== null &&
    typeof phase.name === 'string' && PHASE_NAMES.includes(phase.name) &&
    isValidPhase(phase as Record<string, unknown>)
  );
}

/**
 * Dá se ze stavu hrát dál? Tvar i karty můžou sedět, a přesto stůl zamrzne:
 * podvržený sav s prázdnou rukou toho, kdo je na tahu, nebo s kartou
 * přesunutou do cizí ruky (review 2026-09-25, fuzz nad savem). Mimo úvodní
 * obrazovku a zúčtování tedy musí mít někdo legální tah, a v sehrávce musí
 * ruce odpovídat číslu štychu — jinak AI nenajde rozdání, které by sedělo.
 */
function playable(st: GameState): boolean {
  const p = st.phase;
  if (p.name === 'idle' || p.name === 'scored') return true;
  if (!([0, 1, 2] as const).some((seat) => legalActions(view(st, seat)).length > 0)) return false;
  if (p.name === 'tricks') {
    return ([0, 1, 2] as const).every((seat) =>
      st.hands[seat].length === 10 - p.trickNo - (p.trick.some((x) => x.seat === seat) ? 1 : 0));
  }
  return true;
}

/**
 * Ověří obálku savu `{ v, state }` stejně jako načtení z localStorage — tvar,
 * verzi, karty a hratelnost. Sdílí ji i hlášení chyby (`report.ts`): záznam
 * z e-mailu musí projít týmiž kontrolami, jinak by se chyba „zopakovala" nad
 * stavem, který hra sama nikdy nepřijme. Vyhazuje výjimku u nekonzistence.
 */
export function validateSave(parsed: { v?: unknown; state?: unknown }): GameState | null {
  // tvar napřed: `loadable` se ptá na jméno fáze a to musí být ověřené
  if (!looksLikeGameState(parsed.state)) return null;
  if (!loadable(parsed.v, parsed.state.phase.name)) return null;
  assertValid(parsed.state); // semantická kontrola (karty, konto, talon)
  if (!playable(parsed.state)) return null;
  return parsed.state;
}

export function loadMatch(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown };
    if (validateSave(parsed) === null) return null;
    if (!looksLikeGameState(parsed.state)) return null; // (jen pro zúžení typu, validateSave to ověřil)
    /*
     * Přepsat na aktuální verzi, ať se migrace neopakuje při každém načtení —
     * ale jen když od načtení nikdo jiný nezapsal.
     *
     * Záznam je sdílený mezi panely. Kdyby se zapisovalo naslepo, stačilo by
     * otevřít hru ve druhém panelu: ten sav zmigruje a rozehraje, a první
     * panel by pak přepsal jeho postup tím, co si přečetl na začátku — konto
     * a archiv o kus zpátky. Jednotlivé operace nad localStorage atomické
     * jsou, tahle dvojice čtení+zápis ne, takže se před zápisem ověří, že
     * tam pořád leží TÝŽ řetězec.
     */
    if (parsed.v !== VERSION && localStorage.getItem(KEY) === raw) saveMatch(parsed.state);
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
