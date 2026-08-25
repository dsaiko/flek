/**
 * table.ts — vykreslení herního stolu a interakce (bez herní logiky)
 *
 * Prosté překreslení dynamických regionů při každé změně stavu; legalitu akcí
 * určuje výhradně legalActions(view) — UI z ní jen staví tlačítka a klikací
 * karty. Žádný přístup ke GameState mimo humanView + veřejné části.
 */

import { suitOf, type Card } from '../cards';
import { legalActions } from '../rules/legal';
import { trickWinner } from '../rules/tricks';
import type { GameState, PlayerAction, PlayerView, Seat } from '../rules/types';
import { forhont } from '../rules/types';
import { view } from '../rules/view';
import { backSrc, cardName, cardSrc, suitIcon, suitName, type Pattern } from './cardAssets';
import { aiNames, currentLang, flekName, fmtMoney, marriageWarn, t } from './i18n';
import { discardWarnings } from './discardWarnings';
import { playChoice } from './playChoice';
import { esc, replayHtml, settlementHtml, type HtmlDeps } from './resultHtml';

export { esc };

export interface TableCallbacks {
  onAction: (action: PlayerAction) => void;
  onDeal: () => void;
  onNewMatch: () => void;
}

export interface TableOptions {
  humanSeat: Seat;
  pattern: () => Pattern;
}

