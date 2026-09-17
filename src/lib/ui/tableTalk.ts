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
      'Platí', 'Jen si posluž', 'Tak do toho', 'Ať se daří',
      'Proti ničemu', 'Dobrá, hraj', 'Beze všeho', 'Já jsem pro', 'Tak ukaž, co umíš', 'Máš to mít',
      'Nebráním ti', 'Ať to stojí za to',
    ],
    en: ['Fine by me', 'Agreed.', 'All right', "I'll take it", 'No objection', 'Nothing against',
      'It stands', 'Be my guest', 'Go ahead then', 'Good luck',
      'No argument here', 'Fine, play it', 'By all means', "I'm for it", 'Show us what you have',
      'It is yours', "I won't stand in your way", 'Make it count',
    ],
    de: ['Bei mir gut', 'Einverstanden.', 'Meinetwegen', 'Passt schon', 'Kein Einwand', 'Nichts dagegen',
      'Gilt', 'Nur zu', 'Dann los', 'Viel Glück',
      'Kein Widerspruch', 'Gut, spiel', 'Bitte sehr', 'Ich bin dafür', 'Zeig, was du kannst',
      'Gehört dir', 'Ich halte dich nicht auf', 'Mach was draus',
    ],
    fr: [
      'Ça me va', 'D’accord.', 'Comme tu veux',
      'Je prends', 'Entendu', 'Rien contre',
      'Ça tient', 'Je t’en prie', 'Vas-y alors',
      'Bonne chance',
      'Aucune objection', 'Bien, joue', 'Volontiers', 'Je suis pour', 'Montre ce que tu sais faire',
      'C’est à toi', 'Je ne te retiens pas', 'Fais-en bon usage',
    ],
  },
  pass: {
    cs: ['Já jsem zticha', 'Já se točit nebudu', 'Nechám to na vás', 'Mlčím', 'Bez mého',
      'Tentokrát ne', 'Vynechám', 'Tohle není pro mě', 'Dál beze mě', 'Ani slovo',
      'Nechám to být', 'Karty mlčí', 'Nemám k tomu co říct', 'Přenechám to vám',
      'Tentokrát jen přihlížím', 'Pas', 'Nebudu to komplikovat', 'Jdu dál',
    ],
    en: ['I keep quiet', "I'm out", 'Leave it to you', 'Passing', 'Not from me',
      'Not this time', "I'll sit this one out", 'Not my hand', 'Go on without me', 'Not a word',
      'I let it be', 'My cards say nothing', 'Nothing to add', 'It is yours to take',
      'Just watching this one', 'Pass', 'I will not complicate it', 'Moving on',
    ],
    de: ['Ich schweige', 'Ich bin raus', 'Überlasse ich euch', 'Weiter', 'Nicht von mir',
      'Diesmal nicht', 'Ich setze aus', 'Nichts für mich', 'Macht ohne mich', 'Kein Wort',
      'Ich lasse es', 'Meine Karten schweigen', 'Nichts hinzuzufügen', 'Nehmt es euch',
      'Diesmal schaue ich nur zu', 'Passe', 'Ich mache es nicht kompliziert', 'Weiter im Text',
    ],
    fr: [
      'Je me tais', 'Je passe', 'Je vous laisse',
      'Sans moi', 'Pas de mon côté', 'Pas cette fois',
      'Je saute mon tour', 'Pas ma main', 'Continuez sans moi',
      'Pas un mot',
      'Je laisse courir', 'Mes cartes se taisent', 'Rien à ajouter', 'À vous de le prendre',
      'Cette fois je regarde', 'Parole', 'Je ne complique rien', 'On avance',
    ],
  },
  fromPeople: {
    cs: ['Z lidu, pánové!', 'Ať rozhodne balíček', 'Naslepo a nebát se', 'Co dá, to dá',
      'Beru, co přijde', 'Zkusíme štěstí', 'Naslepo!', 'Ať mluví karty',
      'Ať rozhodne osud', 'Nevidím, neslyším, beru', 'Věřím té pětce', 'Co leží, to platí',
      'Naslepo, ať je to zajímavé', 'Ruku na to', 'Otočíme a uvidíme', 'Riziko k tomu patří',
    ],
    en: ['From the deck, gentlemen!', 'Let the pack decide', 'Blind and brave', 'Whatever it gives',
      "I'll take what comes", "Let's try our luck", 'Blind it is!', 'Let the cards speak',
      'Let fate decide', 'Eyes closed, I take it', 'I trust those five', 'What lies there, stands',
      'Blind, to keep it interesting', 'Hand on it', 'Turn it over and we shall see',
      'Risk is part of the game',
    ],
    de: ['Blind, meine Herren!', 'Der Stapel entscheidet', 'Blind und mutig', 'Was kommt, das kommt',
      'Ich nehme, was kommt', 'Versuchen wir es', 'Also blind!', 'Die Karten sollen reden',
      'Das Schicksal entscheidet', 'Augen zu und nehmen', 'Ich vertraue den fünf',
      'Was liegt, das gilt', 'Blind, damit es spannend bleibt', 'Hand drauf', 'Umdrehen und sehen',
      'Risiko gehört dazu',
    ],
    fr: [
      'À l’aveugle, messieurs !', 'Que le talon décide', 'À l’aveugle et sans peur',
      'Ce qui vient, vient', 'Je prends ce qui tombe', 'Tentons notre chance',
      'Va pour l’aveugle !', 'Que les cartes parlent',
      'Que le sort décide', 'Les yeux fermés, je prends', 'Je fais confiance à ces cinq',
      'Ce qui est là fait foi', 'À l’aveugle, pour le piment', 'Topons là', 'On retourne et on verra',
      'Le risque fait partie du jeu',
    ],
  },
  thinking: {
    cs: ['Momentíček…', 'Nechte mě přemýšlet', 'Hmm…', 'Počkat, počkat', 'Rozmýšlím se',
      'Ještě chvilku', 'Tak co s tím', 'Už to bude', 'Nechte mě spočítat',
      'Ještě to přepočítám', 'Tohle chce rozmyslet', 'Vteřinku', 'Dívám se, dívám', 'Zvažuju možnosti',
      'Kde to jen je', 'Hned budu hotov', 'Nechte mi chvilku klidu',
    ],
    en: ['One moment…', 'Let me think', 'Hmm…', 'Hold on', 'Thinking it over',
      'Just a moment', 'Now what', 'Almost there', 'Let me count',
      'Let me count again', 'This needs thought', 'One second', 'Looking, looking',
      'Weighing my options', 'Where is it now', 'Nearly done', 'Give me a quiet moment',
    ],
    de: ['Moment mal…', 'Lasst mich denken', 'Hmm…', 'Warte kurz', 'Ich überlege',
      'Einen Augenblick', 'Was nun', 'Gleich habe ich es', 'Lasst mich rechnen',
      'Ich rechne es nach', 'Das will überlegt sein', 'Eine Sekunde', 'Ich schaue noch', 'Ich wäge ab',
      'Wo ist es nur', 'Gleich fertig', 'Gebt mir einen Moment Ruhe',
    ],
    fr: [
      'Un instant…', 'Laissez-moi réfléchir', 'Hmm…',
      'Attendez', 'Je réfléchis', 'Encore un moment',
      'Voyons voir', 'J’y suis presque', 'Laissez-moi compter',
      'Je recompte', 'Cela demande réflexion', 'Une seconde', 'Je regarde encore',
      'Je pèse mes options', 'Où est-ce donc', 'Presque fini', 'Un moment de calme',
    ],
  },
  trickWon: {
    cs: ['Ten je můj', 'Děkuji pěkně', 'Kdo maže, ten jede', 'To se povedlo', 'Beru',
      'Pěkný štych', 'A je to tady', 'Sem s ním', 'Ten si nechám',
      'Ten byl potřeba', 'Tenhle mi udělal radost', 'Přidám si ho', 'Dobře vynesené', 'Hezky to sedlo',
      'Ten půjde ke mně', 'Držím se', 'Zatím to jde',
    ],
    en: ['That one is mine', 'Thank you kindly', 'Grease it and go', 'Nicely done', 'Mine',
      'A fine trick', 'There we go', 'Over here', "I'll keep that one",
      'That one was needed', 'This one pleases me', 'Adding it to the pile', 'Well led',
      'That fit nicely', 'This one comes to me', 'Holding on', 'So far so good',
    ],
    de: ['Der gehört mir', 'Danke schön', 'Wer schmiert, der fährt', 'Gut gelaufen', 'Nehme ich',
      'Schöner Stich', 'Da haben wir es', 'Her damit', 'Den behalte ich',
      'Den brauchte ich', 'Der freut mich', 'Kommt auf meinen Stapel', 'Gut angespielt',
      'Das passte gut', 'Der kommt zu mir', 'Ich halte mich', 'Bislang läuft es',
    ],
    fr: [
      'Celle-là est à moi', 'Merci bien', 'Qui graisse avance',
      'Joliment joué', 'Je prends', 'Belle levée',
      'Et voilà', 'Par ici', 'Je la garde',
      'Celle-là, il la fallait', 'Elle me fait plaisir', 'Je l’ajoute à ma pile', 'Bien entamé',
      'Ça tombe bien', 'Elle vient chez moi', 'Je tiens bon', 'Jusqu’ici tout va bien',
    ],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Dobrá hra', 'Tak se to hraje', 'Sedlo to',
      'Vyšlo to', 'Byla to jistota', 'Šlo to samo', 'Spočítáno a podtrženo',
      'Karty byly na mé straně', 'Přesně podle plánu', 'To se počítá', 'Vyplatilo se riskovat',
      'Beru s díky', 'Tohle byla radost', 'Šlo to hladce', 'Ještě jednou?',
    ],
    en: ['A win is a win', 'Good game', "That's how it's played", 'It worked out',
      'It came off', 'Never in doubt', 'It played itself', 'Counted and signed',
      'The cards were with me', 'Exactly as planned', 'That counts', 'The risk paid off',
      'Taken with thanks', 'That was a pleasure', 'It went smoothly', 'Once more?',
    ],
    de: ['Gewonnen ist gewonnen', 'Gutes Spiel', 'So spielt man das', 'Hat gepasst',
      'Es ist aufgegangen', 'War nie in Gefahr', 'Ging von allein', 'Gezählt und fertig',
      'Die Karten waren auf meiner Seite', 'Genau wie geplant', 'Das zählt',
      'Das Risiko hat sich gelohnt', 'Danke bestens', 'Das war ein Vergnügen', 'Lief glatt',
      'Noch eins?',
    ],
    fr: [
      'Gagné, c’est gagné', 'Belle partie', 'C’est comme ça qu’on joue',
      'Ça a marché', 'C’est passé', 'Jamais douté',
      'Ça s’est joué tout seul', 'Compté et signé',
      'Les cartes étaient avec moi', 'Exactement comme prévu', 'Ça compte', 'Le risque a payé',
      'Je prends avec plaisir', 'C’était un plaisir', 'Tout roulait', 'On remet ça ?',
    ],
  },
  handLost: {
    cs: ['Karta jak noha', 'To se stává', 'Příště to vrátím', 'Smůla, jdeme dál',
      'Nedalo se nic dělat', 'Chybělo málo', 'Tak zase příště', 'Dneska to nebyl můj den',
      'Tak to chodí', 'Karty rozdal někdo jiný', 'Beru si to jako školné', 'Nevyšlo, jdeme dál',
      'O chlup', 'Uznávám, hrál jsi dobře', 'Zaplatím a mlčím', 'Rozdávej, ať to napravím',
    ],
    en: ['Rotten cards', 'It happens', "I'll get it back", 'Bad luck, next one',
      'Nothing to be done', 'So close', 'Next time then', 'Not my day today',
      'That is how it goes', 'Someone else dealt these', 'Chalk it up to tuition', 'Did not work out',
      'By a hair', 'Fair play, you played well', 'I pay and say nothing', 'Deal, let me make it back',
    ],
    de: ['Miserable Karten', 'Kommt vor', 'Das hole ich zurück', 'Pech, weiter geht es',
      'Da war nichts zu machen', 'Knapp daneben', 'Dann eben nächstes Mal', 'Heute nicht mein Tag',
      'So läuft das eben', 'Die hat jemand anders gegeben', 'Nenne ich Lehrgeld', 'Hat nicht geklappt',
      'Um Haaresbreite', 'Zugegeben, gut gespielt', 'Ich zahle und schweige',
      'Gib, ich hole es zurück',
    ],
    fr: [
      'Des cartes de bois', 'Ça arrive', 'Je me rattraperai',
      'Pas de chance, on continue', 'Rien à faire', 'Il s’en fallait de peu',
      'La prochaine alors', 'Pas mon jour',
      'C’est comme ça', 'Ce n’est pas moi qui ai donné', 'Je mets ça sur le compte des leçons',
      'Ça n’a pas marché', 'À un cheveu près', 'Beau jeu, je le reconnais', 'Je paye sans rien dire',
      'Donne, je me refais',
    ],
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
      'Ať tě ani nenapadne prohrát',
      'Dobrá, ale ať to stojí za to', 'Ber si to, stejně to prohraješ', 'Souhlas, a mluv nahlas',
      'Klidně, mám čas', 'Dobrá, ale bacha na sedmu', 'Do toho, hrdino', 'Nechám tě vykoupat',
      'Platí, a teď makej',
    ],
    en: ["Fine, just don't botch it", 'Agreed, now play', 'Sitting quiet', 'Suit yourself',
      "Sure, you'll blow it anyway", 'Fine, hands on the table', "Play, let's get it over with",
      "Don't you dare lose",
      'Fine, but make it worth it', "Take it, you'll lose it anyway", 'Agreed, and speak up',
      'Sure, I have time', 'Fine, but watch the seven', 'Go on, hero', "I'll let you drown",
      'It stands, now get to work',
    ],
    de: ['Gut, aber verbock es nicht', 'Einverstanden, nun spiel', 'Ich sitze still', 'Von mir aus',
      'Meinetwegen, du vergeigst es eh', 'Gut, Hände auf den Tisch', 'Spiel, bringen wir es hinter uns',
      'Wehe, du verlierst',
      'Gut, aber dann richtig', 'Nimm es, verlierst es eh', 'Einverstanden, sprich lauter',
      'Klar, ich habe Zeit', 'Gut, aber pass auf die Sieben auf', 'Nur zu, Held',
      'Ich lasse dich baden gehen', 'Gilt, jetzt streng dich an',
    ],
    fr: [
      'Ça me va, mais joue bien', 'D’accord, alors joue', 'Je me tais et je regarde',
      'Fais comme tu veux', 'Vas-y, tu vas te planter', 'D’accord, mains sur la table',
      'Joue, qu’on en finisse', 'N’avise pas de perdre',
      'D’accord, mais que ça vaille le coup', 'Prends, tu vas perdre de toute façon',
      'Entendu, et parle plus fort', 'Vas-y, j’ai le temps', 'D’accord, mais gare à la sept',
      'Allez, champion', 'Je te laisse couler', 'Ça tient, au travail',
    ],
  },
  pass: {
    cs: ['Držím hubu a krok', 'Do toho mi nic není', 'Já mám v ruce seno', 'Ani náhodou',
      'S tímhle nikam nejdu', 'To si zahraj sám', 'Já na to kašlu', 'Tohle bych nevyhrál ani omylem',
      'Tohle bych nehrál ani za pivo', 'Mám to jak z popelnice', 'Já se na to jenom dívám',
      'Bez mého, chlapci', 'Radši si dám doušek', 'Nechte mě být', 'Za tohle bych se styděl',
      'Hrajte si sami',
    ],
    en: ['Keeping my mouth shut', 'Not my business', 'I hold a pile of hay', 'Not a chance',
      "I'm going nowhere with this", 'Play it yourself', "I'm having none of it",
      "I couldn't win this by accident",
      "I wouldn't play this for a beer", 'Straight out of the bin', 'I am only watching',
      'Without me, boys', "I'd rather take a sip", 'Leave me out of it', "I'd be ashamed of this hand",
      'Play among yourselves',
    ],
    de: ['Ich halte den Mund', 'Geht mich nichts an', 'Ich halte Heu', 'Auf keinen Fall',
      'Damit komme ich nirgends hin', 'Spiel es doch selbst', 'Ohne mich',
      'Das gewinne ich nicht mal aus Versehen',
      'Dafür nicht mal ein Bier', 'Direkt aus der Tonne', 'Ich schaue nur zu', 'Ohne mich, Jungs',
      'Ich nehme lieber einen Schluck', 'Lasst mich aus dem Spiel', 'Für das Blatt schäme ich mich',
      'Spielt unter euch',
    ],
    fr: [
      'Je ferme ma bouche', 'Ça ne me regarde pas', 'J’ai du foin en main',
      'Certainement pas', 'Je ne vais nulle part avec ça', 'Joue-la toi-même',
      'Je m’en moque', 'Je ne gagnerais pas ça par accident',
      'Même pas pour une bière', 'Tout droit de la poubelle', 'Je ne fais que regarder',
      'Sans moi, les gars', 'Je préfère boire un coup', 'Laissez-moi tranquille',
      'J’aurais honte de cette main', 'Jouez entre vous',
    ],
  },
  thinking: {
    cs: ['Momentíček, nehoří', 'Nekoukej mi do karet', 'Neremcej, počítám', 'Času dost',
      'Nedejchej mi na krk', 'Hned to bude, klid', 'Nech mě, nejsem stroj', 'Nespěchej na mě',
      'Klid, přemýšlím', 'Nekoukej na hodinky', 'Tohle se musí spočítat', 'Mám to skoro',
      'Ještě chvilku a jdu na to', 'Neruš, dělám vědu', 'Chvilku, ať to nepokazím',
      'Kdo spěchá, ten platí',
    ],
    en: ["One moment, nothing's burning", 'Stop peeking at my cards', "Quiet, I'm counting", 'Plenty of time',
      "Don't breathe down my neck", 'Easy, almost there', "Let me be, I'm no machine", "Don't rush me",
      'Easy, I am thinking', 'Stop watching the clock', 'This needs counting', 'Almost have it',
      'One more moment and I go', 'Quiet, science at work', 'A moment, so I do not spoil it',
      'He who hurries, pays',
    ],
    de: ['Moment, es brennt nicht', 'Guck nicht in meine Karten', 'Ruhe, ich rechne', 'Zeit genug',
      'Atme mir nicht im Nacken', 'Gleich, ganz ruhig', 'Lass mich, ich bin keine Maschine',
      'Dräng mich nicht',
      'Ruhig, ich denke nach', 'Schau nicht auf die Uhr', 'Das muss gerechnet werden',
      'Fast habe ich es', 'Noch kurz, dann lege ich los', 'Nicht stören, Wissenschaft',
      'Moment, sonst verderbe ich es', 'Wer hetzt, der zahlt',
    ],
    fr: [
      'Un instant, ça ne brûle pas', 'Ne regarde pas mes cartes', 'Silence, je compte',
      'On a le temps', 'Ne me souffle pas dans le cou', 'Du calme, j’arrive',
      'Laisse-moi, je ne suis pas une machine', 'Ne me presse pas',
      'Du calme, je réfléchis', 'Ne regarde pas l’heure', 'Ça se calcule', 'Je le tiens presque',
      'Encore un instant et j’y vais', 'Silence, je fais de la science',
      'Un instant, pour ne pas gâcher', 'Qui se presse paye',
    ],
  },
  trickWon: {
    cs: ['Ten je můj, chlapci', 'Sedma smrdí, viďte', 'Kdo maže, ten jede', 'A je to doma',
      'Poděkujte pánovi', 'Tak se to dělá', 'Na to jste krátký', 'Ten si beru s sebou',
      'Ten byl za pivo', 'Tenhle mi udělal den', 'Berte to jako lekci', 'To bylo lehké',
      'Ještě jednou a jdeme domů', 'Pěkně jsi mi ho nahrál', 'Ten si zarámuju',
      'Kdo se směje naposled',
    ],
    en: ['Mine, boys', 'The seven reeks, eh', 'Grease it and go', "That's in the bag",
      'Thank the gentleman', "That's how it's done", 'Too good for you', "I'm taking that one home",
      'That one was worth a beer', 'This made my day', 'Take it as a lesson', 'That was easy',
      'One more and we go home', 'You set that up for me nicely', 'I am framing this one',
      'He who laughs last',
    ],
    de: ['Meiner, Jungs', 'Die Sieben stinkt, was', 'Wer schmiert, der fährt', 'Und das sitzt',
      'Dankt dem Herrn', 'So macht man das', 'Dafür seid ihr zu klein', 'Den nehme ich mit',
      'Der war ein Bier wert', 'Der rettet meinen Tag', 'Nehmt es als Lektion', 'Das war leicht',
      'Noch einer und wir gehen heim', 'Den hast du mir schön vorgelegt', 'Den rahme ich ein',
      'Wer zuletzt lacht',
    ],
    fr: [
      'Celle-là est à moi, les gars', 'La sept sent mauvais, hein', 'Qui graisse avance',
      'Et c’est dans la poche', 'Remerciez le monsieur', 'C’est comme ça qu’on fait',
      'Vous êtes trop courts', 'Je l’emporte',
      'Celle-là valait une bière', 'Elle me fait la journée', 'Prenez ça comme une leçon',
      'C’était facile', 'Encore une et on rentre', 'Tu me l’as bien servie', 'Je vais l’encadrer',
      'Rira bien qui rira le dernier',
    ],
  },
  handWon: {
    cs: ['Co je doma, to se počítá', 'Plať a nekoukej', 'Škola základ života', 'To bylo za ty peníze',
      'Vyklop drobné', 'Přiznej, žes čekal míň', 'Tak znovu a lépe', 'Dobrá, ale draho',
      'Nebreč a rozdávej', 'To bylo za tu trpělivost', 'Dobrá hra, špatné karty pro vás',
      'Mám na pivo', 'Ještě dvě takové a platím rundu', 'Vyplatilo se počkat', 'Teď se mi to hodilo',
      'Kdo neriskuje, nepije',
    ],
    en: ['A win is a win', 'Pay up and no sulking', 'Consider it a lesson', 'Worth every crown',
      'Cough up the change', 'Admit you expected less', 'Again, and better', 'Good, but pricey',
      'Stop crying and deal', 'That was for the patience', 'Good game, bad cards for you',
      'That is my beer sorted', 'Two more and I buy a round', 'Waiting paid off', 'That came in handy',
      'No risk, no beer',
    ],
    de: ['Gewonnen ist gewonnen', 'Zahlen und nicht meckern', 'Lehrgeld nennt man das', 'Das war es wert',
      'Raus mit dem Kleingeld', 'Gib zu, du hast weniger erwartet', 'Noch mal, und besser',
      'Gut, aber teuer',
      'Heul nicht, gib', 'Das war für die Geduld', 'Gutes Spiel, schlechte Karten für euch',
      'Damit ist mein Bier bezahlt', 'Noch zwei und ich gebe eine Runde', 'Warten hat sich gelohnt',
      'Das kam gelegen', 'Ohne Risiko kein Bier',
    ],
    fr: [
      'Gagné, c’est gagné', 'Paye et ne râle pas', 'Ça s’appelle une leçon',
      'Ça valait le prix', 'Sors la monnaie', 'Avoue que tu attendais moins',
      'Encore, et mieux', 'Bien joué, mais cher',
      'Arrête de pleurer et donne', 'Ça, c’est pour la patience', 'Belle partie, mauvaises cartes',
      'Voilà ma bière payée', 'Deux comme ça et je paye la tournée', 'Attendre a payé',
      'Ça tombe à pic', 'Qui ne risque rien ne boit rien',
    ],
  },
  handLost: {
    cs: ['Karta jak noha!', 'Vykašli se na mariáš, dej se na politiku', 'U Bucků zhasli', 'To byla bída',
      'S takovou kartou ani svatý', 'Kdo to rozdával?', 'Tohle si budu pamatovat', 'Příště mícháte vy',
      'Tohle si dáme ještě jednou', 'Zaplatím, ale nerad', 'Rozdával sám ďábel',
      'Máte štěstí, že nehrajeme o dům', 'Dneska mi to nelepí', 'Píšu si to za uši',
      'Za tohle chci odvetu', 'Ještě že je pivo levné',
    ],
    en: ['Rotten cards!', 'Give up cards, try politics', 'The lights went out on me', 'That was misery',
      'Not even a saint with these', 'Who dealt this?', "I'll remember this one", 'You shuffle next time',
      'We are doing this again', 'I pay, but not gladly', 'The devil dealt these',
      'Lucky we play only for coins', 'Nothing sticks today', 'I am noting that down',
      'I want a rematch for this', 'At least the beer is cheap',
    ],
    de: ['Karten wie Stroh!', 'Lass die Karten, geh in die Politik', 'Bei mir gingen die Lichter aus',
      'Das war elend', 'Damit schafft es kein Heiliger', 'Wer hat das gegeben?',
      'Das merke ich mir', 'Nächstes Mal mischt ihr',
      'Das machen wir noch mal', 'Ich zahle, aber ungern', 'Die hat der Teufel gegeben',
      'Gut, dass es nur um Münzen geht', 'Heute klebt mir nichts', 'Das schreibe ich mir auf',
      'Dafür will ich Revanche', 'Wenigstens ist das Bier billig',
    ],
    fr: [
      'Des cartes de bois !', 'Laisse les cartes, fais de la politique', 'Les lumières se sont éteintes',
      'C’était la misère', 'Même un saint n’y ferait rien', 'Qui a donné ça ?',
      'Je m’en souviendrai', 'La prochaine, c’est vous qui mêlez',
      'On remet ça, et vite', 'Je paye, mais à contrecœur', 'C’est le diable qui a donné',
      'Heureusement qu’on joue petit', 'Rien ne colle aujourd’hui', 'Je le note',
      'Je veux une revanche', 'Au moins la bière est bon marché',
    ],
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
      'Klidně, stejně to zkurvíš',
      'Dobrá, ať už je klid', 'Hraj a nekecej', 'Do prdele, beru', 'Jen si posluž, kamaráde',
      'Fajn, ale ať to za něco stojí', 'Souhlas, ty magore', 'Ať si to užiješ, sakra',
      'Dobrá, a plať, až prohraješ',
    ],
    en: ['Fine, dammit', "Just play, for fuck's sake", 'Fine, you smartass', 'Play already, damn it',
      'Hell, have it your way', "I'll take it, big shot", "Sure, don't shit yourself",
      "Go on, you'll screw it up anyway",
      'Fine, just shut up and play', 'Play, no talking', 'Hell, I take it', 'Help yourself, pal',
      'Fine, but make it worth a damn', 'Agreed, you lunatic', 'Enjoy it, dammit',
      'Fine, and pay when you lose',
    ],
    de: ['Gut, verdammt', 'Spiel endlich, verdammt', 'Gut, du Klugscheißer', 'Spiel schon, Herrgott',
      'Scheiße, mach wie du willst', 'Nehme ich, du Angeber', 'Klar, mach dir nicht ins Hemd',
      'Meinetwegen, du versaust es eh',
      'Gut, jetzt aber Ruhe', 'Spiel und quatsch nicht', 'Verdammt, ich nehme es',
      'Bedien dich, Kumpel', 'Gut, aber dann verdammt richtig', 'Einverstanden, du Irrer',
      'Viel Spaß damit, verdammt', 'Gut, und zahl, wenn du verlierst',
    ],
    fr: [
      'Bon, bordel', 'Joue, nom d’un chien', 'Ça va, monsieur je-sais-tout',
      'Joue donc, merde', 'Bon sang, fais comme tu veux', 'Je prends, gros malin',
      'Ouais, ne te chie pas dessus', 'Vas-y, tu vas tout foirer',
      'Bon, et maintenant silence', 'Joue et tais-toi', 'Merde, je prends', 'Sers-toi, mon vieux',
      'Bon, mais que ça vaille le coup', 'D’accord, espèce de fou', 'Profite, bordel',
      'Bon, et paye quand tu perdras',
    ],
  },
  pass: {
    cs: ['Ani hovno', 'Mám v ruce hovno', 'Držím hubu', 'Kašlu na to',
      'Do prdele s tím, nehraju', 'S tímhle můžu tak do háje', 'Ani náhodou, kurva',
      'Já do toho nejdu, sakra',
      'Mám tam sračku', 'Nasrat, nehraju', 'Ani za boha', 'Tohle by nevyhrál ani ďábel',
      'Do prdele, pas', 'Nechte mě s tím být', 'Za tohle bych se propadl', 'Já si dám radši panáka',
    ],
    en: ['Not a damn thing', 'I hold shit', 'Keeping my damn mouth shut', "I don't give a damn",
      'To hell with it', 'This hand is garbage', 'No damn way', "I'm not touching that",
      'I hold garbage', 'Screw it, not playing', 'Not for the life of me',
      'The devil could not win this', 'Damn it, pass', 'Leave me out of this',
      "I'd sink through the floor", "I'd rather have a shot",
    ],
    de: ['Einen Scheiß', 'Ich halte Mist', 'Ich halte die verdammte Klappe', 'Ist mir scheißegal',
      'Zum Teufel damit', 'Das Blatt ist Müll', 'Auf gar keinen Fall, verdammt',
      'Da fasse ich nichts an',
      'Ich halte Scheiße', 'Scheiß drauf, ich spiele nicht', 'Nicht ums Verrecken',
      'Das gewinnt nicht mal der Teufel', 'Verdammt, ich passe', 'Lasst mich damit in Ruhe',
      'Dafür würde ich im Boden versinken', 'Ich nehme lieber einen Schnaps',
    ],
    fr: [
      'Que dalle', 'J’ai de la merde en main', 'Je ferme ma gueule',
      'Je m’en fous', 'Au diable ce truc', 'Cette main est une poubelle',
      'Certainement pas, merde', 'J’y touche pas',
      'J’ai de la merde', 'Tant pis, je ne joue pas', 'Pour rien au monde', 'Même le diable perdrait',
      'Merde, je passe', 'Laissez-moi tranquille', 'J’en rentrerais sous terre',
      'Je préfère un petit verre',
    ],
  },
  fromPeople: {
    cs: ['Z lidu, kurva', 'Ať rozhodne ten zasranej balíček', 'Naslepo, co má bejt',
      'Do prdele, beru co dá', 'Naslepo a nasrat', 'Ať už to mám z krku',
      'Co přijde, to přijde, sakra', 'Klidně naslepo, stejně je to v hajzlu',
      'Naslepo, ať je sranda', 'Ať rozhodne ta kupa hnoje', 'Jdu do toho po hlavě, kurva',
      'Otočím a bude, co bude', 'Riskneme to, do háje', 'Stejně je to loterie',
      'Do prdele, ať je to venku', 'Beru naslepo a hotovo',
    ],
    en: ['From the deck, dammit', 'Let the damn pack decide', "Blind, so what", 'Hell, whatever comes',
      'Blind and screw it', "Let's get it over with", 'What comes, comes, damn it',
      "Blind then, it's all rubbish anyway",
      'Blind, for the fun of it', 'Let that pile of muck decide', 'Head first, dammit',
      'I turn it and what comes, comes', 'Let us risk it, hell', 'It is a lottery anyway',
      'Damn it, out with it', 'Blind, and done',
    ],
    de: ['Blind, verdammt', 'Der verdammte Stapel entscheidet', 'Blind, na und', 'Scheiß drauf, was kommt',
      'Blind und basta', 'Bringen wir es hinter uns', 'Was kommt, das kommt, verdammt',
      'Dann blind, ist eh alles Mist',
      'Blind, soll lustig werden', 'Der Misthaufen soll entscheiden', 'Kopf voran, verdammt',
      'Ich drehe um, kommt wie es kommt', 'Riskieren wir es, zum Teufel', 'Ist eh eine Lotterie',
      'Verdammt, raus damit', 'Blind und fertig',
    ],
    fr: [
      'À l’aveugle, bordel', 'Que ce fichu talon décide', 'À l’aveugle, et alors',
      'Merde, je prends ce qui vient', 'À l’aveugle et puis voilà', 'Qu’on en finisse',
      'Ce qui vient vient, bon sang', 'À l’aveugle, c’est foutu d’avance',
      'À l’aveugle, pour rigoler', 'Que ce tas de fumier décide', 'La tête la première, bordel',
      'Je retourne, advienne que pourra', 'Risquons le coup, zut', 'C’est une loterie de toute façon',
      'Merde, qu’on en finisse', 'À l’aveugle, et basta',
    ],
  },
  thinking: {
    cs: ['Momentíček, kurva', 'Nekoukej mi do karet, vole', 'Drž hubu, počítám',
      'Neser mě, přemýšlím', 'Dej mi pokoj, sakra', 'Počkej, do prdele', 'Nehoň mě',
      'Ještě chvilku, ksakru',
      'Zavři zobák, počítám', 'Krucifix, nech mě', 'Za chvilku, do prdele', 'Já nejsem počítač, sakra',
      'Ticho tam vzadu', 'Musím to promyslet, ksakru', 'Neblbni, hned to bude', 'Do hajzlu, kde to je',
    ],
    en: ['One damn moment', 'Stop peeking, you fool', 'Shut up, I am counting',
      "Don't bug me, I'm thinking", 'Give me a break, damn it', 'Wait, dammit', "Don't rush me",
      'Just a damn second',
      'Shut it, I am counting', 'Damn it, let me be', 'In a moment, dammit',
      'I am no computer, damn it', 'Quiet back there', 'I have to think this through',
      'Cut it out, almost there', 'Where the hell is it',
    ],
    de: ['Einen Moment, verdammt', 'Guck nicht rein, du Depp', 'Klappe, ich rechne',
      'Nerv mich nicht, ich denke', 'Lass mich in Ruhe, verdammt', 'Warte, verdammt',
      'Hetz mich nicht', 'Noch eine verdammte Sekunde',
      'Schnauze, ich rechne', 'Herrgott, lass mich', 'Gleich, verdammt',
      'Ich bin kein Computer, verdammt', 'Ruhe da hinten', 'Das muss ich durchdenken',
      'Blödsinn, gleich habe ich es', 'Wo zum Teufel ist es',
    ],
    fr: [
      'Un instant, bordel', 'Ne mate pas mes cartes, crétin', 'Ta gueule, je compte',
      'Me casse pas les pieds, je réfléchis', 'Fous-moi la paix', 'Attends, merde',
      'Ne me presse pas', 'Une foutue seconde',
      'Ferme-la, je compte', 'Bon Dieu, laisse-moi', 'Dans une minute, merde',
      'Je ne suis pas un ordinateur', 'Silence là-bas', 'Je dois y réfléchir, bon sang',
      'Arrête, j’y suis presque', 'Où diable est-ce',
    ],
  },
  trickWon: {
    cs: ['Ten je můj, vole', 'Sedma smrdí, co', 'A je to doma, kurva', 'Máš hovno',
      'Tak se to dělá, blbečku', 'Ten si strčte za klobouk', 'Poděkuj a plať',
      'Na mě jsi krátkej, kamaráde',
      'Sem s ním, sakra', 'Ten je můj, kurva drát', 'Máte to marný', 'Ještě jednou a je po vás',
      'Ten mi udělal radost, do prdele', 'Koukejte a učte se', 'Zase o něco blíž k prachům',
      'Plačte, chlapci',
    ],
    en: ['Mine, you fool', 'The seven reeks, huh', "That's in the damn bag", 'You get nothing',
      "That's how it's done, genius", 'Stick that in your pipe', 'Thank me and pay',
      "You're no match for me, pal",
      'Over here, dammit', 'Mine, damn right', 'You have no chance', 'One more and you are done',
      'That one felt good, damn it', 'Watch and learn', 'One step closer to your money', 'Weep, boys',
    ],
    de: ['Meiner, du Depp', 'Die Sieben stinkt, was', 'Und das sitzt, verdammt', 'Du kriegst nichts',
      'So macht man das, Genie', 'Steck dir den an den Hut', 'Bedank dich und zahl',
      'Gegen mich bist du nichts, Freundchen',
      'Her damit, verdammt', 'Meiner, und wie', 'Ihr habt keine Chance',
      'Noch einer und ihr seid durch', 'Der tat gut, verdammt', 'Schaut zu und lernt',
      'Wieder näher an eurem Geld', 'Heult ruhig, Jungs',
    ],
    fr: [
      'À moi, crétin', 'La sept pue, hein', 'Et c’est dans la poche, bordel',
      'Tu n’as rien', 'C’est comme ça qu’on fait, génie', 'Mets-toi ça où je pense',
      'Remercie et paye', 'Tu fais pas le poids, mon vieux',
      'Par ici, bordel', 'À moi, et comment', 'Vous n’avez aucune chance', 'Encore une et c’est fini',
      'Celle-là fait du bien, merde', 'Regardez et apprenez', 'Encore plus près de votre fric',
      'Pleurez, les gars',
    ],
  },
  handWon: {
    cs: ['Plať, ty držgrešle', 'Vyklop prachy', 'Co je doma, to se počítá, kurva',
      'Škola základ života, vole', 'To bylo za ty prachy', 'Tak znovu, ty lamo',
      'Naval drobný a nekňuč', 'Máš to za ty svoje chytrosti',
      'Prachy na stůl, kurva', 'Tak to má bejt', 'Nekňučte a plaťte', 'Za tohle si dám dvojitou',
      'Máte, co jste chtěli', 'Ještě jednou a jdu domů bohatej', 'To bylo za všechny ty řeči',
      'Plať, ty bídáku',
    ],
    en: ['Pay up, you cheapskate', 'Cough up the damn money', 'A win is a damn win',
      'Consider it a lesson, fool', 'Worth every damn crown', 'Again, you amateur',
      'Hand it over and stop whining', "That's for being a smartass",
      'Money on the table, dammit', 'That is how it should be', 'Stop whining and pay',
      'This calls for a double', 'You got what you asked for', 'One more and I go home rich',
      'That was for all the talk', 'Pay up, you wretch',
    ],
    de: ['Zahl, du Geizhals', 'Rück die verdammte Kohle raus', 'Gewonnen ist verdammt nochmal gewonnen',
      'Lehrgeld, du Depp', 'Das war jeden Cent wert', 'Noch mal, du Anfänger',
      'Her damit und hör auf zu jammern', 'Das hast du vom Klugscheißen',
      'Geld auf den Tisch, verdammt', 'So gehört sich das', 'Hört auf zu jammern und zahlt',
      'Darauf einen Doppelten', 'Ihr habt es so gewollt', 'Noch eins und ich gehe reich heim',
      'Das war für das viele Gerede', 'Zahl, du Elender',
    ],
    fr: [
      'Paye, radin', 'Sors ton fric', 'Gagné, c’est gagné, bordel',
      'Ça s’appelle une leçon, crétin', 'Ça valait chaque centime', 'Encore, amateur',
      'Donne et arrête de pleurnicher', 'Ça t’apprendra à faire le malin',
      'L’argent sur la table, bordel', 'Voilà comment il faut faire', 'Arrêtez de geindre et payez',
      'Ça mérite un double', 'Vous l’avez cherché', 'Encore une et je rentre riche',
      'Ça, c’est pour tout ce bavardage', 'Paye, misérable',
    ],
  },
  handLost: {
    cs: ['Do prdele s takovou kartou', 'Karta jak hovno', 'Kdo to, kurva, rozdával?',
      'Zasraná smůla', 'To je v prdeli', 'Takovou sračku jsem dlouho neměl',
      'Příště mícháte vy, sakra', 'Vykašli se na mariáš, dej se na politiku',
      'Do prdele práce', 'Takhle se hrát nedá, kurva', 'Zaplatím, ale s odporem', 'Kdo mi to nadělil?',
      'Ať to rozdávání trefí šlak', 'Krucinál, zase', 'Tohle byla čirá sračka',
      'Naval karty, chci odvetu',
    ],
    en: ['To hell with these cards', 'Cards like crap', 'Who the hell dealt this?',
      'Damn rotten luck', "It's all screwed", "Haven't held such garbage in years",
      'You shuffle next time, damn it', 'Give up cards, try politics',
      'Damn it all', 'You cannot play like this', 'I pay, with disgust', 'Who dealt me this?',
      'To hell with that deal', 'Blast it, again', 'That was pure garbage',
      'Give me the cards, I want revenge',
    ],
    de: ['Scheiß auf diese Karten', 'Karten wie Mist', 'Wer hat das verdammt nochmal gegeben?',
      'Verdammtes Pech', 'Alles im Eimer', 'So einen Mist hatte ich lange nicht',
      'Nächstes Mal mischt ihr, verdammt', 'Lass die Karten, geh in die Politik',
      'Verdammte Scheiße', 'So kann man nicht spielen', 'Ich zahle, mit Widerwillen',
      'Wer hat mir das gegeben?', 'Zum Teufel mit dieser Gabe', 'Verflixt, schon wieder',
      'Das war reiner Mist', 'Her mit den Karten, ich will Revanche',
    ],
    fr: [
      'Au diable ces cartes', 'Des cartes de merde', 'Qui a donné ça, bon sang ?',
      'Foutue malchance', 'Tout est foutu', 'Une merde pareille, ça faisait longtemps',
      'La prochaine c’est vous qui mêlez, merde', 'Laisse les cartes, fais de la politique',
      'Putain de sort', 'On ne peut pas jouer comme ça', 'Je paye, à contrecœur', 'Qui m’a donné ça ?',
      'Au diable cette donne', 'Zut, encore', 'C’était de la pure merde',
      'Redonne, je veux ma revanche',
    ],
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
