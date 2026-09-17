/**
 * engine.ts — čistý reducer zápasu (docs/marias-design.md §5.2–5.3)
 *
 * apply(state, action) → nový stav; deterministické, bez vedlejších efektů.
 * Legalitu validuje výhradně členstvím v legalActions(view(state, seat)) —
 * pravidla se nikde nederivují podruhé. I rozdání je akce (`deal` se seedem),
 * takže replay celého zápasu = history.reduce(apply, initialState).
 */

import { CERVENE, DECK, sortHand, suitOf, type Card } from '../cards';
import { Random } from '../random';
import { actionMatchesLegal, flekEnding, legalActions, trumplessChoicePending } from './legal';
import { settle } from './scoring';
import { trickWinner } from './tricks';
import type {
  Contract,
  FlekState,
  FlekTarget,
  GameState,
  PlayerAction,
  RulesConfig,
  Seat,
  Standing,
} from './types';
import { IllegalActionError, InvariantError, defendersOf, forhont, nextSeat } from './types';
import { view } from './view';

// ── inicializace ─────────────────────────────────────────────────────────────

export function initialState(config: RulesConfig, firstDealer: Seat = 2): GameState {
  return {
    config,
    dealer: firstDealer,
    seed: 0,
    hands: [[], [], []],
    unseen: [],
    talon: [],
    talonOwner: null,
    revealedTrump: null,
    talonKnowledge: [[], [], []],
    history: [],
    handResults: [],
    ledger: [0, 0, 0],
    handNo: 0,
    contract: null,
    phase: { name: 'idle' },
  };
}

// ── rozdání ──────────────────────────────────────────────────────────────────

function deal(state: GameState, seed: number, config?: RulesConfig): GameState {
  const cfg = config ?? state.config;
  const dealer = state.phase.name === 'idle' ? state.dealer : nextSeat(state.dealer);
  const f = forhont(dealer);
  const [d1, d2] = defendersOf(f);
  const deck = new Random(seed).shuffled(DECK);

  const hands: [Card[], Card[], Card[]] = [[], [], []];
  let unseen: Card[] = [];
  let talon: Card[] = [];

  if (cfg.variant === 'voleny') {
    // forhont 7 (volí trumf), obránci 5+5, forhontových dalších 5 leží stranou
    // („z lidu"), obránci 5+5 → forhont 7+5=12, ostatní 10; talon vznikne odhozem
    hands[f] = deck.slice(0, 7);
    hands[d1] = deck.slice(7, 12);
    hands[d2] = deck.slice(12, 17);
    unseen = deck.slice(17, 22);
    hands[d1] = hands[d1].concat(deck.slice(22, 27));
    hands[d2] = hands[d2].concat(deck.slice(27, 32));
  } else {
    // licitovaný: 5+5 každému, talon 2 lícem dolů; vítěz licitace ho zvedne
    hands[f] = deck.slice(0, 5);
    hands[d1] = deck.slice(5, 10);
    hands[d2] = deck.slice(10, 15);
    hands[f] = hands[f].concat(deck.slice(15, 20));
    hands[d1] = hands[d1].concat(deck.slice(20, 25));
    hands[d2] = hands[d2].concat(deck.slice(25, 30));
    talon = deck.slice(30, 32);
  }

  return {
    ...state,
    config: cfg,
    dealer,
    seed,
    hands: [sortHand(hands[0]), sortHand(hands[1]), sortHand(hands[2])],
    unseen,
    talon,
    talonOwner: null,
    revealedTrump: null,
    talonKnowledge: [[], [], []],
    handNo: state.handNo + 1,
    contract: null,
    phase:
      cfg.variant === 'voleny'
        ? { name: 'choose-trump' }
        : // licitaci otevírá ZADÁK — „hráč, který dostává karty jako poslední,
          // tj. hráč sedící ve směru hraní před forhontem" (Obecná pravidla
          // čl. VII/3). Ve třech je to rozdávající; forhontovi pak stačí výši
          // závazku vyrovnávat (drží shodný stupeň, viz `mayHoldEqual`).
          { name: 'bidding', bids: [], toAct: dealer, best: null },
  };
}

// ── pomocné přechody ─────────────────────────────────────────────────────────

/** Držitel licitace: poslední přihazující, jinak forhont (implicitní hra). */
function biddingHolder(state: GameState & { phase: { name: 'bidding' } }): Seat {
  for (let i = state.phase.bids.length - 1; i >= 0; i -= 1) {
    const b = state.phase.bids[i];
    if (b.bid !== 'pass') return b.seat;
  }
  return forhont(state.dealer);
}

