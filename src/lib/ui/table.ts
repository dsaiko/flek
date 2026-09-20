/**
 * table.ts — vykreslení herního stolu a interakce (bez herní logiky)
 *
 * Prosté překreslení dynamických regionů při každé změně stavu; legalitu akcí
 * určuje výhradně legalActions(view) — UI z ní jen staví tlačítka a klikací
 * karty. Žádný přístup ke GameState mimo humanView + veřejné části.
 */

import { sortHand, suitOf, card as mkCard, KRAL, SVRSEK, type Card, type OrderMode, type Suit } from '../cards';
import { legalActions, passSettlesWithoutPlay, trumplessChoicePending } from '../rules/legal';
import { orderMode, trickWinner } from '../rules/tricks';
import type { Contract, GameMode, GameState, PlayerAction, PlayerView, Seat } from '../rules/types';
import { forhont } from '../rules/types';
import { view } from '../rules/view';
import { backSrc, cardName, cardSrc, suitIcon, suitName, type Pattern } from './cardAssets';
import { aiNames, currentLang, flekName, fmtMoney, marriageWarn, t, type Lang } from './i18n';
import { discardWarnings } from './discardWarnings';
import { playChoice } from './playChoice';
import { silentSounds, type Sounds } from './sounds';
import { tableTalk, talkFires, type TalkSet, type TalkSituation } from './tableTalk';
import { esc, replayHtml, settlementHtml, type HtmlDeps } from './resultHtml';

export { esc };

export interface TableCallbacks {
  onAction: (action: PlayerAction) => void;
  onDeal: () => void;
  onNewMatch: () => void;
  /** Výběr varianty na úvodní obrazovce (mockup „1a Úvod"). */
  onVariant?: (variant: 'voleny' | 'licitovany') => void;
}

export interface TableOptions {
  humanSeat: Seat;
  pattern: () => Pattern;
  /** Jméno člověka u stolu (nastavení); výchozí „Ty". */
  playerName?: () => string;
  /** Jména protihráčů (nastavení); prázdné = výchozí podle jazyka. */
  opponentNames?: () => readonly [string, string];
  /** Sada hlášek (§5.8); výchozí „slušná", `off` = mlčenlivý stůl. */
  talk?: () => TalkSet;
  /** Zvuky (§5.7); výchozí tichý dublér, ať testy nepotřebují Web Audio. */
  sounds?: Sounds;
}

const $ = <T extends HTMLElement>(root: HTMLElement, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`chybí element ${sel}`);
  return el;
};

/** Hodiny a časovače — v testu se podstrčí řiditelné. */
export interface BubbleClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (t: ReturnType<typeof setTimeout>) => void;
}

/**
 * Fronta bublin u sedadel — KDY se hláška vykreslí, ne jak.
 *
 * Hlášky chodí v dávkách (komentování, fleky), takže nová často přišla dřív, než
 * se stihla přečíst ta předchozí — text u téhož sedadla probliknul. Každá proto
 * dostane minimální čas na obrazovce a novější počká; čeká vždy jen ta poslední,
 * aby bubliny nezaostávaly za hrou.
 *
 * Visící a čekající „Momentíček…" jsou DVA RŮZNÉ STAVY. Kdyby se hlídal jen ten
 * první, tah AI by frontu nezrušil a „Momentíček…" by naskočil nad sedadlem,
 * které už dávno táhlo — přesně to hlásil uživatel.
 *
 * Vlastní třída (a ne pár polí v `TableUI`) kvůli testu: tahle logika je celá
 * o časovačích a bez DOM se jinak ověřit nedá.
 */
export class BubbleQueue {
  private readonly pending = new Map<Seat, ReturnType<typeof setTimeout>>();
  private readonly shownAt = new Map<Seat, number>();
  private queuedThinking: Seat | null = null;

  constructor(private readonly minMs: number, private readonly clock: BubbleClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (timer) => clearTimeout(timer),
  }) {}

  /** Hláška u sedadla: buď hned, nebo až doječte ta předchozí. */
  request(seat: Seat, kind: 'talk' | 'thinking', paint: () => void): void {
    const waiting = this.pending.get(seat);
    if (waiting !== undefined) this.clock.clearTimeout(waiting);
    // ve frontě čeká vždy jen poslední hláška — tahle tam případné „Momentíček…"
    // střídá, takže ho přestáváme evidovat
    if (this.queuedThinking === seat) this.queuedThinking = null;
    const since = this.clock.now() - (this.shownAt.get(seat) ?? 0);
    if (since < this.minMs) {
      if (kind === 'thinking') this.queuedThinking = seat;
      this.pending.set(seat, this.clock.setTimeout(() => {
        this.pending.delete(seat);
        if (this.queuedThinking === seat) this.queuedThinking = null;
        paint();
      }, this.minMs - since));
      return;
    }
    this.pending.delete(seat);
    paint();
  }

  /** Bublina naskočila — od téhle chvíle běží její čtecí čas. */
  painted(seat: Seat): void {
    this.shownAt.set(seat, this.clock.now());
  }

  /**
   * Zruší „Momentíček…", které teprve ČEKÁ ve frontě.
   *
   * Volá se i tehdy, když nic nevisí — právě tak se totiž stihne zrušit dřív,
   * než ho fronta vykreslí nad hotovým tahem.
   */
  cancelQueuedThinking(): void {
    const queued = this.queuedThinking;
    if (queued === null) return;
    this.queuedThinking = null;
    this.forget(queued);
  }

  /** Zahodí hlášku čekající u sedadla (bublina se zrovna sundává). */
  forget(seat: Seat): void {
    const waiting = this.pending.get(seat);
    if (waiting === undefined) return;
    this.clock.clearTimeout(waiting);
    this.pending.delete(seat);
  }

  /** Nový zápas: nic starého nesmí doskočit do nového rozdání. */
  clear(): void {
    for (const timer of this.pending.values()) this.clock.clearTimeout(timer);
    this.pending.clear();
    this.shownAt.clear();
    this.queuedThinking = null;
  }

  /** U koho „Momentíček…" čeká ve frontě (test, a jen pro čtení). */
  get queuedSeat(): Seat | null {
    return this.queuedThinking;
  }
}

export class TableUI {
  private readonly root: HTMLElement;
  private readonly cb: TableCallbacks;
  private readonly opts: TableOptions;
  private selected = new Set<Card>();
  private bubbleTimers = new Map<Seat, ReturnType<typeof setTimeout>>();
  private prevState: GameState | null = null;
  private chain: Promise<void> = Promise.resolve();
  /**
   * Otevřený popup na stole. Překreslení TÝMŽ stavem (přepnutí jazyka nebo
   * vzoru karet) čistí `#center-float`, což by jinak popup i s čekající volbou
   * hráče tiše zahodilo — proto se umí znovu postavit.
   */
  /**
   * Otevřený popup i s jeho „lepivostí" v jednom objektu.
   *
   * Vlastnost nesmí žít zvlášť: kdyby zůstala v samostatném poli, přežila by
   * popup, pro který byla nastavená — po sticky dotazu by se pak neplatný
   * dotaz na hlášku překreslil nad stavem, do kterého už nepatří.
   */
  private openPopup: { paint: () => void; sticky: boolean } | null = null;
  /**
   * Generace zápasu. Animace spí až ~1,8 s a jsou zařazené do `chain`, takže
   * nový zápas by čekal za animacemi toho starého (a při opakovaných klicích
   * na „Nový zápas" i za několika). Zvýšení generace opuštěné animace zkrátí.
   */
  private gen = 0;
  /** Probouzeče běžících spánků — `reset()` je zavolá, aby animace neblokovaly. */
  private readonly sleepers = new Set<() => void>();
  /** „Momentíček…" — ukáže se, jen když AI opravdu přemýšlí déle než chvilku. */
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  /** U koho bublina „přemýšlím" právě visí (aby šla sundat, až tah přijde). */
  private thinkShown: Seat | null = null;
  /** Kdy se která hláška smí vykreslit (i rušení čekajícího „Momentíčku"). */
  private readonly bubbles = new BubbleQueue(MIN_BUBBLE_MS);
  /** Karty na úvodní obrazovce — vybrané jednou, ať při překreslení nepřeskakují. */
  private introCards: Card[] | null = null;
  /** Pohled pro delegovaný klik na kartu (tlačítka se recyklují, ne převěšují). */
  private handView: PlayerView | null = null;
  private handClickBound = false;
  /** Posledních pár hlášek — aby dva soupeři neřekli totéž hned po sobě. */
  private readonly recentTalk: string[] = [];
  /** Komentář k vyúčtování se vybírá JEDNOU za hru (jinak by při překreslení skákal). */
  private scoredLine: { handNo: number; line: string | null } | null = null;
  /** Zvuk konce hry patří ke hře, ne k překreslení (jazyk/vzor překresluje týž stav). */
  private scoredSoundFor: number | null = null;
  private resultView: 'summary' | 'replay' = 'summary';

  constructor(root: HTMLElement, opts: TableOptions, cb: TableCallbacks) {
    this.root = root;
    this.opts = opts;
    this.cb = cb;
  }

  /**
   * Potvrzovací popup na stole — pro akce mimo herní smyčku (ukončení hry).
   * Vypadá stejně jako varování u odhozu, aby stůl mluvil jedním hlasem.
   */
  /**
   * Potvrzovací dotaz v panelu na stole.
   *
   * `sticky` = dotaz NENÍ o aktuálním stavu hry (typicky „opravdu ukončit?"),
   * takže nesmí zmizet, když mezitím táhne AI. Bez toho hráč otevře dialog,
   * soupeř zahraje a tlačítko pod prstem se ztratí.
   */
  confirm(message: string, confirmLabel: string, onConfirm: () => void, sticky = false): void {
    this.showConfirmPopup([message], confirmLabel, onConfirm, sticky);
  }

