/**
 * tableTalk.ts — mariášové hlášky u stolu (docs/marias-design.md §5.8)
 *
 * Bez DOM, aby šly testovat. Tři sady: **slušná** (výchozí), **hospodská**
 * (jadrnější, pro pamětníky) a **vulgární** (hospoda po půlnoci) — každá dědí
 * od té mírnější všude, kde nemá vlastní variantu. Materiál vychází z hlášek odposlouchaných z originálu FLEK!
 * (docs/original-notes.md) a z běžného mariášového folkloru.
 *
 * Zásada, proč se hláška nikdy nenacpe místo popisku akce: bublina je jediná
 * zpětná vazba o tom, CO soupeř udělal. Folklor proto mluví jen tam, kde
 * popisek nenese informaci („dobrá", „pas"), nebo v okamžicích, které dosud
 * bubliny neměly (přemýšlení, sebraný štych, konec hry).
 */

import type { Lang } from './i18n';

export type TalkSet = 'off' | 'slusna' | 'hospodska' | 'vulgarni';

export type TalkSituation =
  /** „Dobrá" v komentování / převzetí — popisek nenese informaci. */
  | 'accept'
  /** Pas v licitaci. */
  | 'pass'
  /** Volba trumfu naslepo z druhé pětice. */
  | 'fromPeople'
  /** AI počítá tah. */
  | 'thinking'
  /** Sebral štych (ukazuje se jen občas, ať to nešumí). */
  | 'trickWon'
  /** Komentář k zúčtování z pohledu člověka. */
  | 'handWon'
  | 'handLost';

type Lines = Record<Lang, readonly string[]>;

/**
 * Slušná sada — hospodská od ní dědí, kde nemá vlastní variantu.
 * České hlášky jsou folklor; EN/DE drží spíš neutrální herní tón, protože
 * hospodská jadrnost se nepřekládá (§5.8).
 */
