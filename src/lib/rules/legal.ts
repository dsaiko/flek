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
import type {
  BidLevel, Contract, FlekState, FlekTarget, GameMode, PlayerAction, PlayerView, RulesConfig, Seat,
} from './types';
import { bidRank, defendersOf, forhont, nextSeat } from './types';

const MODE_RANK: Record<GameMode, number> = { hra: 0, betl: 1, durch: 2 };

/**
 * Jak dopadne flekování, když právě teď skončí (nikdo už nezvýšil).
 *
 * Tři důvody, proč se sehrávka nekoná, a všechny jsou v pravidlech:
 *  - `dobra`: neflekovaná holá hra se nehraje a platí se aktérovi (hospodské
 *    pravidlo i FLEK!, přepínač `autoSettlePlainHra`),
 *  - `flek-bez-re`: „Flekovaná hra se bez »re« nehraje" (ČSM volený B/19),
 *  - `vyrovnano`: „Dojde-li k tomu, že při závazku Sedma je obranou Hra
 *    okomentována flekem a Sedma schválena bez fleku, a volící strana
 *    schvaluje prohranou Hru, sehrávka se nekoná, neboť závazky jsou finančně
 *    vyrovnané a není v nich sporu o vítězi" (Obecná pravidla čl. V/11).
 *
 * Podmínku „finančně vyrovnané" bereme doslova: uplatní se, jen když se
 * vyflekovaná hra a sedma v daném sazebníku opravdu rovnají (v ČSM ano, 2 = 2).
 */
export type FlekEnding = 'play' | 'dobra' | 'flek-bez-re' | 'vyrovnano';

export function flekEnding(config: RulesConfig, contract: Contract, fleks: FlekState): FlekEnding {
  if (contract.mode !== 'hra' || contract.kilo !== null) return 'play';
  const levels = fleks.levels;
  const raisedKeys = Object.keys(levels).filter((k) => (levels[k as FlekTarget] ?? 0) > 0);
  if (raisedKeys.some((k) => k !== 'hra')) return 'play';
  const hra = levels.hra ?? 0;
  const cerveny = contract.trump === CERVENE ? config.sazby.cervenyMultiplier : 1;

  if (contract.sedma === null) {
    if (config.autoSettlePlainHra && hra === 0) return 'dobra';
    if (config.autoSettleFlekkedHra && hra === 1) return 'flek-bez-re';
    return 'play';
  }
  // čl. V/11 — jen sedma AKTÉRA (sedma proti je jiná situace) a jen flek bez re
  if (contract.sedma === contract.declarer && hra === 1) {
    const hraAmount = config.sazby.hra * 2 * cerveny;
    const sedmaAmount = config.sazby.sedma * cerveny;
    if (hraAmount === sedmaAmount) return 'vyrovnano';
  }
  return 'play';
}

/**
 * Znamená „dobrá" od tohohle sedadla konec flekování BEZ sehrávky?
 *
 * „Flekovaná hra se bez »re« nehraje" (ČSM volený B/19): kdo flek na holou hru
 * nezvedne, rovnou ji platí obraně. Je to jediné místo, kde „dobrá" stojí
 * peníze bez jediné odehrané karty, takže se na to UI musí zeptat — a
 * `maybeAutoGood` to nesmí odklikat za hráče.
 *
 * Podmínku drží pohromadě s reducerem test: pro každý stav, kde tahle funkce
 * řekne `true`, musí `apply(good)` skončit zúčtováním (a naopak).
 */
export function passSettlesWithoutPlay(v: PlayerView): 'flek-bez-re' | 'vyrovnano' | null {
  const c = v.contract;
  if (v.phase.name !== 'fleks' || c === null) return null;
  const f = v.phase.fleks;
  // v tomhle kole už někdo zvýšil → kolo pokračuje protistraně, nekončí se
  if (f.raised.length > 0) return null;
  // jsem poslední ze své strany, kdo v tomhle kole mluví?
  const side: Seat[] = v.seat === c.declarer ? [c.declarer] : defendersOf(c.declarer);
  if (!side.every((s) => s === v.seat || f.spoke.includes(s))) return null;
  const ending = flekEnding(v.config, c, f);
  /*
   * „Dobrá" u neflekované hry se nehlásí: to je dávno zavedené chování
   * („dobrá hra se nehraje") a hráče nic nestojí. Ptáme se jen tam, kde
   * kliknutí buď platí flek, nebo tiše zahodí rozehranou hru.
   */
  return ending === 'flek-bez-re' || ending === 'vyrovnano' ? ending : null;
}

