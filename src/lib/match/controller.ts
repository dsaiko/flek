/**
 * controller.ts — orchestrace zápasu (docs/marias-design.md §4, §5.9)
 *
 * Čistá vrstva bez DOM: drží stav, pouští akce přes engine, plánuje AI tahy
 * přes vstříknutý driver (worker/fallback řeší driver), autosave přes callback.
 * main.ts ji jen napojuje na UI; budoucí server použije tutéž třídu.
 */

import type { Difficulty } from '../ai/heuristics';
import { playPolicy } from '../ai/heuristics';
import type { ThinkStats } from '../ai/ismcts';
import { Random } from '../random';
import { claimPlan, shouldAnnounce } from '../rules/claim';
import { apply, initialState } from '../rules/engine';
import { legalActions, passSettlesWithoutPlay } from '../rules/legal';
import type { GameState, PlayerAction, PlayerView, RulesConfig, Seat } from '../rules/types';
import { view } from '../rules/view';

/*
 * requestId musí být unikátní napříč VŠEMI controllery: main.ts sdílí jeden
 * worker driver mezi zápasy, takže per-instance počítadlo od nuly kolidovalo —
 * odpověď na zrušený požadavek starého zápasu se spárovala s novým a `apply`
 * ji odmítl (zaseknutá hra). Modulové počítadlo kolizi vylučuje.
 */
let nextRequestId = 0;

export interface ThinkRequestMsg {
  requestId: number;
  view: PlayerView;
  difficulty: Difficulty;
  seed: number;
  budgetMs: number;
}

/** Driver AI — implementace přes Web Worker (UI) nebo synchronní (testy). */
export interface AiDriver {
  think(req: ThinkRequestMsg): Promise<{ action: PlayerAction; stats: ThinkStats }>;
  cancel(requestId: number): void;
}

export interface MatchOptions {
  config: RulesConfig;
  humanSeat: Seat;
  difficulty: Difficulty;
  budgetMs: number;
  /** zdroj seedů pro rozdání (UI: crypto random; testy: deterministický) */
  seedSource: () => number;
  /**
   * Zdroj ZÁKLADU seedů pro AI (výchozí: náhodný). Musí být nezávislý na
   * seedu rozdání — viz `aiSeedBase`.
   */
  aiSeedSource?: () => number;
  /** persist celého stavu (localStorage v UI) */
  autosave?: (state: GameState) => void;
  /** pauza mezi AI tahy (ms) — ať jde hra sledovat; 0 v testech */
  aiDelayMs?: number;
  /** auto-potvrzení vynucené „dobré" (jediná legální akce) — pocta parametru Q z FLEK! */
  autoGood?: boolean;
  /**
   * Záložní politika, když AI driver selže nebo vrátí nelegální tah.
   * Výchozí je heuristika na hlavním vlákně; injektovatelná kvůli testům
   * (aby šla ověřit i cesta, kdy selže i fallback).
   */
  fallbackPolicy?: (v: PlayerView, rng: Random) => PlayerAction;
  /**
   * Prodleva mezi kartami při „vše za mnou" (§39); výchozí 260 ms.
   *
   * Není nula schválně: hráč si zvolil, že se to dohraje za něj, ne že to
   * zmizí. Karty mají padat tak, aby se dalo koukat, co se stalo.
   */
  claimDelayMs?: number;
}

/** Kolik selhání za sebou se snese, než se AI smyčka vzdá (ochrana proti zacyklení). */
const AI_MAX_FAILURES = 3;

export class MatchController {
  state: GameState;
  private readonly opts: MatchOptions;
  private readonly driver: AiDriver;
  private listeners: ((state: GameState) => void)[] = [];
  private pendingRequest: number | null = null;
  private stopped = false;
  /** kolikrát po sobě selhalo použití AI tahu (ochrana proti smyčce) */
  private aiFailures = 0;
  /**
   * Základ seedů pro AI tahy. NESMÍ být odvozený od seedu rozdání: `derive()`
   * je invertibilní xorshift a druhý parametr (číslo tahu + sedadlo) zná
   * worker sám, takže z `derive(seedRozdání, n)` by si seed rozdání spočítal
   * zpátky — a tím i celé zamíchání balíčku, tedy cizí ruce. Losuje se proto
   * nezávisle; testy si ho můžou zafixovat přes `opts.aiSeedSource`.
   */
  private readonly aiSeedBase: number;
  /** pořadové číslo AI tahu v tomto zápase (seedy jdou z něj, ne z historie) */
  private aiMoveNo = 0;
  /** Běží „vše za mnou" (§39)? Platí do konce rozdání, pak se zhasne. */
  private claiming = false;

  constructor(driver: AiDriver, opts: MatchOptions, resumeState?: GameState) {
    this.driver = driver;
    this.opts = opts;
    this.state = resumeState ?? initialState(opts.config, 2);
    this.aiSeedBase = (opts.aiSeedSource ?? randomAiSeedBase)();
  }

