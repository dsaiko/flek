/**
 * report.ts — záznam rozehrané hry do hlášení chyby (§51)
 *
 * Tester popíše, co se stalo, a hra k tomu přidá záznam, ze kterého jde
 * situace zopakovat přesně — bez „nevím, co jsem mačkal". Záznam je čitelný
 * JSON bez češtiny: varianta, sazebník, kdo rozdával, číslo hry, konto před
 * rozdáním a tahy od rozdání v symbolech („0 --> KH"). Engine je deterministický, takže
 * seed rozdání a tahy stačí — hra se přehraje a každý tah se při tom znovu
 * ověří proti pravidlům. Jména hráčů ani nic jiného v záznamu nejsou.
 *
 * (Dřív to byl zkomprimovaný sav v base64; z telefonu to vypadalo, jako by
 * hra posílala bůhvíco. Uživatel chtěl text, který jde přečíst.)
 *
 * Zpátky: `pbpaste | npx tsx scripts/report.ts` (celý e-mail ze schránky)
 * vypíše sav k vložení do localStorage (klíč `flek.match.v1`).
 */

import { card, rankOf, suitOf, type Card, type Rank, type Suit } from '../cards';
import { apply, initialState } from '../rules/engine';
import { defaultConfig } from '../rules/sazby';
import type { BidLevel, FlekTarget, GameMode, GameState, PlayerAction, RulesConfig, Seat, Variant } from '../rules/types';
import { VERSION, validateSave } from './persist';

export const REPORT_FORMAT = 'flek-record-1';

const RANK = ['7', '8', '9', 'T', 'U', 'O', 'K', 'D'];
const SUIT = ['H', 'L', 'B', 'A'];
const cardCode = (c: Card): string => `${RANK[rankOf(c)]}${SUIT[suitOf(c)]}`;
function parseCard(code: string): Card {
  const r = RANK.indexOf(code[0] ?? '');
  const s = SUIT.indexOf(code[1] ?? '');
  if (code.length !== 2 || r < 0 || s < 0) throw new Error(`unknown card "${code}"`);
  return card(s as Suit, r as Rank);
}

/** Legenda po řádcích — jeden dlouhý řetězec by přetekl přes délku řádku e-mailu. */
const LEGEND = [
  'seats: 0 = you, 1 = left, 2 = right',
  'card = rank + suit: 7 8 9 T(10) U(unter) O(ober) K D(ace)',
  'suits: H(hearts) L(leaves) B(bells) A(acorns)',
  '# deal seed, * trump (? blind), ^ bid (- pass, H red)',
  '>> discard, ~ takeover (ok, << take talon), = declare',
  'x2 double, vs against, ok good, --> play (+ marriage)',
  'xx concede',
];

/*
 * Záznam je bez češtiny (i bez jiného jazyka): tahy jsou symboly a kódy karet,
 * závazky čísla jako v licitačním žebříčku (7, 100, 107, 77…). Kdo ho uvidí
 * v e-mailu, má vidět data, ne větu.
 */
const BID_CODE: Record<BidLevel['kind'], string> = {
  sedma: '7', sto: '100', 'sto-sedma': '107', betl: 'betl', durch: 'durch', 'dve-sedmy': '77', 'dve-sedmy-sto': '1077',
};
const BID_KIND = Object.fromEntries(Object.entries(BID_CODE).map(([k, c]) => [c, k])) as Record<string, BidLevel['kind']>;
const TARGET_CODE: Record<FlekTarget, string> = { hra: '=', sedma: '7', kilo: '100', betl: 'betl', durch: 'durch', dveSedmy: '77' };
const TARGET = Object.fromEntries(Object.entries(TARGET_CODE).map(([k, c]) => [c, k])) as Record<string, FlekTarget>;
const CLAIM_CODE = { good: 'ok', take: '<<', betl: 'betl', durch: 'durch' } as const;
const CLAIM = Object.fromEntries(Object.entries(CLAIM_CODE).map(([k, c]) => [c, k])) as Record<string, 'betl' | 'durch' | 'good' | 'take'>;

