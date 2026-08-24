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
import { apply, initialState } from '../rules/engine';
import { legalActions } from '../rules/legal';
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

  constructor(driver: AiDriver, opts: MatchOptions, resumeState?: GameState) {
    this.driver = driver;
    this.opts = opts;
    this.state = resumeState ?? initialState(opts.config, 2);
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

  /** Akce člověka (UI). Vyhazuje IllegalActionError při nelegální akci. */
  dispatch(action: PlayerAction): void {
    this.cancelPending();
    this.state = apply(this.state, action);
    this.afterChange();
  }

  /** Nové rozdání (z fáze idle/scored). */
  dealNext(): void {
    this.dispatch({ type: 'deal', seed: this.opts.seedSource() });
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

  private afterChange(): void {
    this.opts.autosave?.(this.state);
    for (const fn of this.listeners) fn(this.state);
    void this.maybeRunAi();
    this.maybeAutoGood();
  }

  /** Když člověk nemá žádnou volbu (jen „dobrá"/pas), potvrď za něj po pauze. */
  private maybeAutoGood(): void {
    if (!this.opts.autoGood || this.stopped) return;
    const legal = this.humanLegal();
    if (legal.length !== 1) return;
    const a = legal[0];
    const forced = a.type === 'good' || (a.type === 'bid' && a.bid === 'pass');
    if (!forced) return;
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
    const seed = Random.derive(this.state.seed, this.state.history.length * 3 + seat);

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
