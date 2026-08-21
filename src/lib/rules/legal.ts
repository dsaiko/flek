/**
 * legal.ts — jediný zdroj pravdy legality (docs/marias-design.md §5.3)
 *
 * legalActions je definováno nad PlayerView: legalita vlastních akcí závisí jen
 * na veřejném stavu + vlastní ruce, takže tutéž funkci volá UI (aktivní tlačítka),
 * AI ve workeru (akční prostor) i engine (apply validuje členstvím).
 *
 * Systémová akce `deal` se generuje jen ve fázích idle/scored (bez sedadla).
 */

import { CERVENE, R7, R10, ESO, KRAL, SVRSEK, card, rankOf, suitOf, type Card, type Suit } from '../cards';
import { legalPlays } from './tricks';
import type { BidLevel, FlekTarget, GameMode, PlayerAction, PlayerView, Seat } from './types';
import { bidRank, forhont, nextSeat } from './types';

const MODE_RANK: Record<GameMode, number> = { hra: 0, betl: 1, durch: 2 };

const isValuable = (c: Card): boolean => rankOf(c) === ESO || rankOf(c) === R10;

/** Všechny závazky licitačního žebříčku (bez nelegálních kombinací). */
const ALL_BIDS: BidLevel[] = (
  [
    { kind: 'sedma', cervena: false }, { kind: 'sedma', cervena: true },
    { kind: 'sto', cervena: false }, { kind: 'sto-sedma', cervena: false },
    { kind: 'sto', cervena: true }, { kind: 'sto-sedma', cervena: true },
    { kind: 'betl', cervena: false }, { kind: 'durch', cervena: false },
    { kind: 'dve-sedmy', cervena: false }, { kind: 'dve-sedmy-sto', cervena: false },
    { kind: 'dve-sedmy', cervena: true }, { kind: 'dve-sedmy-sto', cervena: true },
  ] as BidLevel[]
).sort((a, b) => bidRank(a) - bidRank(b));

