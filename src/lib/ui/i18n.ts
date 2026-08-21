/**
 * i18n.ts — texty herního UI (CZ/EN). Jazyk stránky řídí lang-pill v Layoutu
 * (třída lang-cs/lang-en na <html>); hra si ho čte odtud.
 */

export type Lang = 'cs' | 'en';

export function currentLang(): Lang {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('lang-en')) {
    return 'en';
  }
  return 'cs';
}

const STRINGS = {
  deal: { cs: 'Rozdat', en: 'Deal' },
  nextHand: { cs: 'Další hra', en: 'Next hand' },
  newMatch: { cs: 'Nový zápas', en: 'New match' },
  resume: { cs: 'Pokračovat v rozehrané hře?', en: 'Resume the unfinished game?' },
  chooseTrump: { cs: 'Vyber trumfovou kartu (z prvních sedmi)', en: 'Pick the trump card (from your first seven)' },
  fromPeople: { cs: 'Z lidu', en: 'From the deck' },
  discard: { cs: 'Vyber 2 karty do talonu', en: 'Choose 2 cards for the talon' },
  discardConfirm: { cs: 'Odhodit', en: 'Discard' },
  declare: { cs: 'Ohlaš závazek', en: 'Declare your contract' },
  bidding: { cs: 'Licitace', en: 'Bidding' },
  pass: { cs: 'Dobrá (pas)', en: 'Pass' },
  takeover: { cs: 'Dobrá, nebo přebereš?', en: 'Accept, or take over?' },
  good: { cs: 'Dobrá', en: 'Good' },
  fleks: { cs: 'Flekování', en: 'Doubling' },
  yourTurn: { cs: 'Hraj', en: 'Your turn' },
  waiting: { cs: 'Na tahu:', en: 'Waiting for' },
  you: { cs: 'Ty', en: 'You' },
  hra: { cs: 'Hra', en: 'Game' },
  betl: { cs: 'Betl', en: 'Betl' },
  durch: { cs: 'Durch', en: 'Durch' },
  sedma: { cs: 'Sedma', en: 'Seven' },
  kilo: { cs: 'Kilo', en: 'Hundred' },
  sedmaProti: { cs: 'Sedma proti', en: 'Seven against' },
  kiloProti: { cs: 'Sto proti', en: 'Hundred against' },
  trump: { cs: 'Trumfy', en: 'Trumps' },
  talon: { cs: 'Talon', en: 'Talon' },
  result: { cs: 'Zúčtování', en: 'Settlement' },
  points: { cs: 'Body', en: 'Points' },
  declarerSide: { cs: 'Aktér', en: 'Declarer' },
  defendersSide: { cs: 'Obrana', en: 'Defence' },
  wonBy: { cs: 'vyhrál', en: 'won by' },
  settings: { cs: 'Nastavení', en: 'Settings' },
  variant: { cs: 'Varianta', en: 'Variant' },
  voleny: { cs: 'Volený (FLEK!)', en: 'Chosen (FLEK!)' },
  licitovany: { cs: 'Licitovaný (RE!)', en: 'Auction (RE!)' },
  difficulty: { cs: 'Obtížnost (IQ)', en: 'Difficulty (IQ)' },
  easy: { cs: 'Nízké', en: 'Low' },
  normal: { cs: 'Střední', en: 'Medium' },
  hard: { cs: 'Vysoké', en: 'High' },
  pattern: { cs: 'Vzor karet', en: 'Card pattern' },
  modern: { cs: 'Moderní', en: 'Modern' },
  history: { cs: '1860 (historické)', en: '1860 (historical)' },
  fullscreen: { cs: 'Celá obrazovka', en: 'Fullscreen' },
  marriage: { cs: 'Hláška!', en: 'Marriage!' },
  flekNames: { cs: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'], en: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'] },
  na: { cs: 'na', en: 'on' },
  units: { cs: 'bodů', en: 'pts' },
} as const;

type Key = keyof typeof STRINGS;

export function t(key: Key): string {
  const v = STRINGS[key][currentLang()];
  return typeof v === 'string' ? v : String(v);
}

export function flekName(level: number): string {
  const names = STRINGS.flekNames[currentLang()];
  return names[Math.min(level, names.length - 1)];
}
