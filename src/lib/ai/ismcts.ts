/**
 * ismcts.ts — Information-Set Monte Carlo Tree Search pro sehrávku
 * (docs/marias-design.md §5.4)
 *
 * Single-tree ISMCTS: každá iterace vzorkuje novou determinizaci u kořene
 * a sestupuje sdíleným stromem; UCB je omezené na akce legální v této
 * determinizaci. Odměna = finanční delta v jednotkách (max^n — každé sedadlo
 * maximalizuje svou složku), takže search přirozeně respektuje sazby, fleky,
 * sedmu i kilo. Playout = rychlá heuristická politika.
 *
 * Simulace jede přes skutečný engine (apply/legalActions) — pravidla nikde
 * podruhé. Determinismus: seedovaný PRNG, stejný seed ⇒ stejný tah.
 */

import { Random } from '../random';
import { apply } from '../rules/engine';
import { legalActions } from '../rules/legal';
import type { GameState, PlayerAction, PlayerView, Seat } from '../rules/types';
import { view } from '../rules/view';
import { buildState, determinize } from './determinize';
import { playPolicy } from './heuristics';

interface Node {
  visits: number;
  /** součty odměn per sedadlo (max^n) */
  rewards: [number, number, number];
  children: Map<string, Node>;
}

const newNode = (): Node => ({ visits: 0, rewards: [0, 0, 0], children: new Map() });

const keyOf = (a: PlayerAction): string => JSON.stringify(a);

const UCB_C = 1.4;
/**
 * UCB předpokládá odměny v omezeném rozsahu (typicky [0,1]), ale naše odměna je
 * finanční delta v jednotkách: prostá hra ±1, vyflekované kilo v červených i
 * ±128. S pevnou konstantou by průměr přebil explorační člen právě u her
 * s nejvyšší sázkou. Explorační člen proto škálujeme rozsahem, který jsme
 * v tomto hledání skutečně viděli.
 */
const MIN_REWARD_SCALE = 1;

/**
 * Skóre UCB1 pro jedno dítě. Vytaženo, aby šlo testovat, že explorační člen
 * škáluje s rozsahem odměn (bez toho ho průměr u vysokých sázek přebije).
 */
export function ucbScore(
  mean: number,
  rewardScale: number,
  parentVisits: number,
  childVisits: number,
): number {
  return mean + rewardScale * UCB_C * Math.sqrt(Math.log(parentVisits + 1) / (childVisits + 1));
}

export interface ThinkStats {
  iterations: number;
  elapsedMs: number;
  evaluations: { action: PlayerAction; visits: number; mean: number }[];
}

export interface IsmctsOptions {
  /** časový rozpočet; iterace se kontrolují po chuncích */
  budgetMs?: number;
  /** pevný počet iterací (testy, reprodukovatelnost) */
  iterations?: number;
  seed: number;
  /** volitelný callback pro zrušení */
  cancelled?: () => boolean;
}

/** Kdo je na tahu v daném stavu (fáze tricks). */
function actorOf(state: GameState): Seat {
  if (state.phase.name !== 'tricks') throw new Error('actorOf: mimo sehrávku');
  return state.phase.toAct;
}

/** Aplikuj akci bez validace nákladné cesty — engine apply validuje vždy (jistota > rychlost v1). */
function step(state: GameState, action: PlayerAction): GameState {
  return apply(state, action);
}

/** Dohraj stav heuristickou politikou a vrať delty. */
function playout(state: GameState, rng: Random): [number, number, number] {
  let s = state;
  let guard = 0;
  while (s.phase.name !== 'scored') {
    if ((guard += 1) > 60) throw new Error('playout: nekonverguje');
    const actor = actorOf(s);
    s = step(s, playPolicy(view(s, actor), rng));
  }
  return s.phase.result.delta;
}

export function ismctsMove(v: PlayerView, opts: IsmctsOptions): { action: PlayerAction; stats: ThinkStats } {
  if (v.phase.name !== 'tricks') throw new Error('ismctsMove: jen pro sehrávku');
  const rng = new Random(opts.seed);
  const root = newNode();
  // rozsah odměn viděný v tomto hledání (viz MIN_REWARD_SCALE)
  let rewardScale = MIN_REWARD_SCALE;
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 1500;
  const maxIters = opts.iterations ?? Number.MAX_SAFE_INTEGER;

  const rootLegal = legalActions(v);
  if (rootLegal.length === 1) {
    return {
      action: rootLegal[0],
      stats: { iterations: 0, elapsedMs: 0, evaluations: [] },
    };
  }

  let iterations = 0;
  while (iterations < maxIters) {
    if (opts.iterations === undefined && (iterations & 15) === 0) {
      if (Date.now() - started >= budgetMs || opts.cancelled?.()) break;
    }
    iterations += 1;

    // 1) determinizace u kořene
    let state = buildState(v, determinize(v, rng));
    let node = root;
    const path: Node[] = [root];

    // 2) sestup: UCB nad akcemi legálními v TÉTO determinizaci
    let expanded = false;
    while (!expanded && state.phase.name !== 'scored') {
      const actor = actorOf(state);
      const legal = legalActions(view(state, actor));
      let bestChild: Node | null = null;
      let bestAction: PlayerAction | null = null;
      let bestScore = -Infinity;
      for (const a of legal) {
        const k = keyOf(a);
        const child = node.children.get(k);
        if (child === undefined) {
          // expanze první nenavštívené akce
          const fresh = newNode();
          node.children.set(k, fresh);
          state = step(state, a);
          node = fresh;
          path.push(fresh);
          expanded = true;
          bestChild = null;
          break;
        }
        const mean = child.visits > 0 ? child.rewards[actor] / child.visits : 0;
        const ucb = ucbScore(mean, rewardScale, node.visits, child.visits);
        if (ucb > bestScore) {
          bestScore = ucb;
          bestChild = child;
          bestAction = a;
        }
      }
      if (!expanded) {
        if (bestChild === null || bestAction === null) break;
        state = step(state, bestAction);
        node = bestChild;
        path.push(bestChild);
      }
    }

    // 3) playout + 4) backpropagace
    const delta = state.phase.name === 'scored' ? state.phase.result.delta : playout(state, rng);
    rewardScale = Math.max(rewardScale, Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2]));
    for (const n of path) {
      n.visits += 1;
      n.rewards[0] += delta[0];
      n.rewards[1] += delta[1];
      n.rewards[2] += delta[2];
    }
  }

  // výběr: nejnavštěvovanější kořenová akce
  let best: PlayerAction = rootLegal[0];
  let bestVisits = -1;
  const evaluations: ThinkStats['evaluations'] = [];
  for (const a of rootLegal) {
    const child = root.children.get(keyOf(a));
    const visits = child?.visits ?? 0;
    evaluations.push({
      action: a,
      visits,
      mean: child && child.visits > 0 ? child.rewards[v.seat] / child.visits : 0,
    });
    if (visits > bestVisits) {
      bestVisits = visits;
      best = a;
    }
  }
  evaluations.sort((a, b) => b.visits - a.visits);

  return {
    action: best,
    stats: { iterations, elapsedMs: Date.now() - started, evaluations },
  };
}