  /**
   * Nový zápas: zapomeň minulý stav a **probuď opuštěné animace**, aby řetěz
   * hned uvolnily.
   *
   * Řetěz se schválně NEnahrazuje: dvě větve nad týmž DOM by si přepisovaly
   * třídu `animating` (a tím i zámek vstupu) a dokreslovaly stav mrtvého
   * zápasu. Místo toho běží pořád jeden řetěz a opuštěná práce se pozná podle
   * generace — a nic nekreslí.
   */
  reset(): void {
    this.gen += 1;
    this.prevState = null;
    this.openPopup = null;
    this.selected.clear();
    for (const wake of [...this.sleepers]) wake();
    // bubliny mají vlastní 2,6s časovač — bez zhasnutí by hláška mrtvého
    // zápasu visela nad rozdáváním toho nového
    for (const timer of this.bubbleTimers.values()) clearTimeout(timer);
    this.bubbleTimers.clear();
    this.bubbles.clear();
    if (this.thinkTimer !== null) clearTimeout(this.thinkTimer);
    this.thinkTimer = null;
    this.thinkShown = null;
    this.recentTalk.length = 0;
    this.scoredLine = null;
    this.scoredSoundFor = null;
    for (const el of this.root.querySelectorAll('.bubble')) el.classList.remove('show');
    this.lastHistoryLen = 0;
  }

  /**
   * Překreslení podle stavu. Přechody hodné animace (rozdání, dohraný štych)
   * se serializují do fronty — stavy se nikdy nepřeskočí, jen pozdrží.
   */
  render(state: GameState): void {
    const prev = this.prevState;
    this.prevState = state;
    // skutečný posun hry popup zneplatňuje (obnovuje se jen při překreslení
    // TÝMŽ stavem, tedy při přepnutí jazyka nebo vzoru karet)
    if (prev !== null && prev !== state && this.openPopup?.sticky !== true) this.openPopup = null;
    /*
     * Jakmile se stav pohne, „Momentíček…" přestává platit — a sundat ho je
     * potřeba TEĎ, ne až v renderNow: mezi tím leží animace dohraného štychu
     * (1,7 s), takže by hláška „přemýšlím" visela nad hráčem, který už zahrál.
     */
    if (prev !== state) this.hideThinkingBubble();
    const gen = this.gen;
    this.chain = this.chain
      .then(async () => {
        try {
          // mezitím začal jiný zápas → tenhle stav už NEEXISTUJE, nekresli ho
          if (gen !== this.gen) return;
          const handled = await this.playTransitions(prev, state, gen);
          if (gen !== this.gen) return; // zápas se vyměnil během animace
          if (!handled) this.renderNow(state);
        } catch (e) {
          console.error(e);
          if (gen === this.gen) this.renderNow(state); // ještě jeden pokus bez animací
        }
      })
      // chain nesmí ZŮSTAT odmítnutý — jinak by se žádné další překreslení
      // nikdy nespustilo a tabule by zamrzla natrvalo
      .catch((e) => {
        console.error('render selhal:', e);
      });
  }

  /** Vrací true, když přechod sám vykreslil finální stav. */
  private async playTransitions(prev: GameState | null, state: GameState, gen = this.gen): Promise<boolean> {
    // Přechod animuj jen tehdy, když stav opravdu pokročil právě o jednu akci.
    // (Překreslení TÍMŽ stavem — změna jazyka/vzoru karet — jinak přehrávalo
    //  animaci štychu znovu a s duplikovanou kartou.)
    const a = state.history[state.history.length - 1];
    /*
     * Nový zápas dostane čerstvý controller, jehož historie začíná od nuly —
     * `prev` ale patří tomu starému a je delší. Bez téhle výjimky by se
     * rozdávání nového zápasu (i po změně varianty/obtížnosti) nikdy
     * neanimovalo.
     */
    // POZOR: výjimka nesmí obejít `prev === state` — překreslení TÝMŽ stavem
    // (přepnutí jazyka/vzoru) by jinak znovu přehrálo rozdávání a přeskočilo
    // obnovení otevřeného popupu
    const newMatchDeal = a?.type === 'deal' && state.history.length === 1 && prev !== state;
    if (!newMatchDeal && (!prev || prev === state || prev.history.length + 1 !== state.history.length)) {
      return false;
    }

    // rozdání po vzoru FLEK!: karty se v ruce objevují postupně
    if (a?.type === 'deal') {
      this.renderNow(state, true);
      if (!this.reducedMotion()) {
        this.root.classList.add('animating');
        const n = state.hands[this.opts.humanSeat].length;
        // ťuknutí ke každé odkryté kartě — spánky jsou přerušitelné, takže
        // `reset()` smyčku ukončí dřív, než dojde ke konci
        for (let i = 0; i < n; i += 1) {
          await this.sleep(REVEAL_STEP_MS);
          if (gen !== this.gen) break;
          this.sounds.play('deal');
        }
        // dorovnání na konci animace — po `reset()` už ho nikdo nebudí, takže
        // by opuštěný zápas držel řetěz (a nový by čekal) celých 350 ms
        if (gen === this.gen) await this.sleep(350);
        this.root.classList.remove('animating');
      }
      return gen === this.gen; // opuštěný zápas nechá překreslit ten nový
    }

    /*
     * „Z lidu": volí se naslepo z druhé pětice, ať je ta chvíle vidět. Kartu
     * ale ukazujeme JEN tomu, kdo volil — leží lícem dolů (ČSM, Obecná
     * pravidla Čl. VII/1). U soupeře se otočí rub a status řekne jen to, že
     * bral z lidu; dřív se odhalovala i cizí karta.
     */
    if (a?.type === 'choose-trump' && a.card === 'from-people' && prev !== null && prev.unseen.length > 0) {
      const flipped = prev.unseen[0];
      const mine = a.seat === this.opts.humanSeat;
      const trickEl = $(this.root, '#trick');
      this.root.classList.add('animating');
      trickEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = mine ? cardSrc(flipped, this.opts.pattern()) : backSrc();
      img.alt = mine ? cardName(flipped) : '';
      // vlastní třída, ne `pos-me`: ta míří nad ruku, kde je v tu chvíli
      // akční lišta s tlačítkem „Z lidu" — karta ho překrývala
      img.className = 'played flip win';
      trickEl.appendChild(img);
      const statusEl = $(this.root, '#status');
      statusEl.textContent = mine ? `${t('fromPeople')}: ${cardName(flipped)}` : t('fromPeople');
      await this.sleep(this.reducedMotion() ? 900 : 1800);
      // po vyměněném zápasu ať se o překreslení postará ten nový
      return gen !== this.gen;
    }

    if (a?.type === 'play') this.sounds.play('play');
    if (a?.type === 'flek') this.sounds.play('flek');

    // dohraný štych → pauza, zvýraznění vítězné karty, odlet do paklu vítěze
    if (a?.type === 'play' && prev !== null && prev.phase.name === 'tricks' && prev.contract) {
      const prevTrick = prev.phase.trick;
      if (prevTrick.length === 2) {
        const full = [...prevTrick, { seat: a.seat, card: a.card }];
        const winner = trickWinner(full, prev.contract.trump, prev.contract.mode);
        // ruka a počty karet soupeřů se přepnou na NOVÝ stav hned — zahraná
        // karta nesmí zůstat v ruce, zatímco leží ve štychu na stole
        const vNew = view(state, this.opts.humanSeat);
        this.renderHand(vNew, []); // bez klikání, animace kliky stejně blokuje
        this.renderOpponents(vNew);
        if (gen !== this.gen) return false; // zápas se mezitím vyměnil
        await this.animateTrickEnd(full, winner, state, prev.contract.trump, gen);
      }
    }
    return false;
  }

  /** Okamžité plné překreslení. */
  private renderNow(state: GameState, reveal = false): void {
    const me = this.opts.humanSeat;
    const v = view(state, me);
    const legal = legalActions(v);
    const phase = v.phase;
    if (phase.name !== 'discard-talon') this.selected.clear();

    this.root.classList.remove('animating');
    // na úvodní obrazovce nemá prázdná ruka co rezervovat — jinak by tlačítko
    // „Rozdat" viselo v půlce sukna a panel by na něj sedal
    this.root.classList.toggle('idle', phase.name === 'idle');
    this.root.classList.toggle('pattern-history', this.opts.pattern() === 'history');
    this.renderOpponents(v, reveal, state.unseen.length);
    this.renderCenter(v, state);
    this.renderHand(v, legal, reveal, state.unseen.length);
    if (phase.name !== 'scored') this.resultView = 'summary';
    this.renderPiles(v);
    this.renderMelds(state, v);
    this.renderTrumpAside(v);
    this.renderActions(v, legal);
    this.renderStatus(v, legal);
    this.renderIntro(v);
    this.showLastActionBubble(state);
    this.scheduleThinkingBubble(v, state);
    // zvuk konce hry patří ke KONKRÉTNÍ hře, ne ke každému překreslení
    if (phase.name === 'scored' && this.scoredSoundFor !== v.handNo) {
      this.scoredSoundFor = v.handNo;
      // nula není výhra ani prohra (panel na ni hlásí „Bez změny") — mlčíme
      const delta = phase.result.delta[me];
      if (delta !== 0) this.sounds.play(delta > 0 ? 'win' : 'lose');
    }
    // popup přežije překreslení týmž stavem (jazyk, vzor karet)
    this.openPopup?.paint();
  }

  // ── animace ────────────────────────────────────────────────────────────────

