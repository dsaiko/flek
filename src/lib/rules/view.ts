/**
 * view.ts — projekce pohledu hráče (docs/marias-design.md §5.1)
 *
 * Jediné místo, kde se rozhoduje, co který hráč vidí. AI worker dostává
 * výhradně PlayerView — fér hra je vynucená konstrukcí. Tentýž pohled by
 * později posílal server vzdálenému klientovi.
 */

import type { GameState, PlayerAction, PlayerView, PublicAction, Seat } from './types';

/** Redakce jedné akce do veřejné podoby. */
export function redact(action: PlayerAction): PublicAction {
  switch (action.type) {
    case 'deal':
      return { type: 'deal' };
    case 'discard':
      return { type: 'discard', seat: action.seat };
    default:
      return action;
  }
}

export function view(state: GameState, seat: Seat): PlayerView {
  return {
    seat,
    config: state.config,
    dealer: state.dealer,
    hand: state.hands[seat].slice(),
    handCounts: [state.hands[0].length, state.hands[1].length, state.hands[2].length],
    revealedTrump: state.revealedTrump,
    talonKnown: state.talonKnowledge[seat].slice(),
    talon: state.talonOwner === seat ? state.talon.slice() : null,
    contract: state.contract,
    phase: state.phase, // fáze neobsahují skrytá data (ruce/talon žijí mimo Phase)
    publicHistory: state.history.map(redact),
    handResults: state.handResults,
    ledger: [...state.ledger],
    handNo: state.handNo,
  };
}