/**
 * Ostatní dvě sedadla v pořadí mluvení: „ve směru hraní" od toho, kdo právě
 * mluvil nebo hlásil (Obecná pravidla čl. V/4, volený B/11 „sled hodinových
 * ručiček, jeden po druhém"). Kruh se otevírá u aktéra, resp. u toho, kdo
 * vznesl nárok — první slovo má hráč po jeho levici.
 *
 * Dřív pořadí začínalo vždy u forhonta. Ve voleném s aktérem-forhontem je to
 * totéž, ale v licitovaném (aktérem může být kdokoli) a při převzetí mluvil
 * jako první forhont i tehdy, když seděl až za rohem — a druhý mluvčí zná
 * názor prvního, takže na pořadí záleží.
 */
function speakingOrder(after: Seat): Seat[] {
  return [nextSeat(after), nextSeat(nextSeat(after))];
}

/** Komponenty závazku, ke kterým se dá vyjádřit. */
function flekTargets(contract: Contract): FlekTarget[] {
  if (contract.mode !== 'hra') return [contract.mode];
  return [
    'hra',
    ...(contract.sedma !== null ? (['sedma'] as FlekTarget[]) : []),
    ...(contract.kilo !== null ? (['kilo'] as FlekTarget[]) : []),
    ...(contract.dveSedmy ? (['dveSedmy'] as FlekTarget[]) : []),
  ];
}

/** Sedadla strany, která je na tahu v tomhle kole (v pořadí mluvení). */
function flekSideMembers(contract: Contract, seat: Seat): Seat[] {
  return seat === contract.declarer
    ? [contract.declarer]
    : speakingOrder(contract.declarer);
}

/**
 * Posun flekování po kolech (čl. V/4). Vrací `null`, když kolo skončilo bez
 * jediného zvýšení — to je „schválení závazku některou ze stran" a konec fáze.
 */
function advanceFleks(state: GameState, contract: Contract, f: FlekState): FlekState | null {
  const members = flekSideMembers(contract, f.toAct);
  const next = members.find((m) => !f.spoke.includes(m));
  if (next !== undefined) return { ...f, toAct: next };
  if (f.raised.length === 0) return null;
  // kolo skončilo zvýšením → slovo dostává protistrana, a jen k tomu, co padlo
  const otherSide = flekSideMembers(
    contract, f.toAct === contract.declarer ? defendersOf(contract.declarer)[0] : contract.declarer,
  );
  return {
    ...f,
    round: f.round + 1,
    open: [...new Set(f.raised)],
    raised: [],
    spoke: [],
    toAct: otherSide[0],
  };
}

function startFleks(state: GameState, contract: Contract): GameState {
  /*
   * Závazek schvaluje OBRANA („Při schvalování závazku se jednotliví hráči
   * vyjadřují v pořadí ve směru hraní", čl. V/4) — aktér ke svému závazku
   * v prvním kole nemluví. Dřív fáze začínala u forhonta, takže aktér-forhont
   * říkal „dobrá" ke své vlastní hře.
   */
  const defenders = speakingOrder(contract.declarer);
  const fleks: FlekState = {
    levels: {},
    lastRaiser: {},
    toAct: defenders[0],
    spoke: [],
    open: flekTargets(contract),
    raised: [],
    round: 0,
  };
  return { ...state, contract, phase: { name: 'fleks', fleks } };
}

function startTricks(state: GameState): GameState {
  const contract = state.contract;
  if (!contract) throw new InvariantError('startTricks bez kontraktu');
  // do prvního štychu vynáší forhont; u betla/durcha aktér (Obecná čl. II.6)
  const leader = contract.mode === 'hra' ? forhont(state.dealer) : contract.declarer;
  return {
    ...state,
    phase: {
      name: 'tricks', trickNo: 0, leader, toAct: leader,
      trick: [], played: [], won: [[], [], []], marriages: [],
    },
  };
}

/** Ukončení převzetí (volený): vyřeší talon a kontrakt podle vítěze. */
function resolveTakeover(state: GameState, standing: Standing): GameState {
  /*
   * Talon odhodil původní aktér, takže `talonOwner` je jediný spolehlivý
   * záznam o tom, kdo se ptal „Barva?" — `state.contract` v tuhle chvíli
   * ještě neexistuje (deklarace přijde AŽ po převzetí, čl. VII/1).
   */
  const asker = state.talonOwner;

  // nikdo nepřebral: aktér teprve teď hlásí závazek (čl. VII/1)
  if (standing.mode === null) {
    return { ...state, phase: { name: 'declare', standing } };
  }
  if (standing.mode === 'hra') throw new InvariantError('převzetí musí být betl nebo durch');

  // hru přebral betlem/durchem obránce — NEBO ji přebral sám aktér
  // (po cizím betlu smí ohlásit durch; jeho nárok se nesmí zahodit)
  const contract: Contract = {
    mode: standing.mode,
    trump: null,
    declarer: standing.declarer,
    sedma: null,
    kilo: null,
    dveSedmy: false,
  };

  // původní aktér už talon odhodil a drží 10 karet; talon znovu nebere
  if (standing.declarer === asker || state.config.talonOnTakeover === 'keep') {
    return startFleks(state, contract);
  }

  // retake: nový aktér zvedne talon (vidí ho) a odhodí dvě karty
  const s = { ...state, contract };
  const hands = s.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
  hands[contract.declarer] = sortHand(hands[contract.declarer].concat(s.talon));
  const talonKnowledge = s.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
  for (const c of s.talon) {
    if (!talonKnowledge[contract.declarer].includes(c)) talonKnowledge[contract.declarer].push(c);
  }
  return {
    ...s,
    hands,
    talon: [],
    talonOwner: null,
    talonKnowledge,
    phase: {
      name: 'discard-talon',
      standing: { declarer: contract.declarer, mode: contract.mode, trump: null, bid: null },
    },
  };
}

