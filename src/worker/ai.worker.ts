/**
 * ai.worker.ts — tenký Web Worker nad lib/ai/think (docs/marias-design.md §5.4)
 *
 * Žádný stav mezi požadavky. Zrušení: think je synchronní v rámci requestu,
 * proto se `cancel` uplatní zahozením odpovědi na straně match controlleru
 * (requestId) — worker navíc přeskočí požadavky zrušené ještě ve frontě.
 */

import { think } from '../lib/ai/think';
import type { FromWorker, ToWorker } from './messages';

/*
 * `cancel` nelze uvnitř workeru uplatnit: think() je synchronní a zprávy se
 * zpracovávají FIFO, takže cancel dorazí vždy až PO dokončení hledání, které
 * měl zrušit (dřívější „předběžná kontrola zrušených id" byla mrtvý kód).
 * Zrušení proto vynucuje volající: driver odmítne čekající promise a
 * controller zahodí odpověď podle requestId; zaseknutý worker řeší watchdog
 * (terminate + nový worker). Zprávu přijímáme kvůli stabilitě protokolu.
 */
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;

  if (msg.type === 'cancel') return;

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