const $ = <T extends HTMLElement>(root: HTMLElement, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`chybí element ${sel}`);
  return el;
};

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
  private openPopup: (() => void) | null = null;
  /**
   * Generace zápasu. Animace spí až ~1,8 s a jsou zařazené do `chain`, takže
   * nový zápas by čekal za animacemi toho starého (a při opakovaných klicích
   * na „Nový zápas" i za několika). Zvýšení generace opuštěné animace zkrátí.
   */
  private gen = 0;
  /** Probouzeče běžících spánků — `reset()` je zavolá, aby animace neblokovaly. */
  private readonly sleepers = new Set<() => void>();
  private resultView: 'summary' | 'replay' = 'summary';

  constructor(root: HTMLElement, opts: TableOptions, cb: TableCallbacks) {
    this.root = root;
    this.opts = opts;
    this.cb = cb;
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
    if (prev !== null && prev !== state) this.openPopup = null;
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
        await this.sleep(n * REVEAL_STEP_MS + 350);
        this.root.classList.remove('animating');
      }
      return gen === this.gen; // opuštěný zápas nechá překreslit ten nový
    }

    // „z lidu": otočená karta se ukazuje všem — chvíli ji vystav uprostřed
    if (a?.type === 'choose-trump' && a.card === 'from-people' && prev !== null && prev.unseen.length > 0) {
      const flipped = prev.unseen[0];
      const trickEl = $(this.root, '#trick');
      this.root.classList.add('animating');
      trickEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = cardSrc(flipped, this.opts.pattern());
      img.alt = cardName(flipped);
      img.className = 'played pos-me win';
      trickEl.appendChild(img);
      const statusEl = $(this.root, '#status');
      statusEl.textContent = `${t('fromPeople')}: ${cardName(flipped)}`;
      await this.sleep(this.reducedMotion() ? 900 : 1800);
      // po vyměněném zápasu ať se o překreslení postará ten nový
      return gen !== this.gen;
    }

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
    this.root.classList.toggle('pattern-history', this.opts.pattern() === 'history');
    this.renderOpponents(v, reveal, state.unseen.length);
    this.renderCenter(v, state);
    this.renderHand(v, legal, reveal, state.unseen.length);
    if (phase.name !== 'scored') this.resultView = 'summary';
    this.renderPiles(v);
    this.renderMelds(state, v);
    this.renderActions(v, legal);
    this.renderStatus(v, legal);
    this.showLastActionBubble(state);
    // popup přežije překreslení týmž stavem (jazyk, vzor karet)
    this.openPopup?.();
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

    // vykresli kompletní štych se zvýrazněným vítězem
    trickEl.innerHTML = '';
    const imgs: HTMLImageElement[] = [];
    for (const p of full) {
      const img = document.createElement('img');
      img.src = cardSrc(p.card, this.opts.pattern());
      img.alt = cardName(p.card);
      img.className = `played pos-${this.posOf(p.seat)}${p.seat === winner ? ' win' : ''}`;
      trickEl.appendChild(img);
      imgs.push(img);
      if (state) this.appendMeldBox(trickEl, p, state, trump);
    }
    const statusEl = $(this.root, '#status');
    statusEl.textContent = `${t('trickWord')}: ${this.nameOf(winner)}`;
    statusEl.classList.remove('me-turn');

    if (this.reducedMotion()) {
      await this.sleep(900);
      return;
    }
    await this.sleep(1250);
    if (gen !== this.gen) return; // zápas se vyměnil — do mrtvého stolu nekresli
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
      $(box, '.seat-name').textContent =
        aiNames()[pos === 'left' ? 0 : 1] + (seat === v.dealer ? ' 🂠' : '');
      $(box, '.seat-ledger').textContent = fmtMoney(v.ledger[seat]);
      const backs = $(box, '.backs');
      const extraUnseen =
        v.phase.name === 'choose-trump' && seat === forhont(v.dealer) ? unseenCount : 0;
      const n = v.handCounts[seat] + extraUnseen;
      backs.innerHTML = '';
      for (let i = 0; i < n; i += 1) {
        const img = document.createElement('img');
        img.src = backSrc();
        img.alt = '';
        img.className = 'back';
        if (reveal && !this.reducedMotion()) {
          img.classList.add('reveal');
          img.style.animationDelay = `${i * REVEAL_STEP_MS}ms`;
        }
        backs.appendChild(img);
      }
    }
    const meLedger = this.root.querySelector<HTMLElement>('#ledger-me');
    if (meLedger) meLedger.textContent = fmtMoney(v.ledger[this.opts.humanSeat]);
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
      el.innerHTML = '';
      const n = tricksOf[seat];
      for (let i = 0; i < n; i += 1) {
        const img = document.createElement('img');
        img.src = backSrc();
        img.alt = '';
        // ledabylý hospodský pakl: deterministické natočení po štychu
        img.style.transform = `rotate(${((i * 47) % 24) - 12}deg) translate(${(i % 3) * 3}px, ${(i % 2) * 2}px)`;
        el.appendChild(img);
      }
      if (n > 0) {
        const count = document.createElement('span');
        count.className = 'pile-count';
        count.textContent = `${n}×`;
        el.appendChild(count);
      }
    }
  }

  // ── střed stolu ────────────────────────────────────────────────────────────

  private renderCenter(v: PlayerView, state: GameState): void {
    const trickEl = $(this.root, '#trick');
    trickEl.innerHTML = '';
    if (v.phase.name === 'tricks') {
      for (const p of v.phase.trick) {
        const img = document.createElement('img');
        img.src = cardSrc(p.card, this.opts.pattern());
        img.alt = cardName(p.card);
        img.className = `played pos-${this.posOf(p.seat)}`;
        trickEl.appendChild(img);
        this.appendMeldBox(trickEl, p, state, v.contract?.trump ?? null);
      }
    }
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

    const info = $(this.root, '#contract-info');
    const c = v.contract;
    if (!c || v.phase.name === 'idle' || v.phase.name === 'scored') {
      info.textContent = '';
    } else {
      const parts: string[] = [];
      parts.push(
        c.mode === 'hra' ? `${t('hra')} ${c.trump !== null ? suitIcon(c.trump) : ''}` : t(c.mode),
      );
      if (c.sedma !== null) parts.push(c.sedma === c.declarer ? t('sedma') : t('sedmaProti'));
      if (c.kilo !== null) parts.push(c.kilo === c.declarer ? t('kilo') : t('kiloProti'));
      const fleks = flekSummary(state);
      if (fleks) parts.push(fleks);
      const who = esc(c.declarer === this.opts.humanSeat ? t('you') : this.nameOf(c.declarer));
      info.innerHTML = `${who}: ${parts.join(' · ')}`;
    }
  }

  private posOf(seat: Seat): string {
    const me = this.opts.humanSeat;
    if (seat === me) return 'me';
    return seat === this.seatAt('left') ? 'left' : 'right';
  }

  private nameOf(seat: Seat): string {
    if (seat === this.opts.humanSeat) return t('you');
    return aiNames()[seat === this.seatAt('left') ? 0 : 1];
  }

  // ── ruka ───────────────────────────────────────────────────────────────────

  private renderHand(v: PlayerView, legal: PlayerAction[], reveal = false, unseenCount = 0): void {
    const handEl = $(this.root, '#hand');
    handEl.innerHTML = '';
    const phase = v.phase;

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
    const n = v.hand.length + myUnseen;
    v.hand.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.disabled = !playable.has(c);
      if (this.selected.has(c)) btn.classList.add('selected');
      // jemný vějíř: natočení + pokles ke krajům (transform na buttonu,
      // hover/selected zdvih řeší CSS na <img>, aby se nepřepisovaly)
      const off = i - (n - 1) / 2;
      btn.style.transform = `rotate(${(off * 3).toFixed(1)}deg) translateY(${(off * off * 1.4).toFixed(1)}px)`;
      if (reveal && !this.reducedMotion()) {
        btn.classList.add('reveal');
        btn.style.animationDelay = `${i * REVEAL_STEP_MS}ms`;
      }
      const img = document.createElement('img');
      img.src = cardSrc(c, this.opts.pattern());
      img.alt = cardName(c);
      btn.appendChild(img);
      btn.addEventListener('click', () => this.onCardClick(c, v));
      handEl.appendChild(btn);
    });

    // neotočené karty druhého balíčku (volba trumfu) — ruby v ruce jako u FLEK!
    for (let j = 0; j < myUnseen; j += 1) {
      const i = v.hand.length + j;
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.disabled = true;
      const off = i - (n - 1) / 2;
      btn.style.transform = `rotate(${(off * 3).toFixed(1)}deg) translateY(${(off * off * 1.4).toFixed(1)}px)`;
      const img = document.createElement('img');
      img.src = backSrc();
      img.alt = '';
      if (reveal && !this.reducedMotion()) {
        btn.classList.add('reveal');
        btn.style.animationDelay = `${i * REVEAL_STEP_MS}ms`;
      }
      btn.appendChild(img);
      handEl.appendChild(btn);
    }
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
    v.hand.forEach((c, i) => {
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
            const warns = discardWarnings(v.hand, cards).map((w) =>
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

      case 'takeover':
        for (const a of legal) {
          if (a.type !== 'takeover') continue;
          const label = a.claim === 'good' ? t('good') : t(a.claim);
          btn(label, () => this.cb.onAction(a), { primary: a.claim === 'good' });
        }
        break;

      case 'fleks':
        for (const a of legal) {
          if (a.type === 'good') {
            btn(t('good'), () => this.cb.onAction(a), { primary: true });
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
    const el = $(this.root, '#status');
    const iAct = legal.some((a) => a.type !== 'deal');
    if (v.phase.name === 'idle') {
      el.textContent = '';
    } else if (v.phase.name === 'scored') {
      el.textContent = '';
    } else if (iAct) {
      const hint: Partial<Record<string, string>> = {
        'choose-trump': t('chooseTrump'),
        'discard-talon': t('discard'),
        declare: t('declare'),
        bidding: t('bidding'),
        takeover: t('takeover'),
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

  private showConfirmPopup(messages: string[], confirmLabel: string, onConfirm: () => void): void {
    this.openPopup = () => this.paintConfirmPopup(messages, confirmLabel, onConfirm);
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
    this.openPopup = () => this.paintChoicePopup(question, primary, secondary);
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
    return { humanSeat: this.opts.humanSeat, nameOf: (s) => this.nameOf(s), pattern: this.opts.pattern };
  }

  // ── bubliny (table talk základ) ────────────────────────────────────────────

  private lastHistoryLen = 0;

  private showLastActionBubble(state: GameState): void {
    if (state.history.length === this.lastHistoryLen) return;
    this.lastHistoryLen = state.history.length;
    const a = state.history[state.history.length - 1];
    if (!a || a.type === 'deal') return;
    const text = bubbleText(a, state);
    if (!text) return;
    const seat = a.seat;
    const el =
      seat === this.opts.humanSeat
        ? $(this.root, '#bubble-me')
        : $(this.root, `#seat-${seat === this.seatAt('left') ? 'left' : 'right'} .bubble`);
    // text obsahuje jen i18n konstanty, escapované cizí hodnoty a naše SVG ikony
    el.innerHTML = text;
    el.classList.add('show');
    const prev = this.bubbleTimers.get(seat);
    if (prev) clearTimeout(prev);
    this.bubbleTimers.set(seat, setTimeout(() => el.classList.remove('show'), 2600));
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
  const table = lang === 'en' ? BID_LABEL_EN : lang === 'de' ? BID_LABEL_DE : BID_LABEL_CS;
  const base = table[b.kind] ?? esc(b.kind);
  return b.cervena ? `${base} ${suitIcon(0)}` : base;
}

/**
 * Popisek komponenty (exportováno kvůli regresním testům escapování).
 * `target` může přijít z obnoveného (nedůvěryhodného) savu,
 * takže neznámá hodnota se escapuje — texty jdou do innerHTML.
 */
export function targetLabel(target: string): string {
  const map: Record<string, string> = {
    hra: t('hra'), sedma: t('sedma'), kilo: t('kilo'),
    betl: t('betl'), durch: t('durch'), dveSedmy: 'dvě sedmy',
  };
  return map[target] ?? esc(target);
}

function flekSummary(state: GameState): string {
  const counts: Record<string, number> = {};
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const a = state.history[i];
    if (a.type === 'deal') break;
    if (a.type === 'flek') counts[a.target] = (counts[a.target] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(
    ([tg, lvl]) => `${flekName(lvl - 1)} ${t('na')} ${targetLabel(tg)}`,
  );
  return parts.join(', ');
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
      return a.claim === 'good' ? t('good') : `${t(a.claim)}!`;
    case 'flek': {
      // historie už obsahuje TENTO flek — jeho jméno je tedy na indexu count-1
      let count = 0;
      for (let i = state.history.length - 1; i >= 0; i -= 1) {
        const h = state.history[i];
        if (h.type === 'deal') break;
        if (h.type === 'flek' && h.target === a.target) count += 1;
      }
      return `${flekName(Math.max(0, count - 1))} ${t('na')} ${targetLabel(a.target)}`;
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

