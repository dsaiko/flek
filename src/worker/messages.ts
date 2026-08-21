/**
 * messages.ts — typovaný protokol AI workeru (vzor tsp; docs/marias-design.md §5.4)
 *
 * Worker je skutečně bezstavový: každý `think` nese vše (view, budget,
 * obtížnost i seed). `requestId` páruje odpovědi a činí zrušení/opožděné
 * odpovědi bezpečnými — match controller zahazuje vše mimo aktuální requestId.
 */

import type { Difficulty } from '../lib/ai/heuristics';
import type { ThinkStats } from '../lib/ai/ismcts';
import type { PlayerAction, PlayerView } from '../lib/rules/types';

export type ToWorker =
  | {
      type: 'think';
      requestId: number;
      view: PlayerView;
      budgetMs: number;
      difficulty: Difficulty;
      seed: number;
    }
  | { type: 'cancel'; requestId: number };

export type FromWorker =
  | { type: 'move'; requestId: number; action: PlayerAction; stats: ThinkStats }
  | { type: 'error'; requestId: number; message: string };
