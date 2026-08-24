/**
 * workerDriver.ts — AiDriver nad Web Workerem s watchdogem (design §5.4)
 *
 * Neodpoví-li worker do budgetMs + GRACE, terminate → nový worker → 1× retry;
 * selže-li i ten, vyhodí chybu a MatchController použije heuristický fallback
 * na hlavním vlákně. Hra se nikdy nezasekne.
 */

import type { ThinkStats } from '../ai/ismcts';
import type { PlayerAction } from '../rules/types';
import type { FromWorker, ToWorker } from '../../worker/messages';
import type { AiDriver, ThinkRequestMsg } from './controller';

const GRACE_MS = 2000;

/** Zrušený požadavek se NESMÍ opakovat (retry je jen pro pád/mlčení workeru). */
class CancelledError extends Error {
  constructor() {
    super('AI požadavek zrušen');
    this.name = 'CancelledError';
  }
}

type Pending = {
  resolve: (r: { action: PlayerAction; stats: ThinkStats }) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function createWorkerDriver(): AiDriver {
  let worker: Worker | null = null;
  const pending = new Map<number, Pending>();

  /** Zabij worker a odmítni VŠE, co na něm čeká — terminate ruší i cizí hledání. */
  const killWorker = (err: Error): void => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  const spawn = (): Worker => {
    const w = new Worker(new URL('../../worker/ai.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const msg = ev.data;
      const p = pending.get(msg.requestId);
      if (!p) return; // opožděná/zrušená odpověď
      pending.delete(msg.requestId);
      clearTimeout(p.timer);
      if (msg.type === 'move') p.resolve({ action: msg.action, stats: msg.stats });
      else p.reject(new Error(msg.message));
    };
    w.onerror = () => {
      // pád workeru: odmítni vše čekající (controller má fallback), restartuj
      killWorker(new Error('AI worker havaroval'));
    };
    return w;
  };

  const ensureWorker = (): Worker => (worker ??= spawn());

  const thinkOnce = (req: ThinkRequestMsg): Promise<{ action: PlayerAction; stats: ThinkStats }> =>
    new Promise((resolve, reject) => {
      const w = ensureWorker();
      const timer = setTimeout(() => {
        // watchdog: worker mlčí — zabij ho a odmítni VŠECHNY čekající požadavky
        // (terminate ukončí i hledání, na které čekají ostatní)
        killWorker(new Error('AI worker neodpověděl (watchdog)'));
      }, req.budgetMs + GRACE_MS);
      pending.set(req.requestId, { resolve, reject, timer });
      const msg: ToWorker = { type: 'think', ...req };
      w.postMessage(msg);
    });

  return {
    async think(req) {
      try {
        return await thinkOnce(req);
      } catch (e) {
        if (e instanceof CancelledError) throw e; // zrušené se neopakuje
        // 1× retry s čerstvým workerem (pád/mlčení workeru)
        return thinkOnce(req);
      }
    },
    cancel(requestId) {
      const p = pending.get(requestId);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(requestId);
        // promise MUSÍ skončit, jinak `await think()` visí navždy; controller
        // odpověď na zrušený požadavek zahodí podle requestId
        p.reject(new CancelledError());
      }
      /*
       * Zrušené hledání běží dál (think() ve workeru je synchronní) a další
       * požadavek by čekal ve frontě za ním. Pokud na workeru nic jiného
       * nezbývá, ukonči ho — nový se vytvoří líně a hned volný.
       */
      if (p !== undefined && pending.size === 0) {
        worker?.terminate();
        worker = null;
        return;
      }
      const msg: ToWorker = { type: 'cancel', requestId };
      worker?.postMessage(msg);
    },
  };
}