export function legalActions(v: PlayerView): PlayerAction[] {
  const me = v.seat;
  const phase = v.phase;
  const out: PlayerAction[] = [];

  switch (phase.name) {
    case 'idle':
    case 'scored':
      // systémová akce — seed doplní volající (match controller)
      out.push({ type: 'deal', seed: 0 });
      break;

    case 'choose-trump': {
      if (me !== forhont(v.dealer)) break;
      for (const c of v.hand) out.push({ type: 'choose-trump', seat: me, card: c });
      out.push({ type: 'choose-trump', seat: me, card: 'from-people' });
      break;
    }

    case 'bidding': {
      if (me !== phase.toAct) break;
      out.push({ type: 'bid', seat: me, bid: 'pass' });
      const minRank = phase.best ? bidRank(phase.best) : 0;
      for (const b of ALL_BIDS) {
        if (bidRank(b) <= minRank) continue;
        if (!v.config.enableDveSedmy && (b.kind === 'dve-sedmy' || b.kind === 'dve-sedmy-sto')) continue;
        out.push({ type: 'bid', seat: me, bid: b });
      }
      break;
    }

    case 'discard-talon': {
      if (me !== phase.standing.declarer || v.hand.length !== 12) break;
      for (let i = 0; i < v.hand.length; i += 1) {
        for (let j = i + 1; j < v.hand.length; j += 1) {
          out.push({ type: 'discard', seat: me, cards: [v.hand[i], v.hand[j]] });
        }
      }
      break;
    }

    case 'declare': {
      const st = phase.standing;
      if (me !== st.declarer) break;

      if (st.mode === 'betl' || st.mode === 'durch') {
        // mód zamčený (převzetí ve voleném / licitovaný betl-durch)
        out.push({ type: 'declare', seat: me, mode: st.mode, sedma: false, kilo: false });
        break;
      }

      // hra: talon nesmí obsahovat esa/desítky (příp. trumfy dle house rule)
      const talon = v.talon ?? [];
      const trumps = (t: Suit | null) => talon.filter((c) => t !== null && suitOf(c) === t);
      const hraTalonOk = (t: Suit | null) =>
        !talon.some(isValuable) && (!v.config.talonForbidsTrump || trumps(t).length === 0);

      const pushHra = (trump: Suit) => {
        if (!hraTalonOk(trump)) return;
        const canSedma = v.hand.includes(card(trump, R7));
        const bid = st.bid;
        // licitovaný: deklarace musí pokrýt vysoutěžený závazek
        const needSedma = bid !== null && (bid.kind === 'sedma' || bid.kind === 'sto-sedma');
        const needKilo = bid !== null && (bid.kind === 'sto' || bid.kind === 'sto-sedma');
        for (const sedma of [false, true]) {
          for (const kilo of [false, true]) {
            if (sedma && !canSedma) continue;
            if (needSedma && !sedma) continue;
            if (needKilo && !kilo) continue;
            out.push({
              type: 'declare', seat: me, mode: 'hra', sedma, kilo,
              ...(st.trump === null ? { trump } : {}),
            });
          }
        }
      };

      if (st.trump !== null) {
        pushHra(st.trump);
      } else {
        // licitovaný: volba trumfu — červená jen při červeném závazku (a naopak)
        const bid = st.bid;
        const suits: Suit[] = bid?.cervena ? [CERVENE] : ([0, 1, 2, 3] as Suit[]).filter(
          (s) => bid === null || s !== CERVENE,
        );
        for (const s of suits) pushHra(s);
      }

      // volený: aktér smí místo hry ohlásit betl/durch (licitovaný jen dle závazku)
      if (v.config.variant === 'voleny') {
        out.push({ type: 'declare', seat: me, mode: 'betl', sedma: false, kilo: false });
        out.push({ type: 'declare', seat: me, mode: 'durch', sedma: false, kilo: false });
      }
      break;
    }

    case 'takeover': {
      if (me !== phase.toAct) break;
      out.push({ type: 'takeover', seat: me, claim: 'good' });
      const currentRank = MODE_RANK[phase.standing.mode ?? 'hra'];
      if (MODE_RANK.betl > currentRank) out.push({ type: 'takeover', seat: me, claim: 'betl' });
      if (MODE_RANK.durch > currentRank) out.push({ type: 'takeover', seat: me, claim: 'durch' });
      break;
    }

    case 'fleks': {
      const f = phase.fleks;
      const contract = v.contract;
      if (me !== f.toAct || contract === null) break;

      out.push({ type: 'good', seat: me });

      const holderSeat = (t: FlekTarget): Seat =>
        t === 'sedma' ? (contract.sedma as Seat)
        : t === 'kilo' ? (contract.kilo as Seat)
        : contract.declarer;
      const sideOf = (s: Seat): boolean => s === contract.declarer; // true = strana aktéra

      const targets: FlekTarget[] =
        contract.mode === 'hra'
          ? (['hra', ...(contract.sedma !== null ? ['sedma'] : []), ...(contract.kilo !== null ? ['kilo'] : [])] as FlekTarget[])
          : [contract.mode];

      for (const t of targets) {
        const level = f.levels[t] ?? 0;
        if (level >= v.config.sazby.maxFlekLevel) continue;
        const last = f.lastRaiser[t];
        const eligible =
          last === undefined
            ? sideOf(me) !== sideOf(holderSeat(t)) // první flek dává protistrana držitele
            : sideOf(me) !== sideOf(last); // dál se strany střídají
        if (eligible) out.push({ type: 'flek', seat: me, target: t });
      }

      // sedma/sto proti: obránce, jen v barevné hře, jen dokud komponenta neexistuje
      if (contract.mode === 'hra' && !sideOf(me)) {
        const canSedmaProti =
          contract.sedma === null && contract.trump !== null && v.hand.includes(card(contract.trump, R7));
        const canKiloProti = contract.kilo === null;
        if (canSedmaProti) out.push({ type: 'announce-proti', seat: me, sedma: true, kilo: false });
        if (canKiloProti) out.push({ type: 'announce-proti', seat: me, sedma: false, kilo: true });
        if (canSedmaProti && canKiloProti) out.push({ type: 'announce-proti', seat: me, sedma: true, kilo: true });
      }
      break;
    }

    case 'tricks': {
      if (me !== phase.toAct || v.contract === null) break;
      const { mode, trump } = v.contract;
      let cards = legalPlays(v.hand, phase.trick, trump, mode);

      // hlášená sedma smí z ruky až v posledním štychu (dřív jen z donucení)
      if (v.contract.sedma === me && trump !== null && phase.trickNo < 9) {
        const seven = card(trump, R7);
        if (cards.includes(seven) && cards.length > 1) cards = cards.filter((c) => c !== seven);
      }

      const announced = new Set(
        phase.marriages.filter((m) => m.seat === me).map((m) => m.suit),
      );
      for (const c of cards) {
        out.push({ type: 'play', seat: me, card: c, announceMarriage: false });
        // hláška: hraju K/svrška, partnera držím, v této barvě jsem ještě nehlásil
        if (mode === 'hra' && (rankOf(c) === KRAL || rankOf(c) === SVRSEK) && !announced.has(suitOf(c))) {
          const partner = card(suitOf(c), rankOf(c) === KRAL ? SVRSEK : KRAL);
          if (v.hand.includes(partner)) {
            out.push({ type: 'play', seat: me, card: c, announceMarriage: true });
          }
        }
      }
      break;
    }
  }

  return out;
}

/** Porovnání akcí pro validaci v apply (deal se porovnává bez seedu/configu). */
export function actionMatchesLegal(action: PlayerAction, legal: PlayerAction[]): boolean {
  if (action.type === 'deal') return legal.some((l) => l.type === 'deal');
  const norm = (a: PlayerAction): string => {
    const o: Record<string, unknown> = { ...a };
    if (a.type === 'discard') o.cards = [...a.cards].sort((x, y) => x - y);
    if (a.type === 'declare' && a.dveSedmy === undefined) o.dveSedmy = false;
    // stabilní serializace nezávislá na pořadí klíčů
    return JSON.stringify(o, Object.keys(o).sort());
  };
  const target = norm(action);
  return legal.some((l) => norm(l) === target);
}

export { nextSeat };