  /** Spánek, který `reset()` umí probudit dřív (opuštěná animace nesmí držet řetěz). */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.sleepers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.sleepers.add(wake);
    });
  }

  private reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  /** Bílý box „20"/„40" u karty, KTEROU byla hláška ohlášena (po vzoru FLEK!). */
  private appendMeldBox(
    trickEl: HTMLElement,
    p: { seat: Seat; card: Card },
    state: GameState,
    trump: number | null,
  ): void {
    if (!wasAnnouncedBy(state, p.seat, p.card)) return;
    const box = document.createElement('div');
    box.className = `meld-box meld-${this.posOf(p.seat)}`;
    box.textContent = trump !== null && suitOf(p.card) === trump ? '40' : '20';
    trickEl.appendChild(box);
  }

  private async animateTrickEnd(
    full: { seat: Seat; card: Card }[],
    winner: Seat,
    state: GameState | null = null,
    trump: number | null = null,
    gen = this.gen,
  ): Promise<void> {
    const trickEl = $(this.root, '#trick');
    this.root.classList.add('animating');

    // vykresli kompletní štych se zvýrazněným vítězem (karty recykluj — dvě
    // z nich už na stole leží a nové elementy by probliknuly, viz setSrc)
    for (const box of Array.from(trickEl.querySelectorAll('.meld-box'))) box.remove();
    const imgs = syncChildren(trickEl, full.length, () => document.createElement('img'));
    full.forEach((p, i) => {
      const img = imgs[i];
      setSrc(img, cardSrc(p.card, this.opts.pattern()));
      img.alt = cardName(p.card);
      img.className = `played pos-${this.posOf(p.seat)}${p.seat === winner ? ' win' : ''}`;
    });
    if (state) for (const p of full) this.appendMeldBox(trickEl, p, state, trump);
    const statusEl = $(this.root, '#status');
    statusEl.textContent = `${t('trickWord')}: ${this.nameOf(winner)}`;
    statusEl.classList.remove('me-turn');

    /*
     * Hláška vítěze štychu a zvuk sebrání NEJSOU animace, takže patří i do
     * režimu omezeného pohybu — uživatel si vyžádal míň pohybu, ne míň hry.
     * Hláška jen občas, jinak by to u třiceti štychů byl šum.
     */
    if (this.talkSet !== 'off' && winner !== this.opts.humanSeat && state !== null) {
      const seed = [winner, state.handNo, state.history.length];
      if (talkFires(3, seed)) {
        const line = this.pickTalk('trickWon', seed);
        if (line !== null) this.showBubble(winner, esc(line));
      }
    }

    if (this.reducedMotion()) {
      this.sounds.play('trick');
      await this.sleep(900);
      return;
    }
    await this.sleep(1250);
    if (gen !== this.gen) return; // zápas se vyměnil — do mrtvého stolu nekresli
    this.sounds.play('trick');
    for (const img of imgs) img.classList.add(`fly-${this.posOf(winner)}`);
    await this.sleep(430);
  }

  // ── protihráči ─────────────────────────────────────────────────────────────

  private seatAt(pos: 'left' | 'right'): Seat {
    const me = this.opts.humanSeat;
    return ((me + (pos === 'left' ? 1 : 2)) % 3) as Seat;
  }

  private renderOpponents(v: PlayerView, reveal = false, unseenCount = 0): void {
    for (const pos of ['left', 'right'] as const) {
      const seat = this.seatAt(pos);
      const box = $(this.root, `#seat-${pos}`);
      const name = this.nameOf(seat);
      $(box, '.seat-name').textContent = name;
      $(box, '.avatar').textContent = name.slice(0, 1).toUpperCase();
      // podtitulek: peníze + role (rozdávající / forhont) — jako v mockupu
      const role = seat === v.dealer ? t('dealerShort') : seat === forhont(v.dealer) ? t('forhont') : '';
      $(box, '.seat-sub').textContent = role ? `${role} · ${fmtMoney(v.ledger[seat])}` : fmtMoney(v.ledger[seat]);
      const backs = $(box, '.backs');
      const n = opponentBacks(v, seat, unseenCount);
      const animate = reveal && !this.reducedMotion();
      const imgs = syncChildren(backs, n, () => {
        const img = document.createElement('img');
        img.className = 'back';
        img.alt = '';
        return img;
      });
      for (const img of imgs) setSrc(img, backSrc());
      setReveal(backs, imgs, animate);
    }
    const me = this.opts.humanSeat;
    const myName = this.nameOf(me);
    const meName = this.root.querySelector<HTMLElement>('#name-me');
    if (meName) meName.textContent = myName;
    const meAvatar = this.root.querySelector<HTMLElement>('.avatar.me');
    if (meAvatar) meAvatar.textContent = myName.slice(0, 1).toUpperCase();
    const meLedger = this.root.querySelector<HTMLElement>('#ledger-me');
    if (meLedger) {
      const role = me === v.dealer ? t('dealerShort') : me === forhont(v.dealer) ? t('forhont') : '';
      meLedger.textContent = role ? `${role} · ${fmtMoney(v.ledger[me])}` : fmtMoney(v.ledger[me]);
    }
  }

  // ── vystavené hlášky (karta lícem + 20/40, po vzoru FLEK!) ──────────────────

  private renderMelds(state: GameState, v: PlayerView): void {
    const bySeat: [{ card: Card }[], { card: Card }[], { card: Card }[]] = [[], [], []];
    if (v.phase.name === 'tricks') {
      // ohlášené hlášky od posledního rozdání (karta, kterou byla hláška ohlášena)
      for (let i = state.history.length - 1; i >= 0; i -= 1) {
        const a = state.history[i];
        if (a.type === 'deal') break;
        if (a.type === 'play' && a.announceMarriage) bySeat[a.seat].unshift({ card: a.card });
      }
    }
    const trump = v.contract?.trump ?? null;
    const targets: [Seat, string][] = [
      [this.opts.humanSeat, '#melds-me'],
      [this.seatAt('left'), '#melds-left'],
      [this.seatAt('right'), '#melds-right'],
    ];
    for (const [seat, sel] of targets) {
      const el = $(this.root, sel);
      el.innerHTML = '';
      for (const m of bySeat[seat]) {
        const wrap = document.createElement('div');
        wrap.className = 'meld';
        const img = document.createElement('img');
        img.src = cardSrc(m.card, this.opts.pattern());
        img.alt = cardName(m.card);
        const badge = document.createElement('span');
        badge.textContent = trump !== null && suitOf(m.card) === trump ? '40' : '20';
        wrap.appendChild(img);
        wrap.appendChild(badge);
        el.appendChild(wrap);
      }
    }
  }

  /**
   * Trumf odložený stranou na stole (jako v originále).
   *
   * Ve VOLENÉM leží konkrétní zvolená karta lícem dolů (`revealedTrump` — vidí
   * ji jen volící, Čl. VII/1, i u volby „z lidu"). V LICITOVANÉM se žádná karta neodkládá, trumf je jen barva
   * z deklarace — pak leží destička se symbolem barvy, aby se nepředstíralo,
   * že padla karta, která nepadla.
   */
  private renderTrumpAside(v: PlayerView): void {
    const box = $(this.root, '#trump-aside');
    const aside = trumpAsideOf(v);
    if (aside === null) {
      box.hidden = true;
      box.innerHTML = '';
      delete box.dataset.key;
      return;
    }
    const { card, suit: trump, faceDown } = aside;
    const key = faceDown ? 'down' : card !== null ? `c${card}` : `s${trump}`;
    // překresluje se jen při ZMĚNĚ — jinak by se karta při každém renderu
    // nahrazovala novým <img> a v Chromu problikávala (viz setSrc/syncChildren)
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.innerHTML = faceDown || card !== null
        ? `<img alt="">`
        : `<div class="suit-plate">${suitIcon(trump, 64)}</div>`;
      const label = document.createElement('div');
      label.className = 'trump-label';
      box.appendChild(label);
    }
    const img = box.querySelector('img');
    if (img !== null) {
      setSrc(img, card !== null ? cardSrc(card, this.opts.pattern()) : backSrc());
      img.alt = card !== null ? cardName(card) : '';
    }
    const label = box.querySelector('.trump-label');
    if (label !== null) label.textContent = t('trump');
    box.hidden = false;
  }

  // ── pakle vybraných štychů ──────────────────────────────────────────────────

  private renderPiles(v: PlayerView): void {
    const tricksOf: [number, number, number] = [0, 0, 0];
    if (v.phase.name === 'tricks') {
      for (const s of [0, 1, 2] as Seat[]) tricksOf[s] = v.phase.won[s].length / 3;
    }
    const targets: [Seat, string][] = [
      [this.opts.humanSeat, '#pile-me'],
      [this.seatAt('left'), '#pile-left'],
      [this.seatAt('right'), '#pile-right'],
    ];
    for (const [seat, sel] of targets) {
      const el = $(this.root, sel);
      const n = tricksOf[seat];
      // počítadlo ven, ať sync vidí jen obrázky; vrátí se na konec
      el.querySelector('.pile-count')?.remove();
      const imgs = syncChildren(el, n, () => {
        const img = document.createElement('img');
        img.alt = '';
        return img;
      });
      imgs.forEach((img, i) => {
        setSrc(img, backSrc());
        // ledabylý hospodský pakl: deterministické natočení po štychu
        img.style.transform = `rotate(${((i * 47) % 24) - 12}deg) translate(${(i % 3) * 3}px, ${(i % 2) * 2}px)`;
      });
      if (n > 0) {
        const count = document.createElement('span');
        count.className = 'pile-count';
        count.textContent = `${n}×`;
        el.appendChild(count);
      }
    }
  }

  /**
   * Úvodní obrazovka: vějíř skutečných karet na prázdném stole. Sada se losuje
   * při každém příchodu na úvodní obrazovku (tedy při načtení stránky), ale
   * NE při každém překreslení — jinak by karty přeskakovaly při přepnutí
   * jazyka nebo vzoru.
   */
  /** Výběr varianty + „minule" na úvodní obrazovce. */
  private renderIntroPanel(v: PlayerView): void {
    const panel = $(this.root, '#intro-panel');
    const idle = v.phase.name === 'idle';
    panel.style.display = idle ? '' : 'none';
    if (!idle) return;

    const box = $(this.root, '#intro-variants');
    const VARIANTS = [
      { id: 'voleny' as const, tag: t('variantTagVoleny'), name: t('voleny'), desc: t('variantDescVoleny'), figure: mkCard(0, KRAL) },
      { id: 'licitovany' as const, tag: t('variantTagLicitovany'), name: t('licitovany'), desc: t('variantDescLicitovany'), figure: mkCard(1, SVRSEK) },
    ];
    const cards = syncChildren(box, VARIANTS.length, () => {
      const btn = document.createElement('button');
      btn.className = 'variant-card';
      btn.type = 'button';
      return btn;
    });
    VARIANTS.forEach((variant, i) => {
      const btn = cards[i];
      btn.classList.toggle('on', v.config.variant === variant.id);
      // bez písmene V/L — v cizím jazyce nedává smysl
      const html = `<span class="variant-top"><span class="variant-tag">${esc(variant.tag)}</span></span>`
        + `<span class="variant-figure"><img src="${esc(cardSrc(variant.figure, this.opts.pattern()))}" alt=""></span>`
        + `<span class="variant-name">${esc(variant.name)}</span>`
        + `<span class="variant-desc">${esc(variant.desc)}</span>`;
      if (btn.innerHTML !== html) btn.innerHTML = html;
      btn.onclick = () => this.cb.onVariant?.(variant.id);
    });

    // „Minule: …" — poslední odehraná hra zápasu
    const last = $(this.root, '#intro-last');
    const prev = v.handResults[v.handResults.length - 1];
    last.textContent = prev
      ? `${t('lastHand')}: ${([0, 1, 2] as Seat[])
          .map((s) => `${this.nameOf(s)} ${prev.delta[s] >= 0 ? '+' : ''}${fmtMoney(prev.delta[s])}`)
          .join(' · ')}`
      : '';
  }

  private renderIntro(v: PlayerView): void {
    this.renderIntroPanel(v);
    const el = $(this.root, '#intro');
    if (v.phase.name !== 'idle') {
      if (this.introCards !== null) {
        this.introCards = null;
        el.innerHTML = '';
      }
      return;
    }
    if (this.introCards === null) this.introCards = pickIntroCards();
    const cards = this.introCards;
    const imgs = syncChildren(el, INTRO_LAYOUT.length, () => document.createElement('img'));
    imgs.forEach((img, i) => {
      const spot = INTRO_LAYOUT[i];
      setSrc(img, spot.back === true ? backSrc() : cardSrc(cards[i], this.opts.pattern()));
      img.alt = '';
      img.style.setProperty('--x', `${spot.x}%`);
      img.style.setProperty('--y', `${spot.y}%`);
      img.style.setProperty('--rot', `${spot.rot}deg`);
      img.style.animationDelay = `${i * 70}ms`;
    });
  }

  // ── střed stolu ────────────────────────────────────────────────────────────

  private renderCenter(v: PlayerView, state: GameState): void {
    const trickEl = $(this.root, '#trick');
    const plays = v.phase.name === 'tricks' ? v.phase.trick : [];
    // boxy hlášek se přestaví vždy (je jich málo a mění se), karty se recyklují
    for (const box of Array.from(trickEl.querySelectorAll('.meld-box'))) box.remove();
    const cards = syncChildren(trickEl, plays.length, () => document.createElement('img'));
    plays.forEach((p, i) => {
      const img = cards[i];
      setSrc(img, cardSrc(p.card, this.opts.pattern()));
      img.alt = cardName(p.card);
      img.className = `played pos-${this.posOf(p.seat)}`;
    });
    for (const p of plays) this.appendMeldBox(trickEl, p, state, v.contract?.trump ?? null);
    // zúčtování/průběh: plovoucí vrstva přes střed stolu — nemění výšku stolu
    const float = $(this.root, '#center-float');
    if (v.phase.name === 'scored') {
      float.classList.add('open');
      const buttons = `<div class="felt-actions">
        <button class="action-btn" data-act="toggle">${this.resultView === 'summary' ? t('showReplay') : t('back')}</button>
        <button class="action-btn primary" data-act="next">${t('nextHand')}</button>
      </div>`;
      float.innerHTML =
        this.resultView === 'summary'
          ? settlementHtml(v.phase.result, v, this.htmlDeps)
          : replayHtml(state, v.phase.result, this.htmlDeps);
      // tlačítka dovnitř panelu
      const host = float.querySelector('.felt-panel, .replay');
      if (host) host.insertAdjacentHTML('beforeend', buttons);
      float.querySelector('[data-act="toggle"]')?.addEventListener('click', () => {
        this.resultView = this.resultView === 'summary' ? 'replay' : 'summary';
        if (this.prevState) this.renderNow(this.prevState);
      });
      float.querySelector('[data-act="next"]')?.addEventListener('click', () => this.cb.onDeal());
    } else {
      float.classList.remove('open');
      float.innerHTML = '';
    }

    /*
     * Co kdo hraje patří K HRÁČI: badge sedí u sedadla aktéra, takže tam jméno
     * nemusí být vůbec — kdo hraje, je vidět z toho, u koho badge visí.
     */
    const boxes: [Seat, HTMLElement][] = [
      [this.opts.humanSeat, $(this.root, '#contract-me')],
      [this.seatAt('left'), $(this.root, '#seat-left .seat-contract')],
      [this.seatAt('right'), $(this.root, '#seat-right .seat-contract')],
    ];
    const c = v.contract;
    const hidden = !c || v.phase.name === 'idle' || v.phase.name === 'scored';
    const label = c === null ? '' : contractLabelHtml(c, state);
    for (const [seat, el] of boxes) {
      const mine = !hidden && c !== null && seat === c.declarer;
      const html = mine ? label : '';
      if (el.innerHTML !== html) el.innerHTML = html;
    }

    /*
     * Totéž velké uprostřed sukna, ale jen po dobu flekování: tam se o závazku
     * rozhoduje a badge u sedadla je v rohu sotva vidět. Uprostřed už není
     * poznat, komu badge patří, takže se přidává jméno aktéra.
     */
    const centre = $(this.root, '#contract-center');
    if (!hidden && c !== null && v.phase.name === 'fleks') {
      const html = `<span class="cc-who">${esc(this.nameOf(c.declarer))}</span>`
        + `<span class="cc-what">${label}</span>`;
      if (centre.innerHTML !== html) centre.innerHTML = html;
      centre.hidden = false;
    } else {
      if (centre.innerHTML !== '') centre.innerHTML = '';
      centre.hidden = true;
    }
  }

  private get talkSet(): TalkSet {
    return this.opts.talk?.() ?? 'slusna';
  }

  private get sounds(): Sounds {
    return this.opts.sounds ?? silentSounds;
  }

  /**
   * Vybere hlášku a zapamatuje si ji, aby se hned neopakovala. Volat jen tam,
   * kde se hláška opravdu ukáže — ne při každém překreslení.
   */
  private pickTalk(situation: TalkSituation, seed: readonly (string | number)[]): string | null {
    const set = this.talkSet;
    if (set === 'off') return null;
    const line = tableTalk(situation, { set, lang: currentLang(), seed, avoid: this.recentTalk });
    if (line === null) return null;
    this.recentTalk.push(line);
    if (this.recentTalk.length > RECENT_TALK) this.recentTalk.shift();
    return line;
  }

  /** Hláška místo popisku — jen tam, kde popisek nenese informaci (§5.8). */
  private flavourFor(a: PlayerAction, state: GameState): string | null {
    // `deal` nemá sedadlo (a hlášku taky ne) — zároveň tím projde zúžení typu
    if (this.talkSet === 'off' || a.type === 'deal') return null;
    const situation = talkSituationFor(a, state);
    if (situation === null) return null;
    return this.pickTalk(situation, [a.seat, state.handNo, state.history.length]);
  }

  private bubbleEl(seat: Seat): HTMLElement {
    return seat === this.opts.humanSeat
      ? $(this.root, '#bubble-me')
      : $(this.root, `#seat-${seat === this.seatAt('left') ? 'left' : 'right'} .bubble`);
  }

  /** Bublina u sedadla (`html` už musí být escapované); o KDY se stará fronta. */
  private showBubble(seat: Seat, html: string, kind: 'talk' | 'thinking' = 'talk'): void {
    this.bubbles.request(seat, kind, () => this.paintBubble(seat, html, kind));
  }

  private paintBubble(seat: Seat, html: string, kind: 'talk' | 'thinking'): void {
    this.thinkShown = kind === 'thinking' ? seat : this.thinkShown === seat ? null : this.thinkShown;
    const el = this.bubbleEl(seat);
    el.innerHTML = html;
    el.classList.add('show');
    this.bubbles.painted(seat);
    const prev = this.bubbleTimers.get(seat);
    if (prev) clearTimeout(prev);
    this.bubbleTimers.set(seat, setTimeout(() => el.classList.remove('show'), BUBBLE_MS));
  }

  /**
   * „Momentíček…" u AI, která počítá. Čeká 700 ms, takže u rychlých tahů se
   * neukáže vůbec — přesně jako v originále, kde se hláška objevila jen
   * u opravdu dlouhého rozmýšlení.
   */
  private scheduleThinkingBubble(v: PlayerView, state: GameState): void {
    if (this.thinkTimer !== null) {
      clearTimeout(this.thinkTimer);
      this.thinkTimer = null;
    }
    // (sundáno už v render(), tohle je pojistka pro překreslení týmž stavem)
    this.hideThinkingBubble();

    const set = this.talkSet;
    if (set === 'off' || v.phase.name === 'idle' || v.phase.name === 'scored') return;
    const seat = seatOnTurn(v);
    if (seat === null || seat === this.opts.humanSeat) return;
    const at = state.history.length;
    this.thinkTimer = setTimeout(() => {
      this.thinkTimer = null;
      // stav se mezitím pohnul (nebo hlášky zhasly) → hláška už je zastaralá
      if (this.prevState === null || this.prevState.history.length !== at) return;
      if (this.talkSet === 'off') return;
      // vybíráme až TEĎ, ať se do „nedávno padlo" nezapisují hlášky, co se neukázaly
      const line = this.pickTalk('thinking', [seat, state.handNo, at]);
      if (line === null) return;
      this.showBubble(seat, esc(line), 'thinking');
    }, 700);
  }

  /** Sundá „Momentíček…", pokud zrovna visí (nebo čeká ve frontě). */
  private hideThinkingBubble(): void {
    // čekající se ruší i tehdy, když nic nevisí — právě tak se totiž stihne
    // zrušit dřív, než ho fronta vykreslí nad hotovým tahem
    this.bubbles.cancelQueuedThinking();
    if (this.thinkShown === null) return;
    const seat = this.thinkShown;
    this.thinkShown = null;
    this.bubbles.forget(seat);
    const prev = this.bubbleTimers.get(seat);
    if (prev) clearTimeout(prev);
    this.bubbleTimers.delete(seat);
    this.bubbleEl(seat).classList.remove('show');
  }

  private posOf(seat: Seat): string {
    const me = this.opts.humanSeat;
    if (seat === me) return 'me';
    return seat === this.seatAt('left') ? 'left' : 'right';
  }

  private nameOf(seat: Seat): string {
    if (seat === this.opts.humanSeat) {
      const own = this.opts.playerName?.().trim();
      return own !== undefined && own !== '' ? own : t('you');
    }
    const idx = seat === this.seatAt('left') ? 0 : 1;
    const own = this.opts.opponentNames?.()[idx]?.trim();
    return own !== undefined && own !== '' ? own : aiNames()[idx];
  }

  // ── ruka ───────────────────────────────────────────────────────────────────

  private renderHand(v: PlayerView, legal: PlayerAction[], reveal = false, unseenCount = 0): void {
    const handEl = $(this.root, '#hand');
    const phase = v.phase;
    // zvolený trumf leží stranou na stole, ne ve vějíři (viz trumpAsideOf)
    const hand = handAside(v);

    const playable = new Set<Card>();
    if (phase.name === 'tricks') {
      for (const a of legal) if (a.type === 'play') playable.add(a.card);
    } else if (phase.name === 'choose-trump') {
      for (const a of legal) {
        if (a.type === 'choose-trump' && a.card !== 'from-people') playable.add(a.card);
      }
    } else if (phase.name === 'discard-talon' && legal.length > 0) {
      // klikat lze jen na karty, které se vyskytují v aspoň jednom legálním odhozu
      for (const a of legal) if (a.type === 'discard') for (const c of a.cards) playable.add(c);
    }

    const myUnseen =
      v.phase.name === 'choose-trump' && v.seat === forhont(v.dealer) ? unseenCount : 0;
    const n = hand.length + myUnseen;
    const animate = reveal && !this.reducedMotion();

    // klik je delegovaný na kontejner, aby šlo tlačítka recyklovat bez
    // odvěšování posluchačů (viz setSrc)
    this.handView = v;
    if (!this.handClickBound) {
      this.handClickBound = true;
      handEl.addEventListener('click', (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('.card-btn');
        const raw = btn?.dataset.card;
        if (btn === null || btn === undefined || btn.disabled || raw === undefined) return;
        if (this.handView !== null) this.onCardClick(Number(raw) as Card, this.handView);
      });
    }

    const buttons = syncChildren(handEl, n, () => {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.appendChild(document.createElement('img'));
      return btn;
    });

    buttons.forEach((btn, i) => {
      const img = btn.firstElementChild as HTMLImageElement;
      const fromHand = i < hand.length;
      const c = fromHand ? hand[i] : null;
      btn.disabled = c === null || !playable.has(c);
      btn.classList.toggle('selected', c !== null && this.selected.has(c));
      if (c === null) delete btn.dataset.card;
      else btn.dataset.card = String(c);
      // jemný vějíř: natočení + pokles ke krajům (transform na buttonu,
      // hover/selected zdvih řeší CSS na <img>, aby se nepřepisovaly)
      const off = i - (n - 1) / 2;
      btn.style.transform = `rotate(${(off * 3).toFixed(1)}deg) translateY(${(off * off * 1.4).toFixed(1)}px)`;
      setSrc(img, c === null ? backSrc() : cardSrc(c, this.opts.pattern()));
      img.alt = c === null ? '' : cardName(c);
    });
    setReveal(handEl, buttons, animate);
  }

  private onCardClick(c: Card, v: PlayerView): void {
    const phase = v.phase;
    if (phase.name === 'choose-trump') {
      this.cb.onAction({ type: 'choose-trump', seat: v.seat, card: c });
    } else if (phase.name === 'discard-talon') {
      if (this.selected.has(c)) this.selected.delete(c);
      else if (this.selected.size < 2) this.selected.add(c);
      this.rerenderSelection(v);
    } else if (phase.name === 'tricks') {
      // rozhodnutí (ohlásit / neohlásit / bez ptaní) je v playChoice — bez DOM
      const choice = playChoice(v, legalActions(v), c);
      if (choice.ask) {
        const { withMarriage, plain, points } = choice.ask;
        this.showChoicePopup(
          `${t('announceQuestion')} (${points})`,
          { label: t('announceYes'), onPick: () => this.cb.onAction(withMarriage) },
          { label: t('announceNo'), onPick: () => this.cb.onAction(plain) },
        );
        return;
      }
      if (choice.single) this.cb.onAction(choice.single);
    }
  }

  private rerenderSelection(v: PlayerView): void {
    const handEl = $(this.root, '#hand');
    const buttons = handEl.querySelectorAll<HTMLButtonElement>('.card-btn');
    handAside(v).forEach((c, i) => {
      buttons[i]?.classList.toggle('selected', this.selected.has(c));
    });
    // stav tlačítka i případné hlášení o nedovoleném odhozu řeší renderActions
    this.renderActions(v, legalActions(v));
  }

  // ── akční lišta ────────────────────────────────────────────────────────────

  private renderActions(v: PlayerView, legal: PlayerAction[]): void {
    const bar = $(this.root, '#actions');
    bar.innerHTML = '';
    const btn = (label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; id?: string }) => {
      const b = document.createElement('button');
      b.className = `action-btn${opts?.primary ? ' primary' : ''}`;
      if (opts?.id) b.id = opts.id;
      b.innerHTML = label;
      b.disabled = opts?.disabled ?? false;
      b.addEventListener('click', onClick);
      bar.appendChild(b);
      return b;
    };

    switch (v.phase.name) {
      case 'idle':
        if (legal.some((a) => a.type === 'deal')) btn(t('deal'), () => this.cb.onDeal(), { primary: true });
        break;

      case 'scored':
        break; // tlačítka jsou součástí plovoucího panelu

      case 'choose-trump': {
        const fp = legal.find((a) => a.type === 'choose-trump' && a.card === 'from-people');
        if (fp) btn(t('fromPeople'), () => this.cb.onAction(fp));
        break;
      }

      case 'discard-talon':
        if (legal.length > 0) {
          const selectedPair = [...this.selected] as Card[];
          const legalPair =
            selectedPair.length === 2 &&
            legal.some(
              (a) => a.type === 'discard' && a.cards.includes(selectedPair[0]) && a.cards.includes(selectedPair[1]),
            );
          if (selectedPair.length === 2 && !legalPair) {
            const note = document.createElement('span');
            note.className = 'action-note';
            note.textContent = t('talonIllegal');
            bar.appendChild(note);
          }
          btn(t('discardConfirm'), () => {
            const cards = [...this.selected] as [Card, Card];
            const action = legal.find(
              (a) => a.type === 'discard' && a.cards.includes(cards[0]) && a.cards.includes(cards[1]),
            );
            if (!action) return;
            // rizikové odhozy potvrdit popupem vestavěným do stolu
            // hra bez trumfů (i když druh ještě nepadl): varování nemají o čem být (§27)
            const warns = discardWarnings(v.hand, cards, knownTrumpless(v) ? 'betl' : knownMode(v)).map((w) =>
              w.kind === 'valuable' ? t('talonWarn') : marriageWarn(w.suit),
            );
            if (warns.length > 0) this.showConfirmPopup(warns, t('discardConfirm'), () => this.cb.onAction(action));
            else this.cb.onAction(action);
          }, { primary: true, disabled: !legalPair, id: 'discard-confirm' });
        }
        break;

      case 'declare': {
        const standingTrump = v.phase.name === 'declare' ? v.phase.standing.trump : null;
        for (const a of legal) {
          if (a.type !== 'declare') continue;
          btn(declareLabel(a, standingTrump), () => this.cb.onAction(a), { primary: a.mode === 'hra' && !a.sedma && !a.kilo });
        }
        break;
      }

      case 'bidding':
        for (const a of legal) {
          if (a.type !== 'bid') continue;
          btn(a.bid === 'pass' ? t('pass') : bidLabel(a.bid), () => this.cb.onAction(a), {
            primary: a.bid === 'pass',
          });
        }
        break;

      case 'takeover': {
        // aktér se v téhle fázi PTÁ („Barva?"), obrana odpovídá („Dobrá")
        const asking = v.phase.name === 'takeover' && v.seat === v.phase.standing.declarer;
        for (const a of legal) {
          if (a.type !== 'takeover') continue;
          const label = a.claim === 'good' ? t(asking ? 'askColour' : 'good') : t(a.claim);
          btn(label, () => this.cb.onAction(a), { primary: a.claim === 'good' });
        }
        break;
      }

      case 'fleks':
        for (const a of legal) {
          if (a.type === 'good') {
            /*
             * Jediná „dobrá", která stojí peníze bez jediné odehrané karty:
             * flek na holou hru bez re se podle B/19 nehraje a rovnou se platí.
             * Klik do prázdna by hráče stál dvojnásobek, takže se zeptáme —
             * stejným popupem jako u rizikového odhozu.
             */
            const settles = passSettlesWithoutPlay(v);
            const warn = settles === 'flek-bez-re' ? t('noReWarn')
              : settles === 'vyrovnano' ? t('evenOutWarn') : null;
            btn(t('good'), () => {
              if (warn !== null) this.showConfirmPopup([warn], t('good'), () => this.cb.onAction(a));
              else this.cb.onAction(a);
            }, { primary: true });
          } else if (a.type === 'flek') {
            const level = (v.phase.name === 'fleks' ? v.phase.fleks.levels[a.target] ?? 0 : 0) + 0;
            btn(`${flekName(level)} ${t('na')} ${targetLabel(a.target)}`, () => this.cb.onAction(a));
          } else if (a.type === 'announce-proti') {
            const label = a.sedma && a.kilo ? `${t('sedmaProti')} + ${t('kiloProti')}` : a.sedma ? t('sedmaProti') : t('kiloProti');
            btn(label, () => this.cb.onAction(a));
          }
        }
        break;

      default:
        break;
    }
  }

  // ── status ─────────────────────────────────────────────────────────────────

  private renderStatus(v: PlayerView, legal: PlayerAction[]): void {
    const eyebrow = this.root.querySelector<HTMLElement>('#status-eyebrow');
    if (eyebrow) {
      eyebrow.textContent =
        v.phase.name === 'idle' ? '' : t(v.config.variant === 'voleny' ? 'voleny' : 'licitovany');
    }
    const el = $(this.root, '#status');
    const iAct = legal.some((a) => a.type !== 'deal');
    if (v.phase.name === 'idle') {
      el.textContent = '';
    } else if (v.phase.name === 'scored') {
      el.textContent = '';
    } else if (iAct) {
      const hint: Partial<Record<string, string>> = {
        'choose-trump': t('chooseTrump'),
        // kdo sebral talon, odhazuje na hru bez trumfů a druh vybere až pak
        'discard-talon': knownTrumpless(v) && knownMode(v) === null ? t('takeHint') : t('discard'),
        declare: t('declare'),
        bidding: t('bidding'),
        takeover:
          v.phase.name === 'takeover' && v.seat === v.phase.standing.declarer
            ? t('askColourHint')
            : t('takeover'),
        fleks: t('fleks'),
        tricks: t('yourTurn'),
      };
      let text = hint[v.phase.name] ?? t('yourTurn');
      // zvolený trumf připomenout už při odhozu a ohlášení
      if ((v.phase.name === 'discard-talon' || v.phase.name === 'declare') && v.phase.standing.trump !== null) {
        text += ` · ${t('trump')}: ${suitName(v.phase.standing.trump)}`;
      }
      el.textContent = text;
      el.classList.add('me-turn');
    } else {
      const actor = this.currentActorName(v);
      el.textContent = actor ? `${t('waiting')} ${actor}…` : '…';
      el.classList.remove('me-turn');
    }
  }

  private currentActorName(v: PlayerView): string | null {
    const seat = seatOnTurn(v);
    if (seat === null || seat === this.opts.humanSeat) return null;
    return this.nameOf(seat);
  }

  // ── potvrzovací popup vestavěný do stolu ─────────────────────────────────────

  private showConfirmPopup(
    messages: string[], confirmLabel: string, onConfirm: () => void, sticky = false,
  ): void {
    this.openPopup = { paint: () => this.paintConfirmPopup(messages, confirmLabel, onConfirm), sticky };
    this.paintConfirmPopup(messages, confirmLabel, onConfirm);
  }

  private paintConfirmPopup(messages: string[], confirmLabel: string, onConfirm: () => void): void {
    const float = $(this.root, '#center-float');
    float.classList.add('open');
    float.innerHTML = `<div class="felt-panel warn">
      ${messages.map((m) => `<p class="warn-msg">⚠️ ${esc(m)}</p>`).join('')}
      <div class="felt-actions">
        <button class="action-btn" data-act="cancel">${t('back')}</button>
        <button class="action-btn primary" data-act="confirm">${esc(confirmLabel)}</button>
      </div>
    </div>`;
    float.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      this.openPopup = null;
      if (this.prevState) this.renderNow(this.prevState);
      else { float.classList.remove('open'); float.innerHTML = ''; }
    });
    float.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      this.openPopup = null;
      float.classList.remove('open');
      float.innerHTML = '';
      onConfirm();
    });
  }

  /** Dvě rovnocenné volby v panelu na stole (např. ohlásit hlášku, nebo ne). */
  private showChoicePopup(
    question: string,
    primary: { label: string; onPick: () => void },
    secondary: { label: string; onPick: () => void },
  ): void {
    // volba je vždycky o AKTUÁLNÍM stavu → nikdy sticky
    this.openPopup = { paint: () => this.paintChoicePopup(question, primary, secondary), sticky: false };
    this.paintChoicePopup(question, primary, secondary);
  }

  private paintChoicePopup(
    question: string,
    primary: { label: string; onPick: () => void },
    secondary: { label: string; onPick: () => void },
  ): void {
    const float = $(this.root, '#center-float');
    float.classList.add('open');
    float.innerHTML = `<div class="felt-panel warn">
      <p class="warn-msg">${esc(question)}</p>
      <div class="felt-actions">
        <button class="action-btn" data-act="secondary">${esc(secondary.label)}</button>
        <button class="action-btn primary" data-act="primary">${esc(primary.label)}</button>
      </div>
    </div>`;
    const close = (): void => {
      this.openPopup = null;
      float.classList.remove('open');
      float.innerHTML = '';
    };
    float.querySelector('[data-act="primary"]')?.addEventListener('click', () => { close(); primary.onPick(); });
    float.querySelector('[data-act="secondary"]')?.addEventListener('click', () => { close(); secondary.onPick(); });
  }

  // ── zúčtování a průběh hry (integrované do stolu, po vzoru FLEK!) ──────────

  private get htmlDeps(): HtmlDeps {
    return {
      humanSeat: this.opts.humanSeat,
      nameOf: (s) => this.nameOf(s),
      pattern: this.opts.pattern,
      talkLine: this.settlementLine(),
    };
  }

  /** Uštěpačný komentář k vyúčtování (po vzoru FLEK!). */
  private settlementLine(): string | null {
    const state = this.prevState;
    if (this.talkSet === 'off' || state === null || state.phase.name !== 'scored') return null;
    const delta = state.phase.result.delta[this.opts.humanSeat];
    // nula je „Bez změny" — komentář „Co je doma, to se počítá" by si s tím odporoval
    if (delta === 0) return null;
    // panel se překresluje (jazyk, přepnutí na průběh hry) — hláška musí zůstat táž
    if (this.scoredLine?.handNo === state.handNo) return this.scoredLine.line;
    const line = this.pickTalk(delta > 0 ? 'handWon' : 'handLost', [state.handNo, delta]);
    this.scoredLine = { handNo: state.handNo, line };
    return line;
  }

  // ── bubliny (table talk základ) ────────────────────────────────────────────

  private lastHistoryLen = 0;

  private showLastActionBubble(state: GameState): void {
    if (state.history.length === this.lastHistoryLen) return;
    this.lastHistoryLen = state.history.length;
    const a = state.history[state.history.length - 1];
    if (!a || a.type === 'deal') return;
    const flavour = this.flavourFor(a, state);
    // text obsahuje jen i18n konstanty, escapované cizí hodnoty a naše SVG ikony
    const text = flavour !== null ? esc(flavour) : bubbleText(a, state);
    if (!text) return;
    this.showBubble(a.seat, text);
  }
}