/**
 * Smí aktér po odhozu vůbec hlásit barevnou hru? Talon bez esa/desítky
 * (ČSM volený C/13) — a bez trumfu, pokud běží house rule `talonForbidsTrump`.
 * Bez toho by otázka „Barva?" vedla do deklarace bez jediné legální akce.
 */
function colourDeclarationPossible(v: PlayerView, st: { trump: Suit | null }): boolean {
  const talon = v.talon ?? [];
  if (talon.some(isValuable)) return false;
  if (!v.config.talonForbidsTrump) return true;
  return !talon.some((c) => st.trump !== null && suitOf(c) === st.trump);
}

/**
 * Místo deklarace v licitačním žebříčku (`bidRank`). Holá hra leží pod
 * žebříčkem (stupeň 1 je sedma), proto 0.
 */
function declareRank(mode: GameMode, sedma: boolean, kilo: boolean, trump: Suit | null): number {
  if (mode === 'betl') return bidRank({ kind: 'betl', cervena: false });
  if (mode === 'durch') return bidRank({ kind: 'durch', cervena: false });
  const cervena = trump === CERVENE;
  if (sedma && kilo) return bidRank({ kind: 'sto-sedma', cervena });
  if (kilo) return bidRank({ kind: 'sto', cervena });
  if (sedma) return bidRank({ kind: 'sedma', cervena });
  return 0;
}

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
      // „z lidu" jen když je z čeho brát (poškozený sav by jinak dal trumf
      // z `undefined`, tedy tiše červené)
      if (v.unseenCount > 0) out.push({ type: 'choose-trump', seat: me, card: 'from-people' });
      break;
    }

    case 'bidding': {
      if (me !== phase.toAct) break;
      out.push({ type: 'bid', seat: me, bid: 'pass' });
      const minRank = phase.best ? bidRank(phase.best) : 0;
      /*
       * Shodu drží hráč dřívější v pořadí mluvení (§3.4): smí vzít TÝŽ závazek,
       * ostatní musí přihodit výš. Každé takové „držím" posouvá držitele blíž
       * k forhontovi, takže licitace zůstává konečná.
       */
      const order = [forhont(v.dealer), nextSeat(forhont(v.dealer)), nextSeat(nextSeat(forhont(v.dealer)))];
      const holder = [...phase.bids].reverse().find((b) => b.bid !== 'pass')?.seat;
      const mayHoldEqual =
        phase.best !== null && holder !== undefined && order.indexOf(me) < order.indexOf(holder);
      /*
       * Sedmový závazek smí slíbit jen ten, kdo ho pak dokáže deklarací pokrýt —
       * jinak by se hra zasekla bez legální akce (omyl podle licitovaných pravidel
       * čl. 17 neúčtujeme, viz README).
       *
       * Pozor na past: vysoutěžený stupeň je MINIMUM, ne přesný předpis (Obecná
       * pravidla čl. VII/3, viz §25). Kdo drží ČERVENOU sedmu, umí pokrýt i
       * nečervený sedmový závazek — ohlásí červenou variantu, která je v žebříčku
       * o stupeň výš (licitovaný čl. I: 1 sedma, 2 sedma červená; 4 sto a sedma,
       * 6 sto a sedma červených). Nečervený závazek proto stačí JAKÁKOLI sedma,
       * červený výhradně ta červená.
       */
      const hasCervenaSeven = v.hand.includes(card(CERVENE, R7));
      const hasAnySeven = v.hand.some((c) => rankOf(c) === R7);
      for (const b of ALL_BIDS) {
        const rank = bidRank(b);
        if (rank < minRank || (rank === minRank && !mayHoldEqual)) continue;
        // „dvě sedmy" scoring neumí (viz §10) — nenabízí se ani se zapnutým configem
        if (b.kind === 'dve-sedmy' || b.kind === 'dve-sedmy-sto') continue;
        const needsSeven = b.kind === 'sedma' || b.kind === 'sto-sedma';
        if (needsSeven && !(b.cervena ? hasCervenaSeven : hasAnySeven)) continue;
        out.push({ type: 'bid', seat: me, bid: b });
      }
      break;
    }

    case 'discard-talon': {
      const stDiscard = phase.standing;
      if (me !== stDiscard.declarer || v.hand.length !== 12) break;

      /*
       * Odhazuje se PŘED ohlášením závazku, takže se nabízí vše. Eso ani
       * desítka v talonu nejsou renonc „vyjma Betla či Durcha" (Obecná
       * pravidla čl. IV/11, volený C/13) — a betl i durch jdou ohlásit vždycky:
       * ve voleném na otázku „Barva?", v licitovaném jsou nejvyššími stupni
       * žebříčku, takže pokryjí jakýkoli vysoutěžený barevný závazek.
       *
       * Kdo si tedy odhodí eso, prostě si tím zavřel barevnou hru a hraje
       * bez trumfů; `declare` mu nikdy nezůstane bez legální akce. Dřív se
       * takové odhozy v licitovaném vůbec nenabízely, což zakazovalo tah,
       * který pravidla dovolují (a vylučovalo betl s esem v talonu).
       * Riziko hlídá UI varovným popupem, ne pravidla.
       */
      const discardOk = (pair: readonly [Card, Card]): boolean => {
        /*
         * Zvolená karta do talonu nesmí: aktér odkládá dvě karty „na sebe
         * a ODDĚLENĚ OD ZVOLENÉ KARTY" (ČSM volený, B/7) — ta po celou dobu
         * leží stranou lícem dolů (Obecná pravidla, Čl. VII/1) a do ruky se
         * vrací až na sehrávku. Platí to při všech hrách, i u betlu a durchu.
         */
        return !(v.revealedTrump !== null && pair.includes(v.revealedTrump));
      };

      for (let i = 0; i < v.hand.length; i += 1) {
        for (let j = i + 1; j < v.hand.length; j += 1) {
          const pair: [Card, Card] = [v.hand[i], v.hand[j]];
          if (discardOk(pair)) out.push({ type: 'discard', seat: me, cards: pair });
        }
      }
      break;
    }

    case 'declare': {
      const st = phase.standing;
      if (me !== st.declarer) break;

      /*
       * Volený: mód zamčený PŘEVZETÍM (obránce sebral hru betlem/durchem) —
       * hlásí se přesně to, co si nárokoval. Poznávací znamení je `bid === null`:
       * v licitovaném týž mód pochází z příhozu, a ten se smí překonat výš.
       */
      if (st.bid === null && (st.mode === 'betl' || st.mode === 'durch')) {
        out.push({ type: 'declare', seat: me, mode: st.mode, sedma: false, kilo: false });
        break;
      }

      /*
       * Licitovaný: ohlášený závazek „nesmí být v dané posloupnosti níže, než
       * jej zavazuje výška ukončené licitace, může se však jednat o JAKÝKOLIV
       * VYŠŠÍ druh závazku" (Obecná pravidla čl. VII/3). Neporovnává se tedy
       * druh závazku ani barva, ale jen místo v žebříčku — po vylicitovaném
       * betlu jde ohlásit durch a po nečerveném stu i to červené.
       */
      const minRank = st.bid ? bidRank(st.bid) : 0;

      // hra: talon nesmí obsahovat esa/desítky (příp. trumfy dle house rule)
      const talon = v.talon ?? [];
      const trumps = (t: Suit | null) => talon.filter((c) => t !== null && suitOf(c) === t);
      const hraTalonOk = (t: Suit | null) =>
        !talon.some(isValuable) && (!v.config.talonForbidsTrump || trumps(t).length === 0);

      const pushHra = (trump: Suit) => {
        if (!hraTalonOk(trump)) return;
        const canSedma = v.hand.includes(card(trump, R7));
        for (const sedma of [false, true]) {
          for (const kilo of [false, true]) {
            if (sedma && !canSedma) continue;
            if (declareRank('hra', sedma, kilo, trump) < minRank) continue;
            out.push({
              type: 'declare', seat: me, mode: 'hra', sedma, kilo,
              ...(fixedTrump === null ? { trump } : {}),
            });
          }
        }
      };

      /*
       * Ve voleném je trumf dávno zvolený, takže je pevný. V licitovaném je
       * `standing.trump` jen stopa po ČERVENÉM příhozu — barvu vybírá až
       * deklarace a o tom, že červená zůstane, rozhoduje žebříček.
       */
      const fixedTrump = v.config.variant === 'voleny' ? st.trump : null;
      if (fixedTrump !== null) pushHra(fixedTrump);
      else for (const s of [0, 1, 2, 3] as Suit[]) pushHra(s);

      /*
       * Betl a durch hlásí ve VOLENÉM aktér už na otázku „Barva?" (fáze
       * převzetí, Obecná pravidla čl. VII/1), takže sem patří jen licitovaný.
       */
      if (v.config.variant === 'licitovany') {
        for (const mode of ['betl', 'durch'] as const) {
          if (declareRank(mode, false, false, null) < minRank) continue;
          out.push({ type: 'declare', seat: me, mode, sedma: false, kilo: false });
        }
      }
      break;
    }

    case 'takeover': {
      if (me !== phase.toAct) break;
      const stT = phase.standing;
      /*
       * Ve voleném tahle fáze začíná otázkou „Barva?" (Obecná pravidla čl.
       * VII/1): aktér po odhozu nabídne soupeřům hru bez trumfů, a teprve po
       * jejich souhlasu hlásí závazek. Ptát se má ale jen ten, kdo barevnou
       * hru opravdu HRÁT MŮŽE — s esem nebo desítkou v talonu (odhodit je smí,
       * počítá-li s betlem/durchem) mu zbývá právě betl a durch.
       */
      const askable = me !== stT.declarer || stT.mode !== null || colourDeclarationPossible(v, stT);
      if (askable) out.push({ type: 'takeover', seat: me, claim: 'good' });
      const currentRank = MODE_RANK[stT.mode ?? 'hra'];
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

      /*
       * „V daném kole schvalování se lze vyjadřovat již jen k tomu závazku,
       * který v předchozím kole protistrana flekovala" (Obecná pravidla
       * čl. V/4) — otevřené komponenty proto nese `f.open`, ne celý závazek.
       */
      for (const t of f.open) {
        const level = f.levels[t] ?? 0;
        if (level >= v.config.sazby.maxFlekLevel) continue;
        const last = f.lastRaiser[t];
        const eligible =
          last === undefined
            ? sideOf(me) !== sideOf(holderSeat(t)) // první flek dává protistrana držitele
            : sideOf(me) !== sideOf(last); // dál se strany střídají
        if (eligible) out.push({ type: 'flek', seat: me, target: t });
      }

      /*
       * Sedma/sto proti: „Závazky Sedma a Sto mohou hlásit i hráči obrany
       * V PRVNÍM KOLE komentování ohlášeného trumfového závazku" (Obecná
       * pravidla čl. VII/1) — tedy jen volený a jen v kole 0. Licitovaná
       * pravidla je zakazují úplně: „Sedmu ani sto proti nelze hlásit"
       * (čl. II/23).
       */
      if (v.config.variant === 'voleny' && contract.mode === 'hra' && !sideOf(me) && f.round === 0) {
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

/**
 * Stabilní serializace nezávislá na pořadí klíčů — REKURZIVNĚ.
 * (`JSON.stringify(o, keys)` filtruje klíče ve všech úrovních, takže by
 * vnořený `bid` přišel o obsah a jakákoli licitace by prošla jako jakákoli jiná.)
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** Porovnání akcí pro validaci v apply (deal se porovnává bez seedu/configu). */
export function actionMatchesLegal(action: PlayerAction, legal: PlayerAction[]): boolean {
  if (action.type === 'deal') return legal.some((l) => l.type === 'deal');
  const norm = (a: PlayerAction): string => {
    const o: Record<string, unknown> = { ...a };
    if (a.type === 'discard') o.cards = [...a.cards].sort((x, y) => x - y);
    if (a.type === 'declare' && a.dveSedmy === undefined) o.dveSedmy = false;
    return canonical(o);
  };
  const target = norm(action);
  return legal.some((l) => norm(l) === target);
}

export { nextSeat };