const bidCode = (b: BidLevel | 'pass'): string => (b === 'pass' ? '-' : `${BID_CODE[b.kind]}${b.cervena ? 'H' : ''}`);
function parseBid(w: string): BidLevel | 'pass' {
  if (w === '-') return 'pass';
  const cervena = w.endsWith('H');
  const kind = BID_KIND[cervena ? w.slice(0, -1) : w];
  if (kind === undefined) throw new Error(`unknown bid "${w}"`);
  return { kind, cervena };
}

/** Tah → krátký kód („0 --> KH +"). Rozdání nese jen seed. */
export function moveText(a: PlayerAction): string {
  switch (a.type) {
    case 'deal': return `# ${a.seed}`;
    case 'choose-trump': return `${a.seat} * ${a.card === 'from-people' ? '?' : cardCode(a.card)}`;
    case 'bid': return `${a.seat} ^ ${bidCode(a.bid)}`;
    case 'discard': return `${a.seat} >> ${cardCode(a.cards[0])} ${cardCode(a.cards[1])}`;
    case 'declare': {
      const parts = a.mode === 'hra'
        ? [...(a.trump !== undefined ? [SUIT[a.trump]] : []), ...(a.sedma ? ['7'] : []), ...(a.kilo ? ['100'] : [])]
        : [a.mode];
      if (a.dveSedmy === true) parts.push('77');
      if (a.dveSedmy === false) parts.push('-77');
      return [`${a.seat} =`, ...parts].join(' ');
    }
    case 'takeover': return `${a.seat} ~ ${CLAIM_CODE[a.claim]}`;
    case 'flek': return `${a.seat} x2 ${TARGET_CODE[a.target]}`;
    case 'good': return `${a.seat} ok`;
    case 'announce-proti': return [`${a.seat} vs`, ...(a.sedma ? ['7'] : []), ...(a.kilo ? ['100'] : [])].join(' ');
    case 'play': return `${a.seat} --> ${cardCode(a.card)}${a.announceMarriage ? ' +' : ''}`;
    case 'concede': return `${a.seat} xx`;
  }
}

/** Kód → tah. Neznámý symbol je chyba, ne tichý odhad. */
export function parseMove(text: string): PlayerAction {
  const t = text.trim().split(/\s+/);
  const bad = (): never => { throw new Error(`cannot read move "${text}"`); };
  if (t[0] === '#') {
    const seed = Number(t[1]);
    if (t.length !== 2 || !Number.isInteger(seed) || seed < 0) bad();
    return { type: 'deal', seed };
  }
  const seat = Number(t[0]);
  if (seat !== 0 && seat !== 1 && seat !== 2) bad();
  const s = seat as Seat;
  const rest = t.slice(2);
  switch (t[1]) {
    case '*':
      if (rest.length !== 1) bad();
      return { type: 'choose-trump', seat: s, card: rest[0] === '?' ? 'from-people' : parseCard(rest[0]) };
    case '^':
      if (rest.length !== 1) bad();
      return { type: 'bid', seat: s, bid: parseBid(rest[0]) };
    case '>>':
      if (rest.length !== 2) bad();
      return { type: 'discard', seat: s, cards: [parseCard(rest[0]), parseCard(rest[1])] };
    case '=': {
      const mode: GameMode = rest[0] === 'betl' || rest[0] === 'durch' ? rest[0] : 'hra';
      const flags = mode === 'hra' ? rest : rest.slice(1);
      const a: PlayerAction = { type: 'declare', seat: s, mode, sedma: false, kilo: false };
      flags.forEach((w, i) => {
        if (w === '7' && mode === 'hra') a.sedma = true;
        else if (w === '100' && mode === 'hra') a.kilo = true;
        else if (w === '77') a.dveSedmy = true;
        else if (w === '-77') a.dveSedmy = false;
        else if (i === 0 && mode === 'hra' && SUIT.includes(w)) a.trump = SUIT.indexOf(w) as Suit;
        else bad();
      });
      return a;
    }
    case '~':
      if (rest.length !== 1 || CLAIM[rest[0]] === undefined) bad();
      return { type: 'takeover', seat: s, claim: CLAIM[rest[0]] };
    case 'x2':
      if (rest.length !== 1 || TARGET[rest[0]] === undefined) bad();
      return { type: 'flek', seat: s, target: TARGET[rest[0]] };
    case 'ok':
      if (rest.length !== 0) bad();
      return { type: 'good', seat: s };
    case 'vs':
      if (rest.some((w) => w !== '7' && w !== '100')) bad();
      return { type: 'announce-proti', seat: s, sedma: rest.includes('7'), kilo: rest.includes('100') };
    case '-->':
      if (rest.length < 1 || rest.length > 2 || (rest.length === 2 && rest[1] !== '+')) bad();
      return { type: 'play', seat: s, card: parseCard(rest[0]), announceMarriage: rest[1] === '+' };
    case 'xx':
      if (rest.length !== 0) bad();
      return { type: 'concede', seat: s };
  }
  return bad();
}