// ── invarianty ───────────────────────────────────────────────────────────────

export function assertValid(state: GameState): void {
  const inPlay =
    state.phase.name !== 'idle' && state.phase.name !== 'scored';
  if (inPlay) {
    const seen = new Set<Card>();
    const add = (cards: readonly Card[], where: string) => {
      for (const c of cards) {
        // POZOR na relační porovnání: `null < 0` je false, takže bez
        // Number.isInteger by nečíselná karta prošla a `suitOf` by z ní
        // udělala kartu 0 (červenou sedmu) ležící zároveň v ruce
        if (!Number.isInteger(c) || c < 0 || c > 31 || seen.has(c)) {
          throw new InvariantError(`karta ${String(c)} dvakrát/mimo rozsah (${where})`);
        }
        seen.add(c);
      }
    };
    add(state.hands[0], 'hand0');
    add(state.hands[1], 'hand1');
    add(state.hands[2], 'hand2');
    add(state.unseen, 'unseen');
    add(state.talon, 'talon');
    if (state.phase.name === 'tricks') {
      add(state.phase.trick.map((p) => p.card), 'trick');
      for (const w of state.phase.won) add(w, 'won');
    }
    if (seen.size !== 32) throw new InvariantError(`karet ve hře ${seen.size}, má být 32`);
  }
  const ledgerSum = state.ledger[0] + state.ledger[1] + state.ledger[2];
  if (ledgerSum !== 0) throw new InvariantError(`konto není zero-sum (${ledgerSum})`);
  if (state.talon.length !== 0 && state.talon.length !== 2) {
    throw new InvariantError(`talon má ${state.talon.length} karet`);
  }
}

// ── reducer ──────────────────────────────────────────────────────────────────

export function apply(state: GameState, action: PlayerAction): GameState {
  /*
   * Validace: jediný zdroj pravdy legality — s jedinou výjimkou.
   *
   * `concede` NENÍ tah ve smyslu pravidel, je to ukončení rozehrané hry, a do
   * `legalActions` nepatří: kdyby ho měl každý hráč pořád k dispozici, mělo by
   * „kdo je na tahu" (`actor()` hledá první sedadlo s legální akcí) i AI, která
   * si z legálních akcí vybírá, úplně jiný význam. Kontroluje se proto zvlášť.
   */
  const seat: Seat = action.type === 'deal' ? 0 : action.seat;
  if (action.type === 'concede') {
    if (state.phase.name === 'idle' || state.phase.name === 'scored') {
      throw new IllegalActionError('vzdát jde jen rozehranou hru', action);
    }
  } else if (!actionMatchesLegal(action, legalActions(view(state, seat)))) {
    throw new IllegalActionError(`nelegální akce ${action.type} ve fázi ${state.phase.name}`, action);
  }

  let next = reduce(state, action);
  next = { ...next, history: [...state.history, action] };
  assertValid(next);
  return next;
}

