/**
 * i18n.ts — texty herního UI (CZ / EN / DE). Jazyk stránky řídí lang-pill
 * v Layoutu (třída lang-cs/lang-en/lang-de na <html>); hra si ho čte odtud.
 *
 * Německá terminologie vychází z německých karetních her (mariáš pochází
 * z německého prostředí): Bettel, Durchmarsch, Kontra/Re/Supra/Resupra,
 * Zwanziger/Vierziger (hlášky), Alleinspieler/Verteidigung.
 */

export type Lang = 'cs' | 'en' | 'de';

export function currentLang(): Lang {
  if (typeof document !== 'undefined') {
    const cl = document.documentElement.classList;
    if (cl.contains('lang-en')) return 'en';
    if (cl.contains('lang-de')) return 'de';
  }
  return 'cs';
}

const STRINGS = {
  deal: { cs: 'Rozdat', en: 'Deal', de: 'Geben' },
  nextHand: { cs: 'Další hra', en: 'Next hand', de: 'Nächstes Spiel' },
  newMatch: { cs: 'Nový zápas', en: 'New match', de: 'Neue Partie' },
  resume: { cs: 'Pokračovat v rozehrané hře?', en: 'Resume the unfinished game?', de: 'Angefangenes Spiel fortsetzen?' },
  chooseTrump: { cs: 'Vyber trumfovou kartu (z prvních sedmi)', en: 'Pick the trump card (from your first seven)', de: 'Wähle die Trumpfkarte (aus den ersten sieben)' },
  fromPeople: { cs: 'Z lidu', en: 'From the deck', de: 'Blind' },
  discard: { cs: 'Vyber 2 karty do talonu', en: 'Choose 2 cards for the talon', de: 'Lege 2 Karten in den Talon' },
  discardConfirm: { cs: 'Odhodit', en: 'Discard', de: 'Ablegen' },
  declare: { cs: 'Ohlaš závazek', en: 'Declare your contract', de: 'Sage dein Spiel an' },
  bidding: { cs: 'Licitace', en: 'Bidding', de: 'Lizitation' },
  pass: { cs: 'Dobrá (pas)', en: 'Pass', de: 'Weiter' },
  takeover: { cs: 'Dobrá, nebo přebereš?', en: 'Accept, or take over?', de: 'Gut, oder übernimmst du?' },
  good: { cs: 'Dobrá', en: 'Good', de: 'Gut' },
  fleks: { cs: 'Flekování', en: 'Doubling', de: 'Kontrieren' },
  yourTurn: { cs: 'Hraj', en: 'Your turn', de: 'Du bist dran' },
  waiting: { cs: 'Na tahu:', en: 'Waiting for', de: 'Am Zug:' },
  you: { cs: 'Ty', en: 'You', de: 'Du' },
  hra: { cs: 'Hra', en: 'Game', de: 'Spiel' },
  betl: { cs: 'Betl', en: 'Betl', de: 'Bettel' },
  durch: { cs: 'Durch', en: 'Durch', de: 'Durchmarsch' },
  sedma: { cs: 'Sedma', en: 'Seven', de: 'Sieben' },
  kilo: { cs: 'Kilo', en: 'Hundred', de: 'Hundert' },
  sedmaProti: { cs: 'Sedma proti', en: 'Seven against', de: 'Sieben dagegen' },
  kiloProti: { cs: 'Sto proti', en: 'Hundred against', de: 'Hundert dagegen' },
  trump: { cs: 'Trumfy', en: 'Trumps', de: 'Trumpf' },
  talon: { cs: 'Talon', en: 'Talon', de: 'Talon' },
  result: { cs: 'Zúčtování', en: 'Settlement', de: 'Abrechnung' },
  points: { cs: 'Body', en: 'Points', de: 'Punkte' },
  declarerSide: { cs: 'Aktér', en: 'Declarer', de: 'Alleinspieler' },
  defendersSide: { cs: 'Obrana', en: 'Defence', de: 'Verteidigung' },
  settings: { cs: 'Nastavení', en: 'Settings', de: 'Einstellungen' },
  variant: { cs: 'Varianta', en: 'Variant', de: 'Variante' },
  voleny: { cs: 'Volený (FLEK!)', en: 'Chosen (FLEK!)', de: 'Gewählt (FLEK!)' },
  licitovany: { cs: 'Licitovaný (RE!)', en: 'Auction (RE!)', de: 'Lizitiert (RE!)' },
  difficulty: { cs: 'Obtížnost (IQ)', en: 'Difficulty (IQ)', de: 'Schwierigkeit (IQ)' },
  easy: { cs: 'Nízké', en: 'Low', de: 'Niedrig' },
  normal: { cs: 'Střední', en: 'Medium', de: 'Mittel' },
  hard: { cs: 'Vysoké', en: 'High', de: 'Hoch' },
  pattern: { cs: 'Vzor karet', en: 'Card pattern', de: 'Kartenbild' },
  modern: { cs: 'Moderní', en: 'Modern', de: 'Modern' },
  history: { cs: '1860 (historické)', en: '1860 (historical)', de: '1860 (historisch)' },
  fullscreen: { cs: 'Celá obrazovka', en: 'Fullscreen', de: 'Vollbild' },
  marriage: { cs: 'Hláška!', en: 'Marriage!', de: 'Meldung!' },
  flekNames: {
    cs: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'],
    en: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'],
    de: ['Kontra!', 'Re!', 'Supra!', 'Resupra!', 'Bock!', 'Hirsch!'],
  },
  na: { cs: 'na', en: 'on', de: 'auf' },
  units: { cs: 'bodů', en: 'pts', de: 'Punkte' },
  vyuctovani: { cs: 'Vyúčtování', en: 'Settlement', de: 'Abrechnung' },
  youLost: { cs: 'Přišel jsi o', en: 'You lost', de: 'Du hast verloren' },
  youWon: { cs: 'Vyhrál jsi', en: 'You won', de: 'Du hast gewonnen' },
  nowTotal: { cs: 'Máš nyní celkem', en: 'You now have', de: 'Du hast jetzt insgesamt' },
  showReplay: { cs: 'Průběh hry', en: 'Show the hand', de: 'Spielverlauf' },
  back: { cs: 'Zpět', en: 'Back', de: 'Zurück' },
  trickWord: { cs: 'Štych', en: 'Trick', de: 'Stich' },
  silentWord: { cs: 'tichá', en: 'silent', de: 'still' },
  marriageWarnAdj: {
    cs: ['červený', 'zelený', 'kulový', 'žaludský'],
    en: ['hearts', 'leaves', 'bells', 'acorns'],
    de: ['Herz', 'Grün', 'Schellen', 'Eichel'],
  },
  announceQuestion: {
    cs: 'Ohlásit hlášku?',
    en: 'Announce the marriage?',
    de: 'Meldung ansagen?',
  },
  announceYes: { cs: 'Ohlásit', en: 'Announce', de: 'Ansagen' },
  announceNo: { cs: 'Zahrát bez hlášky', en: 'Play without it', de: 'Ohne Meldung spielen' },
  talonIllegal: {
    cs: 'Tento odhoz pravidla licitovaného mariáše nedovolují (závazek by nešlo ohlásit).',
    en: 'Auction mariáš rules do not allow this discard (the contract could not be declared).',
    de: 'Diese Ablage erlauben die Regeln des lizitierten Mariasch nicht (das Spiel wäre nicht ansagbar).',
  },
  talonWarn: {
    cs: 'Pozor: s esem/desítkou v talonu lze hrát jen betl nebo durch!',
    en: 'Careful: with an ace/ten in the talon only betl or durch can be played!',
    de: 'Achtung: mit Ass/Zehn im Talon sind nur Bettel oder Durchmarsch möglich!',
  },
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

/** Jména AI soupeřů dle jazyka (Franta/Lojza → Frank/Louie → Franz/Alois). */
export function aiNames(): [string, string] {
  const lang = currentLang();
  if (lang === 'en') return ['Frank', 'Louie'];
  if (lang === 'de') return ['Franz', 'Alois'];
  return ['Franta', 'Lojza'];
}

/**
 * Peníze: konto se vede v jednotkách (1 jednotka = základní sazba hry);
 * zobrazení 0,20 za jednotku (empiricky dle FLEK!) — Kč / $ / €.
 */
export function fmtMoney(units: number): string {
  const v = units * 0.2;
  const lang = currentLang();
  if (lang === 'en') return `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
  const num = v.toFixed(2).replace('.', ',');
  return lang === 'de' ? `${num} €` : `${num} Kč`;
}

/** Varování při odhozu půlky hlášky do talonu — FLEKova formulace. */
export function marriageWarn(suit: 0 | 1 | 2 | 3): string {
  const lang = currentLang();
  const adj = STRINGS.marriageWarnAdj[lang][suit];
  if (lang === 'cs') return `A co ${adj} mariáš?`;
  if (lang === 'de') return `Und die ${adj}-Meldung?`;
  return `What about the ${adj} marriage?`;
}

/** Popisek komponenty vyúčtování ve stylu FLEK! („Prohrané kilo", „Vyhraný betl"…). */
export function compLabel(target: string, won: boolean): string {
  const lang = currentLang();
  if (lang === 'cs') {
    const w: Record<string, string> = {
      hra: 'Vyhraná hra', sedma: 'Vyhraná sedma', kilo: 'Vyhrané kilo',
      betl: 'Vyhraný betl', durch: 'Vyhraný durch', dveSedmy: 'Vyhrané dvě sedmy',
    };
    const l: Record<string, string> = {
      hra: 'Prohraná hra', sedma: 'Prohraná sedma', kilo: 'Prohrané kilo',
      betl: 'Prohraný betl', durch: 'Prohraný durch', dveSedmy: 'Prohrané dvě sedmy',
    };
    return (won ? w : l)[target] ?? target;
  }
  const base: Record<string, Record<string, string>> = {
    en: { hra: 'Game', sedma: 'Seven', kilo: 'Hundred', betl: 'Betl', durch: 'Durch', dveSedmy: 'Two sevens' },
    de: { hra: 'Spiel', sedma: 'Sieben', kilo: 'Hundert', betl: 'Bettel', durch: 'Durchmarsch', dveSedmy: 'Zwei Sieben' },
  };
  const suffix = lang === 'en' ? (won ? 'won' : 'lost') : won ? 'gewonnen' : 'verloren';
  return `${base[lang][target] ?? target} ${suffix}`;
}
