/**
 * table.ts — vykreslení herního stolu a interakce (bez herní logiky)
 *
 * Prosté překreslení dynamických regionů při každé změně stavu; legalitu akcí
 * určuje výhradně legalActions(view) — UI z ní jen staví tlačítka a klikací
 * karty. Žádný přístup ke GameState mimo humanView + veřejné části.
 */

import { pointsOf, rankOf, suitOf, KRAL, SVRSEK, card as mkCard, type Card } from '../cards';
import { legalActions } from '../rules/legal';
import { trickWinner } from '../rules/tricks';
import type { GameState, HandResult, PlayerAction, PlayerView, Seat } from '../rules/types';
import { forhont } from '../rules/types';
import { view } from '../rules/view';
import { backSrc, cardName, cardSrc, suitIcon, suitName, type Pattern } from './cardAssets';
import { aiNames, compLabel, currentLang, flekName, fmtMoney, t } from './i18n';

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
  private resultView: 'summary' | 'replay' = 'summary';

  constructor(root: HTMLElement, opts: TableOptions, cb: TableCallbacks) {
    this.root = root;
    this.opts = opts;
    this.cb = cb;
  }

  /**
   * Překreslení podle stavu. Přechody hodné animace (rozdání, dohraný štych)
   * se serializují do fronty — stavy se nikdy nepřeskočí, jen pozdrží.
   */
  render(state: GameState): void {
    const prev = this.prevState;
    this.prevState = state;
    this.chain = this.chain.then(async () => {
      try {
        const handled = await this.playTransitions(prev, state);
        if (!handled) this.renderNow(state);
      } catch (e) {
        console.error(e);
        this.renderNow(state);
      }
    });
  }

  /** Vrací true, když přechod sám vykreslil finální stav. */
  private async playTransitions(prev: GameState | null, state: GameState): Promise<boolean> {
    if (!prev) return false;
    const a = state.history[state.history.length - 1];

    // rozdání po vzoru FLEK!: karty se v ruce objevují postupně
    if (a?.type === 'deal') {
      this.renderNow(state, true);
      if (!this.reducedMotion()) {
        this.root.classList.add('animating');
        const n = state.hands[this.opts.humanSeat].length;
        await sleep(n * REVEAL_STEP_MS + 350);
        this.root.classList.remove('animating');
      }
      return true;
    }

    // „z lidu": otočená karta se ukazuje všem — chvíli ji vystav uprostřed
    if (a?.type === 'choose-trump' && a.card === 'from-people' && prev.unseen.length > 0) {
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
      await sleep(this.reducedMotion() ? 900 : 1800);
      return false; // pokračuj běžným překreslením
    }

    // dohraný štych → pauza, zvýraznění vítězné karty, odlet do paklu vítěze
    if (a?.type === 'play' && prev.phase.name === 'tricks' && prev.contract) {
      const prevTrick = prev.phase.trick;
      if (prevTrick.length === 2) {
        const full = [...prevTrick, { seat: a.seat, card: a.card }];
        const winner = trickWinner(full, prev.contract.trump, prev.contract.mode);
        // ruka a počty karet soupeřů se přepnou na NOVÝ stav hned — zahraná
        // karta nesmí zůstat v ruce, zatímco leží ve štychu na stole
        const vNew = view(state, this.opts.humanSeat);
        this.renderHand(vNew, []); // bez klikání, animace kliky stejně blokuje
        this.renderOpponents(vNew);
        await this.animateTrickEnd(full, winner);
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
    this.renderActions(v, legal);
    this.renderStatus(v, legal);
    this.showLastActionBubble(state);
  }

  // ── animace ────────────────────────────────────────────────────────────────

  private reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private async animateTrickEnd(full: { seat: Seat; card: Card }[], winner: Seat): Promise<void> {
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
    }
    const statusEl = $(this.root, '#status');
    statusEl.textContent = `${currentLang() === 'en' ? 'Trick' : 'Štych'}: ${this.nameOf(winner)}`;
    statusEl.classList.remove('me-turn');

    if (this.reducedMotion()) {
      await sleep(900);
      return;
    }
    await sleep(1250);
    for (const img of imgs) img.classList.add(`fly-${this.posOf(winner)}`);
    await sleep(430);
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
    if (meLedger) meLedger.textContent = `${t('you')}: ${fmtMoney(v.ledger[this.opts.humanSeat])}`;
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
      }
    } else if (v.phase.name === 'scored') {
      // zúčtování integrované do stolu (po vzoru FLEK!)
      trickEl.innerHTML =
        this.resultView === 'summary'
          ? this.settlementHtml(v.phase.result, v)
          : this.replayHtml(state, v.phase.result);
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
      const who = c.declarer === this.opts.humanSeat ? t('you') : this.nameOf(c.declarer);
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
      for (const c of v.hand) playable.add(c);
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
      // preferuj hlášku, když je legální (skoro vždy správně)
      const legal = legalActions(v);
      const withM = legal.find((a) => a.type === 'play' && a.card === c && a.announceMarriage);
      const plain = legal.find((a) => a.type === 'play' && a.card === c);
      const action = withM ?? plain;
      if (action) this.cb.onAction(action);
    }
  }

  private rerenderSelection(v: PlayerView): void {
    const handEl = $(this.root, '#hand');
    const buttons = handEl.querySelectorAll<HTMLButtonElement>('.card-btn');
    v.hand.forEach((c, i) => {
      buttons[i]?.classList.toggle('selected', this.selected.has(c));
    });
    const confirm = this.root.querySelector<HTMLButtonElement>('#discard-confirm');
    if (confirm) confirm.disabled = this.selected.size !== 2;
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

      case 'scored': {
        btn(this.resultView === 'summary' ? t('showReplay') : t('back'), () => {
          this.resultView = this.resultView === 'summary' ? 'replay' : 'summary';
          if (this.prevState) this.renderNow(this.prevState);
        });
        if (legal.some((a) => a.type === 'deal')) btn(t('nextHand'), () => this.cb.onDeal(), { primary: true });
        break;
      }

      case 'choose-trump': {
        const fp = legal.find((a) => a.type === 'choose-trump' && a.card === 'from-people');
        if (fp) btn(t('fromPeople'), () => this.cb.onAction(fp));
        break;
      }

      case 'discard-talon':
        if (legal.length > 0) {
          btn(t('discardConfirm'), () => {
            const cards = [...this.selected] as [Card, Card];
            const action = legal.find(
              (a) => a.type === 'discard' && a.cards.includes(cards[0]) && a.cards.includes(cards[1]),
            );
            if (action) this.cb.onAction(action);
          }, { primary: true, disabled: this.selected.size !== 2, id: 'discard-confirm' });
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
    const p = v.phase;
    const seat =
      p.name === 'bidding' || p.name === 'takeover' ? p.toAct
      : p.name === 'fleks' ? p.fleks.toAct
      : p.name === 'tricks' ? p.toAct
      : p.name === 'choose-trump' ? null
      : p.name === 'discard-talon' || p.name === 'declare' ? p.standing.declarer
      : null;
    if (seat === null || seat === this.opts.humanSeat) return null;
    return this.nameOf(seat);
  }

  // ── zúčtování a průběh hry (integrované do stolu, po vzoru FLEK!) ──────────

  private settlementHtml(r: HandResult, v: PlayerView): string {
    const me = this.opts.humanSeat;
    const mydSide = r.contract.declarer === me ? 'declarer' : 'defenders';
    const lang = currentLang();

    const head =
      r.contract.mode === 'hra'
        ? `${t('hra')} ${r.contract.trump !== null ? suitIcon(r.contract.trump) : ''}`
        : t(r.contract.mode);
    const pts =
      r.contract.mode === 'hra'
        ? `<div class="felt-sub">${t('declarerSide')} ${r.cardPoints.declarer + r.marriagePoints.declarer}
           · ${t('defendersSide')} ${r.cardPoints.defenders + r.marriagePoints.defenders} ${t('units')}</div>`
        : '';

    const flekWord = lang === 'de' ? 'Kontra' : 'flek';
    const rows = r.components
      .map((comp) => {
        const won = comp.wonBy === mydSide;
        let label = compLabel(comp.target, won);
        if (comp.silent) label += ` (${t('silentWord')})`;
        if (comp.flekMultiplier > 1) label += `, ${Math.log2(comp.flekMultiplier)}× ${flekWord}`;
        if (comp.note) label += ` <em>(${comp.note})</em>`;
        return `<tr><td>${label}:</td><td class="money">${fmtMoney(comp.amount)}</td></tr>`;
      })
      .join('');

    const myDelta = r.delta[me];
    const deltaLine = `<tr class="sum"><td>${myDelta < 0 ? t('youLost') : t('youWon')}:</td><td class="money">${fmtMoney(Math.abs(myDelta))}</td></tr>`;
    const totalLine = `<tr><td>${t('nowTotal')}:</td><td class="money">${fmtMoney(v.ledger[me])}</td></tr>`;
    const others = ([0, 1, 2] as Seat[])
      .filter((x) => x !== me)
      .map((x) => `${this.nameOf(x)} ${r.delta[x] >= 0 ? '+' : ''}${fmtMoney(r.delta[x])}`)
      .join(' · ');

    return `<div class="felt-panel">
      <h3>${t('vyuctovani')}:</h3>
      <div class="felt-sub">${head} — ${this.nameOf(r.contract.declarer)}</div>
      ${pts}
      <table><tbody>${rows}${deltaLine}${totalLine}</tbody></table>
      <div class="felt-others">${others}</div>
    </div>`;
  }

  private replayHtml(state: GameState, r: HandResult): string {
    // rekonstrukce štychů z historie aktuální hry
    let start = 0;
    for (let i = state.history.length - 1; i >= 0; i -= 1) {
      if (state.history[i].type === 'deal') { start = i + 1; break; }
    }
    const plays: { seat: Seat; card: Card }[] = [];
    for (let i = start; i < state.history.length; i += 1) {
      const a = state.history[i];
      if (a.type === 'play') plays.push({ seat: a.seat, card: a.card });
    }

    const cardImg = (c: Card, cls = ''): string =>
      `<img class="${cls}" src="${cardSrc(c, this.opts.pattern())}" alt="${cardName(c)}">`;

    const tricksHtml: string[] = [];
    for (let i = 0; i + 2 < plays.length; i += 3) {
      const trick = plays.slice(i, i + 3);
      const winner = trickWinner(trick, r.contract.trump, r.contract.mode);
      tricksHtml.push(`<div class="rtrick">
        <div>${trick.map((p) => cardImg(p.card)).join('')}</div>
        <div class="rwin">${i / 3 + 1}. ${this.nameOf(winner)}</div>
      </div>`);
    }

    const talon = state.talon.length > 0
      ? `<span class="rtalon">${t('talon')}: ${state.talon.map((c) => cardImg(c)).join('')}</span>`
      : '';
    const pts = r.contract.mode === 'hra'
      ? `${t('declarerSide')} ${r.cardPoints.declarer + r.marriagePoints.declarer}
         · ${t('defendersSide')} ${r.cardPoints.defenders + r.marriagePoints.defenders} ${t('units')} · `
      : '';

    return `<div class="replay">
      <div class="replay-head">${pts}${talon}</div>
      <div class="rtricks">${tricksHtml.join('')}</div>
    </div>`;
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
    if (seat === this.opts.humanSeat) return;
    const pos = seat === this.seatAt('left') ? 'left' : 'right';
    const el = $(this.root, `#seat-${pos} .bubble`);
    el.innerHTML = text;
    el.classList.add('show');
    const prev = this.bubbleTimers.get(seat);
    if (prev) clearTimeout(prev);
    this.bubbleTimers.set(seat, setTimeout(() => el.classList.remove('show'), 2600));
  }
}