const POLITE: Record<TalkSituation, Lines> = {
  accept: {
    cs: ['U mě dobrá', 'Dobrá.', 'Ať je po tvém', 'Beru to', 'Souhlas', 'Nic proti',
      'Platí', 'Jen si posluž', 'Tak do toho', 'Ať se daří'],
    en: ['Fine by me', 'Agreed.', 'All right', "I'll take it", 'No objection', 'Nothing against',
      'It stands', 'Be my guest', 'Go ahead then', 'Good luck'],
    de: ['Bei mir gut', 'Einverstanden.', 'Meinetwegen', 'Passt schon', 'Kein Einwand', 'Nichts dagegen',
      'Gilt', 'Nur zu', 'Dann los', 'Viel Glück'],
  },
  pass: {
    cs: ['Já jsem zticha', 'Já se točit nebudu', 'Nechám to na vás', 'Mlčím', 'Bez mého',
      'Tentokrát ne', 'Vynechám', 'Tohle není pro mě', 'Dál beze mě', 'Ani slovo'],
    en: ['I keep quiet', "I'm out", 'Leave it to you', 'Passing', 'Not from me',
      'Not this time', "I'll sit this one out", 'Not my hand', 'Go on without me', 'Not a word'],
    de: ['Ich schweige', 'Ich bin raus', 'Überlasse ich euch', 'Weiter', 'Nicht von mir',
      'Diesmal nicht', 'Ich setze aus', 'Nichts für mich', 'Macht ohne mich', 'Kein Wort'],
  },
  fromPeople: {
    cs: ['Z lidu, pánové!', 'Ať rozhodne balíček', 'Naslepo a nebát se', 'Co dá, to dá',
      'Beru, co přijde', 'Zkusíme štěstí', 'Naslepo!', 'Ať mluví karty'],
    en: ['From the deck, gentlemen!', 'Let the pack decide', 'Blind and brave', 'Whatever it gives',
      "I'll take what comes", "Let's try our luck", 'Blind it is!', 'Let the cards speak'],
    de: ['Blind, meine Herren!', 'Der Stapel entscheidet', 'Blind und mutig', 'Was kommt, das kommt',
      'Ich nehme, was kommt', 'Versuchen wir es', 'Also blind!', 'Die Karten sollen reden'],
  },
  thinking: {
    cs: ['Momentíček…', 'Nechte mě přemýšlet', 'Hmm…', 'Počkat, počkat', 'Rozmýšlím se',
      'Ještě chvilku', 'Tak co s tím', 'Už to bude', 'Nechte mě spočítat'],
    en: ['One moment…', 'Let me think', 'Hmm…', 'Hold on', 'Thinking it over',
      'Just a moment', 'Now what', 'Almost there', 'Let me count'],
    de: ['Moment mal…', 'Lasst mich denken', 'Hmm…', 'Warte kurz', 'Ich überlege',
      'Einen Augenblick', 'Was nun', 'Gleich habe ich es', 'Lasst mich rechnen'],
  },
  trickWon: {
    cs: ['Ten je můj', 'Děkuji pěkně', 'Kdo maže, ten jede', 'To se povedlo', 'Beru',
      'Pěkný štych', 'A je to tady', 'Sem s ním', 'Ten si nechám'],
    en: ['That one is mine', 'Thank you kindly', 'Grease it and go', 'Nicely done', 'Mine',
      'A fine trick', 'There we go', 'Over here', "I'll keep that one"],
    de: ['Der gehört mir', 'Danke schön', 'Wer schmiert, der fährt', 'Gut gelaufen', 'Nehme ich',
      'Schöner Stich', 'Da haben wir es', 'Her damit', 'Den behalte ich'],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Dobrá hra', 'Tak se to hraje', 'Sedlo to',
      'Vyšlo to', 'Byla to jistota', 'Šlo to samo', 'Spočítáno a podtrženo'],
    en: ['A win is a win', 'Good game', "That's how it's played", 'It worked out',
      'It came off', 'Never in doubt', 'It played itself', 'Counted and signed'],
    de: ['Gewonnen ist gewonnen', 'Gutes Spiel', 'So spielt man das', 'Hat gepasst',
      'Es ist aufgegangen', 'War nie in Gefahr', 'Ging von allein', 'Gezählt und fertig'],
  },
  handLost: {
    cs: ['Karta jak noha', 'To se stává', 'Příště to vrátím', 'Smůla, jdeme dál',
      'Nedalo se nic dělat', 'Chybělo málo', 'Tak zase příště', 'Dneska to nebyl můj den'],
    en: ['Rotten cards', 'It happens', "I'll get it back", 'Bad luck, next one',
      'Nothing to be done', 'So close', 'Next time then', 'Not my day today'],
    de: ['Miserable Karten', 'Kommt vor', 'Das hole ich zurück', 'Pech, weiter geht es',
      'Da war nichts zu machen', 'Knapp daneben', 'Dann eben nächstes Mal', 'Heute nicht mein Tag'],
  },
};

/**
 * Hospodská sada — jadrnější, ale bez sprostoty: hospodská je od hlášek, ne
 * od nadávek. Chybějící situace se berou ze slušné sady.
 */