function reduce(state: GameState, action: PlayerAction): GameState {
  const phase = state.phase;

  switch (action.type) {
    case 'deal':
      return deal(state, action.seed, action.config);

    case 'concede':
      return concede(state, action.seat);

    case 'choose-trump': {
      // volený: trumf z prvních 7, nebo „z lidu" — první karta neprohlédnutého
      // balíčku (deterministické ze seedu); poté forhont zvedne zbylých 5
      if (action.card === 'from-people' && state.unseen.length === 0) {
        throw new InvariantError('„z lidu" bez neprohlédnutých karet');
      }
      const trumpCard = action.card === 'from-people' ? state.unseen[0] : action.card;
      const trump = suitOf(trumpCard);
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = sortHand(hands[action.seat].concat(state.unseen));
      return {
        ...state,
        hands,
        unseen: [],
        // zvolená karta leží stranou lícem dolů (Čl. VII/1) — i „z lidu";
        // ve stavu je pro volícího, `view()` ji ostatním nedá
        revealedTrump: trumpCard,
        phase: {
          name: 'discard-talon',
          standing: { declarer: action.seat, mode: null, trump, bid: null },
        },
      };
    }

    case 'bid': {
      if (phase.name !== 'bidding') throw new InvariantError('bid mimo bidding');
      const bids = [...phase.bids, { seat: action.seat, bid: action.bid }];
      const withBids = { ...state, phase: { ...phase, bids } };

      const withdrawn = withdrawnFromBidding(bids);

      if (action.bid !== 'pass') {
        // nový držitel; slovo dostává druhý z dvojice, která zrovna draží
        return {
          ...withBids,
          phase: {
            ...withBids.phase, best: action.bid,
            toAct: nextNonHolder(state.dealer, action.seat, withdrawn),
          },
        };
      }

      // pass: konec, jakmile odstoupili oba ne-držitelé (odstoupení je konečné)
      const holder = biddingHolder(withBids as GameState & { phase: { name: 'bidding' } });
      if (withdrawn.length >= 2) {
        // vítěz zvedá talon a odhazuje
        const hands = withBids.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
        hands[holder] = sortHand(hands[holder].concat(withBids.talon));
        const talonKnowledge = withBids.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
        for (const c of withBids.talon) talonKnowledge[holder].push(c);
        const best = phase.best;
        const standing: Standing = {
          declarer: holder,
          mode: best === null ? null : best.kind === 'betl' || best.kind === 'durch' ? best.kind : null,
          trump: best?.cervena ? 0 : null,
          bid: best,
        };
        return {
          ...withBids,
          hands,
          talon: [],
          talonOwner: null,
          talonKnowledge,
          phase: { name: 'discard-talon', standing },
        };
      }
      // pas: odstoupivšího nahradí prostřední hráč a odpovídá ten, kdo nedrží
      return {
        ...withBids,
        phase: { ...withBids.phase, toAct: nextNonHolder(state.dealer, holder, withdrawn) },
      };
    }

    case 'discard': {
      if (phase.name !== 'discard-talon') throw new InvariantError('discard mimo fázi');
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = hands[action.seat].filter((c) => !action.cards.includes(c));
      const talonKnowledge = state.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
      for (const c of action.cards) {
        if (!talonKnowledge[action.seat].includes(c)) talonKnowledge[action.seat].push(c);
      }
      /*
       * Volený: po odhozu talonu přichází otázka „Barva?" — aktér musí dát
       * soupeřům možnost hrát betl/durch a teprve po jejich souhlasu hlásí
       * závazek (Obecná pravidla čl. VII/1). Dřív se pořadí obracelo, takže
       * obrana o převzetí rozhodovala se znalostí aktérovy sedmy a sta.
       * Do fáze převzetí se vstupuje i s módem `null`; mód dostane teprve
       * nárokem betl/durch. Po PŘEVZETÍ (mód už konkrétní) se talon odhazuje
       * podruhé a následuje rovnou deklarace zamčeného módu.
       */
      const askColour =
        state.config.variant === 'voleny' && phase.standing.mode === null &&
        // obránce, který talon sebral (trumf žádný), rovnou hlásí betl/durch
        !trumplessChoicePending(state.config, phase.standing);
      return {
        ...state,
        hands,
        talon: [...action.cards],
        talonOwner: action.seat,
        talonKnowledge,
        phase: askColour
          ? { name: 'takeover', toAct: action.seat, standing: phase.standing, passed: [] }
          : { name: 'declare', standing: phase.standing },
      };
    }

    case 'declare': {
      if (phase.name !== 'declare') throw new InvariantError('declare mimo fázi');
      const st = phase.standing;
      /*
       * `action.trump` má přednost: ve voleném ho deklarace vůbec nenese
       * (trumf je zvolený a `st.trump` platí), v licitovaném je `st.trump`
       * jen stopa po červeném příhozu a barvu vybírá až tahle akce.
       */
      const trump = action.mode === 'hra' ? (action.trump ?? st.trump ?? null) : null;
      const contract: Contract = {
        mode: action.mode,
        trump,
        declarer: action.seat,
        sedma: action.sedma ? action.seat : null,
        kilo: action.kilo ? action.seat : null,
        dveSedmy: action.dveSedmy ?? false,
      };
      /*
       * Obránce, který sebral talon, ohlásil betl: „z ohlášeného Betla mohou
       * zbývající dva hráči přebrat hru ještě na Durcha" (čl. VII/1), takže
       * se ještě jednou otevře převzetí. Durch je konečný a rovnou se flekuje.
       */
      if (trumplessChoicePending(state.config, st) && action.mode === 'betl') {
        const standing: Standing = { declarer: action.seat, mode: 'betl', trump: null, bid: null };
        return {
          ...state,
          phase: { name: 'takeover', standing, passed: [], toAct: speakingOrder(action.seat)[0] },
        };
      }
      // jinak převzetí (volený) proběhlo UŽ PŘED deklarací a rovnou se flekuje
      return startFleks({ ...state, contract }, contract);
    }

    case 'takeover': {
      if (phase.name !== 'takeover') throw new InvariantError('takeover mimo fázi');
      if (action.claim === 'good') {
        const passed = [...phase.passed, action.seat];
        const others = speakingOrder(phase.standing.declarer);
        if (others.every((o) => passed.includes(o))) {
          return resolveTakeover(state, phase.standing);
        }
        const nextTo = others.find((o) => !passed.includes(o)) as Seat;
        return { ...state, phase: { ...phase, passed, toAct: nextTo } };
      }
      if (action.claim === 'take') {
        /*
         * „Seberou odložený talon a následně po odhozu jiného talonu ohlásí
         * Betl či Durch" (čl. VII/1): obránce zvedne talon (a vidí ho),
         * odhodí dvě karty a druh hry bez trumfů vybere až s nimi v ruce.
         * Stojící závazek: bez módu i bez trumfu — viz `trumplessChoicePending`.
         * House rule 'keep' talon nechává ležet a jde se rovnou k volbě.
         */
        const standing: Standing = { declarer: action.seat, mode: null, trump: null, bid: null };
        if (state.config.talonOnTakeover === 'keep') {
          return { ...state, phase: { name: 'declare', standing } };
        }
        const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
        hands[action.seat] = sortHand(hands[action.seat].concat(state.talon));
        const talonKnowledge = state.talonKnowledge.map((k) => k.slice()) as [Card[], Card[], Card[]];
        for (const c of state.talon) {
          if (!talonKnowledge[action.seat].includes(c)) talonKnowledge[action.seat].push(c);
        }
        return {
          ...state,
          hands,
          talon: [],
          talonOwner: null,
          talonKnowledge,
          phase: { name: 'discard-talon', standing },
        };
      }
      // aktérův betl/durch, nebo nárok na durch proti ohlášenému betlu: nový
      // držitel, pasy se ruší, slovo dostávají ostatní ve směru hraní
      const standing: Standing = { declarer: action.seat, mode: action.claim, trump: null, bid: null };
      return { ...state, phase: { name: 'takeover', standing, passed: [], toAct: speakingOrder(action.seat)[0] } };
    }

    case 'flek': {
      if (phase.name !== 'fleks' || !state.contract) throw new InvariantError('flek mimo fázi');
      const f = phase.fleks;
      const raised: FlekState = {
        ...f,
        levels: { ...f.levels, [action.target]: (f.levels[action.target] ?? 0) + 1 },
        lastRaiser: { ...f.lastRaiser, [action.target]: action.seat },
        spoke: [...f.spoke, action.seat],
        raised: [...f.raised, action.target],
      };
      // kolo se zvýšením nemůže skončit fází, jen předá slovo protistraně
      const next = advanceFleks(state, state.contract, raised) as FlekState;
      return { ...state, phase: { name: 'fleks', fleks: next } };
    }

    case 'announce-proti': {
      if (phase.name !== 'fleks' || !state.contract) throw new InvariantError('proti mimo fázi');
      const contract: Contract = {
        ...state.contract,
        sedma: action.sedma ? action.seat : state.contract.sedma,
        kilo: action.kilo ? action.seat : state.contract.kilo,
      };
      const f = phase.fleks;
      /*
       * Sedma/sto proti je nový závazek obrany — aktér se k němu musí dostat
       * v příštím kole, takže se chová jako zvýšení (otevře tu komponentu).
       */
      const announced: FlekState = {
        ...f,
        spoke: [...f.spoke, action.seat],
        raised: [
          ...f.raised,
          ...(action.sedma ? (['sedma'] as FlekTarget[]) : []),
          ...(action.kilo ? (['kilo'] as FlekTarget[]) : []),
        ],
      };
      const next = advanceFleks(state, contract, announced) as FlekState;
      return { ...state, contract, phase: { name: 'fleks', fleks: next } };
    }

    case 'good': {
      if (phase.name !== 'fleks' || !state.contract) throw new InvariantError('good mimo fázi');
      const f = phase.fleks;
      const spoke: FlekState = { ...f, spoke: [...f.spoke, action.seat] };
      const next = advanceFleks(state, state.contract, spoke);
      if (next !== null) return { ...state, phase: { name: 'fleks', fleks: next } };

      /*
       * Flekování skončilo schválením. Co z toho plyne, rozhoduje `flekEnding`
       * v `legal.ts` — tentýž předpis se ptá UI, aby varovalo předem, takže
       * pravidlo žije na JEDNOM místě.
       */
      const c = state.contract;
      switch (flekEnding(state.config, c, spoke)) {
        case 'dobra':
          return settlePlainHra(state, c);
        case 'flek-bez-re':
          return settlePlainHra(state, c, { wonBy: 'defenders', flekLevel: 1 });
        case 'vyrovnano':
          return settleEvenOut(state, c);
        default:
          return startTricks(state);
      }
    }

    case 'play': {
      if (phase.name !== 'tricks' || !state.contract) throw new InvariantError('play mimo fázi');
      const hands = state.hands.map((h) => h.slice()) as [Card[], Card[], Card[]];
      hands[action.seat] = hands[action.seat].filter((c) => c !== action.card);
      const trick = [...phase.trick, { seat: action.seat, card: action.card }];
      const marriages = action.announceMarriage
        ? [...phase.marriages, { seat: action.seat, suit: suitOf(action.card) }]
        : phase.marriages;

      if (trick.length < 3) {
        return {
          ...state, hands,
          phase: { ...phase, trick, marriages, toAct: nextSeat(action.seat) },
        };
      }

      // štych dokončen
      const winner = trickWinner(trick, state.contract.trump, state.contract.mode);
      const won = phase.won.map((w) => w.slice()) as [Card[], Card[], Card[]];
      won[winner].push(...trick.map((p) => p.card));
      const played = [...phase.played, { plays: trick, winner }];

      // betl padá prvním štychem aktéra, durch první ztrátou — hra se skládá hned
      const earlyEnd =
        (state.contract.mode === 'betl' && winner === state.contract.declarer) ||
        (state.contract.mode === 'durch' && winner !== state.contract.declarer);

      if (phase.trickNo === 9 || earlyEnd) {
        // konec hry → zúčtování
        const flekLevels = flekLevelsFromHistory(state);
        const result = settle({
          handNo: state.handNo,
          config: state.config,
          contract: state.contract,
          flekLevels,
          tricks: played,
          marriages,
          flekRaisers: flekRaisersFromHistory(state),
        });
        const ledger: [number, number, number] = [
          state.ledger[0] + result.delta[0],
          state.ledger[1] + result.delta[1],
          state.ledger[2] + result.delta[2],
        ];
        return {
          ...state,
          hands,
          ledger,
          handResults: [...state.handResults, result],
          phase: { name: 'scored', result },
        };
      }

      return {
        ...state, hands,
        phase: {
          ...phase, trickNo: phase.trickNo + 1, leader: winner, toAct: winner,
          trick: [], played, won, marriages,
        },
      };
    }
  }
}

