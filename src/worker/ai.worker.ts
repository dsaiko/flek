/**
 * ai.worker.ts — tenký Web Worker nad lib/ai/think (docs/marias-design.md §5.4)
 *
 * Žádný stav mezi požadavky. Zrušení: think je synchronní v rámci requestu,
 * proto se `cancel` uplatní zahozením odpovědi na straně match controlleru
 * (requestId) — worker navíc přeskočí požadavky zrušené ještě ve frontě.
 */

import { think } from '../lib/ai/think';
import type { FromWorker, ToWorker } from './messages';

const cancelledIds = new Set<number>();
/** requestId je globálně rostoucí, takže staré položky už nikdy nesedí — drž jen ocas. */
const MAX_CANCELLED = 64;

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;

  if (msg.type === 'cancel') {
    cancelledIds.add(msg.requestId);
    while (cancelledIds.size > MAX_CANCELLED) {
      const oldest = cancelledIds.values().next().value;
      if (oldest === undefined) break;
      cancelledIds.delete(oldest);
    }
    return;
  }

  if (cancelledIds.has(msg.requestId)) {
    cancelledIds.delete(msg.requestId);
    return;
  }

  try {
    const { action, stats } = think({
      view: msg.view,
      difficulty: msg.difficulty,
      seed: msg.seed,
      budgetMs: msg.budgetMs,
    });
    const out: FromWorker = { type: 'move', requestId: msg.requestId, action, stats };
    self.postMessage(out);
  } catch (e) {
    const out: FromWorker = {
      type: 'error',
      requestId: msg.requestId,
      message: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(out);
  }
};
