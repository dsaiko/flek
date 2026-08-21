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
}

export class MatchController {
  state: GameState;
  private readonly opts: MatchOptions;
  private readonly driver: AiDriver;
  private listeners: ((state: GameState) => void)[] = [];
  private requestId = 0;
  private pendingRequest: number | null = null;
  private stopped = false;

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
  }

  private async maybeRunAi(): Promise<void> {
    if (this.stopped) return;
    const seat = this.actor();
    if (seat === null || seat === this.opts.humanSeat) return;

    const requestId = (this.requestId += 1);
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
      // fallback: heuristika na hlavním vlákně — hra se nikdy nezasekne
      console.error('AI driver selhal, používám heuristický fallback:', e);
      action = playPolicy(v, new Random(seed));
    }

    // opožděná odpověď (cancel/restart/nové rozdání) se zahazuje
    if (this.pendingRequest !== requestId || this.stopped) return;
    this.pendingRequest = null;
    this.state = apply(this.state, action);
    this.afterChange();
  }

  /** Ruční spuštění AI smyčky (po resume ze savu). */
  kick(): void {
    void this.maybeRunAi();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