  /**
   * Změna obtížnosti za běhu. Zápas se kvůli ní nesmí zahazovat — hráč
   * přehodí IQ uprostřed hry a čeká, že se dohraje, jen chytřeji. Nový
   * parametr platí od PŘÍŠTÍHO požadavku na AI; ten právě běžící dopočítá.
   */
  setDifficulty(difficulty: Difficulty, budgetMs: number): void {
    this.opts.difficulty = difficulty;
    this.opts.budgetMs = budgetMs;
  }

  onChange(fn: (state: GameState) => void): void {
    this.listeners.push(fn);
  }

  humanView(): PlayerView {
    return view(this.state, this.opts.humanSeat);
  }

  humanLegal(): PlayerAction[] {
    return legalActions(this.humanView());
  }

  /** Kdo je na tahu (null ve fázích idle/scored — tam je na tahu systém/UI). */
  actor(): Seat | null {
    for (const seat of [0, 1, 2] as Seat[]) {
      const acts = legalActions(view(this.state, seat));
      if (acts.length > 0 && acts.some((a) => a.type !== 'deal')) return seat;
    }
    return null;
  }

  /**
   * Akce člověka (UI). Vyhazuje IllegalActionError při nelegální akci.
   * Nejdřív se akce ověří (apply je čistý), TEPRVE pak se ruší běžící AI
   * požadavek — jinak by odmítnutá akce (dvojklik!) zrušila plánovaný tah AI
   * a smyčka by se už nikdy nerozjela.
   */
  dispatch(action: PlayerAction): void {
    const next = apply(this.state, action);
    this.cancelPending();
    this.state = next;
    this.afterChange();
  }

  /**
   * Nové rozdání (z fáze idle/scored). Nese AKTUÁLNÍ konfiguraci pravidel:
   * sav si celý config veze s sebou, takže bez toho by obnovený zápas hrál
   * další hry podle pravidel z doby uložení (např. se stropem fleků, který
   * licitovaný už nemá). Rozehraná hra se nemění — config platí od `deal`.
   */
  dealNext(): void {
    this.dispatch({ type: 'deal', seed: this.opts.seedSource(), config: this.opts.config });
  }

  stop(): void {
    this.stopped = true;
    this.cancelPending();
  }

  private cancelPending(): void {
    if (this.pendingRequest !== null) {
      this.driver.cancel(this.pendingRequest);
      this.pendingRequest = null;
    }
  }

  /**
   * „Vše za mnou" (§39) — zbylé štychy jsou hráčovy, dohraje se to za něj.
   *
   * NEPOČÍTÁ výsledek: hra se doopravdy dohraje kartu po kartě, AI odpovídá
   * jako vždycky (a hlásí si své hlášky, o kterých hráč vědět nemůže — ČSM
   * čl. III/3), takže vyúčtování vyjde stejně jako při ručním dohrání.
   *
   * Nabídku si UI ověřuje samo přes `claimPlan`; tady se ověřuje znovu, ať
   * zdrojem pravdy zůstane pohled hráče a ne stav tlačítka.
   */
  claimRest(): boolean {
    if (claimPlan(this.humanView()) === null) return false;
    this.claiming = true;
    this.playClaimed();
    return true;
  }

  /**
   * Probíhá právě dohrávka „vše za mnou"?
   *
   * Zhasíná ji `playClaimed`, jakmile fáze není `tricks` — proto tu NENÍ žádná
   * pojistka při novém rozdání: rozdávat jde jen z `idle`/`scored`, a tam už
   * je příznak dávno dole. Nedosažitelnou pojistku by nešlo otestovat.
   */
  get isClaiming(): boolean {
    return this.claiming;
  }

  /**
   * Jedna karta z plánu, pokud je hráč na tahu a nabídka pořád platí.
   *
   * Přepočítává se z aktuálního pohledu při každém tahu, ne jednou na začátku:
   * kdyby se stav mezitím pohnul jinak, než plán čekal, dohrávka se prostě
   * zastaví a hráč doklikne zbytek sám — nikdy se nezahraje karta, kterou
   * `legalActions` v tu chvíli nenabízí.
   */
  private playClaimed(): void {
    if (!this.claiming || this.stopped) return;
    if (this.state.phase.name !== 'tricks') { this.claiming = false; return; }
    const v = this.humanView();
    const plan = claimPlan(v);
    if (plan === null || plan.length === 0) return; // není na tahu, nebo už nabídka neplatí
    const next = plan[0];
    const legal = legalActions(v);
    const wanted = legal.find(
      (a) => a.type === 'play' && a.card === next && a.announceMarriage === shouldAnnounce(v, next),
    ) ?? legal.find((a) => a.type === 'play' && a.card === next);
    if (wanted === undefined) { this.claiming = false; return; }
    const historyLen = this.state.history.length;
    setTimeout(() => {
      if (this.stopped || this.state.history.length !== historyLen) return;
      try {
        this.dispatch(wanted);
      } catch {
        this.claiming = false; // stav se pohnul jinak — zbytek doklikne člověk
      }
    }, this.opts.claimDelayMs ?? 260);
  }