/**
 * Prostá hra, která se nehraje. Dvě podoby téhož: schválená („dobrá hra se
 * nehraje" — platí obrana aktérovi) a flekovaná bez re (ČSM volený B/19 —
 * platí aktér obraně vyflekovanou sazbu).
 */
function settlePlainHra(
  state: GameState,
  contract: Contract,
  opts: { wonBy: 'declarer' | 'defenders'; flekLevel: number } = { wonBy: 'declarer', flekLevel: 0 },
): GameState {
  const s = state.config.sazby;
  const cerveny = contract.trump === CERVENE ? s.cervenyMultiplier : 1;
  const flekMultiplier = 2 ** opts.flekLevel;
  const amount = s.hra * cerveny * flekMultiplier;
  const sign = opts.wonBy === 'declarer' ? 1 : -1;
  const [d1, d2] = defendersOf(contract.declarer);
  const delta: [number, number, number] = [0, 0, 0];
  delta[contract.declarer] = sign * 2 * amount;
  delta[d1] = -sign * amount;
  delta[d2] = -sign * amount;
  const result: import('./types').HandResult = {
    handNo: state.handNo,
    contract,
    cardPoints: { declarer: 0, defenders: 0 },
    marriagePoints: { declarer: 0, defenders: 0 },
    components: [{
      target: 'hra', wonBy: opts.wonBy, baseRate: s.hra, flekMultiplier,
      extraMultiplier: cerveny, amount, silent: false,
      note: opts.wonBy === 'declarer' ? 'dobrá — nehrálo se' : 'flek bez re — nehrálo se',
    }],
    delta,
  };
  return {
    ...state,
    ledger: [state.ledger[0] + delta[0], state.ledger[1] + delta[1], state.ledger[2] + delta[2]],
    handResults: [...state.handResults, result],
    phase: { name: 'scored', result },
  };
}