const PUB: Partial<Record<TalkSituation, Lines>> = {
  accept: {
    cs: ['U mě dobrá, jen to nezvorej', 'Dobrá, ale koukej hrát', 'Sedím a nekecám', 'Pro mě za mě',
      'Klidně, stejně to projedeš', 'Dobrá, a ruce na stůl', 'Hraj, ať to máme z krku',
      'Ať tě ani nenapadne prohrát'],
    en: ["Fine, just don't botch it", 'Agreed, now play', 'Sitting quiet', 'Suit yourself',
      "Sure, you'll blow it anyway", 'Fine, hands on the table', "Play, let's get it over with",
      "Don't you dare lose"],
    de: ['Gut, aber verbock es nicht', 'Einverstanden, nun spiel', 'Ich sitze still', 'Von mir aus',
      'Meinetwegen, du vergeigst es eh', 'Gut, Hände auf den Tisch', 'Spiel, bringen wir es hinter uns',
      'Wehe, du verlierst'],
  },
  pass: {
    cs: ['Držím hubu a krok', 'Do toho mi nic není', 'Já mám v ruce seno', 'Ani náhodou',
      'S tímhle nikam nejdu', 'To si zahraj sám', 'Já na to kašlu', 'Tohle bych nevyhrál ani omylem'],
    en: ['Keeping my mouth shut', 'Not my business', 'I hold a pile of hay', 'Not a chance',
      "I'm going nowhere with this", 'Play it yourself', "I'm having none of it",
      "I couldn't win this by accident"],
    de: ['Ich halte den Mund', 'Geht mich nichts an', 'Ich halte Heu', 'Auf keinen Fall',
      'Damit komme ich nirgends hin', 'Spiel es doch selbst', 'Ohne mich',
      'Das gewinne ich nicht mal aus Versehen'],
  },
  thinking: {
    cs: ['Momentíček, nehoří', 'Nekoukej mi do karet', 'Neremcej, počítám', 'Času dost',
      'Nedejchej mi na krk', 'Hned to bude, klid', 'Nech mě, nejsem stroj', 'Nespěchej na mě'],
    en: ["One moment, nothing's burning", 'Stop peeking at my cards', "Quiet, I'm counting", 'Plenty of time',
      "Don't breathe down my neck", 'Easy, almost there', "Let me be, I'm no machine", "Don't rush me"],
    de: ['Moment, es brennt nicht', 'Guck nicht in meine Karten', 'Ruhe, ich rechne', 'Zeit genug',
      'Atme mir nicht im Nacken', 'Gleich, ganz ruhig', 'Lass mich, ich bin keine Maschine',
      'Dräng mich nicht'],
  },
  trickWon: {
    cs: ['Ten je můj, chlapci', 'Sedma smrdí, viďte', 'Kdo maže, ten jede', 'A je to doma',
      'Poděkujte pánovi', 'Tak se to dělá', 'Na to jste krátký', 'Ten si beru s sebou'],
    en: ['Mine, boys', 'The seven reeks, eh', 'Grease it and go', "That's in the bag",
      'Thank the gentleman', "That's how it's done", 'Too good for you', "I'm taking that one home"],
    de: ['Meiner, Jungs', 'Die Sieben stinkt, was', 'Wer schmiert, der fährt', 'Und das sitzt',
      'Dankt dem Herrn', 'So macht man das', 'Dafür seid ihr zu klein', 'Den nehme ich mit'],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Plať a nekoukej', 'Škola základ života', 'To bylo za ty peníze',
      'Vyklop drobné', 'Přiznej, žes čekal míň', 'Tak znovu a lépe', 'Dobrá, ale draho'],
    en: ['A win is a win', 'Pay up and no sulking', 'Consider it a lesson', 'Worth every crown',
      'Cough up the change', 'Admit you expected less', 'Again, and better', 'Good, but pricey'],
    de: ['Gewonnen ist gewonnen', 'Zahlen und nicht meckern', 'Lehrgeld nennt man das', 'Das war es wert',
      'Raus mit dem Kleingeld', 'Gib zu, du hast weniger erwartet', 'Noch mal, und besser',
      'Gut, aber teuer'],
  },
  handLost: {
    cs: ['Karta jak noha!', 'Vykašli se na mariáš, dej se na politiku', 'U Bucků zhasli', 'To byla bída',
      'S takovou kartou ani svatý', 'Kdo to rozdával?', 'Tohle si budu pamatovat', 'Příště mícháte vy'],
    en: ['Rotten cards!', 'Give up cards, try politics', 'The lights went out on me', 'That was misery',
      'Not even a saint with these', 'Who dealt this?', "I'll remember this one", 'You shuffle next time'],
    de: ['Karten wie Stroh!', 'Lass die Karten, geh in die Politik', 'Bei mir gingen die Lichter aus',
      'Das war elend', 'Damit schafft es kein Heiliger', 'Wer hat das gegeben?',
      'Das merke ich mir', 'Nächstes Mal mischt ihr'],
  },
};

/**
 * Vulgární sada — hospoda po půlnoci. Zapíná se výslovně v nastavení (výchozí
 * je slušná), takže ji nikdo nedostane omylem. Držíme se běžných českých
 * sprostých slov mezi kamarády u karet: **žádné nadávky na skupiny lidí** a
 * nic sexuálně ponižujícího — to už není hospoda, to je svinstvo.
 * Chybějící situace dědí od hospodské, ta od slušné.
 */