// ── pomocné formátování ────────────────────────────────────────────────────

/** Byla tato konkrétní karta zahrána s ohlášením hlášky? (z historie aktuální hry) */
function wasAnnouncedBy(state: GameState, seat: Seat, card: Card): boolean {
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'play' && a.seat === seat && a.card === card) return a.announceMarriage;
  }
  return false;
}

const REVEAL_STEP_MS = 90;

/**
 * Přiřadí `src` jen když se opravdu liší.
 *
 * Chrome nově vytvořený `<img>` vykreslí prázdný, dokud ho nedekóduje — a
 * protože se ruka i pakly přestavovaly při KAŽDÉM překreslení, probliklo
 * pokaždé celé plátno. Safari dekódovaný obrázek recykluje, proto tam nebylo
 * nic vidět. Řešení není v CSS: prostě nesmíme vyhazovat elementy, které
 * zůstávají stejné.
 */
const setSrc = (img: HTMLImageElement, src: string): void => {
  if (img.getAttribute('src') !== src) img.src = src;
};

/** Zajistí, že kontejner má přesně `count` dětí daného typu, a vrátí je. */
/**
 * Sladí počet dětí kontejneru s `count` (recyklace místo překreslování).
 * Exportováno kvůli testu ukončení při záporném/nečíselném vstupu.
 */
