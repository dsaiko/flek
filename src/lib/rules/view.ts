/**
 * view.ts — projekce pohledu hráče (docs/marias-design.md §5.1)
 *
 * Jediné místo, kde se rozhoduje, co který hráč vidí. AI worker dostává
 * výhradně PlayerView — fér hra je vynucená konstrukcí. Tentýž pohled by
 * později posílal server vzdálenému klientovi.
 */

import { forhont, type GameState, type PlayerAction, type PlayerView, type PublicAction, type Seat } from './types';

/** Redakce jedné akce do veřejné podoby. */
export function redact(action: PlayerAction): PublicAction {
  switch (action.type) {
    case 'deal':
      return { type: 'deal' };
    case 'discard':
      return { type: 'discard', seat: action.seat };
    case 'choose-trump':
      /*
       * Zvolená karta leží stranou LÍCEM DOLŮ (ČSM, Obecná pravidla Čl. VII/1),
       * takže do veřejné historie její totožnost nepatří — veřejné je jen to,
       * ZDA se volilo z ruky, nebo naslepo „z lidu". Volící ji ve svém pohledu
       * dostane přes `revealedTrump`; kdyby zůstala tady, měl by ji i soupeř
       * (a s ním worker) a redakce `revealedTrump` by nic neřešila.
       */
      return {
        type: 'choose-trump',
        seat: action.seat,
        card: action.card === 'from-people' ? 'from-people' : 'hidden',
      };
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
    /*
     * Zvolená trumfová karta leží stranou LÍCEM DOLŮ (ČSM, Obecná pravidla
     * Čl. VII/1) — vidí ji jen ten, kdo ji volil. Dřív byla ve view veřejná
     * a AI tak znala forhontovu přesnou kartu; barva trumfů je veřejná sama
     * o sobě (nese ji `phase.standing` / `contract`), konkrétní karta ne.
     */
    revealedTrump: forhont(state.dealer) === seat ? state.revealedTrump : null,
    unseenCount: state.unseen.length,
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