export interface Record_ {
  format: string;
  variant: 'chosen' | 'auction';
  rates: 'csm' | 'flek' | 'custom';
  /** jen když se sazebník neshoduje s žádným presetem */
  config?: RulesConfig;
  dealer: Seat;
  hand: number;
  ledger: [number, number, number];
  moves: string[];
  legend: string[];
}

/** Tahy od posledního rozdání (předchozí hry k zopakování chyby netřeba). */
function handMoves(state: GameState): PlayerAction[] {
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    if (state.history[i].type === 'deal') return state.history.slice(i);
  }
  return [];
}

/** Stav → záznam (objekt). */
export function toRecord(state: GameState): Record_ {
  const moves = handMoves(state);
  const same = (a: RulesConfig, b: RulesConfig): boolean => JSON.stringify(a) === JSON.stringify(b);
  const rates = same(state.config, defaultConfig(state.config.variant, 'csm')) ? 'csm'
    : same(state.config, defaultConfig(state.config.variant, 'flek')) ? 'flek' : 'custom';
  // konto PŘED rozdáním: po zúčtování už v něm je výsledek téhle hry
  const last = state.phase.name === 'scored' ? state.handResults[state.handResults.length - 1] : undefined;
  const konto = state.ledger.map((x, i) => x - (last?.delta[i] ?? 0)) as [number, number, number];
  return {
    format: REPORT_FORMAT,
    variant: state.config.variant === 'voleny' ? 'chosen' : 'auction',
    rates,
    ...(rates === 'custom' ? { config: state.config } : {}),
    dealer: state.dealer,
    hand: moves.length > 0 ? state.handNo - 1 : state.handNo,
    ledger: konto,
    moves: moves.map(moveText),
    legend: LEGEND,
  };
}

/**
 * Záznam jako text do e-mailu: platný JSON, ale po řádcích nejvýš ~70 znaků
 * (tahy po několika na řádek). Delší řádky by poštovní klient zalomil sám
 * a mohl by přitom rozdělit tah.
 */