export function syncChildren<T extends HTMLElement>(
  parent: HTMLElement,
  count: number,
  create: () => T,
): T[] {
  /*
   * Záporný (nebo neceločíselný) počet by první smyčku zacyklil: `0 > -1` platí
   * dál, ale `lastElementChild` je už `null`, takže se nic neubere a karta
   * zamrzne. Radši nakreslit prázdno než ztuhnout — podvržený sav se sem dostat
   * může (`assertValid` hlídá 32 karet celkem, ne po rukou).
   */
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  while (parent.children.length > n) parent.lastElementChild?.remove();
  while (parent.children.length < n) parent.appendChild(create());
  return Array.from(parent.children) as T[];
}

/**
 * Nasadí animaci rozdávání na prvky — a umí ji **restartovat**.
 *
 * Od chvíle, kdy se elementy recyklují, si nesou třídu `reveal` z minulého
 * rozdání; pouhé `classList.toggle('reveal', true)` je pak bez efektu a nový
 * zápas by se jen „objevil" místo rozdání. Třída se proto nejdřív sundá všem,
 * jedním vynuceným reflowem se animace zahodí a teprve pak se nasadí znovu.
 */
function setReveal(container: HTMLElement, els: readonly HTMLElement[], animate: boolean): void {
  for (const el of els) {
    el.classList.remove('reveal');
    el.style.animationDelay = '';
  }
  if (!animate) return;
  void container.offsetWidth; // jeden reflow pro celý kontejner
  els.forEach((el, i) => {
    el.style.animationDelay = `${i * REVEAL_STEP_MS}ms`;
    el.classList.add('reveal');
  });
}
/**
 * Rozmístění dekoračních karet na úvodní obrazovce — přesně podle mockupu
 * (Claude Design, artboard „1a Úvod"): dva shluky u okrajů, střed zůstává
 * volný pro titulek a tlačítko. Souřadnice jsou v % šířky/výšky stolu, aby
 * sedly na jakoukoliv velikost; v mockupu to bylo ±470..610 px na desce 1400.
 */