  private afterChange(): void {
    this.opts.autosave?.(this.state);
    for (const fn of this.listeners) fn(this.state);
    void this.maybeRunAi();
    this.maybeAutoGood();
    this.playClaimed();
  }

  /** Když člověk nemá žádnou volbu (jen „dobrá"/pas), potvrď za něj po pauze. */
  private maybeAutoGood(): void {
    if (!this.opts.autoGood || this.stopped) return;
    const legal = this.humanLegal();
    if (legal.length !== 1) return;
    const a = legal[0];
    // „dobrá" existuje ve třech podobách: fleky (`good`), licitace (`pass`)
    // a převzetí (`takeover`/`good` — po cizím durchu už nic jiného nezbývá)
    const forced =
      a.type === 'good' ||
      (a.type === 'bid' && a.bid === 'pass') ||
      (a.type === 'takeover' && a.claim === 'good');
    if (!forced) return;
    /*
     * Výjimka: „dobrá", která podle B/19 rovnou platí flekovanou hru, není
     * vynucená formalita — stojí dvojnásobek. Tu musí odklepnout člověk
     * (a UI se ho na ni ptá popupem), i kdyby jiná akce zrovna nebyla.
     */
    if (passSettlesWithoutPlay(this.humanView()) !== null) return;
    const historyLen = this.state.history.length;
    setTimeout(() => {
      if (this.stopped || this.state.history.length !== historyLen) return;
      try {
        this.dispatch(a);
      } catch {
        /* stav se mezitím pohnul — nic */
      }
    }, this.opts.aiDelayMs ?? 700);
  }

  private async maybeRunAi(): Promise<void> {
    if (this.stopped) return;
    const seat = this.actor();
    if (seat === null || seat === this.opts.humanSeat) return;
    // strop kontrolovaný na VSTUPU — rekurzivní opakování je tím shora omezené
    if (this.aiFailures >= AI_MAX_FAILURES) {
      console.error('AI opakovaně selhává, smyčka se zastavuje');
      return;
    }

    const requestId = (nextRequestId += 1);
    this.pendingRequest = requestId;
    const v = view(this.state, seat);
    // seed tahu: nezávislý základ + pořadí tahu (nikdy ne seed rozdání)
    const seed = Random.derive(this.aiSeedBase, (this.aiMoveNo += 1));

    if (this.opts.aiDelayMs) await sleep(this.opts.aiDelayMs);
    if (this.pendingRequest !== requestId || this.stopped) return;

    let action: PlayerAction;
    try {
      const res = await this.driver.think({
        requestId,
        view: v,
        difficulty: this.opts.difficulty,
        seed,
        budgetMs: this.opts.budgetMs,
      });
      action = res.action;
    } catch (e) {
      // zrušený nebo zastaralý požadavek — fallback nemá smysl vůbec počítat
      if (this.pendingRequest !== requestId || this.stopped) return;
      // fallback: heuristika na hlavním vlákně — hra se nikdy nezasekne
      console.error('AI driver selhal, používám heuristický fallback:', e);
      try {
        action = this.fallback(v, new Random(seed));
      } catch (e2) {
        console.error('Záložní politika selhala:', e2);
        this.aiFailures += 1;
        this.pendingRequest = null;
        void this.maybeRunAi();
        return;
      }
    }

    // opožděná odpověď (cancel/restart/nové rozdání) se zahazuje
    if (this.pendingRequest !== requestId || this.stopped) return;
    this.pendingRequest = null;

    try {
      this.state = apply(this.state, action);
      this.aiFailures = 0;
    } catch (e) {
      // Tah už není legální (stav se pohnul, cizí odpověď…). Zkus záložní
      // politiku a hlavně nedopusť, aby smyčka umřela a hra zamrzla.
      console.error('AI tah odmítnut, zkouším záložní politiku:', e);
      this.aiFailures += 1;
      const actor = this.actor();
      if (actor === null || actor === this.opts.humanSeat) return;
      try {
        this.state = apply(this.state, this.fallback(view(this.state, actor), new Random(seed + this.aiFailures)));
        this.aiFailures = 0;
      } catch (e2) {
        console.error('Záložní politika také selhala:', e2);
        void this.maybeRunAi(); // omezené vstupním stropem
        return;
      }
    }
    this.afterChange();
  }

  /** Záložní politika (default heuristika na hlavním vlákně). */
  private fallback(v: PlayerView, rng: Random): PlayerAction {
    return (this.opts.fallbackPolicy ?? playPolicy)(v, rng);
  }

  /** Ruční spuštění AI smyčky (po resume ze savu). */
  kick(): void {
    void this.maybeRunAi();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Náhodný základ seedů pro AI (crypto, když je; jinak Math.random). */
function randomAiSeedBase(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return (Math.random() * 0x1_0000_0000) >>> 0;
}
