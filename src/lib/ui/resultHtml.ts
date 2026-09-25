/**
 * resultHtml.ts — skladače HTML zúčtování a průběhu hry (bez DOM)
 *
 * Vytaženo z `table.ts` schválně: jsou to jediná místa, kde se text
 * z OBNOVENÉHO (nedůvěryhodného) stavu skládá do `innerHTML`, takže musí být
 * testovatelná bez prohlížeče. Escapuje se každá interpolace; `deps` dodává
 * jen pojmenování hráčů a vzor karet, nic z DOM.
 */

import { type Card } from '../cards';
import { trickWinner } from '../rules/tricks';
import type { GameState, HandResult, PlayerView, Seat } from '../rules/types';
import { cardName, cardSrc, suitIcon, type Pattern } from './cardAssets';
import { compLabel, currentLang, fmtMoney, t } from './i18n';

/** Escapování textu do innerHTML — obnovený stav z localStorage je nedůvěryhodný. */
export function esc(x: unknown): string {
  return String(x).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );
}

export interface HtmlDeps {
  humanSeat: Seat;
  nameOf: (seat: Seat) => string;
  pattern: () => Pattern;
  /**
   * Hláška k výsledku (§5.8) — po vzoru FLEK!, kde vyúčtování doprovázel
   * uštěpačný komentář. Text přichází zvenčí už vybraný; `null` = ticho.
   */
  talkLine?: string | null;
}

export function settlementHtml(r: HandResult, v: PlayerView, deps: HtmlDeps): string {
  const me = deps.humanSeat;
  const mydSide = r.contract.declarer === me ? 'declarer' : 'defenders';
  const lang = currentLang();

  const head =
    r.contract.mode === 'hra'
      ? `${esc(t('hra'))} ${r.contract.trump !== null ? suitIcon(r.contract.trump) : ''}`
      : esc(t(r.contract.mode));
  const pts =
    r.contract.mode === 'hra'
      ? `<div class="felt-sub">${esc(t('pointsLabel'))}: ${esc(t('declarerSide'))} ${esc(r.cardPoints.declarer + r.marriagePoints.declarer)}
         · ${esc(t('defendersSide'))} ${esc(r.cardPoints.defenders + r.marriagePoints.defenders)}</div>`
      : '';

  const flekWord = lang === 'de' ? 'Kontra' : lang === 'fr' ? 'contre' : 'flek';
  const rows = r.components
    .map((comp) => {
      const won = comp.wonBy === mydSide;
      let label = esc(compLabel(comp.target, won));
      if (comp.silent) label += ` (${esc(t('silentWord'))})`;
      if (comp.flekMultiplier > 1) label += `, ${esc(Math.log2(comp.flekMultiplier))}× ${esc(flekWord)}`;
      if (comp.note) label += ` <em>(${esc(comp.note)})</em>`;
      return `<tr><td>${label}:</td><td class="money">${esc(fmtMoney(comp.amount))}</td></tr>`;
    })
    .join('');

  /*
   * Limit (čl. V/8): komponenty se pak nesečtou na výslednou částku, takže se
   * strop musí ukázat — jinak vypadá vyúčtování jako chyba.
   */
  const limitLine = r.limit !== undefined
    ? `<tr><td>${esc(t('limitWord'))}:</td><td class="money">${esc(fmtMoney(r.limit))}</td></tr>`
    : '';

  const myDelta = r.delta[me];
  // nula není výhra — „Vyhrál jsi 0,00 Kč" je nesmysl a nastane, když se
  // komponenty přesně vyruší
  const deltaWord = myDelta === 0 ? t('drawZero') : myDelta < 0 ? t('youLost') : t('youWon');
  const deltaLine = `<tr class="sum"><td>${esc(deltaWord)}:</td><td class="money">${esc(fmtMoney(Math.abs(myDelta)))}</td></tr>`;
  const totalLine = `<tr><td>${esc(t('nowTotal'))}:</td><td class="money">${esc(fmtMoney(v.ledger[me]))}</td></tr>`;
  const others = ([0, 1, 2] as Seat[])
    .filter((x) => x !== me)
    .map((x) => `${esc(deps.nameOf(x))} ${r.delta[x] >= 0 ? '+' : ''}${esc(fmtMoney(r.delta[x]))}`)
    .join(' · ');

  const comment = deps.talkLine
    ? `<div class="felt-talk">„${esc(deps.talkLine)}"</div>`
    : '';

  return `<div class="felt-panel">
    <h3>${esc(t('vyuctovani'))}:</h3>
    <div class="felt-sub">${head} — ${esc(deps.nameOf(r.contract.declarer))}</div>
    ${pts}
    <table><tbody>${rows}${limitLine}${deltaLine}${totalLine}</tbody></table>
    <div class="felt-others">${others}</div>
    ${comment}
  </div>`;
}

export function replayHtml(state: GameState, r: HandResult, deps: HtmlDeps): string {
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
    `<img class="${esc(cls)}" src="${esc(cardSrc(c, deps.pattern()))}" alt="${esc(cardName(c))}">`;

  const tricksHtml: string[] = [];
  for (let i = 0; i + 2 < plays.length; i += 3) {
    const trick = plays.slice(i, i + 3);
    const winner = trickWinner(trick, r.contract.trump, r.contract.mode);
    tricksHtml.push(`<div class="rtrick">
      <div class="rcards">${trick.map((p) => cardImg(p.card)).join('')}</div>
      <div class="rwin">${esc(i / 3 + 1)}. ${esc(deps.nameOf(winner))}</div>
    </div>`);
  }

  /*
   * Talon po hře: ve voleném do něj lze po sehrávce nahlédnout (B/8), v
   * licitovaném „při betlu a durchu však nelze do talonu nahlédnout ani po
   * hře" (licitovaný čl. II/11) — tam zůstane rubem.
   */
  const talonSecret =
    state.config.variant === 'licitovany' && (r.contract.mode === 'betl' || r.contract.mode === 'durch');
  const talon = state.talon.length > 0 && !talonSecret
    ? `<span class="rtalon">${esc(t('talon'))}: ${state.talon.map((c) => cardImg(c)).join('')}</span>`
    : '';
  const pts = r.contract.mode === 'hra'
    ? `${esc(t('pointsLabel'))}: ${esc(t('declarerSide'))} ${esc(r.cardPoints.declarer + r.marriagePoints.declarer)}
       · ${esc(t('defendersSide'))} ${esc(r.cardPoints.defenders + r.marriagePoints.defenders)} · `
    : '';

  return `<div class="replay">
    <div class="replay-head">${pts}${talon}</div>
    <div class="rtricks">${tricksHtml.join('')}</div>
  </div>`;
}

