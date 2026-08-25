/**
 * playChoice.ts — rozhodnutí, co udělat s kliknutím na kartu v sehrávce
 *
 * Bez DOM, aby šlo testovat: hláška je podle pravidel VOLBA hráče (ČSM Čl.
 * III/3 říká jen „v okamžiku, kdy tuto kartu odehrává"), takže ohlásit znamená
 * body, ale i prozradit druhou kartu páru. Když je legální obojí, musí se hráč
 * zeptat; když jen jedna varianta, hraje se bez ptaní.
 */

import { suitOf, type Card } from '../cards';
import type { PlayerAction, PlayerView } from '../rules/types';

export interface PlayChoice {
  /** Zahrát bez ptaní (jen jedna legální varianta). */
  single: PlayerAction | null;
  /** Obě varianty legální → zeptat se. */
  ask: { withMarriage: PlayerAction; plain: PlayerAction; points: 20 | 40 } | null;
}

export function playChoice(v: PlayerView, legal: readonly PlayerAction[], c: Card): PlayChoice {
  const withM = legal.find((a) => a.type === 'play' && a.card === c && a.announceMarriage);
  const plain = legal.find((a) => a.type === 'play' && a.card === c && !a.announceMarriage);
  if (withM && plain) {
    const trump = v.contract?.trump ?? null;
    return {
      single: null,
      ask: { withMarriage: withM, plain, points: trump !== null && suitOf(c) === trump ? 40 : 20 },
    };
  }
  return { single: withM ?? plain ?? null, ask: null };
}