/**
 * Vyrovnané závazky (Obecná pravidla čl. V/11): flekovaná a aktérem schválená
 * Hra proti neflekované Sedmě. Obě strany se shodly, kdo co vyhrál, částky
 * jsou stejné a sehrávka se nekoná — do archivu jdou obě komponenty, ať je
 * z vyúčtování vidět PROČ je nula.
 */
function settleEvenOut(state: GameState, contract: Contract): GameState {
  const s = state.config.sazby;
  const cerveny = contract.trump === CERVENE ? s.cervenyMultiplier : 1;
  const result: import('./types').HandResult = {
    handNo: state.handNo,
    contract,
    cardPoints: { declarer: 0, defenders: 0 },
    marriagePoints: { declarer: 0, defenders: 0 },
    components: [
      {
        target: 'hra', wonBy: 'defenders', baseRate: s.hra, flekMultiplier: 2,
        extraMultiplier: cerveny, amount: s.hra * 2 * cerveny, silent: false,
        note: 'vyrovnáno — nehrálo se',
      },
      {
        target: 'sedma', wonBy: 'declarer', baseRate: s.sedma, flekMultiplier: 1,
        extraMultiplier: cerveny, amount: s.sedma * cerveny, silent: false,
        note: 'vyrovnáno — nehrálo se',
      },
    ],
    delta: [0, 0, 0],
  };
  return {
    ...state,
    handResults: [...state.handResults, result],
    phase: { name: 'scored', result },
  };
}

