/**
 * think.ts — vstupní bod AI: jedno rozhodnutí nad PlayerView
 *
 * Aukční fáze řeší heuristiky, sehrávku ISMCTS (easy jen rychlá politika).
 * Bezstavové: všechna vstupní data nese požadavek (view, obtížnost, seed,
 * budget) — identické chování ve workeru, na hlavním vlákně i na serveru.
 */

import { Random } from '../random';
import type { PlayerAction, PlayerView } from '../rules/types';
import { decideAuction, playPolicy, type Difficulty } from './heuristics';
import { ismctsMove, type ThinkStats } from './ismcts';

export interface ThinkRequest {
  view: PlayerView;
  difficulty: Difficulty;
  seed: number;
  budgetMs: number;
  /** pevný počet iterací místo času (testy, reprodukovatelnost) */
  iterations?: number;
  cancelled?: () => boolean;
}

export interface ThinkResult {
  action: PlayerAction;
  stats: ThinkStats;
}

const EMPTY_STATS: ThinkStats = { iterations: 0, elapsedMs: 0, evaluations: [] };

export function think(req: ThinkRequest): ThinkResult {
  const { view: v, difficulty, seed } = req;
  const rng = new Random(seed);

  if (v.phase.name !== 'tricks') {
    return { action: decideAuction(v, difficulty, rng), stats: EMPTY_STATS };
  }
  if (difficulty === 'easy') {
    return { action: playPolicy(v, rng), stats: EMPTY_STATS };
  }
  return ismctsMove(v, {
    seed,
    budgetMs: req.budgetMs,
    ...(req.iterations !== undefined ? { iterations: req.iterations } : {}),
    ...(req.cancelled !== undefined ? { cancelled: req.cancelled } : {}),
  });
}