const INTRO_LAYOUT: readonly { x: number; y: number; rot: number; back?: boolean }[] = [
  { x: -35, y: -2, rot: -22 },
  { x: -28, y: 9, rot: -12 },
  { x: -38, y: 21, rot: -30, back: true },
  { x: 35, y: -2, rot: 24 },
  { x: 28, y: 9, rot: 12 },
  { x: 38, y: 21, rot: 32, back: true },
];

/**
 * Náhodné karty pro úvodní obrazovku — schválně `Math.random`, ne seedovaný
 * generátor hry: je to dekorace, která se nesmí plést do reprodukovatelnosti
 * rozdání (`?seed=`).
 */
function pickIntroCards(): Card[] {
  const deck = Array.from({ length: 32 }, (_, i) => i as Card);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, INTRO_LAYOUT.length);
}

/**
 * Kolik posledních hlášek si pamatujeme, ať se neopakují. Musí zůstat MENŠÍ než
 * nejkratší tabulka hlášek — jinak by se vyhýbání vyčerpalo a výběr by spadl
 * zpátky na vylosovanou hlášku (hlídá test v scripts/verify.ts).
 */
export const RECENT_TALK = 14;
/** Jak dlouho bublina visí, a nejkratší doba, než ji smí přebít další. */
const BUBBLE_MS = 2600;
const MIN_BUBBLE_MS = 1100;