// ── pomocné formátování ────────────────────────────────────────────────────

const REVEAL_STEP_MS = 90;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const fmtLedger = (n: number): string => (n > 0 ? `+${n}` : String(n));

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
const BID_LABEL_EN: Record<string, string> = {
  sedma: 'Seven', sto: 'Hundred', 'sto-sedma': 'Hundred & seven',
  betl: 'Betl', durch: 'Durch', 'dve-sedmy': 'Two sevens', 'dve-sedmy-sto': 'Two sevens & hundred',
};

function bidLabel(b: { kind: string; cervena: boolean }): string {
  const base = (currentLang() === 'en' ? BID_LABEL_EN : BID_LABEL_CS)[b.kind] ?? b.kind;
  return b.cervena ? `${base} ${suitIcon(0)}` : base;
}

function targetLabel(target: string): string {
  const map: Record<string, string> = {
    hra: t('hra'), sedma: t('sedma'), kilo: t('kilo'),
    betl: t('betl'), durch: t('durch'), dveSedmy: 'dvě sedmy',
  };
  return map[target] ?? target;
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

function bubbleText(a: PlayerAction, state: GameState): string | null {
  switch (a.type) {
    case 'choose-trump':
      return a.card === 'from-people' ? t('fromPeople') : null;
    case 'bid':
      return a.bid === 'pass' ? t('good') : bidLabel(a.bid);
    case 'declare':
      return declareLabel(a);
    case 'takeover':
      return a.claim === 'good' ? t('good') : `${t(a.claim)}!`;
    case 'flek': {
      let level = 0;
      for (let i = state.history.length - 1; i >= 0; i -= 1) {
        const h = state.history[i];
        if (h.type === 'deal') break;
        if (h.type === 'flek' && h.target === a.target) level += 1;
      }
      return `${flekName(level)} ${t('na')} ${targetLabel(a.target)}`;
    }
    case 'good':
      return t('good');
    case 'announce-proti':
      return a.sedma && a.kilo ? `${t('sedmaProti')}, ${t('kiloProti')}!` : a.sedma ? `${t('sedmaProti')}!` : `${t('kiloProti')}!`;
    case 'play': {
      if (a.announceMarriage) {
        const trump = state.contract?.trump;
        const pts = trump !== null && trump !== undefined && suitOf(a.card) === trump ? 40 : 20;
        return `${t('marriage')} ${pts}`;
      }
      return null;
    }
    default:
      return null;
  }
}