const VULGAR: Partial<Record<TalkSituation, Lines>> = {
  accept: {
    cs: ['Dobrá, do prdele', 'Tak hraj, sakra', 'U mě dobrá, ty chytráku', 'Hraj, kurva',
      'Do prdele, ať je po tvým', 'Beru, ty vejtaho', 'Jasně, jen se neposer',
      'Klidně, stejně to zkurvíš'],
    en: ['Fine, dammit', "Just play, for fuck's sake", 'Fine, you smartass', 'Play already, damn it',
      'Hell, have it your way', "I'll take it, big shot", "Sure, don't shit yourself",
      "Go on, you'll screw it up anyway"],
    de: ['Gut, verdammt', 'Spiel endlich, verdammt', 'Gut, du Klugscheißer', 'Spiel schon, Herrgott',
      'Scheiße, mach wie du willst', 'Nehme ich, du Angeber', 'Klar, mach dir nicht ins Hemd',
      'Meinetwegen, du versaust es eh'],
  },
  pass: {
    cs: ['Ani hovno', 'Mám v ruce hovno', 'Držím hubu', 'Kašlu na to',
      'Do prdele s tím, nehraju', 'S tímhle můžu tak do háje', 'Ani náhodou, kurva',
      'Já do toho nejdu, sakra'],
    en: ['Not a damn thing', 'I hold shit', 'Keeping my damn mouth shut', "I don't give a damn",
      'To hell with it', 'This hand is garbage', 'No damn way', "I'm not touching that"],
    de: ['Einen Scheiß', 'Ich halte Mist', 'Ich halte die verdammte Klappe', 'Ist mir scheißegal',
      'Zum Teufel damit', 'Das Blatt ist Müll', 'Auf gar keinen Fall, verdammt',
      'Da fasse ich nichts an'],
  },
  fromPeople: {
    cs: ['Z lidu, kurva', 'Ať rozhodne ten zasranej balíček', 'Naslepo, co má bejt',
      'Do prdele, beru co dá', 'Naslepo a nasrat', 'Ať už to mám z krku',
      'Co přijde, to přijde, sakra', 'Klidně naslepo, stejně je to v hajzlu'],
    en: ['From the deck, dammit', 'Let the damn pack decide', "Blind, so what", 'Hell, whatever comes',
      'Blind and screw it', "Let's get it over with", 'What comes, comes, damn it',
      "Blind then, it's all rubbish anyway"],
    de: ['Blind, verdammt', 'Der verdammte Stapel entscheidet', 'Blind, na und', 'Scheiß drauf, was kommt',
      'Blind und basta', 'Bringen wir es hinter uns', 'Was kommt, das kommt, verdammt',
      'Dann blind, ist eh alles Mist'],
  },
  thinking: {
    cs: ['Momentíček, kurva', 'Nekoukej mi do karet, vole', 'Drž hubu, počítám',
      'Neser mě, přemýšlím', 'Dej mi pokoj, sakra', 'Počkej, do prdele', 'Nehoň mě',
      'Ještě chvilku, ksakru'],
    en: ['One damn moment', 'Stop peeking, you fool', 'Shut up, I am counting',
      "Don't bug me, I'm thinking", 'Give me a break, damn it', 'Wait, dammit', "Don't rush me",
      'Just a damn second'],
    de: ['Einen Moment, verdammt', 'Guck nicht rein, du Depp', 'Klappe, ich rechne',
      'Nerv mich nicht, ich denke', 'Lass mich in Ruhe, verdammt', 'Warte, verdammt',
      'Hetz mich nicht', 'Noch eine verdammte Sekunde'],
  },
  trickWon: {
    cs: ['Ten je můj, vole', 'Sedma smrdí, co', 'A je to doma, kurva', 'Máš hovno',
      'Tak se to dělá, blbečku', 'Ten si strčte za klobouk', 'Poděkuj a plať',
      'Na mě jsi krátkej, kamaráde'],
    en: ['Mine, you fool', 'The seven reeks, huh', "That's in the damn bag", 'You get nothing',
      "That's how it's done, genius", 'Stick that in your pipe', 'Thank me and pay',
      "You're no match for me, pal"],
    de: ['Meiner, du Depp', 'Die Sieben stinkt, was', 'Und das sitzt, verdammt', 'Du kriegst nichts',
      'So macht man das, Genie', 'Steck dir den an den Hut', 'Bedank dich und zahl',
      'Gegen mich bist du nichts, Freundchen'],
  },
  handWon: {
    cs: ['Plať, ty držgrešle', 'Vyklop prachy', 'Co je doma, to se počítá, kurva',
      'Škola základ života, vole', 'To bylo za ty prachy', 'Tak znovu, ty lamo',
      'Naval drobný a nekňuč', 'Máš to za ty svoje chytrosti'],
    en: ['Pay up, you cheapskate', 'Cough up the damn money', 'A win is a damn win',
      'Consider it a lesson, fool', 'Worth every damn crown', 'Again, you amateur',
      'Hand it over and stop whining', "That's for being a smartass"],
    de: ['Zahl, du Geizhals', 'Rück die verdammte Kohle raus', 'Gewonnen ist verdammt nochmal gewonnen',
      'Lehrgeld, du Depp', 'Das war jeden Cent wert', 'Noch mal, du Anfänger',
      'Her damit und hör auf zu jammern', 'Das hast du vom Klugscheißen'],
  },
  handLost: {
    cs: ['Do prdele s takovou kartou', 'Karta jak hovno', 'Kdo to, kurva, rozdával?',
      'Zasraná smůla', 'To je v prdeli', 'Takovou sračku jsem dlouho neměl',
      'Příště mícháte vy, sakra', 'Vykašli se na mariáš, dej se na politiku'],
    en: ['To hell with these cards', 'Cards like crap', 'Who the hell dealt this?',
      'Damn rotten luck', "It's all screwed", "Haven't held such garbage in years",
      'You shuffle next time, damn it', 'Give up cards, try politics'],
    de: ['Scheiß auf diese Karten', 'Karten wie Mist', 'Wer hat das verdammt nochmal gegeben?',
      'Verdammtes Pech', 'Alles im Eimer', 'So einen Mist hatte ich lange nicht',
      'Nächstes Mal mischt ihr, verdammt', 'Lass die Karten, geh in die Politik'],
  },
};