function declareLabel(a: Extract<PlayerAction, { type: 'declare' }>, standingTrump: number | null = null): string {
  if (a.mode !== 'hra') return t(a.mode);
  const parts = [t('hra')];
  const trump = a.trump ?? standingTrump;
  if (trump !== null && trump !== undefined) parts.push(suitIcon(trump as 0 | 1 | 2 | 3));
  if (a.sedma) parts.push(`+ ${t('sedma')}`);
  if (a.kilo) parts.push(`+ ${t('kilo')}`);
  return parts.join(' ');
}

const BID_LABEL_CS: Record<string, string> = {
  sedma: 'Sedma', sto: 'Sto', 'sto-sedma': 'Sto a sedma',
  betl: 'Betl', durch: 'Durch', 'dve-sedmy': 'Dvě sedmy', 'dve-sedmy-sto': 'Dvě sedmy a sto',
};
const BID_LABEL_FR: Record<string, string> = {
  sedma: 'Sept', sto: 'Cent', 'sto-sedma': 'Cent et sept',
  betl: 'Bettel', durch: 'Durch', 'dve-sedmy': 'Deux sept',
  'dve-sedmy-sto': 'Deux sept et cent',
};
const BID_LABEL_DE: Record<string, string> = {
  sedma: 'Sieben', sto: 'Hundert', 'sto-sedma': 'Hundert und Sieben',
  betl: 'Bettel', durch: 'Durchmarsch', 'dve-sedmy': 'Zwei Siebener',
  'dve-sedmy-sto': 'Zwei Siebener und Hundert',
};
const BID_LABEL_EN: Record<string, string> = {
  sedma: 'Seven', sto: 'Hundred', 'sto-sedma': 'Hundred & seven',
  betl: 'Betl', durch: 'Durch', 'dve-sedmy': 'Two sevens', 'dve-sedmy-sto': 'Two sevens & hundred',
};

export function bidLabel(b: { kind: string; cervena: boolean }): string {
  const lang = currentLang();
  const table =
    lang === 'en' ? BID_LABEL_EN
    : lang === 'de' ? BID_LABEL_DE
    : lang === 'fr' ? BID_LABEL_FR
    : BID_LABEL_CS;
  const base = table[b.kind] ?? esc(b.kind);
  return b.cervena ? `${base} ${suitIcon(0)}` : base;
}

/**
 * Popisek komponenty (exportováno kvůli regresním testům escapování).
 * `target` může přijít z obnoveného (nedůvěryhodného) savu,
 * takže neznámá hodnota se escapuje — texty jdou do innerHTML.
 */
export function targetLabel(target: string): string {
  const map = TARGET_ACC[currentLang()];
  return map[target] ?? esc(target);
}

/**
 * Cíl fleku ve 4. pádě — skládá se do „flek NA …", takže první pád zní špatně
 * („Flek! na Hra"). Angličtina a němčina mají vlastní tvary se členem.
 */
const TARGET_ACC: Record<Lang, Record<string, string>> = {
  cs: { hra: 'hru', sedma: 'sedmu', kilo: 'kilo', betl: 'betla', durch: 'durcha', dveSedmy: 'dvě sedmy' },
  en: { hra: 'the game', sedma: 'the seven', kilo: 'the hundred', betl: 'betl', durch: 'durch', dveSedmy: 'two sevens' },
  de: { hra: 'das Spiel', sedma: 'die Sieben', kilo: 'Hundert', betl: 'Bettel', durch: 'Durchmarsch', dveSedmy: 'zwei Siebener' },
  fr: { hra: 'le jeu', sedma: 'la sept', kilo: 'le cent', betl: 'le bettel', durch: 'le durch', dveSedmy: 'les deux sept' },
};

/** Jméno fleku bez vykřičníku — do věty „Flek na hru" se „Flek!" nehodí. */
const flekWord = (level: number): string => flekName(level).replace(/!$/, '');

function flekSummary(state: GameState): string {
  const counts: Record<string, number> = {};
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'flek') counts[a.target] = (counts[a.target] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(
    ([tg, lvl]) => `${flekWord(lvl - 1)} ${t('na')} ${targetLabel(tg)}`,
  );
  return parts.join(', ');
}

/**
 * Co leží stranou na stole jako trumf — a tím pádem NENÍ v ruce.
 *
 * Pravidla (ČSM volený, B/7): aktér odkládá dvě karty do talonu „odděleně od
 * zvolené karty", takže zvolená karta po celou dobu licitování leží zvlášť na
 * stole a do talonu jít nesmí. Na sehrávku si ji aktér bere zpět do ruky —
 * proto od fáze `tricks` dál tu nic neleží a kartu ukazuje zase vějíř.
 *
 * Vrací `card` (volený: ukázaná karta) nebo jen `suit` (licitovaný: žádná karta
 * se neukazuje, leží destička s barvou), `null` = nic se neodkládá.
 *
 * Exportováno, aby to šlo testovat bez DOM — tahle funkce rozhoduje zároveň
 * o obsahu ruky, takže její chyba kartu hráči *ztratí*.
 */
export function trumpAsideOf(
  v: PlayerView,
): { card: Card | null; suit: Suit; faceDown: boolean; holder: Seat | null } | null {
  const p = v.phase;
  if (p.name !== 'discard-talon' && p.name !== 'declare' && p.name !== 'takeover' && p.name !== 'fleks') {
    return null;
  }
  const st = p.name === 'fleks' ? null : p.standing;
  const mode = v.contract?.mode ?? st?.mode ?? null;
  // betl a durch trumf nemají — zvolená karta se vrací do ruky hned při deklaraci
  if (mode === 'betl' || mode === 'durch') return null;
  const suit = v.contract?.trump ?? st?.trump ?? null;
  if (suit === null) return null;
  /*
   * Volí vždy forhont. Po převzetí hraje někdo jiný a zvolená karta je zpátky
   * v cizí ruce — ležet na stole už nemá co.
   */
  const declarer = v.contract?.declarer ?? st?.declarer ?? null;
  if (v.config.variant === 'voleny') {
    if (declarer !== forhont(v.dealer)) return null;
    /*
     * „Zvolenou kartu odloží stranou lícem dolů" (Čl. VII/1): svou vidím,
     * soupeřovu ne — `view()` mi ji ani nepošle, přijde `null`.
     */
    const mine = v.revealedTrump !== null;
    /*
     * `holder` = z čí ruky karta odešla stranou. Ve stavu v ní pořád leží
     * (engine ji jen zapsal do `revealedTrump`), takže `handCounts` ji počítá
     * — kdo kreslí ruce, musí ji o jednu ubrat, jinak ji ukáže dvakrát.
     */
    return { card: mine ? v.revealedTrump : null, suit, faceDown: !mine, holder: declarer };
  }
  // licitovaný: žádná karta se nevynáší, trumf je jen barva ze závazku
  return { card: null, suit, faceDown: false, holder: null };
}