/**
 * Vzdání hry (house rule, §5.5.2). Kdo vzdá, **platí sám**: soupeřům jde sazba
 * stojícího závazku včetně fleků. Spoluhráč za cizí rozhodnutí neplatí, proto
 * se nedělí po stranách jako u běžného zúčtování.
 *
 * Bez kontraktu (ještě se nekomentovalo) se platí základní sazba hry — vzdát
 * rozdanou hru něco stát musí, jinak by to bylo zdarma řešení špatných karet.
 */
/**
 * Závazek, který se u vzdání platí.
 *
 * Dokud nepadne `declare`, je `state.contract` `null` — a ve fázi převzetí
 * dokonce drží PŘEKONANOU deklaraci. Skutečný závazek přitom už existuje:
 * ve `phase.standing` (vysoutěžený závazek v licitovaném, zvolený trumf ve
 * voleném, nárok na betl/durch při převzetí). Bez tohohle přepočtu by se dal
 * vysoutěžený durch nebo převzatý betl vzdát za sazbu holé hry.
 *
 * Ve fázi `bidding` se schválně účtuje základní hra: licitace ještě neskončila,
 * nejvyšší příhoz může kdokoli přebít, takže žádný hráč závazek nedrží.
 */
function contractToSettle(state: GameState): Contract | null {
  const phase = state.phase;
  const st =
    phase.name === 'takeover' || phase.name === 'discard-talon' || phase.name === 'declare'
      ? phase.standing
      : null;
  if (st === null) return state.contract;

  // deklarace už padla a nárok jí odpovídá → `contract` je přesnější (zná
  // trumf i skutečně hlášenou sedmu/kilo)
  const c = state.contract;
  if (c !== null && c.declarer === st.declarer && (st.mode === null || c.mode === st.mode)) return c;

  const kind = st.bid?.kind ?? null;
  // kdo sebral talon a ještě nevybral, hraje hru bez trumfů — vzdání platí
  // aspoň betl, jinak by zvednutý talon byl levným únikem za sazbu hry
  const mode = st.mode ?? (kind === 'betl' || kind === 'durch' ? kind : trumplessChoicePending(state.config, st) ? 'betl' : 'hra');
  const colour = mode === 'hra';
  // vysoutěžený závazek musí deklarace pokrýt (legal.ts), takže sedma/kilo
  // z příhozu jsou pro vzdávajícího závazné stejně jako by byly ohlášené
  const withSedma = kind === 'sedma' || kind === 'sto-sedma' || kind === 'dve-sedmy' || kind === 'dve-sedmy-sto';
  const withKilo = kind === 'sto' || kind === 'sto-sedma' || kind === 'dve-sedmy-sto';
  const withDveSedmy = kind === 'dve-sedmy' || kind === 'dve-sedmy-sto';
  return {
    mode,
    trump: colour ? st.trump : null,
    declarer: st.declarer,
    sedma: colour && withSedma ? st.declarer : null,
    kilo: colour && withKilo ? st.declarer : null,
    dveSedmy: colour && withDveSedmy,
  };
}