export function formatRecord(r: Record_): string {
  const lines: string[] = ['{'];
  const scalar = (k: string, v: unknown): void => { lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`); };
  scalar('format', r.format);
  scalar('variant', r.variant);
  scalar('rates', r.rates);
  if (r.config !== undefined) scalar('config', r.config);
  scalar('dealer', r.dealer);
  scalar('hand', r.hand);
  scalar('ledger', r.ledger);
  lines.push('  "moves": [');
  let row = '';
  r.moves.forEach((m, i) => {
    const item = JSON.stringify(m) + (i < r.moves.length - 1 ? ',' : '');
    if (row !== '' && row.length + item.length + 1 > 66) { lines.push(`    ${row}`); row = ''; }
    row = row === '' ? item : `${row} ${item}`;
  });
  if (row !== '') lines.push(`    ${row}`);
  lines.push('  ],');
  lines.push('  "legend": [');
  r.legend.forEach((c, i) => lines.push(`    ${JSON.stringify(c)}${i < r.legend.length - 1 ? ',' : ''}`));
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n');
}

/** Stav → text záznamu do e-mailu. */
export function encodeReport(state: GameState): string {
  return formatRecord(toRecord(state));
}

/**
 * Text (záznam nebo celý e-mail) → sav. Hra se přehraje enginem od rozdání,
 * takže každý tah znovu projde pravidly, a výsledek musí projít týmiž
 * kontrolami jako načtení hry (`validateSave`). Co by hra sama nepřijala,
 * se odmítne. Předchozí hry zápasu (`handResults`) záznam nenese.
 */
export function decodeReport(text: string): { v: number; state: GameState } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no game record (JSON) in the text');
  const r = JSON.parse(text.slice(start, end + 1)) as Partial<Record_>;
  if (r.format !== REPORT_FORMAT) throw new Error(`unknown record format "${String(r.format)}"`);
  const variant: Variant | null = r.variant === 'chosen' ? 'voleny' : r.variant === 'auction' ? 'licitovany' : null;
  if (variant === null) throw new Error('record has no valid variant');
  const config = r.rates === 'csm' || r.rates === 'flek' ? defaultConfig(variant, r.rates)
    : r.rates === 'custom' && r.config !== undefined ? r.config : null;
  if (config === null) throw new Error('record has no valid rates');
  if (r.dealer !== 0 && r.dealer !== 1 && r.dealer !== 2) throw new Error('record has no valid dealer');
  if (!Number.isInteger(r.hand) || (r.hand as number) < 0) throw new Error('record has no valid hand number');
  if (!Array.isArray(r.ledger) || r.ledger.length !== 3 || !r.ledger.every((x) => Number.isFinite(x))) {
    throw new Error('record has no valid ledger');
  }
  if (!Array.isArray(r.moves) || !r.moves.every((m) => typeof m === 'string')) throw new Error('record has no moves');
  let state: GameState = { ...initialState(config, r.dealer), handNo: r.hand as number, ledger: [...r.ledger] as [number, number, number] };
  for (const m of r.moves) state = apply(state, parseMove(m)); // nelegální tah vyhodí výjimku
  const checked = validateSave({ v: VERSION, state });
  if (checked === null) throw new Error('record failed the save check');
  return { v: VERSION, state: checked };
}

export interface ReportInfo {
  appVersion: string;
  when: string;
  userAgent: string;
  viewport: string;
  flags: string;
  lang: string;
  variant: string;
  pattern: string;
  difficulty: string;
  phase: string;
  handNo: number;
  record: string;
}

/**
 * Místní čas s posunem (`2026-09-26 17:22 UTC+02:00`). Bez označení pásma by
 * UTC vypadal jako místní čas a hlášení by se nedalo spárovat s tím, co
 * tester vyprávěl.
 */
export function localStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    + ` UTC${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/**
 * Tělo e-mailu: popis od hráče a pod čarou údaje pro zopakování — anglicky
 * a symboly, stejné pro testera v každém jazyce. Čistá
 * funkce (bez DOM), ať jde otestovat, co přesně odchází — hlavně že v tom
 * není jméno hráče ani nic, co by hráč nečekal.
 */
export function reportBody(description: string, i: ReportInfo): string {
  return [
    description.trim() || '(no description)',
    '',
    '--- replay data, please do not edit ---',
    `Flek! ${i.appVersion} | ${i.when}`,
    `Device: ${i.userAgent}`,
    `Window: ${i.viewport} | ${i.flags}`,
    `Lang: ${i.lang} | variant: ${i.variant} | cards: ${i.pattern} | IQ: ${i.difficulty}`,
    `Phase: ${i.phase} | hand ${i.handNo}`,
    'Record:',
    i.record,
  ].join('\n');
}

export const REPORT_ADDRESS = 'flek@saiko.cz';

export function reportMailto(subject: string, body: string): string {
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