/**
 * Deterministický výběr: tentýž stav musí dát tutéž hlášku, jinak by se text
 * měnil při každém překreslení (přepnutí jazyka, vzoru karet) a bublina by
 * „blikala" jiným textem u téže akce.
 */
function hash(parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h = Math.imul(h ^ 0x2f, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface TalkOptions {
  set: TalkSet;
  lang: Lang;
  /** Cokoliv, co identifikuje okamžik (sedadlo, číslo hry, délka historie). */
  seed: readonly (string | number)[];
  /**
   * Hlášky, které padly nedávno — vyhneme se jim. Bez toho by dva soupeři
   * klidně řekli totéž hned po sobě („Dobrá, ale koukej hrát" dvakrát vedle
   * sebe vypadá jako porucha, ne jako hospoda).
   */
  avoid?: readonly string[];
}

/** Hláška pro situaci, nebo `null` když jsou hlášky vypnuté. */
export function tableTalk(situation: TalkSituation, opts: TalkOptions): string | null {
  if (opts.set === 'off') return null;
  // sady dědí: vulgární → hospodská → slušná
  const table =
    opts.set === 'vulgarni' ? (VULGAR[situation] ?? PUB[situation] ?? POLITE[situation])
    : opts.set === 'hospodska' ? (PUB[situation] ?? POLITE[situation])
    : POLITE[situation];
  const lines = table[opts.lang] ?? table.cs;
  if (lines.length === 0) return null;
  const start = hash([situation, opts.set, ...opts.seed]) % lines.length;
  const avoid = opts.avoid;
  if (avoid === undefined || avoid.length === 0) return lines[start];
  // od vylosované hlášky dopředu první, která nedávno nezazněla
  for (let i = 0; i < lines.length; i += 1) {
    const candidate = lines[(start + i) % lines.length];
    if (!avoid.includes(candidate)) return candidate;
  }
  return lines[start]; // všechno nedávno padlo (krátká tabulka) — ať radši mluví
}

/**
 * Má se hláška v tomhle okamžiku vůbec ozvat? Štychy se hrají třicetkrát za
 * zápas — kdyby se u každého někdo ozval, je to šum, ne hospoda.
 */
export function talkFires(chanceOneIn: number, seed: readonly (string | number)[]): boolean {
  return hash(['fires', ...seed]) % chanceOneIn === 0;
}

/** Všechny situace — pro testy úplnosti překladů. */
export const TALK_SITUATIONS: readonly TalkSituation[] = Object.keys(POLITE) as TalkSituation[];

/** Jen pro testy: syrová data obou sad. */
export const TALK_TABLES = { POLITE, PUB, VULGAR } as const;