function concede(state: GameState, seat: Seat): GameState {
  const s = state.config.sazby;
  const contract = contractToSettle(state);
  const levels = flekLevelsFromHistory(state);
  const mode = contract?.mode ?? 'hra';
  // červený trumf násobí barevné závazky (hra/sedma/kilo), betl a durch ne
  const cerveny = contract?.trump === CERVENE ? s.cervenyMultiplier : 1;

  /*
   * Vzdává se CELÝ stojící závazek, ne jen hra. Kdyby se platila jen hra,
   * bylo by vzdání levným únikem z vyflekované sedmy nebo kila: hlásím,
   * nechám se vyflekovat a pak to vzdám za základní sazbu.
   *
   * Komponenty odpovídají těm, které by spočítalo `settle()` — každá se svým
   * flekovým multiplikátorem. Kilo se platí v základu: škálování po deseti
   * bodech vychází z odehraných bodů, a ty u vzdané hry neexistují.
   */
  const components: import('./types').ComponentResult[] = [];
  const push = (
    target: import('./types').FlekTarget,
    baseRate: number,
    extraMultiplier: number,
    note: string,
  ): void => {
    const flekMultiplier = 2 ** (levels[target] ?? 0);
    components.push({
      target,
      // kdo vzdal, ten prohrál — bez kontraktu je aktérem dosazený sám vzdávající
      wonBy: (contract?.declarer ?? seat) === seat ? 'defenders' : 'declarer',
      baseRate,
      flekMultiplier,
      extraMultiplier,
      amount: baseRate * flekMultiplier * extraMultiplier,
      silent: false,
      note,
    });
  };

  if (mode === 'betl' || mode === 'durch') {
    push(mode, mode === 'betl' ? s.betl : s.durch, 1, 'vzdáno');
  } else {
    push('hra', s.hra, cerveny, 'vzdáno');
    if (contract?.sedma != null) push('sedma', s.sedma, cerveny, 'vzdáno');
    if (contract?.kilo != null) push('kilo', s.kilo, cerveny, 'vzdáno');
    if (contract?.dveSedmy === true) push('dveSedmy', s.dveSedmy, cerveny, 'vzdáno');
  }

  const raw = components.reduce((sum, c) => sum + c.amount, 0);
  // limit platí i na vzdanou hru: je to výsledná sazba za tuhle hru (čl. V/8)
  const raisers = flekRaisersFromHistory(state).filter((r) => r !== (contract?.declarer ?? seat));
  const cap = new Set(raisers).size >= 2 ? s.limitRaised : s.limit;
  const limited = Number.isFinite(cap) && raw > cap;
  const amount = limited ? cap : raw;

  const delta: [number, number, number] = [0, 0, 0];
  for (const other of [0, 1, 2] as Seat[]) {
    if (other === seat) continue;
    delta[other] += amount;
    delta[seat] -= amount;
  }

  const result: import('./types').HandResult = {
    handNo: state.handNo,
    ...(limited ? { limit: cap } : {}),
    contract: contract ?? {
      // ještě se nekomentovalo: hra bez trumfu, ať vyúčtování nehlásí barvu,
      // která nikdy nepadla (a která by naznačovala červený násobek)
      mode: 'hra', trump: null, declarer: seat, sedma: null, kilo: null, dveSedmy: false,
    },
    cardPoints: { declarer: 0, defenders: 0 },
    marriagePoints: { declarer: 0, defenders: 0 },
    components,
    delta,
  };
  return {
    ...state,
    ledger: [state.ledger[0] + delta[0], state.ledger[1] + delta[1], state.ledger[2] + delta[2]],
    handResults: [...state.handResults, result],
    phase: { name: 'scored', result },
  };
}

/** Kdo v aktuální hře flekoval — pro zvýšený limit (čl. V/8, B/15, II/18). */
function flekRaisersFromHistory(state: GameState): Seat[] {
  const out: Seat[] = [];
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'flek' && !out.includes(a.seat)) out.push(a.seat);
  }
  return out;
}

/** Finální úrovně fleků — z historie akcí aktuální hry (fleks fáze už neexistuje). */
function flekLevelsFromHistory(state: GameState): Partial<Record<import('./types').FlekTarget, number>> {
  const levels: Partial<Record<import('./types').FlekTarget, number>> = {};
  // projdi akce od posledního 'deal'
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'flek') levels[a.target] = (levels[a.target] ?? 0) + 1;
  }
  return levels;
}

/**
 * Kdo je v licitaci ve hře. Draží spolu ZADÁK a FORHONT; „po odstoupení
 * jednoho z hráčů se do licitace zapojí i prostřední hráč, který přebírá jeho
 * postavení" (Obecná pravidla čl. VII/3). Prostřední tedy nedostane slovo,
 * dokud někdo neodstoupí — dřív se do dražby pletl hned po prvním „mám".
 *
 * Kdo odstoupí, nevrací se (čl. V/3), takže odstoupení jsou konečná.
 */
function biddingActive(dealer: Seat, withdrawn: readonly Seat[]): Seat[] {
  const f = forhont(dealer);
  const zadak = dealer; // ve třech dostává karty poslední
  const order: Seat[] = withdrawn.length === 0 ? [zadak, f] : [zadak, f, nextSeat(f)];
  return order.filter((s) => !withdrawn.includes(s));
}

/**
 * Další na slovo: ze dvojice ve hře ten, kdo zrovna nedrží nejvyšší příhoz.
 * Když ve hře zbyl jediný, licitace skončila a volající si to ošetří sám.
 */
function nextNonHolder(dealer: Seat, holder: Seat, withdrawn: readonly Seat[] = []): Seat {
  const active = biddingActive(dealer, withdrawn);
  return active.find((s) => s !== holder) ?? active[0] ?? holder;
}

/** Sedadla, která už v této licitaci pasovala (a tím z ní vypadla). */
function withdrawnFromBidding(bids: readonly { seat: Seat; bid: unknown }[]): Seat[] {
  const out: Seat[] = [];
  for (const b of bids) if (b.bid === 'pass' && !out.includes(b.seat)) out.push(b.seat);
  return out;
}

// ── replay ───────────────────────────────────────────────────────────────────

export function replay(
  history: readonly PlayerAction[],
  config: RulesConfig,
  firstDealer: Seat = 2,
): GameState {
  return history.reduce<GameState>((s, a) => apply(s, a), initialState(config, firstDealer));
}
