/**
 * i18n.ts — texty herního UI (CZ / EN / DE). Jazyk stránky řídí lang-pill
 * v Layoutu (třída lang-cs/lang-en/lang-de na <html>); hra si ho čte odtud.
 *
 * Německá terminologie vychází z německých karetních her (mariáš pochází
 * z německého prostředí): Bettel, Durchmarsch, Kontra/Re/Supra/Resupra,
 * Zwanziger/Vierziger (hlášky), Alleinspieler/Verteidigung.
 */

export type Lang = 'cs' | 'en' | 'de' | 'fr';

export function currentLang(): Lang {
  if (typeof document !== 'undefined') {
    const cl = document.documentElement.classList;
    if (cl.contains('lang-en')) return 'en';
    if (cl.contains('lang-de')) return 'de';
    if (cl.contains('lang-fr')) return 'fr';
  }
  return 'cs';
}

const STRINGS = {
  deal: { cs: 'Rozdat', en: 'Deal', de: 'Geben', fr: 'Donner' },
  nextHand: { cs: 'Další hra', en: 'Next hand', de: 'Nächstes Spiel', fr: 'Partie suivante' },
  newMatch: { cs: 'Nový zápas', en: 'New match', de: 'Neue Partie', fr: 'Nouvelle partie' },
  resume: { cs: 'Pokračovat v rozehrané hře?', en: 'Resume the unfinished game?', de: 'Angefangenes Spiel fortsetzen?', fr: 'Reprendre la partie en cours ?' },
  chooseTrump: { cs: 'Vyber trumfovou kartu (z prvních sedmi)', en: 'Pick the trump card (from your first seven)', de: 'Wähle die Trumpfkarte (aus den ersten sieben)', fr: 'Choisis l’atout (parmi les sept premières)' },
  fromPeople: { cs: 'Z lidu', en: 'From the deck', de: 'Blind', fr: 'À l’aveugle' },
  discard: { cs: 'Vyber 2 karty do talonu', en: 'Choose 2 cards for the talon', de: 'Lege 2 Karten in den Talon', fr: 'Choisis 2 cartes pour le talon' },
  discardConfirm: { cs: 'Odhodit', en: 'Discard', de: 'Ablegen', fr: 'Écarter' },
  declare: { cs: 'Ohlaš závazek', en: 'Declare your contract', de: 'Sage dein Spiel an', fr: 'Annonce ton contrat' },
  bidding: { cs: 'Licitace', en: 'Bidding', de: 'Lizitation', fr: 'Enchéris' },
  pass: { cs: 'Dobrá (pas)', en: 'Pass', de: 'Weiter', fr: 'Passe' },
  takeover: { cs: 'Dobrá, nebo přebereš?', en: 'Accept, or take over?', de: 'Gut, oder übernimmst du?', fr: 'Couleur ?' },
  good: { cs: 'Dobrá', en: 'Good', de: 'Gut', fr: 'Bien' },
  fleks: { cs: 'Flekování', en: 'Doubling', de: 'Kontrieren', fr: 'Contre ?' },
  yourTurn: { cs: 'Hraj', en: 'Your turn', de: 'Du bist dran', fr: 'À toi de jouer' },
  waiting: { cs: 'Na tahu:', en: 'Waiting for', de: 'Am Zug:', fr: 'Au tour de' },
  you: { cs: 'Ty', en: 'You', de: 'Du', fr: 'Toi' },
  hra: { cs: 'Hra', en: 'Game', de: 'Spiel', fr: 'Jeu' },
  betl: { cs: 'Betl', en: 'Betl', de: 'Bettel', fr: 'Bettel' },
  durch: { cs: 'Durch', en: 'Durch', de: 'Durchmarsch', fr: 'Durch' },
  sedma: { cs: 'Sedma', en: 'Seven', de: 'Sieben', fr: 'Sept' },
  kilo: { cs: 'Kilo', en: 'Hundred', de: 'Hundert', fr: 'Cent' },
  sedmaProti: { cs: 'Sedma proti', en: 'Seven against', de: 'Sieben dagegen', fr: 'Sept contre' },
  kiloProti: { cs: 'Sto proti', en: 'Hundred against', de: 'Hundert dagegen', fr: 'Cent contre' },
  trump: { cs: 'Trumfy', en: 'Trumps', de: 'Trumpf', fr: 'Atout' },
  talon: { cs: 'Talon', en: 'Talon', de: 'Talon', fr: 'Talon' },
  result: { cs: 'Zúčtování', en: 'Settlement', de: 'Abrechnung', fr: 'Décompte' },
  points: { cs: 'Body', en: 'Points', de: 'Punkte', fr: 'Points' },
  /*
   * „Aktér" je oficiální termín ČSM pro hrajícího hráče, takže zůstává — ale
   * ve větě „Aktér 50 · Obrana 120 bodů" vypadal jako jméno. Proto se před
   * čísla přidává „Body:" a strany jsou malým písmenem.
   */
  pointsLabel: { cs: 'Body', en: 'Points', de: 'Punkte', fr: 'Points' },
  declarerSide: { cs: 'aktér', en: 'declarer', de: 'Alleinspieler', fr: 'preneur' },
  defendersSide: { cs: 'obrana', en: 'defence', de: 'Verteidigung', fr: 'défense' },
  settings: { cs: 'Nastavení', en: 'Settings', de: 'Einstellungen', fr: 'Réglages' },
  variant: { cs: 'Varianta', en: 'Variant', de: 'Variante', fr: 'Variante' },
  voleny: { cs: 'Volený (FLEK!)', en: 'Chosen (FLEK!)', de: 'Gewählt (FLEK!)', fr: 'Choisi (FLEK!)' },
  licitovany: { cs: 'Licitovaný (RE!)', en: 'Auction (RE!)', de: 'Lizitiert (RE!)', fr: 'Enchères (RE!)' },
  difficulty: { cs: 'Obtížnost (IQ)', en: 'Difficulty (IQ)', de: 'Schwierigkeit (IQ)', fr: 'Difficulté (QI)' },
  easy: { cs: 'Nízké', en: 'Low', de: 'Niedrig', fr: 'Faible' },
  normal: { cs: 'Střední', en: 'Medium', de: 'Mittel', fr: 'Moyen' },
  hard: { cs: 'Vysoké', en: 'High', de: 'Hoch', fr: 'Élevé' },
  pattern: { cs: 'Vzor karet', en: 'Card pattern', de: 'Kartenbild', fr: 'Dos de cartes' },
  modern: { cs: 'Moderní', en: 'Modern', de: 'Modern', fr: 'Moderne' },
  history: { cs: '1860 (historické)', en: '1860 (historical)', de: '1860 (historisch)', fr: '1860 (historiques)' },
  fullscreen: { cs: 'Celá obrazovka', en: 'Fullscreen', de: 'Vollbild', fr: 'Plein écran' },
  marriage: { cs: 'Hláška!', en: 'Marriage!', de: 'Meldung!', fr: 'Mariage !' },
  flekNames: {
    cs: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'],
    en: ['Flek!', 'Re!', 'Tutti!', 'Boty!', 'Kalhoty!', 'Kajzr!'],
    de: ['Kontra!', 'Re!', 'Supra!', 'Resupra!', 'Bock!', 'Hirsch!'],
    fr: ['Contre !', 'Re !', 'Tutti !', 'Boty !', 'Kalhoty !', 'Kajzr !'],
  },
  na: { cs: 'na', en: 'on', de: 'auf', fr: 'sur' },
  units: { cs: 'bodů', en: 'pts', de: 'Punkte', fr: 'points' },
  vyuctovani: { cs: 'Vyúčtování', en: 'Settlement', de: 'Abrechnung', fr: 'Décompte' },
  youLost: { cs: 'Přišel jsi o', en: 'You lost', de: 'Du hast verloren', fr: 'Tu as perdu' },
  youWon: { cs: 'Vyhrál jsi', en: 'You won', de: 'Du hast gewonnen', fr: 'Tu as gagné' },
  nowTotal: { cs: 'Máš nyní celkem', en: 'You now have', de: 'Du hast jetzt insgesamt', fr: 'Total actuel' },
  showReplay: { cs: 'Průběh hry', en: 'Show the hand', de: 'Spielverlauf', fr: 'Déroulement' },
  back: { cs: 'Zpět', en: 'Back', de: 'Zurück', fr: 'Retour' },
  trickWord: { cs: 'Štych', en: 'Trick', de: 'Stich', fr: 'Levée' },
  silentWord: { cs: 'tichá', en: 'silent', de: 'still', fr: 'silencieux' },
  marriageWarnAdj: {
    cs: ['červený', 'zelený', 'kulový', 'žaludský'],
    en: ['hearts', 'leaves', 'bells', 'acorns'],
    de: ['Herz', 'Grün', 'Schellen', 'Eichel'],
    fr: ['cœur', 'feuille', 'grelot', 'gland'],
  },
  talkPolite: { cs: 'slušné', en: 'polite', de: 'höflich', fr: 'poli' },
  talkPub: { cs: 'hospodské', en: 'pub', de: 'Kneipe', fr: 'bistrot' },
  talkVulgar: { cs: 'vulgární', en: 'vulgar', de: 'derb', fr: 'vulgaire' },
  talkOff: { cs: 'vypnuto', en: 'off', de: 'aus', fr: 'coupé' },
  soundOn: { cs: 'zapnuto', en: 'on', de: 'an', fr: 'activé' },
  soundOff: { cs: 'vypnuto', en: 'off', de: 'aus', fr: 'coupé' },
  /**
   * Jméno hry. Mariáš patří do rodiny „marriage group" a jeho jméno je fonetický
   * přepis francouzského *mariage* (svatba = hláška král + svršek), takže v cizích
   * jazycích se používá právě tenhle kořen (§5.6, historie mariáše).
   */
  gameName: { cs: 'Mariáš', en: 'Marriage', de: 'Mariage', fr: 'Mariage' },
  newGame: { cs: 'Nová hra', en: 'New game', de: 'Neues Spiel', fr: 'Nouvelle partie' },
  endGame: { cs: 'Ukončit hru', en: 'Concede', de: 'Aufgeben', fr: 'Abandonner' },
  endGameWarn: {
    cs: 'Opravdu ukončit rozehranou hru? Počítá se jako prohra a zaplatíš ji.',
    en: 'Really give up this hand? It counts as a loss and you pay for it.',
    de: 'Das laufende Spiel wirklich aufgeben? Es zählt als Niederlage und du zahlst.',
    fr: 'Vraiment abandonner la partie en cours ? Elle compte comme une défaite et tu la paies.',
  },
  lastHand: { cs: 'Minule', en: 'Last hand', de: 'Zuletzt', fr: 'Dernière partie' },
  variantTagVoleny: { cs: 'klasika', en: 'the classic', de: 'Klassiker', fr: 'le classique' },
  variantTagLicitovany: { cs: 'pro pokročilé', en: 'for the bold', de: 'für Fortgeschrittene', fr: 'pour les hardis' },
  variantDescVoleny: {
    cs: 'Forhont volí trumf ze svých karet. S flekováním.',
    en: 'Forehand picks the trump from their cards. With fleks.',
    de: 'Vorhand wählt den Trumpf aus den eigenen Karten. Mit Kontra.',
    fr: 'L’avant-main choisit l’atout dans ses cartes. Avec contres.',
  },
  variantDescLicitovany: {
    cs: 'O hru se licituje. Vyšší závazek přebíjí nižší.',
    en: 'The game is bid for. A higher contract beats a lower one.',
    de: 'Um das Spiel wird geboten. Höheres Spiel schlägt niedrigeres.',
    fr: 'Le jeu se dispute aux enchères. Un contrat plus haut bat le plus bas.',
  },
  dealerShort: { cs: 'rozdává', en: 'deals', de: 'gibt', fr: 'donne' },
  forhont: { cs: 'forhont', en: 'forehand', de: 'Vorhand', fr: 'avant-main' },
  drawZero: { cs: 'Bez změny', en: 'No change', de: 'Unverändert', fr: 'Sans changement' },
  announceQuestion: {
    cs: 'Ohlásit hlášku?',
    en: 'Announce the marriage?',
    de: 'Meldung ansagen?',
    fr: 'Annoncer le mariage ?',
  },
  announceYes: { cs: 'Ohlásit', en: 'Announce', de: 'Ansagen', fr: 'Annoncer' },
  announceNo: { cs: 'Zahrát bez hlášky', en: 'Play without it', de: 'Ohne Meldung spielen', fr: 'Jouer sans annoncer' },
  talonIllegal: {
    cs: 'Tento odhoz pravidla licitovaného mariáše nedovolují (závazek by nešlo ohlásit).',
    en: 'Auction mariáš rules do not allow this discard (the contract could not be declared).',
    de: 'Diese Ablage erlauben die Regeln des lizitierten Mariasch nicht (das Spiel wäre nicht ansagbar).',
    fr: 'Les règles du mariáš aux enchères interdisent cet écart (le contrat ne pourrait pas être annoncé).',
  },
  talonWarn: {
    cs: 'Pozor: s esem/desítkou v talonu lze hrát jen betl nebo durch!',
    en: 'Careful: with an ace/ten in the talon only betl or durch can be played!',
    de: 'Achtung: mit Ass/Zehn im Talon sind nur Bettel oder Durchmarsch möglich!',
    fr: 'Attention : avec un as ou un dix au talon, on ne peut jouer que bettel ou durch !',
  },
} as const;

type Key = keyof typeof STRINGS;

export function t(key: Key): string {
  /*
   * Obrana do hloubky: klíč může přijít z obnoveného stavu (mód kontraktu,
   * cíl fleku). Chybějící překlad se dřív projevil výjimkou uvnitř renderu —
   * a protože se stav autosavuje, tabule zůstala mrtvá i po reloadu.
   */
  const row = STRINGS[key] as Record<string, unknown> | undefined;
  if (row === undefined) return String(key);
  const v = row[currentLang()] ?? row.cs;
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
  if (lang === 'fr') return ['Gaston', 'Marcel'];
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
  return lang === 'de' || lang === 'fr' ? `${num} €` : `${num} Kč`;
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