/**
 * Podle čeho se skládá vějíř. Desítka se posouvá pod eso jen ve hrách s
 * trumfem (ČSM, Obecná pravidla Čl. II/1); v betlu a durchu je „nižší kartou
 * než spodek stejné barvy" (Čl. IV/6 a 7). Ruka srovnaná jako do barevné hry
 * ji tam ukazuje hned vedle esa — o dvě místa výš, než jak doopravdy bere.
 *
 * Režim se bere z toho, co je v danou chvíli veřejně známo: stojící závazek
 * (vysoutěžený betl/durch, nárok při převzetí) má přednost před `contract`,
 * protože ten ve fázi převzetí drží už překonanou deklaraci. Nic tajného se
 * tím neprozradí — příhozy i nároky jsou veřejné.
 */
export function handOrderMode(v: PlayerView): OrderMode {
  if (knownTrumpless(v)) return 'natural';
  const mode = knownMode(v);
  return mode === null ? 'trump' : orderMode(mode);
}

/**
 * Hraje se (nebo se bude hrát) bez trumfů? Platí pro betl a durch — a taky
 * pro obránce, který ve voleném sebral talon a druh hry bez trumfů teprve
 * vybere (čl. VII/1): desítka mu už teď klesá pod spodka a eso v talonu ho
 * nemá o čem varovat.
 */
export function knownTrumpless(v: PlayerView): boolean {
  const mode = knownMode(v);
  if (mode === 'betl' || mode === 'durch') return true;
  const p = v.phase;
  const standing =
    p.name === 'discard-talon' || p.name === 'declare' || p.name === 'takeover' ? p.standing : null;
  return standing !== null && trumplessChoicePending(v.config, standing);
}

/**
 * Závazek, o kterém se v danou chvíli veřejně ví; `null` = ještě nepadl.
 * Stojící závazek má přednost před `contract` (ten ve fázi převzetí drží už
 * překonanou deklaraci) — viz `handOrderMode`.
 */
export function knownMode(v: PlayerView): GameMode | null {
  const p = v.phase;
  const standing =
    p.name === 'discard-talon' || p.name === 'declare' || p.name === 'takeover' ? p.standing : null;
  return standing?.mode ?? v.contract?.mode ?? null;
}

/**
 * Kolik rubů se kreslí protihráči do vějíře.
 *
 * Exportováno, aby to šlo testovat bez DOM — je to rozhodnutí o POČTU karet,
 * a spletený počet hráč u stolu pozná hned (ta samá zásada jako u `handAside`).
 */
export function opponentBacks(v: PlayerView, seat: Seat, unseenCount = 0): number {
  /*
   * Zvolený trumf leží stranou na stole (kreslí ho `renderTrumpAside`), ale ve
   * stavu pořád patří do ruky — `handCounts` ho počítá. Bez odečtení by měl
   * protihráč ve vějíři o kartu víc a při sehrávce by mu jedna nevysvětlitelně
   * zmizela. Vlastní ruku řeší `handAside()` tímtéž způsobem.
   */
  const aside = trumpAsideOf(v)?.holder === seat ? 1 : 0;
  // volba trumfu „z lidu": karty ještě nikdo neviděl, ale u forhonta už leží
  const extraUnseen =
    v.phase.name === 'choose-trump' && seat === forhont(v.dealer) ? unseenCount : 0;
  // u podvrženého savu (prázdná ruka s odloženým trumfem) by vyšlo -1
  return Math.max(0, v.handCounts[seat] + extraUnseen - aside);
}

/** Ruka tak, jak ji vidí hráč: bez karty, která leží stranou na stole. */
export function handAside(v: PlayerView): readonly Card[] {
  const aside = trumpAsideOf(v);
  const hand = aside === null || aside.card === null ? v.hand : v.hand.filter((c) => c !== aside.card);
  return sortHand(hand, handOrderMode(v));
}

/**
 * Kdo je na tahu (pro stavový řádek „Na tahu: …"). Exportováno, aby to šlo
 * testovat bez DOM: volbu trumfu dělá vždy forhont, a protože rozdávající
 * rotuje, chybějící případ znamenal „…" bez jména ve dvou ze tří her.
 */
export function seatOnTurn(v: PlayerView): Seat | null {
  const p = v.phase;
  if (p.name === 'bidding' || p.name === 'takeover' || p.name === 'tricks') return p.toAct;
  if (p.name === 'fleks') return p.fleks.toAct;
  if (p.name === 'choose-trump') return forhont(v.dealer);
  if (p.name === 'discard-talon' || p.name === 'declare') return p.standing.declarer;
  return null; // idle / scored — nikdo není „na tahu"
}

/** Trumf ze stojícího závazku (fáze declare/takeover) — pro popisky. */
function standingTrumpOf(state: GameState): number | null {
  const p = state.phase;
  if (p.name === 'declare' || p.name === 'discard-talon' || p.name === 'takeover') {
    return p.standing.trump;
  }
  return null;
}

/**
 * Je tenhle „dobrá" aktérova otázka „Barva?", ne souhlas obrany?
 *
 * Ve voleném aktér po odhozu talonu NENABÍZÍ souhlas, ale ptá se obrany, jestli
 * smí hrát barevnou hru (ČSM, Obecná pravidla Čl. VII/1) — a teprve po odpovědi
 * hlásí závazek. Obojí je tatáž akce `takeover/good` a fáze se otázkou nemění,
 * takže je to poznat jen podle sedadla.
 */
export function isColourQuestion(a: PlayerAction, state: GameState): boolean {
  if (a.type !== 'takeover' || a.claim !== 'good') return false;
  const p = state.phase;
  return p.name === 'takeover' && p.standing.declarer === a.seat;
}

/**
 * Situace, za kterou se místo popisku řekne hláška — nebo `null`, když se má
 * ukázat popisek (§5.8: hláška jen tam, kde popisek nenese informaci).
 *
 * Aktérova „Barva?" informaci nese, a hláška za ni navíc mluvila obranou:
 * hráč, který se ptal, si sám nad hlavou přečetl „Tak hraj, sakra". Souhlasy
 * patří těm, kdo na otázku odpovídají.
 */
export function talkSituationFor(a: PlayerAction, state: GameState): TalkSituation | null {
  if (a.type === 'deal') return null;
  if (a.type === 'good' || (a.type === 'takeover' && a.claim === 'good')) {
    return isColourQuestion(a, state) ? null : 'accept';
  }
  if (a.type === 'bid' && a.bid === 'pass') return 'pass';
  if (a.type === 'choose-trump' && a.card === 'from-people') return 'fromPeople';
  return null;
}

/**
 * Popisek závazku („Hra ♥ · Sedma · Flek!") — stejný text pro badge u sedadla
 * i pro velký panel uprostřed, aby se ta dvě místa nemohla rozejít.
 */
export function contractLabelHtml(c: Contract, state: GameState): string {
  const parts: string[] = [];
  parts.push(c.mode === 'hra' ? `${t('hra')} ${c.trump !== null ? suitIcon(c.trump) : ''}` : t(c.mode));
  if (c.sedma !== null) parts.push(c.sedma === c.declarer ? t('sedma') : t('sedmaProti'));
  if (c.kilo !== null) parts.push(c.kilo === c.declarer ? t('kilo') : t('kiloProti'));
  const fleks = flekSummary(state);
  if (fleks) parts.push(fleks);
  return parts.join(' · ');
}

export function bubbleText(a: PlayerAction, state: GameState): string | null {
  switch (a.type) {
    case 'choose-trump':
      return a.card === 'from-people' ? t('fromPeople') : null;
    case 'bid':
      return a.bid === 'pass' ? t('good') : bidLabel(a.bid);
    case 'declare':
      /*
       * Ve voleném akce `declare` trumf NEnese (je určený už volbou), takže
       * bez fallbacku by bublina hlásila „Hra" bez barvy — a nesouhlasila by
       * s tlačítkem, které fallback používá.
       */
      return declareLabel(a, state.contract?.trump ?? standingTrumpOf(state));
    case 'takeover':
      if (a.claim === 'take') return t('take');
      if (a.claim !== 'good') return `${t(a.claim)}!`;
      return t(isColourQuestion(a, state) ? 'askColour' : 'good');
    case 'flek': {
      // historie už obsahuje TENTO flek — jeho jméno je tedy na indexu count-1
      let count = 0;
      for (let i = state.history.length - 1; i >= 0; i -= 1) {
        const h = state.history[i];
        if (h.type === 'deal') break;
        if (h.type === 'flek' && h.target === a.target) count += 1;
      }
      return `${flekWord(Math.max(0, count - 1))} ${t('na')} ${targetLabel(a.target)}`;
    }
    case 'good':
      return t('good');
    case 'announce-proti':
      return a.sedma && a.kilo ? `${t('sedmaProti')}, ${t('kiloProti')}!` : a.sedma ? `${t('sedmaProti')}!` : `${t('kiloProti')}!`;
    case 'play':
      return null; // hlášku ukazuje box „20/40" u karty (po vzoru FLEK!)
    default:
      return null;
  }
}

