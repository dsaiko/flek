/**
 * tableTalk.ts — mariášové hlášky u stolu (docs/marias-design.md §5.8)
 *
 * Bez DOM, aby šly testovat. Dvě sady: **slušná** (výchozí) a **hospodská**
 * (jadrnější, pro pamětníky) — hospodská dědí od slušné všude, kde nemá vlastní
 * variantu. Materiál vychází z hlášek odposlouchaných z originálu FLEK!
 * (docs/original-notes.md) a z běžného mariášového folkloru.
 *
 * Zásada, proč se hláška nikdy nenacpe místo popisku akce: bublina je jediná
 * zpětná vazba o tom, CO soupeř udělal. Folklor proto mluví jen tam, kde
 * popisek nenese informaci („dobrá", „pas"), nebo v okamžicích, které dosud
 * bubliny neměly (přemýšlení, sebraný štych, konec hry).
 */

import type { Lang } from './i18n';

export type TalkSet = 'off' | 'slusna' | 'hospodska';

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
    cs: ['U mě dobrá', 'Dobrá.', 'Ať je po tvém', 'Beru to', 'Souhlas'],
    en: ['Fine by me', 'Agreed.', 'All right', "I'll take it", 'No objection'],
    de: ['Bei mir gut', 'Einverstanden.', 'Meinetwegen', 'Passt schon', 'Kein Einwand'],
  },
  pass: {
    cs: ['Já jsem zticha', 'Já se točit nebudu', 'Nechám to na vás', 'Mlčím', 'Bez mého'],
    en: ['I keep quiet', "I'm out", 'Leave it to you', 'Passing', 'Not from me'],
    de: ['Ich schweige', 'Ich bin raus', 'Überlasse ich euch', 'Weiter', 'Nicht von mir'],
  },
  fromPeople: {
    cs: ['Z lidu, pánové!', 'Ať rozhodne balíček', 'Naslepo a nebát se', 'Co dá, to dá'],
    en: ['From the deck, gentlemen!', 'Let the pack decide', 'Blind and brave', 'Whatever it gives'],
    de: ['Blind, meine Herren!', 'Der Stapel entscheidet', 'Blind und mutig', 'Was kommt, das kommt'],
  },
  thinking: {
    cs: ['Momentíček…', 'Nechte mě přemýšlet', 'Hmm…', 'Počkat, počkat', 'Rozmýšlím se'],
    en: ['One moment…', 'Let me think', 'Hmm…', 'Hold on', 'Thinking it over'],
    de: ['Moment mal…', 'Lasst mich denken', 'Hmm…', 'Warte kurz', 'Ich überlege'],
  },
  trickWon: {
    cs: ['Ten je můj', 'Děkuji pěkně', 'Kdo maže, ten jede', 'To se povedlo', 'Beru'],
    en: ['That one is mine', 'Thank you kindly', 'Grease it and go', 'Nicely done', 'Mine'],
    de: ['Der gehört mir', 'Danke schön', 'Wer schmiert, der fährt', 'Gut gelaufen', 'Nehme ich'],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Dobrá hra', 'Tak se to hraje', 'Sedlo to'],
    en: ['A win is a win', 'Good game', "That's how it's played", 'It worked out'],
    de: ['Gewonnen ist gewonnen', 'Gutes Spiel', 'So spielt man das', 'Hat gepasst'],
  },
  handLost: {
    cs: ['Karta jak noha', 'To se stává', 'Příště to vrátím', 'Smůla, jdeme dál'],
    en: ['Rotten cards', 'It happens', "I'll get it back", 'Bad luck, next one'],
    de: ['Miserable Karten', 'Kommt vor', 'Das hole ich zurück', 'Pech, weiter geht es'],
  },
};

/**
 * Hospodská sada — jadrnější, ale bez sprostoty: hospodská je od hlášek, ne
 * od nadávek. Chybějící situace se berou ze slušné sady.
 */
const PUB: Partial<Record<TalkSituation, Lines>> = {
  accept: {
    cs: ['U mě dobrá, jen to nezvorej', 'Dobrá, ale koukej hrát', 'Sedím a nekecám', 'Pro mě za mě'],
    en: ["Fine, just don't botch it", 'Agreed, now play', 'Sitting quiet', 'Suit yourself'],
    de: ['Gut, aber verbock es nicht', 'Einverstanden, nun spiel', 'Ich sitze still', 'Von mir aus'],
  },
  pass: {
    cs: ['Držím hubu a krok', 'Do toho mi nic není', 'Já mám v ruce seno', 'Ani náhodou'],
    en: ['Keeping my mouth shut', 'Not my business', 'I hold a pile of hay', 'Not a chance'],
    de: ['Ich halte den Mund', 'Geht mich nichts an', 'Ich halte Heu', 'Auf keinen Fall'],
  },
  thinking: {
    cs: ['Momentíček, nehoří', 'Nekoukej mi do karet', 'Neremcej, počítám', 'Času dost'],
    en: ["One moment, nothing's burning", 'Stop peeking at my cards', "Quiet, I'm counting", 'Plenty of time'],
    de: ['Moment, es brennt nicht', 'Guck nicht in meine Karten', 'Ruhe, ich rechne', 'Zeit genug'],
  },
  trickWon: {
    cs: ['Ten je můj, chlapci', 'Sedma smrdí, viďte', 'Kdo maže, ten jede', 'A je to doma'],
    en: ['Mine, boys', 'The seven reeks, eh', 'Grease it and go', "That's in the bag"],
    de: ['Meiner, Jungs', 'Die Sieben stinkt, was', 'Wer schmiert, der fährt', 'Und das sitzt'],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Plať a nekoukej', 'Škola základ života', 'To bylo za ty peníze'],
    en: ['A win is a win', 'Pay up and no sulking', 'Consider it a lesson', 'Worth every crown'],
    de: ['Gewonnen ist gewonnen', 'Zahlen und nicht meckern', 'Lehrgeld nennt man das', 'Das war es wert'],
  },
  handLost: {
    cs: ['Karta jak noha!', 'Vykašli se na mariáš, dej se na politiku', 'U Bucků zhasli', 'To byla bída'],
    en: ['Rotten cards!', 'Give up cards, try politics', 'The lights went out on me', 'That was misery'],
    de: ['Karten wie Stroh!', 'Lass das Kartenspiel, geh in die Politik', 'Bei mir gingen die Lichter aus', 'Das war elend'],
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
}

/** Hláška pro situaci, nebo `null` když jsou hlášky vypnuté. */
export function tableTalk(situation: TalkSituation, opts: TalkOptions): string | null {
  if (opts.set === 'off') return null;
  const table = opts.set === 'hospodska' ? (PUB[situation] ?? POLITE[situation]) : POLITE[situation];
  const lines = table[opts.lang] ?? table.cs;
  if (lines.length === 0) return null;
  return lines[hash([situation, opts.set, ...opts.seed]) % lines.length];
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
export const TALK_TABLES = { POLITE, PUB } as const;
