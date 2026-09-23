# FLEK! / RE! — online mariáš

**Design dokument** · verze k revizi · 2026-08-21

Moderní webová pocta hrám **FLEK! v1.12** (1991–92) a **RE!** (1993) od Ing. Jaroslava Pivoňky
(Pivoňka Software). Cíl: **`flek.saiko.cz`** (vlastní subdoména), stejný model jako tribute projekty
[mars](../../www.saiko.cz.mars/) a [tsp](../../tsp/).

---

## 1. Zadání a rozhodnutí

| Otázka | Rozhodnutí |
|---|---|
| Rozsah | **Obě varianty od začátku** — volený mariáš (FLEK!) i licitovaný (RE!), přepínatelné |
| Vizuál | **Moderní vzhled** — DOM/SVG karty, animace, myš/dotyk, fullscreen režim |
| AI | **Heuristika + ISMCTS** ve Web Workeru, hraje fér (vidí jen svůj pohled na hru) |
| Stack | **Astro + TypeScript** podle vzoru mars — stránka s příběhem, bilingvální CZ/EN |
| Multiplayer | **V1 single-player** (člověk + 2 AI); architektura ale multiplayer-ready od začátku, síťová vrstva se přidá později bez přepisování |

Charakter: *stránka s příběhem* (věnování otci, historie Pivoňka Software), uvnitř které běží
plnohodnotná hra přepnutelná do fullscreen.

## 2. Rozbor originálu

Co víme z binárek v `original/` a dobových zdrojů:

- **FLEK! v1.12**, (c) 1991,1992 J. Pivoňka — Turbo Pascal + Borland BGI, EGA/VGA 640×480;
  texty uložené v komprimovaném RSC bloku (slovníková komprese českých slabik)
- **RE!** (1993) = licitovaný mariáš, nadmnožina FLEK!; pracovní soubor `RE!.$$$`;
  parametry příkazové řádky: `S` (bez zvuku), `L` (inverzní karty pro laptopy), `Q` (zrychlená hra)
- Menu **F10** → nastavení: *Zvuky, Barva, Vzor, Menu, Standard, IQ* (síla AI) — ukládá se do
  `FLEK!.CFG` (6 bajtů)
- Distribuce na 3,5" disketách, registrace 295–333 Kč, kontakt: pražské číslo 860269
- Dobově „nejlepší dostupný mariášový software"; AI ale údajně „koukala do karet" —
  **naše AI hraje fér** (vynuceno architekturou, viz §5.4)
- Hratelná reference: [retrogames.cz — Flek! online](https://www.retrogames.cz/play_448-DOS.php?language=CZ)
  (js-dos); během implementace navíc DOSBox lokálně → poznámky do `docs/original-notes.md`

## 3. Pravidla

### 3.1 Autoritativní zdroj

`docs/pravidla/` obsahuje **oficiální pravidla Českého svazu mariáše** (5 PDF):

| Soubor | Obsah |
|---|---|
| `Obecná_pravidla_mariáše.pdf` | společný základ |
| `mariáš_pravidla_volený.pdf` | volený mariáš |
| `mariáš_pravidla_licitovaný_2014.pdf` | licitovaný mariáš (2014) |
| `mariáš_pravidla_křížový_volený.pdf` | křížový volený (mistrovská pravidla, od 8. 5. 2007) |
| `mariáš_pravidla_křížový_licitovaný.pdf` | křížový licitovaný |

**Engine se implementuje podle nich** — originál FLEK!/RE! slouží pro flow UI a výchozí presety.

⚠️ **Licence PDF**: jde o dílo ČSM — **neredistribuujeme** (složka `docs/pravidla/` je
v `.gitignore`, jen lokální reference; PDF se nekopírují ani do `public/`). Web i dokumentace
budou **odkazovat na originální dokumenty u zdroje** (ČSM / marias.cstv.cz). Pravidla na stránce
a EN verze (`docs/rules/`) sepíšeme **vlastními slovy** (samotná pravidla hry copyright nemají,
jen jejich konkrétní text). Totéž platí pro originální binárky FLEK!/RE! — v repu nejsou
(copyright J. Pivoňka), odkazujeme na retrogames.cz.

Sazebník **dvacetihaléřového bodovaného voleného** (ČSM, platný od 8. 5. 2007; násobky základní
sazby): **hra 1×, sedma 2×, sto 4×, betl 15×, durch 30×, červené dvojnásob**; tichá sedma =
polovina hlášené; tiché sto zvyšuje hodnotu vyflekované hry 2× (neplatí při hlášených hrách sto,
sto a sedm). Renonc paušál 1 = 10×, paušál 2 = 50×, limit 500×/750×.

> **Pozor na záměnu:** sazebník **betl 10× / durch 20×** patří **křížovému** mariáši (4 hráči,
> desetihaléřový, ČSM 2007), který nehrajeme. Obě naše varianty — volený i licitovaný — mají
> shodně betl 15× a durch 30× (licitovaný to má v tabulce jako 3,00 / 6,00 Kč při základu 0,20).
> Dřívější formulace v tomto dokumentu tvrdila opak a svedla i jedno review (§18, i7).

### Křížový mariáš — vědomě NEhrajeme (rozhodnuto 2026-09-14)

ČSM má i pravidla **křížového** mariáše (volený i licitovaný). Není to varianta pravidel, ale
jiná stavba hry: **4 hráči**, rozdává se 2× po čtyřech (8 karet na hráče) a **talon vůbec
není**; volící hráč odloží jednu kartu lícem dolů a **oznámí výšku karty, se kterou chce hrát**
— tím si volá spoluhráče, aniž ví, kdo to je (může zavolat i sám sebe). Volba „z lidu" je
zakázaná, hraje se 2 na 2 a platí se po dvojicích, betl se po prvním štychu dohrává
z otevřených karet a durch smí být jen „sám", ne „s chytrým".

Proč ne:
1. **Není to FLEK!** — Pivoňkovy hry jsou tři hráči (FLEK! volený, RE! licitovaný). Křížový do
   tributu nepatří.
2. **Není to přepínač, ale přestavba enginu.** Tři hráči nejsou parametr, jsou to typy:
   `Seat = 0 | 1 | 2`, ruce `[Card[], Card[], Card[]]`, konto a výplaty `[number, number, number]`,
   rotace `% 3` — 31 míst v typech a 12 rotací v 11 souborech (engine, scoring, AI, persistence,
   UI). K tomu partnerství, které AI dnes neumí: musela by odvozovat zavolaného spoluhráče
   z průběhu hry, což je nová vrstva v ISMCTS.

Kdyby se někdy chtěla další hra, přirozenější krok je závazek **dvě sedmy** v licitovaném
(už je v typech i v žebříčku, chybí jen scoring) — jedna hra navíc v existující variantě,
ne nová architektura.

### 3.2 Společné jádro

- 32 karet, německé barvy: **červené, zelené, kule, žaludy**; hodnoty 7, 8, 9, 10, spodek, svršek, král, eso
- 3 aktivní hráči, 10 štychů; **aktér vs. dvojice obránců**
- Barevné hry — pořadí: **eso > desítka > král > svršek > spodek > 9 > 8 > 7**
- Body: každé eso 10, každá desítka 10, poslední štych 10 (celkem 90) + **hlášky**
  (král + svršek téže barvy) 20, v trumfech 40
- Povinnosti: ctít barvu **a přebít**, je-li to možné; bez barvy povinný trumf; jinak libovolná karta
- **Betl** (neudělat žádný štych) a **durch** (udělat všechny): přirozené pořadí
  **eso > král > svršek > spodek > 10 > 9 > 8 > 7**, bez trumfů, bez bodů; povinnost přebíjet platí
- Rozdávání: forhont 7 + 5, ostatní 2×5; aktér odhodí 2 karty do **talonu** (nesmí esa a desítky)
- **Flekování**: dobrá → flek (×2) → re (×4) → tutti (×8) → boty (×16) → kalhoty (×32) → kajzr (×64);
  fleky se dávají **zvlášť na hru, sedmu a kilo**
- **Sedma**: závazek vzít poslední štych trumfovou sedmou; hlášená sedma smí z ruky
  až v posledním štychu (dřív jen z donucení — pak je prohraná)
- **Kilo (sto)**, dle Obecných pravidel ČSM čl. IV.4 + V.5: do hranice 100 se počítá
  **jen jedna hláška** (splněno = 60 bodů s trumfovou hláškou / 80 s jinou; bez hlášky nelze);
  uhrané: sazba za každých 10 bodů od 100 výš (vč. dalších hlášek); prohrané: sazba za každých
  10 chybějících + za hlášky obrany. Oficiálně lineárně; hospodská varianta zdvojnásobuje
  (config `kiloScaling`). **Tiché** varianty za poloviční sazbu
- **Talon**: zákaz es a desítek platí jen u trumfových her — u betla/durcha odhodit smíš
- **Výnos do prvního štychu**: forhont; u betla/durcha **aktér**
- Červený trumf zdvojnásobuje sazby; peněžní konto hráčů napříč hrami; rozdávající rotuje

### 3.3 Volený mariáš (FLEK!)

Forhont volí trumf z prvních 7 karet (nebo „z lidu" naslepo z dalších), vezme zbytek + talon,
odhodí 2, ohlásí hru (hra / sedma / kilo / betl / durch). Soupeři řeknou „dobrá", nebo hru
přeberou **pouze betlem/durchem** (durch přebíjí betl; při shodném nároku drží hráč dřívější
v pořadí mluvení). Pak flekování a sehrávka.

### 3.4 Licitovaný mariáš (RE!)

O právo hrát se **licituje** — hráči přihazují vyšší závazky na žebříčku
(hra < sedma < kilo < kilo+sedma < betl < durch; červené varianty výš), forhont drží shodu.
Vítěz licitace bere talon, odhodí, potvrdí závazek; pak flekování a sehrávka.

## 4. Architektura — přehled

Tři čistě oddělené vrstvy, konvence z mars/tsp:

```
┌─────────────────────────────────────────────────────┐
│  UI (src/scripts/main.ts + DOM/SVG)                  │
│  stůl, karty, animace, dialogy, fullscreen           │
└──────────────┬───────────────────────┬───────────────┘
               │ PlayerAction          │ view(state, seat)
┌──────────────▼───────────────────────▼───────────────┐
│  ENGINE (src/lib/rules/) — čistý, bez DOM            │
│  apply(state, action) → state    legalActions(...)   │
└──────────────┬───────────────────────────────────────┘
               │ PlayerView (nikdy celý GameState!)
┌──────────────▼───────────────────────────────────────┐
│  AI WORKER (src/worker/) — bezstavový                │
│  heuristiky + determinizace + ISMCTS                 │
└──────────────────────────────────────────────────────┘
```

Multiplayer-ready principy:
- engine = **čistý reducer** `(stav, akce) → stav`, deterministický, bez vedlejších efektů;
  **i rozdání je akce** (`deal` se seedem) — v enginu není žádná nesledovaná náhoda
- hráči komunikují **jen serializovatelnými akcemi** (plain JSON)
- skryté informace řeší **projekce pohledu** `view(state, seat)` — přesně to, co by později
  posílal server vzdálenému klientovi
- replay **celého zápasu** = `history.reduce(apply, initialState)` — historie obsahuje
  i `deal` akce se seedy, takže je rekonstruovatelné vše od první hry
- orchestrace zápasu (smyčka tahů, plánování AI, autosave) žije v **`src/lib/match/`** —
  čistá vrstva bez DOM; `main.ts` ji jen napojuje na UI. Budoucí server použije tutéž vrstvu.

## 5. Detailní návrh

### 5.1 Datový model (`src/lib/cards.ts`, `src/lib/rules/types.ts`)

```ts
type Suit = 0 | 1 | 2 | 3;                 // červený, zelený, kule, žaludy
type Rank = 0 | ... | 7;                   // 7,8,9,10,spodek,svršek,král,eso
type Card = number;                        // 0..31 = suit*8 + rank
```

- Dvě explicitní pořadové tabulky: `TRUMP_ORDER` (barevné hry) a `NATURAL_ORDER` (betl/durch) —
  komparátor bere `GameMode`; **nikdy jedna tabulka pro obojí** (past: desítka v betlu)
- `pointsOf(card)`: 10 pro eso/desítku, jinak 0
- Ruce jako setříděné `Card[]` (JSON-friendly); AI interně bitové masky pro rychlost
- České názvy karet jen v UI vrstvě (`cardNames.ts`), ne v enginu

```ts
type Variant  = 'voleny' | 'licitovany';
type GameMode = 'hra' | 'betl' | 'durch';
type Seat = 0 | 1 | 2;

interface Contract {
  mode: GameMode;
  trump: Suit | null;
  declarer: Seat;
  sedma: Seat | null;    // kdo hlásil sedmu — aktér, NEBO obránce (sedma proti)
  kilo: Seat | null;     // kdo hlásil kilo — aktér, NEBO obránce (sto proti)
}

type FlekTarget = 'hra' | 'sedma' | 'kilo' | 'betl' | 'durch';

interface FlekState {
  levels: Partial<Record<FlekTarget, number>>;      // 0=nic, 1=flek, 2=re... multiplikátor = 2^level
  lastRaiser: Partial<Record<FlekTarget, Seat>>;    // zvyšovat smí jen druhá strana
  toAct: Seat;                                      // kdo mluví
  passed: Seat[];                                   // kdo od posledního zvýšení řekl „dobrá"
}
// Sémantika: `flek{target}` zvyšuje jednu komponentu (a maže `passed`); `good` = pas na
// VŠECHNY aktuálně otevřené komponenty. Fáze končí, když všechna oprávněná sedadla
// pasovala od posledního zvýšení. Oprávnění: na komponentu smí zvyšovat jen strana,
// která na ní nezvyšovala naposled (obránci fleky, aktér re, ...).
```

**GameState** — vše plain JSON (žádné třídy, Map, funkce) → bezpečné přes worker i budoucí síť:

```ts
interface GameState {
  variant: Variant;
  config: RulesConfig;               // sazby + house-rule přepínače (§5.3); IMMUTABLE —
                                     // změna nastavení se projeví až příští `deal` akcí
  dealer: Seat;
  seed: number;                      // seed aktuálního rozdání (z poslední `deal` akce)
  hands: [Card[], Card[], Card[]];   // autoritativní; skrývá se přes view()
  talon: Card[];                     // aktuální 2 skryté karty (po odhozu)
  talonKnowledge: [Card[], Card[], Card[]]; // které karty talonu/odhozu KTERÉ sedadlo vidělo
                                     // (aktér svůj odhoz; při převzetí talonu dle configu)
  history: PlayerAction[];           // úplný log akcí vč. `deal` (replay celého zápasu)
  handResults: HandResult[];         // archiv odehraných her (statistika, zúčtovací přehled)
  ledger: [number, number, number];  // konto, zero-sum; odvozené z handResults, drženo pro rychlost
  handNo: number;
  contract: Contract | null;         // finální kontrakt; během aukce je autoritativní phase.standing
  phase: Phase;                      // discriminated union ↓
}

// částečný kontrakt během aukce (než padne finální declare)
interface Standing { declarer: Seat; mode: GameMode | null; trump: Suit | null; }

type Phase =
  | { name: 'choose-trump' }                                    // jen volený
  | { name: 'bidding'; bids: Bid[]; toAct: Seat; best: BidLevel | null }  // jen licitovaný
  | { name: 'discard-talon'; standing: Standing }               // trumf/mód známý ⇒ validace odhozu
  | { name: 'declare'; standing: Standing }
  | { name: 'takeover'; toAct: Seat; standing: Standing }       // jen volený
  | { name: 'fleks'; fleks: FlekState }
  | { name: 'tricks'; trickNo: number; leader: Seat; toAct: Seat;
      trick: { seat: Seat; card: Card }[];
      won: [Card[], Card[], Card[]];
      marriages: { seat: Seat; suit: Suit }[] }
  | { name: 'scored'; result: HandResult };
```

**PlayerAction** union (vč. systémové akce `deal` — reducer tak pokrývá celý zápas):

```ts
type PlayerAction =
  | { type: 'deal'; seed: number; config?: RulesConfig }              // systémová; nové rozdání
  | { type: 'choose-trump'; seat: Seat; card: Card | 'from-people' }  // z ruky / z lidu
  | { type: 'bid'; seat: Seat; bid: BidLevel | 'pass' }               // licitovaný
  | { type: 'discard'; seat: Seat; cards: [Card, Card] }
  | { type: 'declare'; seat: Seat; mode: GameMode; sedma: boolean; kilo: boolean }
  | { type: 'takeover'; seat: Seat; claim: 'betl' | 'durch' | 'good' }
  | { type: 'flek'; seat: Seat; target: FlekTarget }                  // vč. sedma/kilo proti dle oprávnění
  | { type: 'good'; seat: Seat }
  | { type: 'play'; seat: Seat; card: Card; announceMarriage: boolean }
  | { type: 'ack-score'; seat: Seat };
```

„Z lidu" je **deterministické**: karta = první karta forhontova druhého (neprohlédnutého)
balíčku, který je dán seedem rozdání — reducer zůstává čistý, žádná dodatečná náhoda;
otočená karta se objeví ve veřejné historii (reveal pro všechny).

Hláška je **explicitní flag na akci play** (hlásí se při zahrání K/svrška s partnerskou kartou
stále v ruce) — engine validuje nárok, ale nehlásí automaticky: je to rozhodnutí hráče
(taktika u kila) a je to multiplayer-poctivé.

**Projekce pohledu** (`rules/view.ts`):

```ts
interface PlayerView {
  seat: Seat;
  hand: Card[];
  handCounts: [number, number, number];
  talonKnown: Card[];               // = state.talonKnowledge[seat] — co JÁ vím o talonu/odhozu
                                    // (vlastní odhoz vč. převzatého talonu dle configu)
  contract; phase; ledger; dealer; config; handResults; ...
  publicHistory: PublicAction[];    // historie s redigovanými skrytými payloady
}
function view(state: GameState, seat: Seat): PlayerView;

// PublicAction = tentýž union jako PlayerAction, se skrytými payloady nahrazenými:
//   deal          → { type: 'deal' }                          (seed se neprozrazuje)
//   discard       → { type: 'discard'; seat }                 (karty ne)
//   choose-trump  → karta veřejná (z ruky ukázaná / z lidu otočená)
//   ostatní akce jsou veřejné beze změny
type PublicAction = ...;            // definováno v types.ts vedle PlayerAction
```

Redakce: cizí ruce → jen počty; talon jen dle `talonKnowledge[seat]` (při převzetí betlem/durchem
vidí původní i nový aktér přesně to, co fyzicky viděli — řídí `config.talonOnTakeover`).
**AI worker dostává výhradně `PlayerView`, nikdy `GameState`** — fér hra je vynucená typem.
**`legalActions` je definováno nad `PlayerView`** (viz §5.3), takže AI používá tentýž zdroj
pravdy jako engine a nemusí si žádný stav dopočítávat.

### 5.2 Stavový stroj

Sdílená páteř, dvě aukční hlavy:

```
                 rozdání (deterministické ze seedovaného míchání)
                     │
     ┌── volený ─────┴───── licitovaný ──┐
     ▼                                   ▼
choose-trump (forhont, z prvních 7)   bidding (forhont otevírá ≥ hra;
     │  forhont bere 5 + talon         ostatní přihazují po žebříčku,
     ▼                                 forhont drží shodu; vítěz = aktér)
discard-talon (forhont)                    │  vítěz bere talon
     ▼                                     ▼
declare (hra/sedma/kilo/betl/durch)    discard-talon (aktér)
     │                                     ▼
     ▼                                 declare (potvrzení vylicitovaného)
takeover (soupeři po řadě:                 │
 'good' | betl | durch; vyšší nárok        │
 přebírá aktérství; talon dle              │
 config.talonOnTakeover)                   │
     └──────────────┬──────────────────────┘
                    ▼
             fleks (kola dobrá/flek per komponenta, střídání stran,
              dokud obě neřeknou dobrá; žebříček dle config.maxFlekLevel)
                    ▼
             tricks ×10 (identické pro obě varianty; mode určuje
              pořadí karet a trumfy; hlášky jen v mode='hra')
                    ▼
             scored (scoring.ts → HandResult → ledger)
                    ▼
             další rozdání: dealer = (dealer+1) % 3
```

Divergence variant je omezená na moduly `auction-voleny.ts` a `auction-licitovany.ts`;
zbytek fází je sdílený kód parametrizovaný `variant`/`config`.

**Rozdání (kanonicky, provádí `apply` na akci `deal`)**: seedované míchání → forhont 7 karet,
ostatní 2× po 5, forhont dalších 5 (celkem 12, z prvních 7 volí trumf), ostatní zbylé karty
do 10 — aktér po zvednutí drží 12 a **2 odhazuje do talonu**, všichni pak mají 10.
Pořadí balíčků je fixní konstanta (stabilní replay).

### 5.3 Pravidla a scoring (`src/lib/rules/`)

- **`legalActions(view: PlayerView)` = jediný zdroj pravdy legality.** Definováno nad
  POHLEDEM, ne nad GameState — legalita vlastních akcí závisí jen na veřejném stavu + vlastní
  ruce, takže tutéž funkci volá UI (aktivní tlačítka), AI ve workeru (akční prostor) i engine:
  `apply(state, action)` validuje členstvím v `legalActions(view(state, action.seat))`,
  nikdy nederivuje pravidla podruhé → nikdo se nemůže rozejít. (Systémová akce `deal` je
  legální jen ve fázi `scored` / na startu zápasu.)
- Legalita ve štychu (`tricks.ts`): (1) urči aktuálně vítěznou kartu; (2) máš-li barvu výnosu,
  musíš ji ctít a přebít vítěznou kartu, pokud přebít lze a máš čím (po přebití trumfem už
  barvu jen ctíš); (3) bez barvy povinný trumf, vítězí-li trumf, povinnost přetrumfnout;
  (4) bez obojího cokoliv. Betl/durch: bod 2 s přirozeným pořadím, bez bodu 3.
- **Invarianty v `apply`** (levné, vždy zapnuté): konzervace všech 32 karet; velikosti rukou
  dle fáze; talon = 2 karty bez es/desítek; flek zvyšuje jen strana, která nezvyšovala naposled;
  hláška jen s partnerskou kartou v ruce; ledger zero-sum a rovný sumě `handResults`.
- **Chování při selhání invariantu**: ve verify/dev → throw (fail fast). V produkci →
  `console.error` s replay historií (serializovaná do zprávy, ať ji hráč může nahlásit),
  dialog s omluvou a nabídkou „rozdat znovu" (stav je nedůvěryhodný; konto se zachová
  z posledního validního `handResults`).

**Scoring** (`scoring.ts` + `sazby.ts`):

```ts
interface Sazby {
  // všechna pole jsou number — uvedené hodnoty jsou DEFAULTY presetu ČSM, ne literální typy
  hra: number;        // 1
  sedma: number;      // 2
  tichaSedma: number; // 1
  kilo: number;       // 4
  ticheKilo: number;  // 2
  betl: number;       // 10
  durch: number;      // 20
  kiloScaling: 'double' | 'linear';   // za každých 10 bodů nad/pod 100
  cervenyMultiplier: number;          // 2; jen barevné hry (hra/sedma/kilo)
  maxFlekLevel: number;               // 5 = kalhoty, 6 = kajzr
  talonForbidsTrump: boolean;         // house rules — defaulty dle originálu/ČSM
  talonOnTakeover: 'retake' | 'keep';
}
// sazby.ts exportuje pojmenované presety: SAZBY_CSM (výchozí), SAZBY_FLEK (podle originálu,
// doladí se empiricky ve fázi 4); RulesConfig = { sazby: Sazby } + případné další přepínače
```

- `scoreTricks(state)` → body stran (esa + desítky + poslední štych) + hlášky + flagy
  (výsledek sedmy: uhraná / zabitá / tichá / sedma proti)
- `settle(state)` → `HandResult` s **rozpadem po komponentách** — hra, sedma, kilo se vyhrávají/
  prohrávají nezávisle, každá se svým flekovým multiplikátorem `2^level`; kilo škáluje po 10
  bodech symetricky nad/pod 100; betl/durch bez červeného násobku (nemají trumf); `delta`
  per hráč se sumou 0 (aktér platí/inkasuje od obou obránců). Rozpad je podklad pro zúčtovací
  obrazovku.

### 5.4 AI (`src/lib/ai/`, `src/worker/`)

**Dělba rolí:**
- **Heuristiky** (`heuristics.ts`) na všechna „aukční" rozhodnutí: volba trumfu, licitace, talon,
  závazky, takeover, fleky. Hodnocení ruky: délka trumfů, esa/desítky, inventář hlášek,
  bezpečnost sedmy (trumfová 7 + délka + doprovody), analýza děr pro betl/durch (pokrytí
  nejnižších karet v přirozeném pořadí), očekávané body ± talon. Prahy v laditelné tabulce →
  obtížnosti (pocta „IQ" z originálu).
- **ISMCTS** (`ismcts.ts`) jen pro `play` akce — malé větvení (≤10), skrytá informace, tam
  Monte Carlo září.

**Determinizace** (`determinize.ts`) — vzorkování skrytých rukou konzistentní s pozorováním
z `publicHistory`:
- `voids[seat][suit]` — nepřiznal barvu ⇒ nemá ji
- `noHigherThan[seat][suit]` — nepřebil, ač přebít musel ⇒ nemá vyšší
- `noTrump[seat]` — netrumfnul, ač musel
- hláška ⇒ držel partnerskou kartu (sledovat spotřebu)
- talon: aktér ho zná přesně (`talonKnown`); ostatní ho vzorkují z neviděných karet s omezením
  bez es/desítek — reálná informační asymetrie
- **derivace omezení nesmí duplikovat pravidla**: přebíjecí povinnosti počítá přes sdílené
  helpery exportované z `rules/tricks.ts` (vítězná karta štychu, „čím lze přebít") —
  legalita štychu žije v enginu jednou
- **vzorkování s garantovaným ukončením**: rejection sampling (≤50 pokusů) → greedy
  most-constrained-first → pokud ani to (teoreticky) neuspěje, postupně uvolňuj nejslabší
  odvozená omezení (`noHigherThan` → `noTrump` → `voids`) a zaloguj; konzervace karet drží
  vždy z konstrukce (rozdává se z poolu neviděných karet)

**Vyhledávání:** single-tree ISMCTS — každá iterace: nová determinizace u kořene → sestup UCB1
omezený na akce legální v této determinizaci → expanze → playout levnou politikou → back-propagace
**finanční delty v jednotkách** (ne jen výhra/prohra — search tak přirozeně respektuje sazby,
fleky, sedmu i kilo). Budget ~1500 ms dle obtížnosti, práce po chuncích ~200 iterací s kontrolou
času a `cancel`. Seedovaný PRNG → reprodukovatelné pro testy.

**Worker protokol** (`worker/messages.ts`, typované discriminated uniony jako v tsp):

```ts
type ToWorker =
  | { type: 'think'; requestId: number; view: PlayerView; budgetMs: number;
      difficulty: 'easy' | 'normal' | 'hard'; seed: number }   // vše per-request, žádný configure
  | { type: 'cancel'; requestId: number };

type FromWorker =
  | { type: 'progress'; requestId: number; stats: ThinkStats }
  | { type: 'move'; requestId: number; action: PlayerAction; stats: ThinkStats }
  | { type: 'error'; requestId: number; message: string };
```

Worker je **skutečně bezstavový** — každý `think` nese vše (view, budget, obtížnost i seed),
mezi requesty se nic nedrží → triviálně korektní, restartovatelný, reprodukovatelný (seed
per tah je odvozený od seedu rozdání + čísla tahu), identický s budoucím server-side AI
procesem. Jeden worker pro obě AI (myslí sekvenčně).

**Odolnost proti selhání workeru** (match controller, §4):
- **watchdog**: neodpoví-li worker do `budgetMs + 2 s`, `terminate()` → nový worker → retry 1×
- **fallback**: selže-li i retry (nebo Worker API chybí), tah spočítá heuristika na hlavním
  vlákně — `lib/ai/heuristics.ts` je čistá knihovna, jde importovat přímo; hra se nikdy nezasekne
- **opožděný tah**: přijatý `move` s `requestId` ≠ aktuálně čekaný se zahodí (po `cancel`,
  po restartu workeru, po novém rozdání); `apply` navíc každý tah validuje, takže zastaralý
  tah nemůže poškodit stav

### 5.5 UI (`src/scripts/main.ts`, `src/lib/ui/`)

- **DOM/SVG karty** (ne canvas): přirozený hit-testing, CSS animace (rozdávání, výnos, sebrání
  štychu, fleky), ostré škálování na HiDPI
- **Dva vzory karet** (pocta volbě „Vzor" z originálu), přepínatelné v nastavení — ✅ HOTOVO:
  - **Historický vzor** — jednohlavý pražský vzor z r. 1860 (Ant. Kratochvíl, Praha), public domain,
    staženo z Wikimedia Commons ([Category:Jednohlave](https://commons.wikimedia.org/wiki/Category:Jednohlave))
    do `cards/history/` (32 PNG + README s licencí); pro web se vygenerují ořezané/optimalizované verze
  - **Moderní vzor** — vlastní SVG sada, MIT, generovaná `scripts/gen-cards.ts` → `cards/modern/`.
    Finální design (schválen uživatelem po 3 iteracích): tradiční mariášový formát **62×106 mm**
    (viewBox 240×410), jednohlavé, rohové indexy jen písmena/čísla `7 8 9 10 S V K A` (bez mini
    symbolů), velké pipy (0.74) a eso jako čistý velký symbol (2.8, bez medailonu), figury jako
    symbolické flat siluety v tónovaném panelu (bez popisků, FIGURE_SCALE 1.12): spodek = prostá
    silueta + symbol POD postavou, svršek = klobouk + symbol NAD postavou (tradiční kód
    Unter/Ober), král = koruna + větší hlava + symbol na hrudi; rub = zelené šrafování
  - **Anglická varianta** `cards/modern-en/` (`gen-cards.ts en`) — identický design, indexy
    `7 8 9 10 J Q K A` (spodek/Unter→J, svršek/Ober→Q); hra volí složku podle jazyka stránky,
    názvy souborů shodné (`<RANK><SUIT>.svg`, RANK: 7 8 9 T U O K D, SUIT: A B H L)
  - ⚠️ **V aplikaci zobrazit informace o licenci a původu karet** (historický vzor: PD, zdroj
    Commons/Gallica, tiskař Kratochvíl 1860; moderní: MIT) — např. v patičce/dialogu „O hře"
  - **Asset pipeline** (rozhodnuto): moderní sada = **SVG přímo** (vektor, ~5 kB/karta, ostré
    v každém zoomu — nerastrovat); historická sada = originální PNG skeny zůstávají v gitu
    v plné velikosti (~100 MB, zdrojová data), pro web je skript `scripts/prep-history-cards.ts`
    (sharp, implementace ve fázi UI) ořízne od pozadí skeneru, sjednotí velikost, zaoblí rohy
    a zkomprimuje do **WebP** (~50 kB/karta) do `public/cards/history/`. Historická sada nemá
    rub — vygenerovat dobově laděný, nebo sdílet rub moderní sady. Poměry stran se liší
    (historická ~0.63, moderní 62/106 ≈ 0.585) — řeší CSS per sada, engine se o vzhled nestará.
- **Překreslení recykluje DOM**: `setSrc()` přiřadí `src` jen při skutečné změně a
  `syncChildren()` dorovná počet elementů. Ruka i pakly se dřív přestavovaly při každém
  renderu a Chrome nově vytvořený `<img>` vykresluje prázdný, dokud ho nedekóduje — celé
  plátno probliklo. (Safari dekódovaný obrázek recykluje, proto tam nebylo nic vidět;
  ověřeno počítadlem: za celou hru vznikne 7 nových `<img>` místo stovek.)
- **Co kdo hraje patří k hráči**, ne doprostřed stolu: badge závazku (a fleků) sedí u sedadla
  aktéra, takže se v něm nemusí uvádět jméno. Místo je vyhrazené i prázdné, aby se karty
  soupeře nepohnuly, až badge naskočí.
- Stůl: vlastní ruka dole vějířem, protihráči rubem vlevo/vpravo nahoře, střed = štych,
  kontextový panel akcí (volba trumfu, licitace, fleky, hláška), zúčtovací obrazovka s rozpadem
  po komponentách, konto hráčů (persistence viz §5.9)
- **Fullscreen** (Fullscreen API); na iOS Safari (kde Fullscreen API pro ne-video prvky není)
  fallback „maximalizovaný" CSS režim přes celý viewport; responzivní vč. mobilu
- **Přístupnost**: kompletní ovládání klávesnicí (šipky + Enter — pocta ovládání DOS
  originálu!), viditelný fokus, `prefers-reduced-motion` → animace karet se vypnou/zkrátí
- **Mince / bank** (nápad uživatele): konto hráčů zobrazené graficky jako hromádky mincí
  u sedadel, platby po zúčtování animované přesunem mincí, případný bank uprostřed stolu.
  Vlastní SVG sada mincí (éra 90. let — desetihaléře/koruny, pocta době FLEK!), generovaná
  skriptem `scripts/gen-coins.ts` po vzoru karet; MIT. Implementace ve fázi UI.
- Nastavení: varianta volený/licitovaný, obtížnost AI, rychlost animací, zvuky (jemné, volitelné)
- Stránka podle mars vzoru: `Layout.astro` (lang-pill CZ/EN, meta, GoatCounter), nahoře hrací
  stůl, pod ním obsahové sekce (viz §5.6)

### 5.5.1 Úvodní obrazovka (podle mockupu z Claude Design)

Mockup `Marias.dc.html` (projekt 787ace27) má dva artboardy: **1a Úvod** (výběr varianty
+ rozdání) a **1b Stůl** (herní stůl s nastavením v rámu). Společné prvky: tmavý rám kolem
sukna se zlatým lemem `inset 0 0 0 2px rgba(225,182,0,.35)`, akcentní zlatá `#e1b600`,
krémová karta `#f3ead6`, zelený rub `#2d6b46`, lišta nastavení **uvnitř rámu** pod suknem
(tmavé „chipy" místo systémových selectů, zvuky jako přepínač), avataři hráčů s kolečkem,
stav hry jako pilulka uprostřed nahoře.

Zapracováno (v tomto pořadí):

1. **Rám, sukno, poměr stran** — deska 1400×900 (`aspect-ratio: 1400/900`), tmavý rám
   `#1c2127` s poloměrem 28, sukno se zlatým lemem a radiálním přechodem
   `#2c6a9e → #1d4f7c → #173f64`. Sukno **ořezává**: deska má pevnou výšku, takže ruka
   visí přes spodní hranu (v mockupu `bottom:-40px`) místo aby vytlačila lištu.
2. **Lišta nastavení uvnitř rámu** — původně chipy pro všechna nastavení, po hraní
   zredukováno: v liště zůstaly **vpravo jen „Nová hra", ozubené kolo a fullscreen**,
   všechno ostatní se přesunulo do **panelu nastavení** (stejný `felt-panel` jako
   vyúčtování). Varianta z lišty zmizela úplně — vybírá se na úvodní obrazovce.
   V nastavení navíc **jméno hráče** (výchozí „Ty") a **vynulování konta** (konto je
   součást stavu hry, takže ho vynuluje nová hra).
3. ~~Lišta~~ — tmavé „chipy" místo systémových selectů (vlastní
   šipka jako data URI), vpravo „Nový zápas" se zlatým obrysem a ikona fullscreenu.
4. **Avataři** — kolečko s iniciálou, jméno a podtitulek (role + konto); u člověka zlaté.
5. **Stav hry jako pilulka** se zlatým „eyebrow" (název varianty) nad ní.
6. **Úvodní obrazovka** — eyebrow, titulek, podtitulek, **výběr varianty dvěma kartami**
   (s figurou ze zvolené sady) a řádek „Minule". Výběr varianty rovnou přepíná zápas, ale
   zůstává na úvodní obrazovce (`newMatchIdle`).

Dekorační karty na úvodní obrazovce. Mockup tam měl obdélníky
s písmenem; místo nich se ukazují **skutečné karty z `cards/history/`** (u okrajů ve dvou
shlucích, střed volný pro tlačítko), z toho dvě rubem. **Sada se losuje při každém příchodu
na úvodní obrazovku** — schválně přes `Math.random`, ne přes seedovaný generátor hry, aby se
dekorace nepletla do reprodukovatelnosti rozdání (`?seed=`). Souřadnice jsou v procentech
stolu; pozor, že procenta v `translate()` se počítají z velikosti KARTY, takže se pozice
skládá v `left`/`top`.

Pasti, na které se při tom naráží (všechny stály jeden screenshot navíc):
- prázdná ruka si i na úvodní obrazovce držela vyhrazenou výšku, takže tlačítko „Rozdat"
  viselo v půlce sukna → `#table.idle` ji ruší;
- panel úvodní obrazovky překrýval to tlačítko → končí nad akční řadou a klikací jsou
  **jen** karty variant, ne celý panel;
- prázdné kontejnery paklu a hlášek braly kliky → `pointer-events: none`;
- panel nastavení má stejnou třídu `.felt-panel` jako vyúčtování a v DOM je i skrytý —
  smoke ho proto bral za konec hry a hru vůbec neodehrál (`count()` nevidí viditelnost).
  Selektory v smoke jsou nově omezené na `#center-float`.

### 5.5.1.1 Sazba stolu: poměry z mockupu v okně i ve fullscreenu

Stůl je **height-constrained** — soupeři, štych a ruka se musí vejít pod sebe. Rozměry se
proto neodvozují od šířky okna (`vw`), ale od **výšky sukna**: `#table` je `container-type:
size` a všechno uvnitř měří v `cqh`. Karty, tlačítka, titulek i bloky výběru varianty tak
drží poměry z mockupu v okně, ve fullscreenu i na jiném poměru stran; fullscreen už
nepotřebuje vlastní `--card-w`.

Klíčové poměry (mockup 1400×900, sukno = 100 cqh): karta v ruce 14,25 cqh, blok varianty
39,6 cqh, titulek 7,6 cqh, „Rozdat" 2,77 cqh textu. Všechny mají `clamp()` s pixelovým dnem
i stropem, aby se v extrémně malém okně layout nerozsypal.

**Odhozené karty se nepočítají od středu `#trick`.** `.me-row` je absolutní, takže `#trick`
sahá až pod ruku a jeho „střed" leží ZA vějířem. Odhozené karty proto mají posun nahoru
(`-137 %` / `-114 %`), aby skončily celou výškou nad horní hranou ruky.

**Past Safari:** `max-height: 100 %` na obrázku ve flex/grid položce WebKit přetáhne přes
rodiče (Chromium ne) — figura varianty se ořízla. Obrázek se proto vkládá absolutně přes
`inset: 0` + `object-fit: contain`, což je definitivní containing block. Hlídá to smoke
**ve WebKitu**, měřením geometrie, ne CSS: figura nesmí přetéct kartu a poměr bloku varianty
k výšce sukna se v okně a ve fullscreenu nesmí lišit o víc než 2 procentní body.

### 5.5.1.2 Jazyky, nastavení a IQ za běhu

- **Čtvrtý jazyk: francouzština** (`fr`) — všechny texty, hlášky (664 kontrolovaných textů),
  vlastní sada karet `cards/modern-fr/` s indexy V/D/R/A. Název hry se překládá
  (Mariáš / Marriage / Mariage), názvy variant **FLEK!/RE! zůstávají** — jsou to jména
  původních her, ne pojmy.
- **Vlajky jsou dropdown** za ikonou nastavení: sbalený stav ukazuje jen aktuální jazyk,
  aby lišta nezabírala místo čtyřmi vlajkami. Zavírá ho výběr, klik mimo i Esc.
- **Esc zavírá panel nastavení.** Panel je modální přes celé sukno; bez klávesy by hráč
  uvízl, kdyby se křížek někdy ztratil.
- **Přepnutí IQ nezahazuje rozehraný zápas.** Dřív UI zakládalo nový zápas, takže hráč
  spadl na úvodní obrazovku a o hru přišel. Nově `MatchController.setDifficulty()` mění
  obtížnost i rozpočet za běhu a platí od příštího požadavku na AI. Hlídá to verify
  (payload requestu) i smoke (ruka a stav stolu se přepnutím nesmí změnit).
- **Hlavička a patička stránky jsou pryč** — stůl je celý obsah; text se přesune do
  dokumentových stránek (§5.6). **Pozor: s patičkou zmizela i atribuce licence karet —
  musí se objevit v plánovaném dialogu „O aplikaci".**
- Analytika běží na `https://flek.goatcounter.com` (CSP povoluje jen tento konkrétní
  subdomain, ne zástupné `*.goatcounter.com`).

### 5.5.2 Ukončení rozehrané hry (house rule)

Tlačítko v liště má dva významy: na úvodní obrazovce a po zúčtování je to
**„Nová hra"**, u rozehrané hry **„Ukončit hru"** — a to se nejdřív ptá (stejný popup jako
varování u odhozu). Potvrzení pošle akci `concede`, která hru **vyúčtuje jako prohru**.

Pravidlo platby: **kdo vzdá, platí sám** — soupeřům jde sazba stojícího závazku včetně fleků
(červený trumf se násobí). Spoluhráč za cizí rozhodnutí neplatí, proto se nedělí po stranách
jako u běžného zúčtování. Bez kontraktu (ještě se nekomentovalo) se platí základní sazba hry;
vzdát rozdanou hru musí něco stát, jinak by to bylo zdarma řešení špatných karet.

**`concede` schválně NENÍ v `legalActions`.** Kdyby ho měl každý hráč pořád k dispozici,
změnil by význam „kdo je na tahu" (`actor()` hledá první sedadlo s legální akcí) a AI, která
si z legálních akcí vybírá tah, by hru mohla vzdát sama. Kontroluje se proto zvlášť v `apply()`.

### 5.6 Obsah stránky (dokumenty)

Pod hracím stolem, bilingválně CZ/EN:

1. **Tribute** — věnování **Otci** (hru měl rád, osobní vzpomínka) a poctě
   **Pivoňka Software / FLEK! a RE!** (Ing. Jaroslav Pivoňka, 1991–93, historie z §2,
   odkaz na retrogames.cz, „independent tribute" disclaimer po vzoru mars)
2. **Pravidla mariáše** — **odkazy na oficiální dokumenty ČSM u zdroje** (neredistribuujeme,
   viz §3.1), vlastní přehled pravidel přímo na stránce + EN verze vlastními slovy (`docs/rules/`)
3. **Historie mariáše** — podklady zjištěny (2026-08-21), sepsat vlastní text ve fázi obsahu:
   - mariáš **nemá mezinárodní jméno** — i anglické zdroje užívají „Mariáš"; patří do rodiny
     **„marriage group"** (ace-ten hry s hláškou krále + svrška/dámy)
   - předchůdce: hra **Mariage**, poprvé doložena **1715 v Lipsku**, v 18. stol. populární
     v Rakousku; název = fonetický přepis fr. *mariage* (svatba = hláška K+Q)
   - příbuzné hry: **Sixty-Six / Schnapsen**, maďarské **Ulti**
   - česká podoba se ustálila v 19. století; kolem 1900 dominantní hospodská hra v Čechách;
     dnes nejpopulárnější karetní hra v ČR a na Slovensku; Český svaz mariáše, turnajová scéna
   - EN terminologie figur: Unter→Jack, Ober→Queen (odpovídá naší EN sadě karet)
   - zdroje pro odkazy: [pagat.com/marriage/marias.html](https://www.pagat.com/marriage/marias.html),
     Wikipedia [Mariáš](https://en.wikipedia.org/wiki/Mari%C3%A1%C5%A1),
     [Marriage group](https://en.wikipedia.org/wiki/Marriage_group),
     [Mariage (card game)](https://en.wikipedia.org/wiki/Mariage_(card_game))
4. **Technická karta** — jak přepis funguje (engine, fér AI vs. původní „koukání do karet")

### 5.7 Zvuky — ✅ HOTOVO (`src/lib/ui/sounds.ts`)

- Jemné zvukové efekty (vypnutelné v nastavení, pocta volbě „Zvuky" z originálu):
  **rozdávání** (šustnutí ke každé odkryté kartě), položení karty, sebrání štychu,
  flek (ťuknutí kloubů o stůl), výhra/prohra.
  Zvuk míchání balíčku byl na začátku rozdávání **odebrán** — v praxi zněl jako rána,
  ne jako karty; zůstává jen šustění (rozhodnuto s uživatelem při poslechu).
- **Rozhodnuto při implementaci: zvuky se syntetizují**, nestahují se samply. Karty jsou
  filtrovaný šum a krátká ťuknutí, což se dá udělat pár uzly Web Audio — odpadá cizí licence
  k dohledání, soubory v `public/`, i čekání na načtení (první zvuk nikdy nepřijde pozdě).
  Kdybychom později chtěli skutečné nahrávky, vymění se implementace `play()`, ne volající.
  Master gain 0.22 — „jemné, tiché, bez hudby".
- **Autoplay policy**: `AudioContext` se odemyká prvním gestem (`pointerdown`/`keydown`,
  `{ once: true }` v `main.ts`) — do té doby se zvuky **tiše zahazují**, žádná chyba v konzoli.
  Kontext vytvořený přímo při gestu startuje rovnou ve stavu `running`, takže `resume()` se
  často vůbec nezavolá — test proto ověřuje, že se **před** gestem nic nerozezvučí
  (podvržený `AudioContext` ve stavu `suspended`), a smoke počítá skutečně spuštěné zdroje.
- Posluchače gest **nejsou** `{ once: true }` a `play()` se uspaný kontext pokouší probudit:
  prohlížeč kontext uspí i bez nás (tab na pozadí, zamčený displej, jiná aplikace si vezme
  zvuk) a s jediným pokusem o odemčení by zvuk po návratu zůstal mrtvý do konce session.
- Safari kontext neodemkne samotným `resume()` — dokud v něm **přímo v gestu** něco nezahraje,
  zůstane potichu, i když hlásí stav `running`. `unlock()` proto přehraje jednorámcový ticháč.
  Ověřeno v Playwright WebKitu: kontext přejde do `running` a zvuky se spustí.
- **Vypnutý zvuk neotevře `AudioContext` vůbec** — na mobilu by tím probouzel zvukovou relaci
  zařízení uživateli, který si zvuk výslovně vypnul. A dokud neproběhlo gesto, kontext se ani
  nezakládá (jinak Chrome vypíše varování, např. při obnovení zápasu na obrazovce vyúčtování).
- Zvuk sebraného štychu a hláška vítěze platí **i v režimu omezeného pohybu** — uživatel si
  vyžádal míň pohybu, ne míň hry.

### 5.8 Mariášové hlášky (table talk) — ✅ HOTOVO (`src/lib/ui/tableTalk.ts`)

AI hráči „mluví" — bubliny u hráče v příslušné situaci. Dvě sady, přepínatelné v nastavení
(výchozí **slušná**; „hospodská" = jadrnější, pro pamětníky; „vulgární" = hospoda po půlnoci;
`off` = mlčenlivý stůl).

**Zásada, proč hláška nikdy nepřepíše popisek akce:** bublina je jediná zpětná vazba o tom,
CO soupeř udělal. Folklor proto mluví jen tam, kde popisek nenese informaci („dobrá", „pas",
„z lidu"), nebo v okamžicích, které dosud bubliny neměly:

| Situace | Kdy |
|---|---|
| `accept` / `pass` / `fromPeople` | místo popisku, který stejně nic neříká |
| `thinking` | AI počítá déle než 700 ms (u rychlých tahů se neukáže vůbec — jako v originále); **sundává se v okamžiku, kdy se stav pohne** — ne až při dalším překreslení, mezi nímž leží 1,7 s animace štychu |
| `trickWon` | vítěz štychu, ale jen asi **každý třetí** (u třiceti štychů by to jinak byl šum) |
| `handWon` / `handLost` | uštěpačný komentář **ve vyúčtování**, po vzoru FLEK!; při nulovém rozdílu (`Bez změny`) mlčí komentář i zvuk |

Výběr hlášky je **deterministický** (FNV-1a hash přes situaci, sadu a seed okamžiku): tentýž
stav musí dát tentýž text, jinak by se hláška měnila při každém překreslení (přepnutí jazyka,
vzoru karet) a bublina by u téže akce „blikala" jiným textem.

Bublina drží **2,6 s** a novou smí přebít až po **1,1 s** — hlášky chodí v dávkách
(komentování, fleky), takže se text u téhož sedadla měnil dřív, než se dal přečíst. Ve frontě
čeká vždy jen ta poslední, aby bubliny nezaostávaly za hrou.

Hlášek je **aspoň 8 na situaci, jazyk a sadu** (celkem 498 textů) a `TableUI` si pamatuje
posledních šest řečených, které předává jako `avoid`. Bez toho dva soupeři klidně řekli totéž
hned po sobě — „Souhlas | Souhlas" vedle sebe vypadá jako porucha, ne jako hospoda. Smoke to
hlídá: dvě stejné folklórní hlášky viditelné zároveň = chyba.

Sady **dědí** jedna od druhé — vulgární → hospodská → slušná — takže každá doplňuje jen to,
co chce říct po svém:

| Sada | Tón |
|---|---|
| **slušná** (výchozí) | „U mě dobrá", „Já jsem zticha", „Karta jak noha" |
| **hospodská** | jadrná hospoda bez sprostoty: „Držím hubu a krok", „Sedma smrdí, viďte", „Vykašli se na mariáš, dej se na politiku" (poslední je přímo z originálu) |
| **vulgární** | hospoda po půlnoci. Zapíná se výslovně, takže ji nikdo nedostane omylem. Držíme běžná česká sprostá slova mezi kamarády u karet — **žádné nadávky na skupiny lidí** a nic sexuálně ponižujícího; to už není hospoda, to je svinstvo. |

Materiál níže + `docs/original-notes.md`.

- Základ (povinné herní): „Barva!", „Špatná!", „Dobrá.", „Flek!", „Re!", „Tutti!", „Boty!",
  „Kalhoty!", „Sedma!", „Kilo!", „Betl!", „Durch!"
- Folklor (slušná sada, náměty — kurátorovat při implementaci): „Sedma smrdí.",
  „Kdo maže, ten jede.", „Co je doma, to se počítá.", „Karta jak noha!",
  „Nemaž, když nevíš.", „Trumfy ven!", „Flek na všechno!"
- Hospodská sada: drsnější varianty výše uvedených — sepsat při implementaci,
  držet v mezích (bez vulgarit na hraně, spíš hospodská jadrnost)
- Texty v datovém souboru (`src/lib/ui/tableTalk.ts`), CZ + EN ekvivalenty
  (EN spíš neutrální herní hlášky — folklor je nepřeložitelný, možno nechat české s vysvětlivkou)

### 5.9 Persistence a obnova

- **Autosave**: match controller po každém `apply` uloží celý serializovaný `GameState`
  do localStorage v obálce `{ v: 1, state }` (verze schématu kvůli budoucím migracím).
  Reload/pád tabu/mobilní eviction → dialog „Pokračovat v rozehrané hře?" a obnova stavu.
- **Jediný vlastník konta = GameState** (`ledger` + `handResults`); localStorage je jen
  persistovaná kopie celého stavu, žádná druhá pravda. Nevalidní/nečitelný záznam
  (jiná verze, poškozený JSON) → zahodit a začít nový zápas, konto z posledního
  validního stavu je pryč jen v tomto krajním případě.
- Nastavení UI (jazyk, vzor karet, zvuky, obtížnost) v samostatném klíči — nezávislé na zápase;
  herní config (sazby, house-rules) je součástí GameState a mění se jen `deal` akcí.

## 6. Struktura projektu

```
astro.config.mjs                # site 'https://flek.saiko.cz', base '/', format 'file'
Makefile, Makefile.local        # aws s3 sync dist/ → s3://flek.saiko.cz/ + CloudFront invalidace
package.json, tsconfig.json     # strict
scripts/
  verify.ts                     # node:assert testy enginu (vzor mars), tsx
  gen-cards.ts                  # generátor SVG karet
  capture.ts                    # screenshoty pro README → docs/
src/
  layouts/Layout.astro          # z mars: meta, lang přepínač, analytics
  pages/index.astro             # stůl + tribute/technická sekce, CZ/EN
  scripts/main.ts               # DOM glue: herní smyčka, AiPlayer wrapper
  lib/
    random.ts                   # seedovaný PRNG (z mars) + shuffle
    cards.ts                    # kódování karet, pořadí, body, masky
    rules/
      types.ts  engine.ts  legal.ts  tricks.ts
      auction-voleny.ts  auction-licitovany.ts
      talon.ts  fleks.ts  scoring.ts  sazby.ts  view.ts
    ai/
      heuristics.ts  determinize.ts  ismcts.ts  playout.ts
    match/                      # orchestrace zápasu: smyčka tahů, AiPlayer + watchdog,
                                # autosave/resume (§5.9) — bez DOM, sdílené s budoucím serverem
    ui/                         # karty, stůl, dialogy (bez herní logiky)
  worker/
    messages.ts  ai.worker.ts
public/
  rules/                        # vlastní přehled pravidel CZ/EN (odkazy na originály ČSM u zdroje)
cards/
  history/                      # PD skeny jednohlavého pražského vzoru 1860 + README (licence)
  modern/                       # finální vlastní SVG sada, české indexy S V K A (MIT)
  modern-en/                    # táž sada s anglickými indexy J Q K A
docs/
  marias-design.md              # tento dokument
  pravidla/*.pdf                # oficiální pravidla ČSM — JEN LOKÁLNĚ (gitignore, neredistribuujeme)
  rules/                        # EN překlady pravidel (vzniknou)
  original-notes.md             # empiricky ověřené chování originálu (vznikne)
original/                       # originální binárky — beze změn
```

Pravidlo: `src/lib/**` bez DOM (sdílené mezi Node testy, workerem a main.ts); DOM se dotýká
jen `src/scripts/main.ts` + `src/lib/ui/`.

## 7. Postup implementace

0. ✅ **Karty**: historická sada stažena (`cards/history/`), moderní sada navržena, iterována
   s uživatelem a schválena (`cards/modern/` + `cards/modern-en/`, generátor `scripts/gen-cards.ts`)
1. ✅ **Revize dokumentu** — průběžně; fixpoint review zapracována (§11)
2. ✅ **Skeleton**: Astro, Makefile s guardem, Layout z mars, assets pipeline, verify
3. ✅ **Engine**: obě varianty kompletní (aukce, fleky+proti, sehrávka, scoring dle ČSM);
   self-play fuzz 120 her, replay determinismus. Zbývá: reveal karty „z lidu" ve veřejné
   historii, závazek „dvě sedmy" (typy připraveny, za configem)
4. **Ověření originálu**: DOSBox (brew install dosbox-x), hrát FLEK!/RE!, zdokumentovat flow,
   sazby → `docs/original-notes.md`, doladit preset SAZBY_FLEK
5. ✅ **AI**: heuristiky (IQ prahy) + determinizace + ISMCTS (max^n, delta reward) + bezstavový
   worker s watchdogem a fallbackem. Zbývá: doladění síly (noHigherThan constraints, lepší playout)
6. ✅ **UI — první hratelná verze**: stůl, interakce všech fází, bubliny, zúčtování,
   nastavení (varianta/IQ/vzor/hlášky/zvuky), autosave+resume, fullscreen, Playwright smoke.
   ✅ zvuky (§5.7) a hlášky obou sad (§5.8). Zbývá: mince/bank, klávesnice, mobil polish
7. **Obsah**: bilingvální stránka dle §5.6 (tribute Otci + Pivoňka FLEK!, pravidla, dohledat
   a sepsat historii mariáše), zvuky (§5.7), hlášky obou sad (§5.8), EN překlady pravidel, README
   (vzor mars: EN + Česky, „independent tribute", odkazy), LICENSE (MIT; originál zůstává
   dílem J. Pivoňky), screenshoty
8. **Infrastruktura + deploy** (web = vlastní subdoména `flek.saiko.cz`, na rozdíl od mars/tsp
   nejde o cestu na www — je potřeba jednorázově vytvořit v AWS):
   - S3 bucket `flek.saiko.cz` (privátní, přístup jen přes CloudFront OAC)
   - ACM certifikát pro `flek.saiko.cz` v us-east-1 (nebo existující wildcard `*.saiko.cz`)
   - CloudFront distribuce s aliasem `flek.saiko.cz`, default root object `index.html`
   - **DNS**: Route 53 zóna `saiko.cz` — A/AAAA alias `flek` → CloudFront distribuce
   - Makefile: `S3_BUCKET=flek.saiko.cz`, sync do kořene bucketu (vlastní bucket ⇒ `--delete`
     v kořeni je zde v pořádku, na rozdíl od guardu v mars/tsp Makefile). **Guard**: deploy
     cíle tvrdě assertují `S3_BUCKET == "flek.saiko.cz"` — `--delete` v kořeni nesmí nikdy
     mířit na jiný (sdílený) bucket, ani překlepem v Makefile.local
   - Pořadí uploadu: nejdřív hashované assety, `index.html` jako poslední — minimalizuje okno
     nekonzistence; plná atomicita/rollback se pro statický web tohoto typu neřeší
     (rollback = `git revert` + redeploy)
   - `make all && make deploy`, GitHub repo **`flek`** (popis: „Flek! — online mariáš · tribute
     to FLEK!/RE! by Pivoňka Software", topics: marias, card-game, czech, ms-dos, tribute)

## 8. Testování a verifikace

`make verify` (`scripts/verify.ts`, node:assert, deterministické seedy + fixture builder):

1. **Matice legality štychů**: ctění barvy; přebití v barvě; po trumfnutí volnost v barvě;
   povinný trumf; povinné přetrumfnutí; betl — desítka NEpřebíjí svrška (v barevné hře ano)
2. **Vítěz štychu** ve všech kombinacích mode/pořadí
3. **Talon**: odmítá esa/desítky; config přepínače; aktér končí s přesně 10 kartami
4. **Hlášky**: 20 vs 40; jen s partnerskou kartou v ruce; hlásí i obránci; zákaz zpětného
   hlášení; žádné hlášky v betlu/durchu; započtení do kila dle configu
5. **Sedma**: uhraná / zabitá (platí zvlášť, i když hra vyšla) / tichá (polovic, neflekuje se)
   / sedma proti
6. **Kilo**: přesně 100, 110, 90; škálování double/linear; přes hlášky >190 (víc kroků);
   tiché kilo polovic, neflekovatelné
7. **Fleky**: střídání stran; nezávislé žebříčky per komponenta; stropy; `2^level` v rozpadu
8. **Aukce**: priorita převzetí (durch > betl > hra, dřívější mluvčí drží); žebříček licitace
   a priorita forhonta; talon při převzetí dle configu
9. **Zúčtování**: červené ×2 jen barevné hry; každý `HandResult.delta` má sumu 0; ledger zero-sum
10. **Redakce view**: pohled hráče nikdy neobsahuje cizí karty ani neredigovaný talon
11. **Self-play fuzz**: ~200 seedů, náhodné legální akce, obě varianty; po každém `apply`
    invarianty; na konci 90 bodů + hlášky, 10 štychů, terminální fáze (nic se nezasekne).
    Pak ~10 seedů heuristika+ISMCTS s malým budgetem: determinizátor vždy najde konzistentní
    svět, ISMCTS vrací legální akce
12. **Replay determinismus**: `history.reduce(apply, dealt)` reprodukuje stav (`deepEqual`);
    stejný seed ⇒ stejný tah AI

Manuálně: `make dev`, kompletní hry v obou variantách, srovnání s originálem na retrogames.cz.
Před deployem `make build && make preview` + `make deploy-s3-dryrun`.

## 9. Známé pasti (checklist)

- Přebíjecí povinnost se vztahuje k **aktuálně vítězné kartě** štychu, ne k hypoteticky nejvyšší
- Hlášky hlásí i obránci a počítají se jim; timing = při zahrání první karty páru
- Betl: desítka mezi spodkem a 9 — **nikdy** nepoužít trumfový komparátor
- Talon při převzetí betlem/durchem: kdo viděl co — `talonKnown` per hráč, ne jeden flag
- Tichá sedma/kilo se nedají flekovat (vznikají až při zúčtování); flek na sedmu jen byla-li hlášena
- Červený násobek jen pro barevné hry (červený betl neexistuje — nemá trumf)
- Forhont = hráč po rozdávajícím; pořadí mluvení (převzetí, fleky) jde **ve směru hraní od toho, kdo hlásil** (aktér, resp. kdo vznesl nárok). U aktéra-forhonta je to totéž jako „od forhonta“, jinde ne (§34)
- Determinizátor nikdy nesmí dostat `GameState` — typově vynuceno (`PlayerView` only)

## 10. Otevřené otázky k revizi

1. ✅ **Žebříček licitace** ověřen proti PDF ČSM (soutěžní licitovaný mariáš, čl. I):
   sedma < sedma červená < sto < sto a sedma < sto červených < sto a sedma červených
   < betl < durch < dvě sedmy < dvě sedmy a sto < dvě sedmy červená < dvě sedmy červená a sto.
   Sazebník licitovaného (násobky hry): sedma 2×, sto 4×, **betl 15×, durch 30×, dvě sedmy 40×**,
   tichá sedma 1×, omyl 6× — **shodné poměry s voleným** (betl 15×, durch 30×), takže obě
   varianty sdílejí `SAZBY_CSM`; odchylku 10×/20× má jen křížový mariáš, který nehrajeme.
   Závazek **dvě sedmy** (trumfová 7 poslední + pomocná 7 předposlední štych) je v typech,
   v1 za config přepínačem `enableDveSedmy`. Chování originálu RE! stále ověřit v DOSBoxu.
2. Defaulty house-rules (`talonForbidsTrump`, `talonOnTakeover`,
   `maxFlekLevel` — kajzr ano/ne) — navrhnout podle chování originálu, vše zůstane konfigurovatelné
3. Jednotky konta: desetihaléře jako ČSM pravidla / Kč / abstraktní body?
4. ✅ Zvuky budou (§5.7 — míchání, rozdávání, karty; vypnutelné); rozhodnuto s uživatelem
5. ✅ Hlášky (§5.8): hospodská sada je **jadrná, ale bez vulgarit** — hospodská je od hlášek,
   ne od nadávek. Implementováno v tomto duchu; k případnému přitvrzení stačí doplnit texty
   do `PUB` v `tableTalk.ts` (k revizi uživatelem).
6. ✅ Název: **„Flek!"** (titulek webu „Flek! · Mariáš"), GitHub repo **`flek`**,
   web **`flek.saiko.cz`** (vlastní subdoména, DNS v Route 53) — rozhodnuto s uživatelem

## 11. Fixpoint review — validace nálezů (2026-08-21)

Design prošel multi-agentní revizí (fixpoint, 4 revizoři × 3 lens, 92 nálezů, 52 zamítl už
judge). Zbylých 40 otevřených jsem validoval — **oprávněné zapracovány do §4–§8 výše**,
neoprávněné zamítnuty:

### Zapracováno (oprávněné)

| Téma | Nálezy | Řešení |
|---|---|---|
| Rozdání mimo reducer, replay jen v rámci hry, seed nikde | i2, i12, i44, i48, i61, i55 | `deal` je akce se seedem v historii; `seed` v GameState; config immutable, mění se `deal` akcí |
| Chybí archiv odehraných her | i37 | `handResults: HandResult[]` v GameState, ledger z něj odvozený |
| AI nemůže volat `legalActions(GameState)` | i3, i14, i17 | `legalActions(view: PlayerView)` — jeden zdroj pravdy pro UI, AI i apply |
| Talon knowledge per hráč (převzetí, vlastní odhoz) | i13, i36, i84 | `talonKnowledge: [Card[],Card[],Card[]]`, view vydává vlastní položku |
| Legalita odhozu potřebuje trumf/mód před `declare` | i45 | fáze `discard-talon`/`declare`/`takeover` nesou `Standing` (částečný kontrakt) |
| Fleky: `good` bez cíle vs. per-komponentové žebříčky | i34 | definována sémantika: `good` = pas na vše otevřené; fáze končí, když všichni oprávnění pasovali od posledního zvýšení |
| Contract neumí sedmu/sto proti | i35 | `sedma/kilo: Seat \| null` (držitel závazku, i obránce) |
| „Z lidu" = náhoda v čistém reduceru | i18, i83 | deterministicky: první karta forhontova neprohlédnutého balíčku ze seedu; reveal veřejný |
| Zaseknutí hry při pádu/hangu workeru; stale move | i62, i80, i85 | watchdog (budget+2 s) → respawn → retry 1× → heuristický fallback na main threadu; stale `requestId` se zahazuje |
| Worker „bezstavový", ale configure drží stav | i26 | `configure` zrušen, difficulty+seed per `think`; seed tahu odvozen od seedu rozdání |
| Determinizer duplikuje pravidla; fallback bez záruk | i5, i63 | sdílené helpery z `tricks.ts`; ukončení garantováno postupným uvolňováním omezení + log |
| Rozehraná hra se ztrácí reloadem; ledger dvojí pravda | i64, i81, i39 | §5.9: autosave GameState `{v, state}` po každém apply, resume dialog; jediný vlastník konta = GameState |
| Orchestrace v DOM vrstvě proti multiplayer cíli | i1 | `src/lib/match/` — čistý match controller, main.ts jen binding |
| `PublicAction` nespecifikován | i21 | definován v types.ts (redakce `deal`/`discard`, reveal choose-trump) |
| `Sazby` literální typy vs. presety | i42 | pole jsou `number`, hodnoty = defaulty; presety `SAZBY_CSM`, `SAZBY_FLEK` |
| Duplicita contract/declarer ve fázích | i10 | fáze nesou jen `Standing`; `contract` se plní až po `declare` |
| Nekonzistentní popis rozdávání | i51 | kanonický popis v §5.2 |
| Chování při selhání invariantu | i65 | dev throw; prod log s replayem + dialog „rozdat znovu" |
| `--delete` s operátorským prefixem | i74 | deploy cíle assertují `S3_BUCKET == "flek.saiko.cz"` |
| Web Audio autoplay | i86 | odemknutí prvním gestem (§5.7) |
| Klávesnice + reduced-motion | i89 | §5.5 — plné ovládání klávesnicí (pocta originálu), `prefers-reduced-motion` |
| iOS Safari fullscreen | i90 | CSS fallback „maximalizovaný režim" (§5.5) |

### Zamítnuto (s odůvodněním)

- **i75** (atomic release/rollback pro S3 sync): nepřiměřené pro statický tribute web —
  hashované assety + upload `index.html` naposled okno nekonzistence prakticky eliminují;
  rollback = git revert + redeploy. Zapracována jen levná mitigace pořadí uploadu.
- **i9, i41** (rehosting PDF pravidel bez práv / dvojí kopie bez synchronizace): **zastaralé** —
  review běžela nad starší verzí dokumentu; mezitím rozhodnuto PDF neredistribuovat vůbec
  (§3.1: jen odkazy na zdroj ČSM, vlastní texty vlastními slovy).

Zamítnutí judge (52 nálezů) jsem přezkoumal namátkou a souhlasím s nimi — typicky duplicity,
spekulace bez konkrétního selhání, nebo restaty už zdokumentovaných rozhodnutí.

## 12. Fixpoint review kódu — validace nálezů (2026-08-24)

Druhá revize (fixpoint `review-code`, 3 revizoři × 4 lens: bugs / concurrency / security /
tests, 35 nálezů, 17 zamítl judge). Zbylých **18 otevřených jsem prošel proti kódu a všechny
potvrdil jako reálné — všechny opraveny**, každý s cíleným regresním testem:

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i1 | high | aktér smí po cizím betlu ohlásit durch, ale `resolveTakeover` porovnával jen `declarer` → nárok se zahodil a hra se skórovala jako barevná | porovnání i `mode`; vlastní převzetí talon znovu nebere |
| i2, i6 | high | v licitovaném šlo odhodit eso/desítku → `declare` bez jediné legální akce (deadlock, betl/durch fallback je jen pro volený) | odhozy u barevného závazku filtruje `discard-talon` |
| i7 | high | licitace nabízela sedmu i bez sedmy v ruce → deklaraci nešlo pokrýt | sedmový závazek smí slíbit jen držitel příslušné sedmy |
| i8, i20 | high | `requestId` se počítal per-controller, ale worker driver je sdílený → odpověď zrušeného zápasu se spárovala s novým a `apply` ji odmítl (zamrznutí) | modulové globální počítadlo |
| i22 | medium | `apply` v fire-and-forget AI smyčce bez `try/catch` → jedna odmítnutá akce zabila AI navždy | ošetřeno + heuristický fallback + strop opakování |
| i27 | high | test auto-zúčtování byl tautologický (prošel i s vadnou podmínkou) | assert na přesnou výplatu, flek vynutí sehrávku, test s `autoSettlePlainHra: false` |
| i13 | medium | `JSON.stringify(o, keys)` filtruje klíče i ve vnořených objektech → `bid` se porovnával prázdný, jakákoli licitace prošla jako jakákoli jiná | rekurzivní kanonická serializace |
| i3 | medium | bublina fleku byla o stupeň výš („Re!" u prvního fleku) | index `count-1` |
| i4 | medium | AI v licitovaném brala první nabídnutou deklaraci = naslepo červenou (dvojnásobné sazby) | `trumpScore` + volba nejlepší barvy |
| i10 | medium | pořadí odpovědí na převzetí podle čísla sedadla | `speakingOrder` od forhonta |
| i16 | medium | `loadMatch` castoval nevalidovaný JSON na `GameState` | strukturální kontrola |
| i21 | medium | `cancelledIds` ve workeru rostl bez omezení | ocas 64 (id jsou rostoucí, staré nikdy nesedí) |
| i28, i29, i30, i31 | medium/low | netestovaná auto-dobrá, smoke bral varovný popup za zúčtování, netestovaná varování odhozu, autosave assert na magickém čísle | testy: auto-dobrá přes rozdíl historie, `.felt-panel.warn` se potvrzuje, čistý modul `ui/discardWarnings.ts`, `saves === history.length` |

Nové regresní testy v `scripts/verify.ts`: i27 (výplata + vypnutelnost), i1 (převzetí durchem),
i2/i6/i7 (**2640 legálních odhozů, žádný deadlock**), i8/i20 (unikátní requestId), i13
(kanonické porovnání), i30 (varování odhozu).

## 13. Fixpoint review kódu — druhé kolo (2026-08-24, po 293dbfc)

Revize po zapracování prvního kola: 36 nálezů, 18 zamítl judge. Zbylých **18 otevřených
jsem prošel proti kódu a všechny potvrdil** — včetně dvou, které způsobily moje předchozí
opravy. Vše opraveno, každý blokující nález má regresní test.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i6 | high | **regrese z i7**: gate na sedmový závazek uznal i červenou sedmu pro NEČERVENÝ závazek → nezbyla sedma v povolené trumfové barvě a filtr odhozu zamítl všechny páry (deadlock) | závazek vyžaduje sedmu v barvě, která smí být trumfem |
| i17 | high | celá cesta obnovy po selhání AI (fallback, strop, rekurze) byla v testech mrtvá | strop se kontroluje na VSTUPU (rekurze je tím omezená) + injektovatelná `fallbackPolicy`; test pokrývá nelegální tah, pád driveru i selhání fallbacku |
| i18, i8 | high/med | validace obnoveného savu nebyla testovaná a byla částečná (chyběl `seed`, `unseen`, `handNo`, `talonOwner`, `contract`, kontrola fází) | kompletní kontrola tvaru + **semantická validace `assertValid`** (karty, konto, talon); 10 testů obou směrů |
| i1 | medium | **regrese z i2/i6**: zakázaný odhoz v licitovaném se po kliknutí tiše ignoroval | nelegální karty nejde vybrat, tlačítko je aktivní jen pro legální pár, jinak hlášení na stole |
| i2 | medium | závazek „dvě sedmy" šel vylicitovat, ale deklarace ho nepokrývala a scoring ho neuměl | nenabízí se vůbec (i se zapnutým configem), doloženo testem |
| i4 | medium | `cancel()` zahodil čekající promise bez ukončení → `await think()` visel navždy | reject `CancelledError` (a `think()` ho neopakuje — retry je jen pro pád workeru) |
| i13 | medium | „předběžná kontrola zrušených id" ve workeru byla nedosažitelná (FIFO + synchronní hledání) | mrtvý kód odstraněn, zrušení dokumentovaně vynucuje driver + controller + watchdog |
| i14 | medium | překreslení TÍMŽ stavem (změna jazyka/vzoru) přehrálo animaci štychu s duplikovanou kartou | animuje se jen skutečný posun o jednu akci |
| i9, i10 | med/low | analytics přes protokolově relativní URL; obnovený (nedůvěryhodný) stav se vykresloval do `innerHTML` bez escapování | `https://` + `referrerpolicy`; `esc()` na všech interpolacích zúčtování a průběhu hry |
| i3, i5 | low | mrtvá druhá smyčka ve varováních; chybějící německý popisek IQ | smyčka odstraněna (první pokrývá i pohřbení obou půlek), `de` span doplněn |
| i19, i21, i22, i23, i24 | medium | netestované: `talonForbidsTrump` větev, tvrzení „durch hlásí původní aktér", volba trumfu AI, `speakingOrder`; smoke končil úspěchem i při vyčerpání smyčky | testy doplněny; smoke při nedohrání vrací **exit 1** |

`make verify` má nyní **27 PASS bloků**.

## 14. Fixpoint review kódu — třetí kolo (2026-08-24, po 5782606)

39 nálezů, 24 zamítl judge. Zbylých **15 otevřených jsem prošel proti kódu a všechny
potvrdil**. Tři blokující byly testovací mezery u záruk z předchozího kola — a jedna z nich
odhalila i skutečnou dírou v modelu (nevalidovaný `handResults`).

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i25 | high | `esc()` nebyl exportovaný ani testovaný; `handResults` se v savu nevalidoval vůbec, takže podvržený stav dostal libovolný text do `note` a odtud do `innerHTML` | `esc()` exportován + 7 testů; `isHandResult` validuje archiv her (vč. typu `note`) |
| i26, i36 | high | semantika `cancel()` (odmítnutí promise) a „zrušené se neopakuje" neměly test — regrese by vrátila zaseknutí hry | testy s podvrženým `globalThis.Worker`: odpověď, cancel → `CancelledError` bez retry + uvolnění workeru, pád → jeden retry, watchdog |
| i1 | medium | chyba v renderu zamítla `this.chain` → **žádné další překreslení se nikdy nespustilo** (natrvalo zamrzlá tabule) | `.catch()` na konci řetězu |
| i2 | medium | validace savu kontrolovala jen `phase.name`, takže poškozený payload fáze shodil první render | `isValidPhase` kontroluje payload podle jména fáze |
| i13, i14 | medium | `target`/`kind` z obnovené historie tekly do `innerHTML` (bubliny, tlačítka, badge kontraktu) | escapování neznámých hodnot v `targetLabel`, `bidLabel`, badge |
| i18 | medium | zrušené hledání běželo dál a další požadavek čekal ve frontě za ním | při zrušení se nečinný worker ukončí (nový vzniká líně) |
| i19 | medium | watchdog ukončil worker, ale ostatní čekající požadavky nechal viset | `killWorker` odmítne všechny čekající |
| i24 | medium | fallback se počítal i pro zrušený požadavek, jen aby se výsledek zahodil | kontrola zastaralosti před výpočtem |
| i5, i6 | medium | determinizace ignorovala **ukázanou trumfovou kartu** a **hlášenou sedmu** — veřejnou informaci | omezení `allowed` (sedadlo / talon) a `mustHave` u sedmy proti; self-play nepotřebuje uvolnění omezení ani jednou |
| i3, i10 | low | hlášení štychu mělo pevný cs/en ternár (němčina dostala češtinu); `?seed=0` se bralo jako „bez seedu" | `t('trickWord')`; explicitní kontrola parametru |
| i27 | medium | test `talonForbidsTrump` ověřoval jen absenci deadlocku, ne vynucení pravidla | u barevného závazku se kontroluje, že žádná nabídnutá hra nemá trumf ležící v talonu |

`make verify` má nyní **30 PASS bloků**.

## 15. Fixpoint review kódu — čtvrté kolo (2026-08-25, po 4b29631)

Nálezů 50, 29 zamítl judge. Zbylých **21 otevřených jsem prošel proti kódu a všechny
potvrdil** — mezi nimi dvě regrese z vlastních oprav třetího kola (i7, i8) a jednu chybu,
která uměla natrvalo zastavit AI smyčku (i27). Osm nálezů byly testovací mezery u záruk
z předchozích kol; jedna z nich (i45) odhalila i skutečnou díru ve validaci savu.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i1 | high | `betlHoles` počítal díry obráceně — nejnižší karty bral jako díry a eso nikdy | `if (mine[i] > i) holes += 1`; test: 7‑8‑9 = 0 děr, osamocené eso = 1 |
| i5 | high | v licitaci nešlo **držet** stejný závazek — dřívější mluvčí musel vždy přebíjet výš | `mayHoldEqual` podle pořadí mluvení od forhonta; test drží i zamítá |
| i6 | high | člověk byl nucen ohlásit **každou** hlášku — přitom je to volba (body vs. prozrazení páru) | popup na stole „Ohlásit (20/40)" / „Zahrát bez hlášky"; auto jen když je legální jedna varianta |
| i10 | high | `?seed=0` kvůli `\|\| 1` dalo prvním dvěma hrám tentýž seed a slíbený determinismus neplatil | prostý `seedCounter++`, náhodný seed bez přepisu nuly |
| i2 | low | `playPolicy` přebíjel vlastního parťáka na posledním místě ve štychu a nemazal mu body | rozhoduje strana vítězné karty (`mineWinning`), ne jen „kdo teď vede" |
| i7 | medium | **regrese z i6 (3. kolo)**: hlášená sedma se směla vzorkovat do talonu, i když je prokazatelně v ruce | deklarace je až PO odhozu ⇒ sedma je nepodmíněné `mustHave` |
| i8 | medium | **regrese z i5 (3. kolo)**: veřejně otočená karta „z lidu" se v akci nese jen jako `'from-people'`, takže ji AI ztratila | nové pole `revealedTrump` ve stavu i v `PlayerView` (engine → view → determinizace → sav) |
| i27 | medium | `dispatch()` rušil běžící požadavek AI **před** validací — dvojklik tak nelegální akcí zabil AI smyčku napořád | `apply()` nejdřív, `cancelPending()` až po něm; test na dvojklik |
| i20 | medium | analytika `count.js` bez SRI a nikde žádná CSP | verzovaná `count.v4.js` + `integrity`/`crossorigin` a `<meta>` CSP (skripty jen self + gc.zgo.at, `object-src 'none'`) |
| i21 | low | nastavení z localStorage se rozprostřelo do stavu bez validace | každá hodnota se ověřuje proti povolené množině, jinak výchozí |
| i22 | low | obnovený `contract` se nekontroloval strukturálně | `isContract()` (mód, rozsah trumfu, sedadla) + rozsah `revealedTrump` |
| i29 | low | watchdog měřil i **start** workeru, takže první požadavek mohl zemřít dřív, než worker vůbec začal | `SPAWN_GRACE_MS` navíc pro první požadavek na čerstvém workeru |
| i30 | low | 32 souběžných `sharp` zápisů + kontrola „stačí počet souborů" uměly natrvalo zakešovat uříznuté WebP | zápis do `.tmp` + `renameSync`, dávky po 4, jmenovitá kontrola všech 32 karet, úklid zbytků |
| i36, i44 | high | `isHandResult` (bariéra proti XSS ze savu) neprošel testem ani jednou — archiv byl v testech vždy prázdný | 6 negativních testů (číselné `note`, rozbité `components`, cizí kontrakt, řetězec místo výsledku) + archiv musí být **zero‑sum** |
| i43 | high | test escapování volal jen `esc()`, ne skutečné sinky | `targetLabel`/`bidLabel` exportovány a testovány přímo |
| i49 | high | oprava off‑by‑one ve jménu fleku nebyla nikde připíchnutá | `bubbleText` exportován; test na první/druhý/třetí flek |
| i50 | high | větev house rule `talonOnTakeover: 'keep'` neměla test | scénář s převzetím betlem od obránce; „keep" → 10/10/10 a rovnou fleky, „retake" → 12 karet a odhoz |
| i38 | medium | test watchdogu neověřoval hromadné odmítnutí (oba požadavky měly vlastní časovač) | druhý požadavek má dlouhý budget; pozorovaný důsledek = **oba** se opakují na čerstvém workeru |
| i45 | medium | payload známé fáze se nevalidoval do hloubky — `typeof null === 'object'` propustil `fleks.levels = null` a obnova pak spadla v `legalActions` | `isRecord()` místo `typeof`, kontrola prvků `trick`/`played`; 4 negativní testy |
| i47 | medium | determinizace se testovala jen po `deriveConstraints`, ne po umístění karet | 60 seedů přes `determinize()`: ukázaný trumf jen u volícího/v talonu, hlášená sedma vždy v ruce aktéra |

`make verify` má nyní **37 PASS bloků**; smoke test potvrzuje, že CSP nic v prohlížeči nerozbila.

## 16. Fixpoint review kódu — páté kolo (2026-08-25, po 959131f)

35 nálezů, 17 zamítl judge. Ze zbylých 18 jsem **16 potvrdil a opravil, 2 zamítl**
(rozpor s autoritativními pravidly ČSM — viz níže). Nejvážnější byla **kritická regrese
z mého vlastního čtvrtého kola**: „zpřesněná" validace savu zneplatnila každý rozehraný
zápas.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i1, i3, i5, i25 | critical/high | `isValidPhase` kontrolovala `played` přes `isCardArray`, ale `Phase.tricks.played` jsou **dohrané štychy** `{ plays, winner }`. Po prvním dohraném štychu tedy `loadMatch()` vracel `null` → autosave se tiše zahazoval po celý zbytek hry a nabídka „pokračovat" se nikdy neobjevila | `isTrickResult` (3 karty + vítěz); round-trip test odehraje 5 a 27 karet a savu se musí obnovit hodnotově shodný |
| i6 | medium | `phase.trick[].card` nekontroloval **ani jeden** ze dvou obranných valů: `assertValid` používá relační porovnání (`null < 0` je `false`), takže `{"seat":0,"card":null}` prošlo a `suitOf` z něj udělalo červenou sedmu ležící zároveň v ruce | `isCard`/`isPlay` v savu, `Number.isInteger` v `assertValid`; validují se i `marriages` a hodnoty `fleks.levels` (jdou do `2**level`) |
| i7 | low | `showConfirmPopup` interpoloval `confirmLabel` do `innerHTML` bez `esc()` — jediné neescapované místo v celém souboru | `esc(confirmLabel)` |
| i12 | low | přepnutí jazyka překreslí stůl **týmž stavem**, což vyčistilo `#center-float` — otevřený popup i s čekající volbou hlášky zmizel a karta se nezahrála | `openPopup` se umí znovu postavit; skutečný posun hry ho zneplatní |
| i15 | medium | `deploy: deploy-s3 deploy-invalidate` — `make -j` mohl invalidovat CloudFront ještě před dokončením syncu | `.NOTPARALLEL:` + invalidace jako krok v recepci po `deploy-s3` |
| i17 | high | test i27 (dvojklik nezabije AI) byl **vakuózní**: dealer 2 ⇒ forhont je člověk, takže žádný požadavek AI nikdy neběžel a `cancels` bylo 0 v obou případech | scénář s dealerem 0 (forhont = AI), driver rozmýšlí 400 ms; test ověří, že odmítnutá akce nezvýší `cancels` a AI svůj tah dokončí |
| i18 | medium | `assert.equal(keep.talonOwner, keep.contract?.declarer === 0 ? 0 : keep.talonOwner)` je tautologie — invariant o tom, kdo smí vidět talon, se netestoval | porovnává se se skutečným `talonOwner` před převzetím |
| i19 | medium | nová volba „ohlásit / bez hlášky" neměla žádný test; smoke klikal vždy jen „ohlásit" | rozhodnutí vytaženo do `playChoice.ts` (bez DOM) a testováno; „bez hlášky" musí projít enginem a **nic nenaskórovat**, smoke obě větve střídá |
| i20 | high | `SPAWN_GRACE_MS` (i29 z minulého kola) test obcházel — schválně zahřívá worker, takže větev `fresh === true` nikdy neproběhla | test drží první požadavek přes 2,6 s (bez tolerance by ho watchdog zabil) a pak ověří, že po plné toleranci zabít MUSÍ |
| i21 | high | CSP ani SRI nic neověřovalo a smoke nemohl na jejich porušení spadnout (zablokovaný worker jen degraduje na fallback) | verify čte `Layout.astro` (direktivy, žádný `*` v `script-src`, verzovaná URL, `integrity`, `crossorigin`); smoke sbírá CSP porušení a končí **exit 1** |
| i22 | low | oba testy `revealedTrump` používaly dealer 2 / aktéra 0, kde `forhont(2) === 0` — nešlo rozlišit správné pravidlo od chybného | přidán případ po převzetí betlem: aktér je 2, kartu ale ukázal forhont 0 |
| i26 | high | test escapování volal jen `esc()`; skutečné sinky (`settlementHtml`, `replayHtml`) byly private metody s DOM a testovat se nedaly | skladače vytaženy do `resultHtml.ts` (bez DOM) a testovány s `note`/`target`/jménem hráče = `<img src=x onerror=…>` |
| i29 | low | test tvrdil „AI nemaže body do cizího štychu", ale desítku ani neměla v ruce | desítka je v ruce a test žádá konkrétní kartu (devítku) |

### Zamítnuto (s odůvodněním)

| Nález | Proč ne |
|---|---|
| i2 (medium) — „hlášku lze hlásit jen při výnosu" | Naším zdrojem pravdy jsou pravidla ČSM (§3.1), a ta v **Čl. III/3** říkají: „Hláška se považuje za nahlášenou, odloží‑li její majitel stranou (na své zdvihy) první z příslušné dvojice karet **v okamžiku, kdy tuto kartu odehrává**." Žádná podmínka výnosu tam není. Citovaný pagat.com popisuje jinou (také rozšířenou) konvenci; kdo ji chce, patří to do house‑rule přepínače, ne do opravy chyby. |
| i4 (medium) — „dřívější hráč smí držet stejné převzetí" | Pravidlo o držení shodného stupně existuje jen v **licitaci** (Obecná Čl. V/3: „Forhontovi stačí výši závazku vyrovnávat odpovědí »Mám«"), ne u převzetí. Pro volený platí Čl. V/1: „Z ohlášeného Betla mohou zbývající dva hráči přebrat hru **ještě na Durcha**" — shodný betl se tedy nepřebírá. Chování je správné. |

### Poznámka k licitaci (nalezeno při validaci i4)

Obecná pravidla ČSM Čl. V/3 určují, že licitaci **začíná zadák** a forhont jen vyrovnává
„Mám"; po odstoupení forhonta přebírá jeho postavení prostřední hráč. Náš model mluví
v pořadí od forhonta a privilegium držet shodný stupeň dává hráči dřívějšímu v tomto
pořadí — což ve výsledku odpovídá ČSM (forhont drží proti zadákovi, prostřední po jeho
odstoupení), ale **pořadí prvního slova je zjednodušené**. Zapsáno jako known deviation
k dořešení, pokud se budeme chtít měřit s turnajovými pravidly.

`make verify` má nyní **43 PASS bloků**; smoke navíc padá na porušení CSP.

## 17. Fixpoint review kódu — šesté kolo (2026-08-25, po 987d0d1)

37 nálezů, 19 zamítl judge. Zbylých **18 jsem prošel proti kódu i proti pravidlům ČSM
a všechny potvrdil** — tentokrát bez kritického, ale se dvěma reálnými chybami v pravidlech
(licitace, auto-dobrá) a s několika testy, které jen vypadaly jako testy.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i8 | medium | `nextNonHolder` přeskakoval jen držitele, takže hráč, který **už pasoval**, dostal znovu slovo a mohl licitaci i vyhrát — proti ČSM Čl. V/3 („po odstoupení jednoho z hráčů…") | odstoupení je konečné: rotace přeskakuje i odstoupené a licitace končí, jakmile odstoupí oba ne-držitelé |
| i12 | medium | po cizím durchu zbývá v převzetí jediná legální akce `takeover/'good'`, ale `maybeAutoGood` znala jen `good` a `bid/pass` — člověk musel klikat na něco, co nemá alternativu (proti vlastní UX zásadě) | `forced` pokrývá i `takeover/'good'`; test měří **historií** (auto-potvrzení proletí mezi pollingy) |
| i10 | medium | sav v sehrávce **bez kontraktu** prošel oběma vrstvami, ale `legalActions` pak nevrátí žádný tah → obnovená hra zamrzne natrvalo; `sazby: {}` prošlo taky a dělalo `NaN` v zúčtování | kontrakt je povinný ve fázích `fleks`/`tricks`, `isSazby` kontroluje všechny sazby i `kiloScaling` |
| i13 | medium | akce v historii se ověřovaly jen jako „objekt s `type: string`". Sav s `{"type":"play","seat":5,…}` prošel, `renderMelds` pak spadl na `bySeat[5].unshift` — a protože se to stane **před** `renderActions`, zůstal stůl bez ovládání; opakované renderování padá na tomtéž místě a poškozený sav se načítá i po reloadu | `isHistoryAction` validuje každou akci po typu (sedadlo, karta, `announceMarriage`, mód, claim) |
| i20 | medium | handlery workeru nekontrolovaly svou generaci. Retry posílá **týž** requestId, takže opožděná odpověď zabitého workeru vyřídila požadavek čekající na novém — nový pak dál marně počítal, `worker` zůstal „obsazený" a další požadavek se zařadil za mrtvé hledání | `isCurrent()` v `onmessage`/`onerror`; test doručí starou odpověď a ověří, že se jí nevěří |
| i21 | medium | lhůta watchdogu se zapínala při **zařazení** do fronty, ale worker hledá sériově — druhý požadavek tak vypršel ještě před svým startem a `killWorker` strhl i ten první | lhůta zahrnuje rozpočty požadavků čekajících před ním |
| i1 | medium | `buildState` kopíroval do simulace historii **celého zápasu**; `apply` ji klonuje a `view` mapuje dvakrát na akci, přitom se čte jen úsek po posledním `deal` | historie se řeže od posledního rozdání |
| i9 | medium | `?seed=N` po obnovení zápasu začínal znovu od `N`, takže slíbená deterministická posloupnost se opakovala | `advanceSeedTo(saved.handNo)` |
| i3 | low | ukázaná trumfová karta byla přišpendlená k forhontovi i po převzetí — s výchozím `talonOnTakeover: 'retake'` ji ale nový aktér mohl zvednout z forhontova talonu | `allowed` obsahuje i nového aktéra, pokud opravdu bral talon; test rozlišuje `keep` vs. `retake` |
| i2 | low | animace rozdávání se u **nového zápasu** nepřehrála (TableUI si drží `prevState` starého controlleru, jehož historie je delší) | rozdání s historií délky 1 se animuje vždy |
| i5 | low | odměna v ISMCTS je finanční delta (±1 až ±128), ale explorační konstanta UCB předpokládá omezený rozsah — u nejvyšších sázek průměr explorační člen přebil o dva řády | explorační člen se škáluje rozsahem odměn viděným v hledání |
| i6 | low | přesně nulové vyúčtování se hlásilo jako „Vyhrál jsi 0,00 Kč" | nový stav `drawZero` („Bez změny" / „No change" / „Unverändert") |
| i11 | low | `bidLabel` měl tabulku jen pro `en`, takže **němčina dostávala české** závazky („Sedma", „Sto a sedma") | `BID_LABEL_DE` (Sieben, Hundert, Bettel, Durchmarsch…) |
| i24 | high | popup přežívající přepnutí jazyka (i12 z pátého kola) neměl test — verify neumí DOM a smoke popup hned odklikl | smoke jede na **pevném seedu 10** (ten spolehlivě vyvolá varovný popup), přepne jazyk tam a zpět a popup musí zůstat; ověřeno i **negativní kontrolou** (bez opravy smoke padá) |
| i29 | high | test CSP/SRI kontroloval jen přítomnost direktiv — `worker-src *` by prošel; `integrity`/`crossorigin` se hledaly kdekoliv v souboru, ne na tom skriptu | politika se rozpadá na direktivy: žádná nesmí být `*`, celé schéma ani `unsafe-eval`; `script-src` je whitelist; SRI se hledá **v tagu** analytiky |
| i26 | low | `assert.ok(points === 20 \|\| points === 40)` je při typu `20 \| 40` tautologie — obrácená podmínka by testem prošla | čtyři kombinace barva×trumf s přesnou očekávanou sazbou |
| i27 | low | propojení `revealedTrump` reducer → stav → pohled netestovalo nic (všechny testy si `PlayerView` skládaly ručně) | test jede přes engine: volba karty i „z lidu", a kartu musí vidět **všechna** sedadla |
| i28 | low | nové kontroly prvků (`lastRaiser`, `passed`, karta ve štychu) byly testované jen s `null`, ne s platným kontejnerem a vadným prvkem | `lastRaiser: { hra: 7 }`, `passed: ['x']`, `trick: [{ seat: 0, card: 99 }]` |

`make verify` má nyní **50 PASS bloků**; smoke jede deterministicky a padá na porušení CSP
i na zahozeném popupu.

## 18. Fixpoint review kódu — sedmé kolo (2026-08-25, po 8ede9c5)

34 nálezů, 22 zamítl judge. Zbylých 12 jsem prošel: **11 potvrdil a opravil, 1 zamítl** —
a to zamítnutí je poučné, protože reviewera svedl **můj vlastní design dokument**.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i1 | medium | prvky `bids` v obnovené licitaci se nevalidovaly (jediná fáze, kde ne). `legal.ts` i reducer z nich čtou `.bid`/`.seat`, takže `null` v poli shodí `legalActions` — a protože se to děje v `actor()` volaném z async `maybeRunAi`, projeví se to jako nezachycený reject a **AI smyčka se nikdy nerozjede** | `isBidEntry`/`isBid` (známý `kind` + boolean `cervena`); 7 negativních testů |
| i2 | low | `trickNo` se ověřovalo jen jako „finite number". Hra končí na `trickNo === 9`, takže hodnota mimo 0..9 (nebo neceločíselná) dá stav, ze kterého se **nikdy nedojde k zúčtování** — a autosave ho zapíše zpátky | `inRange(0, 9)`; testy pro −1, 10, 2.5, 1e9 i legitimní 9 |
| i9 | medium | `standing.mode` bral libovolný řetězec, `resolveTakeover` ho přetypuje do `contract.mode` a UI pak volá `t(mode)` — neznámý klíč **vyhodí výjimku uvnitř renderu**, tabule přestane reagovat a poškozený stav se načte i po reloadu | validace na `null\|hra\|betl\|durch` + rozsah trumfu; navíc `t()` na neznámém klíči vrací klíč místo výjimky (obrana do hloubky) |
| i16 | medium | animace spí až ~1,8 s a jsou ve frontě `chain`, takže nový zápas čekal za animacemi toho **opuštěného** (a při opakovaných klicích za několika) | `TableUI.reset()` zvyšuje generaci: opuštěné animace se zkrátí a nový zápas kreslí hned; smoke to hlídá dvěma rychlými kliky (**negativní kontrola: bez opravy padá**) |
| i3 | low | moje výjimka pro animaci nového zápasu (i2 z 6. kola) byla ORovaná **před** ochranou `prev === state`, takže přepnutí jazyka hned po rozdání znovu přehrálo rozdávání a přeskočilo obnovení popupu | podmínka doplněna o `prev !== state`; smoke to kontroluje hned po rozdání (**negativní kontrola: bez opravy padá**) |
| i4 | low | `currentActorName` vracelo pro `choose-trump` `null`, takže se místo „Na tahu: Franta…" psalo jen „…" — a protože rozdávající rotuje, ve **dvou ze tří her** | volbu dělá vždy forhont → `forhont(v.dealer)` |
| i5 | low | ve voleném akce `declare` trumf nenese (je dán volbou), takže bublina hlásila „Hra" bez barvy — a nesouhlasila s tlačítkem, které fallback používá | `bubbleText` předává trumf z kontraktu/stojícího závazku; test čeká ikonu barvy |
| i19 | medium | test seedové posloupnosti si **zkopíroval logiku z `main.ts`** a testoval kopii; produkční `advanceSeedTo` nespouštěl nikdo (main.ts je browserový entry) | logika vytažena do `seedSequence.ts` (bez DOM) a testuje se produkční modul, včetně `?seed=0` a náhodné větve |
| i21 | medium | škálování odměn v UCB (i5 z 6. kola) neověřovalo nic — self-play testy projdou i s vráceným pevným `UCB_C` | `ucbScore` vytažena a testována: explorace roste **lineárně** s rozsahem, a u sázky ±128 se má dál zkoumat tam, kde u ±1 už rozhoduje průměr |
| i23 | low | `currentLang()` čte `document`, který v Node neexistuje, takže **anglická i německá větev popisků byly pod testem mrtvý kód** | verify stubuje `document`; testuje se, že žádný závazek nepropadne na slug a že se jazyky navzájem liší, plus existence klíčových textů ve všech třech |
| i30 | low | tvrzení o řezu historie v `buildState` by prošlo i s `slice(0, 3)` (délka 3, začíná dealem — ale předchozí hra) | přesná shoda s očekávaným úsekem + kontrola, že akce předchozí hry tam nejsou |

### Zamítnuto (s odůvodněním)

**i7 (high) — „Volený mariáš používá sazby licitované varianty (betl 10×/20× vs. 15×/30×)."**
Nález tvrdí, že volený má mít betl 10× a durch 20×. Podle PDF **ČSM „Pravidla dvacetihaléřového
bodovaného voleného mariáše" (platná od 8. 5. 2007), čl. A** je ale sazebník: hra 1×, sedma 2×,
sto 4×, **betl 15×, durch 30×** — tedy shodný s licitovaným (2014: betl 3,00 / durch 6,00 při
základu 0,20 Kč = 15×/30×). Sazebník **10×/20× patří křížovému mariáši** (4 hráči,
desetihaléřový), který nehrajeme. `SAZBY_CSM` je pro obě naše varianty správný.

**Poučení:** reviewer měl pravdu v tom, že něco nesedí — jenom to bylo v dokumentaci, ne v kódu.
§3.1 tohoto dokumentu tvrdila „sazebník z křížového voleného … betl 10×, durch 20×" a §11
mluvila o „jiných poměrech než volený". Obojí je opravené a doplněné varováním před záměnou;
sazebník je navíc připíchnutý testem.

`make verify` má nyní **55 PASS bloků**; smoke kontroluje tři věci, které verify bez DOM neumí
(popup přes přepnutí jazyka, žádná animace při překreslení týmž stavem, nový zápas nečeká na
opuštěné animace) — a všechny tři jsou ověřené negativní kontrolou.

## 19. Fixpoint review kódu — osmé kolo (2026-08-25, po abc84b7)

35 nálezů, 18 zamítl judge. Zbylých **17 jsem prošel a všechny potvrdil**. Tři „high"
(i1, i15, i16) byly jeden root cause: **`TableUI.reset()`, který jsem přidal v předchozím
kole, byl špatně navržený**.

### Řetěz překreslení (i1, i15, i16 — high)

`reset()` nahradil `this.chain` novým `Promise.resolve()`, ale běžící úlohu nezrušil. Důsledky,
které review popsalo správně:

- **dvě větve nad týmž DOM**: opuštěná úloha běžela paralelně s novým zápasem a obě psaly do
  týchž uzlů i do třídy `animating` — opuštěná ji odebrala v době, kdy ji nový zápas ještě
  potřeboval, takže **šlo klikat do stolu, který se vizuálně ještě rozdával**
- **dokreslení mrtvého zápasu**: moje vlastní větev `if (gen !== this.gen) { this.renderNow(state); … }`
  kreslila stav **opuštěného** zápasu; tlačítka karet pak visela nad starým `PlayerView`
  a klik na ně dispatchoval do nového controlleru → `IllegalActionError`, který `main.ts` jen
  zaloguje, takže **stůl tiše nereagoval**

Oprava mění návrh: řetěz zůstává **jeden** (žádné prokládání) a `reset()` místo jeho výměny
**probudí spící animace** (`sleepers`), aby řetěz hned uvolnily. Stav opuštěné generace se
nikdy nekreslí — ani v `catch`, ani po dokončení animace.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i6 | high | `choose-trump` čte `state.unseen[0]` bez kontroly. `suitOf(undefined)` je 0, takže poškozený sav tiše nastaví **trumf červené**; legalita „z lidu" přitom nevyžadovala neprázdný balíček | `PlayerView.unseenCount` (veřejná informace), legalita „z lidu" jen když je z čeho brát, a reducer navíc vyhodí `InvariantError` |
| i11 | medium | `script-src 'unsafe-inline'` dělá ze `script-src` **prázdné gesto** — a přitom je to jediná pojistka pro případ, že by někde chybělo `esc()` nad obnoveným savem | post-build krok `scripts/csp.ts` vymění `'unsafe-inline'` za **sha256 hashe** skutečných inline bloků; ověřeno v prohlížeči: injektovaný `<script>` se **neprovede** („Executing inline script violates … 'script-src'") |
| i12 | low | `*.goatcounter.com` — goatcounter je self-service, zástupný host povoluje i domény cizích lidí (hotový exfiltrační kanál) | jen `https://flek.goatcounter.com` |
| i13 | low | `worker-src 'self' blob:` je zbytečná cesta ke spuštění cizího kódu (build vytváří worker z reálné URL) | `worker-src 'self'` |
| i4 | medium | v převzetí je mód závazku vždy konkrétní, ale validace brala i `null`; `resolveTakeover` ho přetypuje na `'betl'\|'durch'` a hra se pak hraje v přirozeném pořadí a **zúčtuje jako durch** | mód v převzetí musí být neprázdný, `takeover` navíc vyžaduje kontrakt |
| i5 | medium | `trump: 0.5` prošlo rozsahem, ale žádná barva se mu nerovná — `legalPlays` přestane vynucovat trumfy a bitové operace z něj udělají jinou barvu | `inRange` (celé číslo) pro trumf i `revealedTrump` |
| i2 | low | `parseSeedParam` bral zlomky i obří čísla; nad 2^53 je `counter++` bez efektu, takže **všechny hry v zápase dostanou týž seed** a slíbená posloupnost tiše přestane platit | jen celá čísla 0..2^32−1 |
| i19 | medium | test „bublina ukazuje trumf" nikdy nespustil nový fallback `standingTrumpOf` (deklarace už kontrakt nastavila) a tvrzení `/<svg/` prošlo i pro **špatnou** barvu | testuje se stav bez kontraktu (fallback) a kontroluje se ikona **trumfové** barvy i absence ostatních |
| i21 | medium | nové ochrany `TableUI` hlídal jen smoke, který **nespouštěl žádný make target** | `make smoke` (build → preview → smoke → kill) a `make all: verify build smoke` |
| i22 | low | kontrola i3 se srovnávala s „baseline": když animace ještě běžela, bylo 1 před i po a kontrola tiše nic nehlídala | čeká se na `#table.animating` `state: 'detached'`, pak musí zůstat 0 |
| i23 | low | test popisků pokrýval 5 ze 7 hodnot `Bid.kind` — chyběly právě ty, které existují jen v licitovaném | iteruje se všech sedm |
| i24 | low | whitelist módů měl jen negativní test; zúžení (třeba vypadlý `durch`) by tiše zahazovalo rozehrané zápasy při obnovení | pozitivní test pro `hra`/`betl`/`durch` |
| i27 | medium | test zrušení pokrýval jen rozdávání, ne delší přechody (odhalení „z lidu" drží stůl 1,8 s) | smoke zruší běžící odhalení a pak porovná **otisk ruky** — po rozdání je na tahu člověk, takže se stůl sám nemění a jakákoli změna znamená dokreslení mrtvého zápasu |
| i33 | medium | oprava „na tahu" pro volbu trumfu (i4 ze 7. kola) neměla test — metoda byla private | `seatOnTurn(v)` exportovaná a testovaná pro všechny fáze i pro všechny tři rozdávající |

### K negativním kontrolám

U i27 stálo za to test **skutečně zkusit rozbít**. První verze (kontrola stavového řádku
a počtu karet) prošla i s vráceným rozbitým `reset()` — tedy nehlídala nic. Rozlišující
pozorování je až **otisk ruky** (`src` karet): opuštěná animace přepíše ruku kartami mrtvého
zápasu. Až s ním negativní kontrola padá, a to s čitelnou diagnostikou:

```
CHYBA: opuštěná animace „z lidu" dokreslila mrtvý zápas přes nový
  ruka po rozdání:      8L, OB, UB, 9B, 7B, …
  ruka o 2,5 s později: KH, UH, 9L, 8L, TB, …
```

Poznámka k poctivosti: na tenhle scénář stačí kterákoli **jedna** z těch tří ochran, takže
negativní kontrola padá až po vrácení všech tří. Testuje tedy výsledné chování, ne každou
zábranu zvlášť.

`make verify` má **61 PASS bloků**, `make smoke` kontroluje čtyři věci, které bez DOM otestovat
nejde, a `make all` teď spouští obojí.

## 20. Fixpoint review kódu — deváté kolo (2026-08-25, po 8803888)

22 nálezů (z 35 v předchozím kole), 15 zamítl judge. Zbylých **7 jsem prošel a všechny
potvrdil**. Tři „high" (i5, i13, i19) jsou jeden root cause a míří přesně na to, co jsem
v předchozím kole přidal: **post-build zpevnění CSP mohlo tiše neproběhnout.**

### Zpevnění CSP bez zpětné vazby (i5, i13, i19 — high)

`scripts/csp.ts` bral „nic jsem nepřepsal" jako úspěch — vypsal
`OK: CSP bez 'unsafe-inline' v 0 souboru/ech` a skončil nulou. A nic to dál nekontrolovalo:

- `verify` testoval jen čistou funkci nad ručně napsaným řetězcem
- `verify` nad `Layout.astro` `'unsafe-inline'` **záměrně povoluje** (kvůli `astro dev`),
  takže zdrojová kontrola to zachytit nemohla
- `smoke` sbíral jen **porušení** politiky, tedy odhalil politiku příliš striktní
  (špatný hash → „Refused to execute inline script"), ale nikdy příliš volnou

Ta asymetrie je jádro problému: kdyby regex minul (jiné uvozovky, escapované apostrofy,
minifikace, přesunutá meta) nebo `tsx scripts/csp.ts` vypadl z buildu, šla by do produkce
politika, **proti které je ten krok filed** — a `make all` by byl zelený.

Oprava má tři vrstvy:

1. `csp.ts` **selže nahlas**: chybějící HTML v `dist/`, stránka bez `script-src`, zbylé
   `'unsafe-inline'` po zpracování nebo méně hashů než inline skriptů = `exit 1`
2. `smoke` čte politiku **z doručené stránky** (`meta[http-equiv]`) a vyžaduje absenci
   `'unsafe-inline'` i přítomnost `sha256-`
3. `smoke` navíc **zkusí injektáž**: vloží inline `<script>` a ten se nesmí provést

Negativní kontrola (vyhodit `csp.ts` z `npm run build`) padá čitelně:

```
CHYBA: doručený script-src není zpevněný (post-build krok neproběhl?):
  script-src 'self' 'unsafe-inline' https://gc.zgo.at
```

Mimochodem: při psaní těch kontrol jsem si v `csp.ts` našel **dvě vlastní chyby** —
regex `content=("|')…\1` bez zpětné reference končil uvnitř politiky (protože ta sama
obsahuje apostrofy v `'self'`), a HTML-escapované apostrofy `&#39;` obsahují `;`, takže
dělení politiky na direktivy je musí nejdřív odescapovat. Obojí by ten krok proměnilo
přesně v to tiché no-op, o kterém review mluví.

| Nález | Sev | Podstata | Oprava |
|---|---|---|---|
| i1 | low | `isContract` kontroloval pole nezávisle, takže prošly **nemožné kontrakty**: betl/durch **s trumfem** (`beats()` pak nominovanou barvu bere jako trumf a štychy padají špatnému hráči), `hra` **bez** trumfu (`legalPlays` přestane vynucovat trumf i přebití) a sedma/kilo v bezbarvé hře | křížová konzistence módu, trumfu, sedmy a kila — plus pozitivní test, že čistý betl projít musí |
| i4 | medium | v savu prošel **plný** rozehraný štych (3 karty); další tah by vyrobil štych o čtyřech kartách a hra by se zúčtovala s chybným počtem karet | `trick.length <= 2`; test staví fixturu ze skutečně rozehrané sehrávky |
| i6 | low | německá sada karet se servíruje německým hráčům, ale `verify` ji vynechával v kontrole kompletnosti i v kontrole externích referencí v SVG | `cards/modern-de` je v obou kontrolách |
| i12 | low | `reset()` probudil animace, ale nechal běžet 2,6s časovače bublin — hláška mrtvého zápasu tak visela nad rozdáváním nového | `reset()` zhasne bubliny a zapomene `lastHistoryLen` |

`make verify` má **64 PASS bloků**, `make smoke` kontroluje šest věcí v prohlížeči.

## 21. Fixpoint review PR — první kolo (2026-09-14, PR #2 „design stolu, francouzština")

Tři recenzenti × čtyři čočky (bugs, security, concurrency, tests), 25 nálezů, 10 zamítnutých
soudcem jako duplicity nebo málo hodnotné. Bezpečnostní čočka nenašla nic.

| # | závažnost | nález | oprava |
|---|---|---|---|
| i1/i8/i11 | high | `compLabel()` skládal popisek z `base[lang]` jen pro en/de — s francouzštinou byl `base['fr']` `undefined` a **padalo každé vyúčtování** (a s ním hra) | tabulka je `Record<Lang, …>` s explicitními popisky pro všechny čtyři jazyky; pátý jazyk teď neprojde kompilací |
| i9 | high | vzdání účtovalo jen holou hru — vyflekovaná sedma nebo kilo se daly „vyřešit" vzdáním za základní sazbu | `concede()` účtuje **každý stojící závazek** (hra/betl/durch + sedma + kilo + dvě sedmy), každý se svým flekem a červeným násobkem |
| i14/i15/i21 | high | vzdání nemělo žádný deterministický test — ani platbu, ani strážce fází | nový blok ve `verify.ts`: cena podle kontraktu se sedmou, kilem a flekem, zero-sum, `concede` mimo `legalActions`, replay historie, obě zakázané fáze |
| i2 | medium | „Vynulovat konto" zahodilo rozehranou hru bez dotazu a bez zúčtování | ptá se stejným popupem jako ukončení hry |
| i3 | medium | dotaz „opravdu ukončit hru?" zmizel, jakmile mezitím táhla AI — hráč klikl do prázdna | popup umí být **sticky**: dotaz mimo herní stav přežije překreslení jiným stavem |
| i5 | medium | francouzské varování u odhozu půlky hlášky vracelo anglickou větu | `Record<Lang, …>` místo kaskády `if`ů |
| i10 | medium | bloky výběru varianty se na úzkém stole ořezávaly | výška je omezená i šířkou sukna (`min(39,6cqh, 54,5cqw)`) |
| i23 | medium | francouzština nebyla v end-to-end pokrytí | smoke prochází vyúčtování ve všech čtyřech jazycích a kontroluje nadpis v daném jazyce |
| i6 | low | odkaz „PROJEKTY" neměl francouzskou variantu — ve francouzštině byl prázdný | doplněn `<span class="fr">` |
| i7 | low | francouzská sada karet měla v SVG české `<title>` | `cardTitle()` podle jazyka sady |
| i19/i26 | low | kontrola přetečení figury ve WebKitu neměřila levou hranu | měří všechny čtyři |

**Navíc (odhaleno při ověřování i1):** smoke sice výjimku z aplikace vypsal, ale prošel —
řetěz překreslování si ji chytá vlastním `catch`, takže se nedostane do `pageerror`.
Smoke teď **padá na každé výjimce** v konzoli (CSP hlášky jsou jediná povolená výjimka,
injektáž si vyvolává sám) a navíc kontroluje, že se panel opravdu překreslil do zvoleného
jazyka — samotná existence panelu nestačí, po chybě uprostřed renderu zůstane text toho
předchozího.

Zamítnuto (soudcem, s odůvodněním): rozpad částky ve vyúčtování vzdání „nesedí" (jde
o zavedenou konvenci — `amount` je částka na jednoho soupeře, `delta` aktéra je dvojnásobek),
plus devět duplicit a nízkohodnotných testových nálezů.

Všechny tři nové browser kontroly (vyúčtování ve francouzštině, sticky dotaz, přetečení
figury) byly ověřeny **negativní kontrolou** — s vrácenou chybou skutečně padají.

## 22. Fixpoint review PR — druhé kolo (2026-09-14, po 5fd2b6f)

16 nálezů, 7 zamítnutých soudcem. Bezpečnostní čočka opět nic. Tři nálezy míří na testy
z prvního kola — to je dobrá zpráva: recenzenti čtou i to, čím se opravy dokazují.

| # | závažnost | nález | oprava |
|---|---|---|---|
| i4 | high | ve fázi **převzetí** drží nárok `phase.standing`, zatímco `state.contract` je překonaná deklarace — vzdání proti převzatému betlu se účtovalo jako holá hra (sazba 1 místo 15) a do výsledku šel aktér, který hru už nedrží | `contractToSettle()` bere ve fázi `takeover` nárok ze `standing`; převzetí betlem ruší sedmu i kilo z překonané deklarace |
| i9 | high | test vzdání neprokazoval, že **každá komponenta má svůj flek** — kdyby měly všechny stejnou úroveň, sdílený multiplikátor by prošel | flekování ve fixtuře jede podle rozpisu (hra 2×, sedma 1×) a test **tvrdí, že se úrovně liší** |
| i15 | high | blok s betlem/durchem byl schovaný v `if` a mohl tiše nikdy neproběhnout | scénář je vynucený: nárok `betl` je ve fázi převzetí legální vždy, takže se dá vyvolat deterministicky (a rovnou pokrývá i i4) |
| i1 | medium | potvrzení **zastaralého** dotazu na ukončení (hra mezitím sama doběhla) smazalo obsah středu a vyúčtování se už nevrátilo | větev „není co vzdávat" překreslí stůl |
| i5 | medium | návrat na úvodní obrazovku zakládal **nový zápas** — konto se nulovalo při každé nové hře a řádek „Minule" byl vždy prázdný | `newMatchIdle(keepBank)` přenáší konto, odehrané hry i rotaci rozdávajícího; nuluje jen nastavení |
| i7 | medium | kontrola i16 („dva rychlé restarty") po zavedení „Ukončit hru" **nic neověřovala** — první klik jen otevře dotaz, jehož tlačítka jsou během animace inertní, takže se dvě rozdání nepřekryjí | kontrola přepsaná na to, co reálně nastat může: restart uprostřed rozdávání nesmí zaseknout řetěz (měří se wall-clock); rušení opuštěných animací dál hlídá kontrola „z lidu", kde je překryv skutečný |
| i12 | medium | strážce u „Vynulovat konto" neměl test | smoke: dotaz musí přijít a zamítnutí nesmí změnit rozehranou hru |
| — | low | `openPopupSticky` bylo samostatné pole a **přežívalo popup**, pro který bylo nastavené (po sticky dotazu by se neplatná volba hlášky překreslila nad cizím stavem) | stav popupu je jeden objekt `{ paint, sticky }` — vlastnost nemůže popup přežít |
| i3 | low | francouzské „Couleur ?" místo výzvy k převzetí | „Tu acceptes, ou tu reprends ?" |
| i6 | low | vzdání bez deklarace si dosazovalo trumf ♥ a vyúčtování hlásilo barvu, která nepadla | `trump: null` |

**Vedlejší důsledek i5:** rozdávající se nově posouvá i přes „Novou hru", takže člověk je
forhont až každé třetí rozdání (správně podle pravidel). Smoke si na „z lidu" proto počká
a zkusí až tři rozdání — dřív spoléhal na to, že restart vždycky vrátí člověka na forhonta.

Zamítnuto: sedm duplicit a nízkohodnotných nálezů, mimo jiné „zrušení sticky popupu obchází
frontu překreslování" (okno zavírá CSS: `#table.animating .action-btn { pointer-events: none }`).

Negativní kontrolou ověřeno všech pět nových kontrol (účtování převzetí, vlastní flek
komponenty, dotaz u nulování konta, přenos konta a řádku „Minule").

## 23. Fixpoint review PR — třetí kolo (2026-09-14, po 95ac2a4)

30 nálezů, 18 zamítnutých. Sedm high, z toho čtyři míří na **opravy z druhého kola** —
dvě z nich odhalily, že oprava byla jen poloviční.

| # | závažnost | nález | oprava |
|---|---|---|---|
| i1/i4 | high | vzdání četlo `standing` jen ve fázi převzetí. Mezi koncem licitace a deklarací je `contract` pořád `null`, ale závazek už drží `standing.bid` — **vysoutěžený durch se dal vzdát za sazbu holé hry** | `contractToSettle()` bere `standing` ve všech fázích, které ho nesou (`discard-talon`, `declare`, `takeover`), a odvodí z příhozu i sedmu, kilo a dvě sedmy. Ve fázi `bidding` se schválně platí základní hra: licitace neskončila, nejvyšší příhoz může kdokoli přebít |
| i9 | high | oprava z 2. kola (`trump: null` u vzdání před deklarací) vyrobila kontrakt, který **`isContract` odmítá** — jediné takové vzdání by udělalo z každého dalšího savu nenačitatelný, protože `handResults` si ten záznam nese dál | `isContract(x, archived)`: archiv smí mít „hru bez trumfu" (legitimní záznam „vzdáno, než se komentovalo"), **živý kontrakt pořád ne** — tam by `legalPlays` přestal vynucovat trumf |
| i5/i23 | high | konto zapsané kvůli přenosu přes „Novou hru" **nikdy nikdo nečetl**: obnova idle stavy odmítá, takže refresh na úvodní obrazovce konto stejně smazal | idle sav s odehranými hrami se přebírá potichu (není co dohrávat, jen konto a „Minule") |
| i15 | high | vynucený scénář převzetí ověřoval jen betl | běží pro betl **i durch** |
| i20 | high | větev, kde `standing` odpovídá deklaraci (vedlejší závazky se mají zachovat), neměla test | fixtura se seedem 1 vynutí deklaraci **se sedmou** a ověří, že vzdání platí i ji |
| i6 | medium | přepnutí varianty na úvodní obrazovce posunulo rozdávajícího **podruhé** | rotuje se jen po odehrané hře (`prev.phase.name === 'idle' ? … : nextSeat(…)`) |
| i8 | medium | `#melds-me` bylo v souboru dvakrát; pozdější (starší) pravidlo přebíjelo nové umístění hlášek | staré pravidlo smazáno |
| i3 | low | `scripts/_probe.mts` — ladicí skript zapomenutý v commitu | smazán |
| i19/i24 | — | vzdání obránce a `concede` v historii savu bez pokrytí | doplněno |

**Navíc (mimo review, nahlášeno uživatelem):** text na tlačítkách byl **13 px**, protože
zkratka `font: 600 18px/24px inherit` je **neplatná** — `inherit` nesmí ve zkratce stát jako
rodina písma, takže prohlížeč zahodil celou deklaraci včetně velikosti. Týkalo se to i lišty,
selectů a badge. Všechny přepsané na samostatné vlastnosti; herní tlačítka mají
`clamp(14px, 2.3cqh, 28px)` — velikost doladěná na dva pokusy (13 px bylo málo, 20 px moc).

Negativní kontrolou ověřeno: účtování vysoutěženého závazku, archivní kontrakt v savu,
obnova konta po reloadu a rotace rozdávajícího při přepnutí varianty.

## 24. Odložená trumfová karta (2026-09-14)

Uživatelovo hlášení: *„vyberu trumfy – žaludy. vybírám dvě karty do talonu – nevidím nikde,
jaké jsou trumfy, je to jen napsané nahoře, ale v kartách to vidět není."* Plus dvě otázky:
je legální odhodit si do talonu trumfy, a **mám vidět soupeřovu zvolenou kartu?**

### Co říkají pravidla

| | |
|---|---|
| **Obecná pravidla, Čl. VII/1** | „Trumfovou barvu volí vždy forhont … **Zvolenou kartu odloží stranou lícem dolů.** Talon odkládá až po zařazení druhé pětice karet do listu." |
| **Volený, B/7** | „Aktér je povinen při všech hrách odložit jasným způsobem (na sebe a **odděleně od zvolené karty**) dvě karty do talonu." |
| **Volený, C/13** | renonc je „eso nebo desítka v talonu (vyjma betla a durcha)" — o trumfech nic |

Z toho plyne všechno ostatní: zvolená karta **leží po celou dobu licitování stranou lícem
dolů**, do talonu jít **nesmí**, soupeř ji **nevidí**, a na sehrávku si ji aktér bere zpět do
ruky (deset karet musí mít každý). Odhodit si do talonu *jiné* trumfy legální je —
`talonForbidsTrump` je house-rule přepínač s defaultem `false`, tedy dle ČSM.

### Co se opravilo

**1. Únik informace (vážné).** `view()` posílal `revealedTrump` **všem** sedadlům s komentářem
„ukázaná karta je veřejná". Není: leží lícem dolů. Obránecká AI tak znala forhontovu přesnou
kartu a `determinize.ts` z ní stavěla omezení — přesně to „koukání do karet", které je
v README slíbené, že se nedělá. Nově pohled kartu dá jen tomu, kdo volil; omezení
v determinizaci zmizelo (bez znalosti nemá co omezovat). Barva trumfů veřejná zůstává, nese ji
`phase.standing` / `contract`.

**2. Zvolená karta do talonu.** `legalActions` nabízel odhoz i té karty, co leží stranou
(B/7). Nově se dvojice s ní nenabídne a `apply` ji odmítne i ručně poslanou.

**3. UI.** `#trump-aside` u pravého okraje sukna (uživatel si vyžádal vpravo), od volby do
začátku sehrávky. Vlastní karta lícem nahoru a **zmizí z vějíře** — leží na stole, ne v ruce;
`handAside()` je jediné místo, které to rozhoduje, takže se vějíř a výběr do talonu nemůžou
rozejít. Soupeřova karta leží rubem. V **licitovaném** se žádná karta nevynáší, trumf je jen
barva ze závazku — místo karty leží destička se symbolem, aby se nepředstíralo, že něco padlo.
Betl a durch trumf nemají: při jejich deklaraci karta mizí ze stolu a vrací se do ruky.

**4. „Z lidu".** Otočená karta se ukazovala **všem** a ležela nad rukou přes akční lištu,
takže překrývala tlačítko „Z lidu" (84×36 px, změřeno). Nově ji vidí jen ten, kdo volil
(u soupeře se otočí rub a status řekne jen „Z lidu"), a leží výš, mimo lištu.

**5. Badge aktéra u vlastního sedadla** se přesunul pod jméno (u soupeřů zůstal vedle).

### Testy

`scripts/verify.ts` — pohled dá kartu jen volícímu (i u „z lidu"), determinizace si na ni
nesmí udělat omezení a přes 60 seedů ji musí vzorkovat i k obráncům, odhoz zvolené karty se
nenabídne ani neprojde reducerem, `handAside()` ubere z vějíře právě jednu kartu a po začátku
sehrávky ji vrátí.

`scripts/smoke.ts` — při odhazování do talonu leží karta stranou lícem nahoru, vějíř ukazuje
**11** z dvanácti karet a odloženou mezi nimi nemá; na začátku sehrávky je box pryč a karta
zpátky v ruce; po zúčtování nic nevisí. Běh, ve kterém se do talonu neodhazuje, je chyba testu.

Překryv „z lidu" se hlídá **geometricky** (průnik obdélníků karty a tlačítek), ne přes CSS:
obojí se škáluje z výšky sukna, takže „o kousek výš" je při jiném poměru okna zase málo.

Negativními kontrolami ověřeno: vrácení redakce ve `view()` shodí test i27, nefiltrovaná ruka
shodí kontrolu „11 karet", box, který se neschová, shodí kontrolu po zúčtování, a původní
pozice otočené karty (`pos-me`) shodí kontrolu překryvu.

## 25. Deep review pravidel proti ČSM (2026-09-16)

Externí review (`.codex-review-pravidla.md`, Codex, 2026-09-14) prošlo implementaci proti pěti
dokumentům ČSM a vytklo jedenáct věcí. Každá se validovala proti kódu **i proti PDF**; devět
se ukázalo jako oprávněných (dvě z nich jen zčásti), dvě se zamítly s citací.

### Zapracováno

| # | Závažnost | Nález | Oprava |
|---|---|---|---|
| 1 | kritická | Seed AI vznikal jako `derive(seedRozdání, tah*3+sedadlo)`. `derive` je invertibilní xorshift a druhý parametr worker zná, takže si ze seedu tahu spočítal **seed rozdání** a z něj celé zamíchání = všechny ruce. | Základ seedů se losuje nezávisle (`crypto`, jinak `Math.random`) a kombinuje s pořadím tahu v zápase; `aiSeedSource` ho testům zafixuje |
| 2 | vysoká | `redact()` pouštěl `choose-trump` **i s kartou**, takže zvolený trumf byl v `publicHistory` každého soupeře — §24 ho schoval jen z `revealedTrump` | Veřejné zůstává jen „z ruky / z lidu"; totožnost karty je `'hidden'` |
| 3 | vysoká | Tiché sto se měřilo jen nejvyšší hláškou a platilo se jako **samostatná komponenta** navíc ke hře | Tiché sto počítá **všechny hlášky** (čl. V/6) a **zdvojnásobuje vyflekovanou hru** místo vlastní komponenty; nad 100 náleží navíc sazba tichého sta za každých 10 bodů |
| 4 | vysoká | Deklarace byla zamčená na přesný druh, příznaky i barvu vysoutěženého závazku | Porovnává se **místo v žebříčku**: vysoutěžený stupeň je minimum, nahoru je otevřeno (čl. VII/3) — po betlu jde durch, po nečerveném stu i červené |
| 5 | vysoká | Ve voleném se hlásil závazek **před** otázkou „Barva?", takže obrana rozhodovala o převzetí se znalostí sedmy a sta | Po odhozu se jde do fáze převzetí (aktér se ptá, obrana odpovídá) a **teprve pak** se hlásí závazek (čl. VII/1) |
| 6 | vysoká | „Flekovaná hra se bez »re« nehraje" (volený B/19) se nerespektovalo | Holá hra s flekem a bez re se rovnou platí obraně; přepínač `autoSettleFlekkedHra` (default jen volený — licitovaná pravidla ustanovení nemají) |
| 7 | vysoká | Sedma/sto proti šlo hlásit i v licitovaném | Zakázáno (licitovaný čl. II/23) a ve voleném omezeno na **první kolo** komentování (čl. VII/1) |
| 9 | střední | Flekovací kola: otevřené byly pořád všechny komponenty a fáze končila až po pasu tří sedadel | `FlekState` nese kolo, otevřené komponenty a kdo už mluvil; otevřené je jen to, co protistrana zvýšila v minulém kole, a fáze končí schválením **jedné strany** (čl. V/4). Kolo 0 patří obraně — aktér ke svému závazku nemluví |
| 10 | střední | Chyběl limit | `Sazby.limit`/`limitRaised` (500× a 750× při flekování obou obránců) stropí výslednou sazbu za hru; `HandResult.limit` to ukáže ve vyúčtování |
| 11 | nízká | README tvrdil, že licitaci začíná forhont, engine ji začínal prostředním hráčem; ČSM říká zadák | Licitaci otevírá **zadák** (= rozdávající ve třech, čl. VII/3); README opraven |

### Zamítnuto

| Nález | Proč |
|---|---|
| „Hlášené sto přesně za 100 se účtuje 1 + 4 = 5, přestože sazba Sta je 4" | Sto je **složený závazek** (hra + sto) a „u kombinovaných závazků se výsledné sazby sčítají, resp. odčítají, byl-li splněn jen jeden z nich" (Obecná pravidla čl. V/2). Stejně se chová sedma (1 + 2). 1 + 4 je správně; opravou prošla jen tichá varianta, kde pravidla explicitně mluví o **zdvojnásobení hry** (čl. V/6, volený A) |
| #8 „licitovaná varianta je funkčně neúplná" (dvě sedmy, omyl) | Není to vada implementace, ale **vědomý rozsah** (§10): „dvě sedmy" scoring neumí a nenabízí se ani se zapnutým configem, licitovat sedmu bez sedmy (a s ní institut „omylu", licitovaný čl. II/17) taky neděláme. Nově je to napsané i v README, ať se to nečte jako chyba |

### Co zůstává nepodporované (a je to teď napsané)

- **Ložené hry** (Obecná čl. V/9–10, volený B/15–18, licitovaný čl. II/18–22): rozpoznání
  ložené hry je řešení hry, ne účetnictví, a rozdíl se platí konkrétním flekujícím hráčům.
  Limit se stropí, rozúčtování ložené hry ne.
- **Prémiové body, pauzírující čtvrtý hráč, fyzické snímání a skládání, většina renonců** —
  turnajové mechanismy mimo rozsah tříhráčové browserové hry.
- **Jedno zvýšení na tah**: hráč smí v kole zvýšit jednu komponentu, pravidla dovolují
  vyjádřit se v jednom kole ke **všem** částem závazku („flek na hru, sedma dobrá").
- **Licitace prostředního hráče**: pořadí držení shodného stupně je pevné (forhont > prostřední
  > zadák), pravidla ho po odstoupení hráče přepínají (čl. VII/3). Viz §16.

### Druhé kolo review (2026-09-16, po `baca982`)

Codex prošel opravy znovu a našel tři místa, kde byl nález uzavřený jen napůl. Všechna tři
sedí a jsou opravená:

| Nález | Co bylo špatně | Oprava |
|---|---|---|
| #4 nedotažený | Deklarace už dovolovala jakýkoli vyšší stupeň, ale **filtr odhozu** pořád vycházel z barevného příhozu a zakazoval dát do talonu eso, desítku nebo poslední potřebnou sedmu. Po vylicitovaném stu se z 66 dvojic nabízelo 45 a žádná s hodnotovou kartou — přestože pro betl a durch je takový talon dovolený | Filtr zrušen; zůstala jediná podmínka, **zvolená karta do talonu nesmí** (volený B/7). Kdo si odhodí eso, zavřel si barevnou hru a hraje betl/durch — `declare` bez legální akce nezůstane, protože betl (7) a durch (8) pokryjí každý barevný příhoz. Riziko hlídá varovný popup, ne pravidla |
| #6 nedotažený | Automaticky se ukončovala jen **holá** hra. Obecná pravidla čl. V/11 ale řeší i závazek Sedma: flek na hru, sedma bez fleku, aktér hru schvaluje → „sehrávka se nekoná, neboť závazky jsou finančně vyrovnané" | `flekEnding()` vrací i `vyrovnano`; do archivu jdou obě komponenty (hra obraně, sedma aktérovi) a delta je nula. Uplatní se jen tam, kde se částky opravdu rovnají — premisa článku je finanční |
| licitace | Prostřední hráč dostával slovo hned po prvním „mám" forhonta. Podle čl. VII/3 draží **zadák s forhontem** a prostřední se zapojí teprve „po odstoupení jednoho z hráčů" | `biddingActive()` drží dvojici ve hře; prostřední nastupuje až na první pas a přebírá postavení toho, kdo odstoupil. Priorita držení shodného stupně (forhont > prostřední > zadák) zůstala — pro obě možná odstoupení vychází stejně, viz §16 |

Nález o **ložených hrách** zůstává vědomě neimplementovaný a je přiznaný v README; nález
o **síle tvrzení o férovosti AI** je oprávněný a vyřešený formulací: seed hledání je nezávislý
na seedu rozdání, ale zamíchání pořád stojí na 32bitovém seedu, takže jde o redakci informace,
ne o kryptografickou záruku. README to teď říká takhle.

### Varování před „dobrou", která platí hru

B/19 dělá z „dobré" jedinou akci, která stojí peníze bez jediné odehrané karty. UI se proto
ptá stejným popupem jako u rizikového odhozu („Bez „re“ se flekovaná hra nehraje — rovnou ji
zaplatíš."), a `maybeAutoGood` takovou „dobrou" **nikdy neodklikne za hráče**, i kdyby byla
jedinou legální akcí.

Predikát `passSettlesWithoutPlay(view)` sedí v `legal.ts`, aby UI pravidla neodvozovalo podruhé;
test ho pro 120 pasů porovnává s tím, co doopravdy udělá reducer. Negativní kontrolou ověřeno:
predikát, který vrátí `false`, test shodí.

### Testy

Nové bloky ve `scripts/verify.ts`:

- **únik**: nad 60 rozdáními obou variant se prochází CELÝ `PlayerView` každého sedadla a každé
  pole nesoucí karty se porovná s kartami, které to sedadlo znát nesmí; plus kontrola, že seed
  rozdání není v pohledu a že žádný seed AI není `derive(seedRozdání, n)` pro n do 5000
- **scoring**: tiché sto se dvěma hláškami (přesně 100 → sazba 2, ne 3), zdvojnásobení
  vyflekované hry, bonus nad 100, hlášené sto pořád 1 + 4, limit 500× i 750×
- **pořadí**: po odhozu se ptá aktér, v historii obrany není deklarace, betl/durch se po
  „Barva?" už nenabízejí
- **licitace**: otevírá zadák pro všechny tři rozdávající
- **deklarace**: po betlu durch, po nečerveném stu i červené, nic pod vysoutěženým stupněm
- **fleky**: kola, otevřené komponenty, konec po souhlasu strany, proti jen volený a jen v kole 0
- **hra bez re**: flekovaná bez re se nehraje, s re ano, s vypnutým přepínačem taky
- **varování**: předpověď „tahle dobrá zaplatí hru" se shoduje s reducerem (30 případů, kdy
  platí, a 90, kdy ne)
- **vyrovnané závazky**: hra+sedma s flekem jen na hru končí nulou a dvěma komponentami; sedma
  proti, flekovaná sedma, re i sazebník, kde se částky nerovnají, vedou na sehrávku

Negativními kontrolami ověřeno u obou úniků: vrácení redakce `choose-trump` i vrácení starého
odvození seedu shodí nový test.

## 26. Řazení vějíře podle režimu hry (2026-09-17)

Uživatelova otázka: *„při betlu/durchu — neměla by být v ruce desítka řazena jinak?"*

### Co říkají pravidla

| | |
|---|---|
| **Obecná pravidla, Čl. II/1** | „Sedma je v barvě nejnižší, eso nejvyšší. **Při hrách, ve kterých je stanovena barva trumfů, se desítka v každé barvě posouvá hodnotou hned pod eso** a stává se tak vyšší kartou než král příslušné barvy." |
| **Obecná pravidla, Čl. IV/6 a 7** | betl i durch: „Trumfovní barva se nestanovuje. **Desítka je nižší kartou než spodek stejné barvy.**" |

Engine to respektoval od začátku (`TRUMP_ORDER` vs. `NATURAL_ORDER` v `cards.ts`, výběr přes
`orderMode(mode)` v `tricks.ts`) — přebíjení i legalita byly správně. Špatně bylo jen **zobrazení**:
`sortHand()` řadila vždycky podle barevné hry, takže v betlu ležela desítka ve vějíři hned vedle
esa, i když ve skutečnosti bere až pod spodkem. Hráč se tak díval na ruku srovnanou podle jiného
žebříčku, než jakým se zdvihy vyhodnocovaly.

### Oprava

- `sortHand(cards, mode)` přijímá režim; výchozí `'trump'` drží **stav enginu** v jednom
  kanonickém pořadí (savy a replaye se nemění, řadí se jen to, co se kreslí)
- `handOrderMode(v)` v `ui/table.ts` odvodí režim z toho, co je veřejně známo, a `handAside()`
  podle něj vějíř setřídí — jedno místo pro stůl i pro ruku, stejně jako u odložené trumfové
  karty (§24)
- pořadí se srovná **už při odhozu do talonu na vysoutěžený betl** a při **převzetí betlem**, ne
  až po deklaraci: `phase.standing` má přednost před `state.contract`, který ve fázi převzetí drží
  už překonanou deklaraci (totéž poučení jako u vzdání, §21)
- nic se tím neprozradí: příhozy i nároky na převzetí jsou veřejné

### Testy

Nový blok ve `scripts/verify.ts`: v barevné hře zůstává desítka za esem, v betlu i durchu klesá
mezi spodka a devítku, vysoutěžený betl platí už při odhozu a nárok při převzetí přebíjí
překonanou deklaraci. Negativní kontrolou ověřeno — s natvrdo vráceným `'trump'` test spadne
(`actual [7,3,6,5,4,2]` proti `expected [7,6,5,4,3,2]`).

## 27. Varování před odhozem mlčí v betlu a durchu (2026-09-17)

Uživatelovo hlášení: *„hlásím betl – odhazuji – vybírám eso – dostanu hlášku, že s odhozenými
trumfy se může hrát jen betl."*

### Co říkají pravidla

| | |
|---|---|
| **Obecná pravidla, Čl. IV/11** | „**U závazků s ustanovením trumfové barvy** je zakázáno odkládat esa a desítky do talonu." |
| **Obecná pravidla, Čl. IV/1** | hodnoty (eso a desítka po 10, hláška 20, trumfová 40) jsou ve hře, „**je-li cílem nebo součástí cíle** ohlášeného závazku **získat co největší počet bodů**" |
| **Obecná pravidla, Čl. IV/6 a 7** | betl i durch: „Trumfovní barva se nestanovuje." |

Betl ani durch trumfovou barvu nemají a body se v nich nepočítají, takže ani jedno varování
před odhozem nemá o čem být.

### Oprava

`discardWarnings(hand, discard, committed)` dostalo třetí parametr — závazek, který je v době
odhozu **veřejně znám** — a při `'betl'`/`'durch'` nevrací nic. Mode dodává nová `knownMode(v)`
v `ui/table.ts` (stejné odvození, jaké §26 používá na řazení vějíře: `phase.standing` má přednost
před překonanou deklarací v `state.contract`).

Ve **voleném** se odhazuje ještě před deklarací, takže tam `knownMode()` vrací `null` a obě
varování zůstávají — to je přesně ten případ, kvůli kterému vznikla. Mizí jen v **licitovaném**
po vysoutěženém betlu/durchu a při převzetí, kde hráč odhazem esa dělá právě to, co má; hláška
„pak lze hrát jen betl" mu v lepším případě překážela a v horším radila proti němu.

### Testy

Blok i30 ve `scripts/verify.ts` má nově obě strany: s `'betl'` i `'durch'` nevaruje ani eso, ani
rozbitá hláška; s `'hra'` a s `null` varování zůstává. Negativní kontrolou ověřeno — bez podmínky
test spadne (`actual [{ kind: 'valuable' }]` proti `expected []`).

## 28. „Barva?" je otázka, ne souhlas (2026-09-17)

Uživatelovo hlášení: *„jsem na forhontu, odhazuji talon, pak tam mám možnost ‚Barva?', ale když to
odmáčknu, objeví se hláška typu ‚Tak hraj, sakra' — moc mi to nedává smysl."*

Nedávalo. Aktérova otázka i souhlas obrany jsou **tatáž akce** `takeover/good` (fáze se otázkou
nemění, Čl. VII/1 — aktér se ptá a teprve po odpovědi hlásí závazek). `bubbleText()` je rozlišovalo
podle sedadla, ale `flavourFor()` ne: každé `good` bralo jako souhlas a nahradilo popisek hláškou
ze sady souhlasů. Hráč, který se právě zeptal, si tak nad vlastní hlavou přečetl větu, kterou měla
říct obrana — „Tak hraj, sakra" adresované sobě samému.

Porušovalo to i vlastní pravidlo §5.8: **hláška jen tam, kde popisek nenese informaci**. „Barva?"
informaci nese — je to jediné místo, kde se nabídka barevné hry vysloví.

### Oprava

- `isColourQuestion(a, state)` — jedno místo, které pozná aktérovu otázku podle sedadla; používá
  ho `bubbleText()` i nová `talkSituationFor()`
- `talkSituationFor(a, state)` je čistá funkce (dřív to bylo tělo privátní `flavourFor`): vrací
  situaci pro hlášku, nebo `null` = *ukaž popisek*. Za „Barva?" vrací `null`, za souhlas obrany
  `'accept'`. `flavourFor` z ní jen vybere text — a jde konečně testovat bez DOM.

### Testy

Nový blok ve `scripts/verify.ts` dohraje volený scénář k otázce a ověří obě strany téže akce:
aktérova „Barva?" hlášku nedostane a bublina ukáže „Barva?", souhlas obrany hlášku dostat smí a
bez ní ukáže „Dobrá". Negativní kontrolou ověřeno — bez rozlišení test spadne (`'accept' !== null`).

Browser kontrola do smoke nepřibyla: jeho scénář (seed 10) odhazuje do talonu eso, takže aktérovi
zbývá jen betl a durch a na otázku „Barva?" se v něm vůbec nedojde.

## 29. Závazek je vidět: velký doprostřed při flekování (2026-09-17)

Uživatelovo hlášení: *„když se ptají soupeři na barvu, je jejich volba (trumf a hra) v rohu dost
neviditelná. Při potvrzování hry bych to vytáhl někam doprostřed. Po zbytek hry bych to nechal
pod jménem tak, jak to teď je, ale nějak bych to zvětšil a zvýraznil."*

Badge „Hra ♥ · Sedma" visí u sedadla aktéra schválně (§5.6: *co kdo hraje patří k hráči*, jméno
pak v popisku být nemusí). Jenže **v okamžiku, kdy se o závazku rozhoduje**, je to jediná
informace, podle které se hráč rozhoduje mezi „Dobrá" a flekem — a leží v rohu v 13 px.

### Oprava

- po dobu fáze `fleks` stojí totéž velké **uprostřed sukna** (`#contract-center`): jméno aktéra
  jako nadpisek (uprostřed stolu už není poznat, komu badge patří) a pod ním závazek. Pak panel
  zmizí a platí zase badge u hráče.
- badge u sedadla vychází z nové proměnné `--contract-fs` (`clamp(13px, 2.35cqh, 23px)`), má
  zlatý rámeček a ikona barvy roste s písmem (`width: 1.15em`). Vyhrazená výška se počítá z téže
  proměnné, takže se karty soupeře po naskočení badge pořád nepohnou.
- text obou míst staví jedna funkce `contractLabelHtml()` — dvě místa se nemůžou rozejít.
- otevřený panel přes střed stolu (varování, vyúčtování) má přednost: `#center-float.open ~
  #contract-center { display: none }`, bez jediného řádku v JS.

Vše v `cqh` podle sazby stolu (§5.2), takže to drží v okně i ve fullscreenu.

## 30. Stůl se musí vejít do okna (2026-09-17)

Uživatelovo hlášení: *„když dám fullscreen browser (ne mariáš, ale browser), tak se mi spodek
mariáše nevejde na obrazovku a musím scrollovat."*

Rám stolu má pevný poměr **1400/900** (§5.2 — deska z mockupu i s lištou), takže jeho výška plyne
ze šířky: `width: min(94vw, 1500px)`. V širokém okně tedy roste i do výšky, ale o výšku okna se
nikdo nestaral. Na typickém MacBooku (1440×900) vyšel rám 1353×870 a s odsazením `<main>` (24 + 40)
to dělalo 934 px do 900px okna — spodek stolu utekl pod dolní hranu.

### Oprava

Šířka počítá i s výškou okna, protože poměr je pevný a jedno z druhého plyne:

```css
.game-section {
  --page-gap: 64px; /* svislé odsazení <main> */
  width: min(94vw, 1500px, calc((100vh  - var(--page-gap)) * 1400 / 900));
  width: min(94vw, 1500px, calc((100dvh - var(--page-gap)) * 1400 / 900));
}
```

Dvakrát schválně: `dvh` (skutečná výška okna i s mizející lištou na mobilu) přebije `vh` tam, kde
ho prohlížeč umí, a kde ne, platí `vh`. Ve fullscreenu samotného stolu poměr neplatí a šířku
přepisuje pravidlo `:fullscreen` níž.

### Testy

Smoke otevře stránku v okně **1440×900** — přesně tom, kde to selhávalo — a porovná
`scrollHeight` s `innerHeight`. Negativní kontrolou ověřeno: se starou šířkou smoke spadne
(„obsah 934 px, okno 900 px"). Ručně proměřeno osm velikostí od 820×1180 po 2560×1440, všechny
se vejdou bez scrollování.

## 31. Nápověda za otazníkem (2026-09-17)

Uživatelovo zadání: *„ve stavovém řádku dole máme vpravo nastavení atd. Doleva bych chtěl otazník,
který by vedl na nápovědu. Tam dáme v lidském jazyku pravidla mariáše, odkazy na oficiální pravidla,
tribute Jaroslavu Pivoňkovi a otci Josefu Saikovi."*

Tím se zavírají tři položky z TODO najednou: **pravidla vlastními slovy ve čtyřech jazycích**,
dialog **„O aplikaci"** a s ním **atribuce licence karetních sad**, která zmizela, když padla
patička.

### Jak je to udělané

- **Otazník vlevo** v liště (`#btn-help`); lišta má nově `justify-content: space-between`, vpravo
  zůstává všechno ostatní.
- **Panel `#help-float`** je stejný modální vzor jako nastavení: překrytí přes sukno, zavírá křížek,
  „Hotovo", klik mimo i Esc. Textu je na jednu obrazovku moc, takže tělo scrolluje uvnitř panelu
  a velikost písma jde z `cqh` jako zbytek stolu.
- **Čtyři jazyky vedle sebe** jako bloky `div.cs / .en / .de / .fr`; skrývá je pravidlo
  `.lang-xx .yy { display: none }`, které na stránce už existovalo. Žádný nový i18n mechanismus.
- Obsah: jak se hraje → **volený vs. licitovaný** (na vyžádání doplněno: kdo volí trumf, „z lidu",
  otázka „Barva?", převzetí jen betlem/durchem × dražba, vysoutěžený stupeň jako minimum) → závazky
  → flekování a peníze → odkazy na ČSM → pocta Pivoňkovi a otci → licence karetních sad.
- V patičce panelu je **verze** (`package.json` se importuje v Astro frontmatteru) a odkaz na repo.

### Dvě věci, které to odhalilo

**Z-index.** Závazek uprostřed sukna (§29) má `z-index: 12`, ale oba modální panely měly 8 a 6 —
takže se přes otevřenou nápovědu i nastavení prokreslovala destička se závazkem. Modály jsou teď
na 24.

**Jazyk za otevřeným panelem.** Dropdown vlajek vyjíždí nahoru přes sukno, takže ho překrytí
nápovědy zakrývalo a jazyk nešlo přepnout — zrovna v nápovědě, kde to člověk potřebuje nejvíc.
`.langpill` je proto na 26, nad modály.

### Testy

Smoke otevře nápovědu, ověří, že je vidět **právě jeden** jazykový blok a že obsahuje pravidla,
obě varianty, Pivoňku, věnování i atribuci karet; přepne jazyk a zkontroluje, že se text opravdu
vyměnil; zavře ji Esc. Negativní kontrolou ověřeno — když jazykový blok přestane být jazykový
(`class="cs-broken"`), smoke spadne na tom, že v anglické nápovědě zůstal český text.

## 32. Víc hlášek, delší paměť (2026-09-17)

Uživatel: *„hlášky jsou dobrý, ale dost se opakují."*

Hlášek bylo 664 — ale to je součet přes tři sady a čtyři jazyky. Hráč slyší jen **jednu buňku**:
svou sadu, svůj jazyk, jednu situaci, a tam jich bylo osm. `accept` přitom v jednom rozdání padne
klidně šestkrát. K tomu se paměť „nedávno řečených" držela jen **šesti** posledních hlášek, takže
vyhýbání se vyčerpalo a repertoár se zúžil ještě víc.

- Každá buňka je zhruba **dvojnásobná** (14–18 hlášek), celkem **1304** textů.
- `RECENT_TALK` je **14** a je exportovaný, aby na něj mohl sáhnout test.
- Test hlídá minimum 14 hlášek na buňku a hlavně invariant: **okno nedávných musí být menší než
  nejkratší tabulka**, jinak se vyhýbání vyčerpá a je to zase tam, kde to bylo.

Hygiena zůstává: bez HTML, do 46 znaků, vulgární sada dál bez nadávek na skupiny lidí a bez
sexuálně ponižujících hlášek.

## 33. Nečervený sedmový závazek jde licitovat i s červenou sedmou (2026-09-17)

Uživatelova otázka nad licitací: *„v licitovaném RE není volba normální sedmy a normálního
100 + sedm?"* — s červenou sedmou v ruce nabízela hra jen `Sedma ♥`, `Sto`, `Sto ♥`,
`Sto a sedma ♥`, `Betl`, `Durch`. Nečervená sedma a nečervené sto a sedma chyběly.

### Co říkají pravidla

| | |
|---|---|
| **Licitovaný, čl. I** | žebříček: 1 sedma, **2 sedma červená**, 3 sto, **4 sto a sedma**, 5 sto červených, **6 sto a sedma červených**, 7 betl, 8 durch |
| **Obecná pravidla, čl. VII/3** | aktér ohlásí „závazek, který ohlásil, nebo **vyšší druh závazku**" — vysoutěžený stupeň je minimum (§25) |
| **Licitovaný, čl. 17** | „Hru **Sedma** nelze hrát bez sedmy trumfové v ruce." Kdo vylicituje obyčejnou sedmu a nehraje, platí **omyl**; kdo vylicituje červenou sedmu a nemá ji, „musí hrát jakoukoliv vyšší hru" |

Filtr v `legal.ts` vycházel z domněnky, že u nečerveného závazku „trumf červená být nemůže" —
jenže **červená sedma je v žebříčku VÝŠ** (stupeň 2 proti 1, 6 proti 4). Kdo ji drží, pokryje
nečervený závazek tím, že ohlásí červenou variantu. Nenabízet mu nejnižší stupeň znamenalo, že
hráč s červenou sedmou nemohl otevřít licitaci nejlevnějším závazkem, přestože ho umí uhrát.

### Oprava

Nečervený sedmový závazek nově stačí **jakákoli** sedma, červený dál výhradně ta červená:

```ts
if (needsSeven && !(b.cervena ? hasCervenaSeven : hasAnySeven)) continue;
```

Zůstává vědomá odchylka: čl. 16 dovoluje licitovat cokoli **nad** obyčejnou sedmu bez ohledu na
karty a čl. 17 z toho dělá omyl nebo útěk do vyšší hry. Omyl neúčtujeme (README), takže sedmové
závazky, které by aktér neuměl deklarovat, se dál nenabízejí.

### Testy

Blok v `scripts/verify.ts`: s červenou sedmou se nabízí `sedma` i `sto-sedma` (a `sedma-č`),
s nečervenou sedmou naopak červené varianty ne, a **bez jakékoli sedmy žádný sedmový závazek**.
Navíc se ověřuje pointa — že vysoutěžená nečervená sedma opravdu JDE pokrýt: deklarace nabídne
sedmu v červené. Negativní kontrolou ověřeno; se starým filtrem test vypíše přesně tu nabídku
ze screenshotu (`sedma-č, sto, sto-č, sto-sedma-č, betl, durch`).

## 34. Review pravidel a férovosti AI — třetí kolo (2026-09-18)

Dvě nezávislá review (Codex a Claude) nad celým enginem proti třem dokumentům ČSM a nad tokem
dat do AI. **Férovost AI potvrzena oběma**: worker dostává jen `PlayerView`, `phase` nenese nic
skrytého, simulace v ISMCTS volá totéž `view()` nad determinizovaným stavem, seedy hledání jsou
nezávislé na seedu rozdání. Nálezy se validovaly proti kódu i PDF; závažnost od Codexu se dvakrát
snížila s citací.

### Zapracováno

| # | Zdroj | Nález | Pravidlo | Oprava |
|---|---|---|---|---|
| 1 | oba | `maxFlekLevel: 5` v obou variantách. V licitovaném je čtvrtý flek (boty) poslední platný. Codex dal „vysoká" pro obě varianty — pro volený to z PDF **neplyne** (C/3 odkazuje na bodovací tabulku v příloze, kterou text nemá), takže volený drží kalhoty | licitovaný čl. IV „flek nad rámec posledního platného fleku (čtvrtého)" | `defaultConfig('licitovany')` dává `maxFlekLevel: 4`; `SAZBY_CSM` (peníze) sdílený dál |
| 2 | Claude | **Převzetí ve voleném běželo obráceně**: obránce nárokoval betl/durch naslepo a po zvednutí talonu měl volbu zamčenou. ČSM: obránce „sebere odložený talon a následně po odhozu jiného talonu ohlásí Betl či Durch" — volí s dvanácti kartami | Obecná VII/1 | Nový nárok `take`: obránce zvedne talon (`talonKnowledge`), odhodí, a ve fázi `declare` vybírá betl/durch (`trumplessChoicePending`). Po ohlášeném betlu se převzetí otevře znovu, „zbývající dva hráči" mohou na durch; durch jde rovnou do fleků. Aktér sám hlásí betl/durch dál rovnou (talon už odhodil). House rule `keep` talon nechává ležet |
| 3 | Claude | Pořadí mluvení začínalo vždy u forhonta (§9). Ve voleném s aktérem-forhontem shoda; v licitovaném s aktérem-prostředním mluvil první forhont místo zadáka, a po nároku prostředního při převzetí taky | Obecná V/4 „v pořadí ve směru hraní", volený B/11 „sled hodinových ručiček" | `speakingOrder(after)` = dvě sedadla po levici toho, kdo hlásil; užívá se u fleků i převzetí |
| 4 | Claude | Zastaralé komentáře tvrdily, že zvolená trumfová karta je „veřejná (i z lidu)" — v `engine.ts`, `types.ts` i `table.ts`; přesně ten typ komentáře, který dřív schovával únik (§24) | Obecná VII/1 | Přepsány: karta leží lícem dolů, vidí ji jen volící |
| 5 | Codex | Test úniku chodil jen po vyjmenovaných klíčích; nové pole s kartami by proklouzlo | — | Nový blok „tvar pohledu": **přísný allowlist klíčů** na každé úrovni `PlayerView` (view, config, contract, standing, každá fáze, každý typ akce v historii, výsledky) a **non-interference**: prohození skrytých karet mezi soupeři a s talonem nesmí pohled změnit ani o bit (3 849 pohledů) |
| 6 | Claude | Vyúčtování ukazovalo talon po každé hře | licitovaný čl. II/11 „při betlu a durchu však nelze do talonu nahlédnout ani po hře"; volený B/8 to po hře dovoluje | `replayHtml` v licitovaném betlu/durchu talon nevykreslí |

Vzdání se sebraným talonem (před volbou betl/durch) platí **aspoň betl** — zvednutý talon
nesmí být levným únikem za sazbu hry (`contractToSettle`). AI: obránce bere talon, když má na
betl nebo durch už s deseti kartami; odhazuje podle toho, kam se s dvanácti spíš vejde.

### Zamítnuto / odloženo (s odůvodněním)

| Nález | Proč |
|---|---|
| Codex: betl/durch — výnosová karta má ležet lícem dolů **před** ohlášením (Obecná IV/6–7) | Platí, ale volený B/7 to formuluje jako možnost („pokud … položí"), striktní „musí" je jen v Obecných. Vyžaduje nový krok UI (výběr karty před tlačítkem Betl/Durch), skrytý payload v akci `declare` a jeho redakci; zisk informace proti AI zanedbatelný. **Odloženo**, není součástí tohoto kola |
| Claude: „sto proti" proti hlášenému stu nejde (`kilo: Seat \| null`) | B/20 to nezakazuje, ale model by potřeboval dva držitele kila a dvojznačný flek `kilo`. Vzácné; **odloženo** |
| Codex: `autoSettlePlainHra` default | Domácí pravidlo podle FLEK!, potvrzené uživatelem („dobrá hra se nehraje"). Návrh „striktní ČSM" presetu je k zvážení, ne oprava |
| Codex: README odkazuje na licitovaná pravidla 2014, ČSM má 2023 | Dokument 2023 je pro **míchaný** bodovaný licitovaný mariáš (jiný soutěžní formát); bod o čtvrtém fleku v něm zůstává. Reference se nemění |
| Codex: rozsah (dvě sedmy, omyl, ložené hry, renonce, jedno zvýšení na tah) | Vědomě mimo rozsah, přiznané v §25 a README |
| Codex: AI po převzetí nevyužívá znalost vlastního odhozu | Síla AI, ne férovost. Beze změny |

### Testy

Nové bloky ve `scripts/verify.ts` (každý s negativní kontrolou — vrácení opravy test shodí):

- **převzetí**: obránce má jen `good`/`take`, po `take` drží 12 karet a talon vidí jen on; po odhozu
  je k volbě právě betl a durch; po betlu se převzetí otevře znovu u hráče po levici, nabízí se jen
  `good`/`durch`; durch z betla zvedá talon, odhazuje a má nárok zamčený; ohlášený durch jde rovnou do
  fleků; aktér sám hlásí betl/durch rovnou
- **pořadí**: aktér-prostřední v licitovaném → první komentuje zadák, pak forhont, kola se střídají
- **strop fleků**: v licitovaném po botách pátý flek není, ve voleném kalhoty ano a nad ně ne
- **tvar pohledu**: allowlist klíčů + non-interference (viz výš)
- **vyúčtování**: talon v licitovaném betlu/durchu chybí, v hře i ve voleném je

Upravené: i1 a i50 (převzetí jde přes `take` → odhoz → deklarace), i12 (driver AI bere talon a
hlásí betl), vzdání po převzetí (dvě větve: se sebraným talonem platí betl, nárok na durch platí
durch), i7 (peněžní sazebník sdílený, strop fleků ne), vějíř (standing bez trumfu ve voleném =
hra bez trumfů, v licitovaném ne).

### Fixpoint review PR #9 (2026-09-18, po `ed27f59`)

Panel (claude, codex, glm) nad PR: 14 nálezů, 7 duplikátů/zamítnutí soudcem, 7 otevřených. Všech
sedm sedí a je opravených:

| Závažnost | Nález | Oprava |
|---|---|---|
| high | Test „tvar pohledu" končil smyčku na `scored`, tedy přesně tam, kde se poprvé objeví `phase.result` a nový záznam v `handResults` — allowlist pro `scored` a výsledky nikdy neběžel, a byl mělký | Kontroluje se i `idle` před rozdáním a zúčtování po každé z DVOU her (archiv je pak neprázdný i během hry); `resultShape` prochází kontrakt, body, komponenty i deltu; test navíc vyžaduje, aby se každá deklarovaná fáze v běhu opravdu potkala |
| medium | Sav si veze celý config, takže obnovený licitovaný zápas hrál další hry se stropem 5 | `dealNext()` předává `opts.config` — nové rozdání jede podle aktuálních pravidel, rozehraná hra se nemění (config platí od `deal`) |
| medium | `isHistoryAction` s nárokem `take` neměl test — bez něj by reload rozehraný zápas tiše zahodil | Kolotoč save→load se `take` v historii (i ve fázi `declare` po sebraném talonu) a odmítnutí neznámého nároku |
| medium | Strážce „přebíral OBRÁNCE" v testu vzdání byl tautologie (`talonOwner` je uprostřed převzetí schválně `null`) | Původní aktér se zachytí u otázky „Barva?" a porovnává se s ním |
| medium | Nové větve heuristiky (`take`, odhoz na hru bez trumfů) bez asercí | Jednotkový test: betlová ruka → `take`, slabá → `good` (všechny obtížnosti); se sebraným talonem letí do talonu dvě nejvyšší karty, v licitovaném s týmž standingem se hodnotové karty drží |
| low | Assert stropu fleků procházel i tehdy, když sedadlo nebylo na tahu | Před kontrolou se ověří `toAct` a že sedadlo má aspoň „dobrá" |
| low | Nápověda ve čtyřech jazycích slibovala kalhoty i v licitovaném | Věta rozdělena podle varianty |

Negativní kontroly: cizí klíč v `HandResult`, vyhozené `take` z validace savu, vyhozená větev
`take` i odhozový režim v heuristice a `deal` bez configu — každé shodí právě svůj test.

## 35. Fixpoint review kódu — desáté kolo (2026-09-18, po `774cecd`)

Panel (claude, codex, glm-5.3-flash) nad celým stromem po vydání v0.0.6: 21 nálezů, soudce nechal
sedm (zbytek duplikáty nebo zamítnuto). Všech sedm se ověřilo proti kódu a proti PDF — **žádný
falešný poplach**, všechny opravené.

### Zapracováno

| # | Závažnost | Nález | Pravidlo | Oprava |
|---|---|---|---|---|
| 1 | high | `release.yml` skládal příkaz `gh release create --title "${{ steps.notes.outputs.title }}"`. Výraz se dosazuje do textu skriptu **dřív, než ho shell rozebere**, takže titulek se stává syntaxí. Titulek přitom není konstanta — `release-notes.ts` ho bere doslova z nadpisu v `CHANGELOG.md` (`(.*)`). Uvozovka v nadpisu tedy spustí cizí příkaz na runneru, a to v kroku s `GH_TOKEN` a právem `contents: write` | — | Titulek jde přes `env: RELEASE_TITLE`, kde je pro shell jen text. `release-notes.ts` navíc odmítne nadpis s řídicími znaky, ať se překlep pozná hlasitě |
| 2 | medium | **Na každý flek šlo odpovědět jen jednou za kolo.** `advanceFleks` uzavíralo kolo, jakmile sedadlo jednou promluvilo, a další kolo otevřelo jen `[...new Set(f.raised)]`. Flekla-li obrana dvě komponenty (A hru, B sedmu), aktér zvedl jednu a **druhá zůstala zamrzlá na fleku** — sedma se vyúčtovala za 2× místo 4×. V UI se to projevilo dvěma tlačítky „Re!", z nichž jedno po kliknutí na druhé zmizelo | Obecná V/4: „**U kombinovaných závazků lze flekovat každý z nich samostatně**" | Sedadlo drží slovo, dokud mu zbývá otevřená komponenta, kterou smí zvýšit. Eligibilitu počítá nová `raisableFleks()` v `legal.ts` — jeden zdroj pravdy pro nabídku akcí i pro posun kola |
| 3 | medium | Odložený trumf se u soupeře **počítal dvakrát**: ve stavu karta pořád leží v ruce, takže `handCounts` ji zahrnuje, a `renderOpponents` kreslila rub za každou. AI-forhont tak ukazoval o kartu víc a při sehrávce jedna nevysvětlitelně zmizela (dvě hry ze tří) | — | `trumpAsideOf()` vrací i `holder` (z čí ruky karta odešla); `renderOpponents` o ni vějíř zkrátí. Vlastní ruku řeší `handAside()` jako dosud |
| 4 | medium | `standingOk` v savu ověřovalo `standing.bid` jen jako „nějaký objekt". `bidRank` na cizím tvaru vrací `undefined`, každé porovnání s ním je `false` — a **minimum z licitace tiše přestane platit** | Obecná VII/3 (vysoutěžený stupeň je minimum) | `isBid`, stejně jako všude jinde v souboru |
| 5 | medium | Nápověda a nastavení se vylučovaly **jen jedním směrem**: `openHelp` zavíral nastavení, `openSettings` nápovědu ne — přestože komentář sliboval „a naopak". Nápověda leží uvnitř `#table`, ozubené kolo je jeho soused, takže kliknout jde; oba panely mají `z-index: 24` a prosvítaly přes sebe | — | `openSettings(true)` zavře nápovědu; smoke to hlídá v obou směrech |
| 6 | low | `hideThinkingBubble()` se vracelo na `thinkShown === null` dřív, než se podívalo na frontu, takže **čekající** „Momentíček…" zrušit nešlo — a naskočil nad sedadlem, které už dávno táhlo. Doc komentář o řádek výš tvrdil opak | — | Fronta se eviduje zvlášť (`thinkQueued`) a ruší se i tehdy, když nic nevisí |
| 7 | low | `unlock()` jen spustí `resume()` a vrátí se; `play('deal')` hned za ním narazí na ještě uspaný kontext a potvrzení zapnutí zvuku se **nikdy neozve** | — | `unlock()` vrací příslib; tlačítko zvuků hraje potvrzení až z něj. Odemykací ticháč pro Safari zůstává **synchronně v gestu** (po `await` by ho už neuznalo) |
| 8 | low | Název testu i24 („odpovědi obrany od forhonta") popisoval pravidlo, které §34 nahradilo. Procházel jen proto, že jeho fixtura (aktér = forhont) obě pořadí slučuje | Obecná V/4, volený B/11 | Přejmenováno na „ve směru hraní"; komentář říká, že rozlišující případ hlídá test níž |

### Testy

Nové a rozšířené bloky ve `scripts/verify.ts` a `scripts/smoke.ts`:

- **fleky — na každou flekovanou komponentu se odpovídá zvlášť**: obrana flekne hru i sedmu, aktér
  musí dostat slovo na **obě**; po dvou „re" jsou obě úrovně na 2 a teprve pak se kolo posune
- **workflow — tělo `run:` je bez dosazovaných výrazů**: statická kontrola všech workflow souborů
  (parsuje i víceřádkové `run: |`), aby se `${{ }}` do skriptu nevrátilo jiným krokem
- **sav — cizí příhoz**: `{}`, neznámý `kind` i chybějící `cervena` se musí odmítnout, platný durch projít
- **odložený trumf**: `holder` u volícího i u obránce a shoda „rubů minus odložená karta" s vějířem
- **zvuky**: podvržený `resume()` se probouzí **až s příslibem** (jako prohlížeč) — zvuk hned po
  `unlock()` se zahodí, po `await` se ozvat musí
- **nápověda** (smoke): ozubené kolo přes otevřenou nápovědu a otazník přes otevřené nastavení —
  v obou směrech smí zůstat otevřený právě jeden panel

Negativní kontroly (vrácení opravy shodí právě svůj test): `done = true` v `flek` větvi,
`isRecord` místo `isBid`, `${{ }}` zpátky do `run:`, vyhozené `openHelp(false)`.

**Bez testu zůstal nález 6** (čekající bublina): je to čistě časování uvnitř `TableUI`, kde se
jediný spolehlivý scénář opírá o dvě souběžné lhůty (700 ms a 1100 ms). Takový smoke test by byl
vratký a podle zásady projektu je lepší žádný než mrtvý — chování hlídá komentář u `thinkQueued`.

### Fixpoint review PR #10 (2026-09-18, po `4bc028c`)

Panel nad PR s opravami §35: **verdikt APPROVE**, žádný nález nad „medium". Osm otevřených
nálezů, všech osm sedí; sedm opravených, jeden zamítnutý.

| Závažnost | Nález | Oprava |
|---|---|---|
| medium | `announce-proti` obcházelo nové pravidlo předávání slova: `flek` drží slovo, dokud zbývá otevřená komponenta, ale ohlášení proti zapisovalo do `spoke` bezpodmínečně. Na pořadí uvnitř tahu tak **záleželo** — „sto proti a pak flek" prošlo, „flek a pak sto proti" ne | Symetricky, ale opačným směrem, než navrhoval recenzent: ohlášení proti tah uzavírá **a flek při vyčerpaných zvýšeních taky**. Ohlášení je podle čl. VII/1 jedno vyjádření v prvním kole komentování, ne přídavek k fleku; opačné řešení (držet slovo, dokud má hráč co říct) by po každém fleku ve voleném přidalo potvrzovací „Dobrá" — viz §36 |
| medium | Nový strážce řídicích znaků v `release-notes.ts` nikdo nespouštěl: skript není součástí `make all`, takže se mohl smazat i obrátit a všechno by bylo zelené | Test pouští skript jako **podproces** nad dočasným CHANGELOGem: čistý nadpis → kód 0 a název na stdout, nadpis s řídicím znakem → kód 2 a hláška, chybějící sekce → kód 2 |
| medium | Testovala se jen datová půlka opravy odloženého trumfu (`holder`), ne ta kreslící. Odečet v `renderOpponents` šlo vyhodit, aniž by cokoli spadlo | Rozhodnutí o počtu vytaženo do čisté `opponentBacks(v, seat, unseenCount)` — testuje se bez DOM z pohledu obou obránců, proti `handAside()` téhož hráče (táž zásada jako u `talkSituationFor`, §28) |
| low | `FlekState.spoke` měl v komentáři „kdo se už vyjádřil — pasem i zvýšením", jenže zvýšení tam sedadlo zapíše až s vyčerpanými komponentami. Přesně to pole, na které se ptá `advanceFleks` i `passSettlesWithoutPlay` | Komentář dopsán o podmínku a odkaz na `raisableFleks` |
| low | `echo "title=$(npx tsx …)"` **spolkne návratový kód** — substituce uvnitř argumentu ho nepropustí, `echo` vrátí 0. Chybějící sekce, prázdné tělo i nový strážce by tedy vydání nezastavily; job by šel dál s prázdným titulkem a spadl by až o dva kroky dál na cizí chybě | Dvouřádkový `run: |` s přiřazením `title="$(…)"`, které stav substituce pod `set -e` propustí (ověřeno v shellu) |
| low | Strážce workflow bral odsazení z prvního nebílého znaku, takže u kompaktního `- run: \|` byl „tělem" i sourozenecký `env:` — guard by shodil právě ten zápis, který sám doporučuje | Odsazení se bere ze sloupce KLÍČE `run`. Parser je vytažený do `runLines()` a ověřený na dvou vymyšlených úryvcích, aby mlčení znamenalo čistotu, ne slepotu |
| low | Sentinel `checked > 10` měl rezervu přesně jeden řádek: smazání řádku z jiného kroku by shodilo test hláškou „parser asi nic nenašel" | Strukturální podmínky: aspoň jeden `run:` na soubor a aspoň jeden víceřádkový blok za běh |

### Zamítnuto (s odůvodněním)

| Nález | Proč |
|---|---|
| low: „zapojení tlačítka zvuků na příslib `unlock()` není otestované" | Sedí — vrácení té tří řádky nic neshodí. Jenže test by musel mít uspaný kontext s řízeným příslibem, a smoke si `AudioContext` jen obaluje: kontext vytvořený v gestu startuje rovnou `running`, takže by se `resume()` musel podvrhnout — a test by pak ověřoval podvrh, ne prohlížeč. Kontrakt `createSounds` (zvuk až po dojití příslibu) **otestovaný je**; zbylé tři řádky v `main.ts` jsou jeho jediné volání. Podle zásady projektu je vratký test horší než žádný |

## 36. Kolik toho hráč řekne v jednom tahu (2026-09-18)

Model fleků dával sedadlu jednu akci za tah. Od §35 z toho platí výjimka: kdo zvýšil jednu
z několika otevřených komponent, drží slovo dál (čl. V/4 „u kombinovaných závazků lze flekovat
každý z nich samostatně"). Otevřená otázka byla, jestli táž výjimka platí i pro sedmu/sto proti —
jinými slovy jestli obránce smí v jednom tahu říct „**flek a sto proti**".

Text to nerozhoduje: čl. VII/1 říká jen, že „Závazky Sedma a Sto mohou hlásit i hráči obrany
v prvním kole komentování ohlášeného trumfového závazku" — tedy v tom kole, ne nutně v témž tahu.

**Rozhodnuto (uživatel, 2026-09-18): ano, smí.** Sedadlo drží slovo, dokud má co říct nad rámec
„Dobrá"; tah uzavře až schválení. Predikát je `stillHasSay()` v `engine.ts` a ptá se rovnou
`legalActions` — ne vlastního seznamu. To je na tom to podstatné: kdyby se nabídka a posun kola
rozešly, propadla by hráči možnost, kterou mu UI o akci dřív samo nabízelo.

Nejdřív bylo zvoleno užší čtení (ohlášení tah uzavírá) s odůvodněním, že širší by přidalo klikání.
Panel ukázal, že užší čtení **nedrží**: jakmile je otevřených komponent víc, obránce po fleku pořád
zůstává na tahu, takže „flek a pak sto proti" projde, kdežto „sto proti a pak flek" ne — a ohlášení
navíc zahodí flek, který byl o akci dřív nabízený. Symetrie šla zachránit jen zrušením výjimky
z §35, tedy návratem původní chyby. Argument o klikání navíc taky neobstál: po fleku naskočí
skutečná volba („Dobrá / Flek! na sedmu / Sto proti"), ne potvrzovací klik bez obsahu — zásada
„žádné klikání bez volby" (§5.5) tím porušená není.

Cena je jedno kliknutí navíc ve voleném kole 0, kdy je „sto proti" dostupné pořád. Kdyby vadilo,
cesta nejsou další otázky, ale **sdružené akce** — tak, jak to `legalActions` už dělá pro „sedma
proti + sto proti" jedním tlačítkem.

Drží to test „proti — … nezávisle na pořadí v tahu": obě pořadí musí dát tentýž závazek, tytéž
úrovně fleků i totéž `toAct`.

### Fixpoint review PR #10, druhé kolo (2026-09-18, po `a615d25`)

| Závažnost | Nález | Oprava |
|---|---|---|
| high | Nový test `release-notes.ts` pouštěl `npx tsx` s cwd v dočasném adresáři. Tam `npx` lockfilem nainstalovaný `tsx` nenajde a v CI si ho **stáhne z registru** — cizí nepřipnutý kód v release jobu, který má `contents: write` a token z checkoutu | Volá se rovnou `process.execPath` s `node_modules/tsx/dist/cli.mjs`; když CLI chybí, test spadne, místo aby se cokoli tahalo |
| medium | `announce-proti` pořád obcházelo pravidlo předávání slova — §36 tvrdil symetrii, kterou kód při více otevřených komponentách neměl | Viz §36: širší čtení, `stillHasSay()` pro obě větve |
| medium | `isBid` porovnávalo `String(x.kind)`, jenže `String(['durch'])` je taky `'durch'` — a takové pole `JSON.parse` vyrobí přímo. `bidRank` na něm propadne `switch`em, vrátí `undefined` a minimum z licitace přestane platit. Týmž koncem procházel červený betl/durch, kde `bidRank` vrací -1 | Porovnává se syrová hodnota a navíc se ověřuje `bidRank(...) > 0`, což odřízne obě cesty najednou. Test o tři podvržené příhozy bohatší |

Negativní kontroly: `String()` zpět do `isBid`, neexistující cesta k `tsx`, a obě větve
`stillHasSay` zvlášť — každá shodí právě svůj test.

### Fixpoint review PR #10, třetí kolo (2026-09-18, po `c3559a2`)

Osm nálezů, všechny sedí, všechny opravené. Dva blokující — a ten první je nejdražší chyba
celého PR, protože porušil vlastnost, kterou projekt inzeruje v README.

| Závažnost | Nález | Oprava |
|---|---|---|
| high | **`stillHasSay` prozrazovala trumfovou sedmu obránce.** Ptala se `legalActions`, a ta u sedmy proti sahá do RUKY (`v.hand.includes(card(trump, R7))`). Výsledek se zapisuje do `spoke`/`toAct`, což `view()` posílá všem i workeru. Sekvence: aktér hlásí hru a sto, obránce oba flekne → vyčerpá zvýšení i sto proti a zbývá jediná otázka, jestli má čím hlásit sedmu proti. Z toho, jestli mu zůstalo slovo, si aktér (i heuristika) přečte, kdo drží trumfovou sedmu — přesně tu kartu, podle níž se rozhoduje o sedmě. Ověřeno reprodukcí: dvě rozdání lišící se jen držitelem sedmy dala po TÉŽE veřejné sekvenci různé `toAct` | Predikát čte jen VEŘEJNÝ stav: `raisableFleks(...)` nebo nová `protiPossible(...)` (veřejná polovina čl. VII/1, kterou teď sdílí i `legalActions`). Obránce, který by proti hlásit nemohl, drží slovo taky — jedinou legální akci „dobrá" za něj odklikne `maybeAutoGood` |
| high | Strážce workflow znal jen zápis `run:`. YAML dovoluje i `run :`, `"run":` a `'run':` — a per-file kontrola se dala nasytit jiným, správně napsaným krokem, takže by injekce v přeskočeném kroku prošla | Regex pokrývá všechny čtyři zápisy, syntetické případy je hlídají v obou podobách (jednořádkové i blokové) |
| medium | `opponentBacks` mohla u podvrženého savu (prázdná ruka s odloženou kartou) vrátit -1 a `syncChildren` by se zacyklil: `0 > -1` platí, ale `lastElementChild` je `null`, takže se nic neubere — karta ztuhne | Obojí se ořezává na nezáporné celé číslo. Radši nakreslit prázdno než ztuhnout (`assertValid` hlídá 32 karet celkem, ne po rukou) |
| low | `FlekState.spoke` popisoval `raisableFleks`, jenže reduktor jede přes `stillHasSay` — už podruhé tentýž komentář zastaral rychleji než kód | Popisuje `stillHasSay` a odkazuje na §36 |
| low | Doc u `raisableFleks` sliboval volajícího v enginu, který po `c3559a2` neexistoval | Ukazuje na `stillHasSay` (teď je to zase pravda) |
| low | Per-file podmínka „parser nenašel jediný `run:`" by shodila sadu na legitimním workflow složeném ze samých `uses:` — táž past jako dřívější `checked > 10` | Kontroluje se jen u souborů, které nějaké `run:` opravdu obsahují |
| low | Oprava návratového kódu do `GITHUB_OUTPUT` byla **jediná změna bez negativní kontroly** — návrat k `echo "title=$(…)"` prošel vším | Strážce workflow navíc odmítne řádek, který zapisuje do `$GITHUB_OUTPUT` a obsahuje `$(` |
| low | Pinnutá byla jen čistá `opponentBacks()`, ne její jediné volání: vrácení inline výpočtu vrátí původní chybu a nic nespadne | Smoke staví stav savem (dealer 0 → forhont je soupeř vlevo) a počítá ruby: 9 + karta stranou. Uvnitř herní smyčky to nešlo — v pozorovaném rozdání je forhontem člověk, takže kontrola by nikdy nenastala (ověřeno měřením, ne odhadem) |

Negativní kontroly: `legalActions` zpět do `stillHasSay`, zúžený regex klíče `run`, `echo "$(…)"`
zpět do release.yml, inline výpočet zpět do `renderOpponents` — každá shodí právě svůj test.

**Poučení:** `legalActions` je jediný zdroj pravdy o tom, co smí hráč udělat — ale právě proto
sahá do ruky, a **nesmí se jí ptát nic, co se zapisuje do veřejného stavu**. Testy úniku hlídaly
`view()` nad daným stavem; tudy unikal REDUKTOR, tedy to, jak stav vzniká. Nový blok „únik —
předání slova ve flecích nezávisí na cizí ruce" kontroluje právě tohle.

### Fixpoint review PR #10, čtvrté kolo (2026-09-18, po `14394f1`)

Šest nálezů, všechny sedí, všechny opravené.

| Závažnost | Nález | Oprava |
|---|---|---|
| high | Strážce injekcí ve workflow přeskakoval platné zápisy YAML: `-    run:` (víc mezer za pomlčkou), flow mapy a **kotvu** `run: &script |`, u níž se tělo tvářilo jako hodnota. Per-file podmínku přitom nasytil jiný, správně napsaný krok, takže by injekce v přeskočeném kroku prošla | **Konec vlastního parseru.** Workflow se čte knihovnou `yaml` a prochází se `jobs.*.steps[].run`; kotvy i flow mapy vyřeší parser sám. Syntetická fixtura drží všechny čtyři zápisy, které postupně proklouzly |
| medium | `FlekState.spoke` změnil význam (§35/§36), ale verze savu zůstala na 2. Rozehraná hra z v0.0.6 nese sedadlo, které podle STARÉHO pravidla „domluvilo" po jediném fleku — nový reduktor mu slovo nevrátí a komponenta se vyúčtuje o stupeň níž | Verze savu na **3**. Migrovat to nejde (co by hráč řekl, kdyby se ho engine byl zeptal, se dopočítat nedá), takže se rozehraná hra z v2 nenačte. Test odmítnutí v2 je pevný, ne relativní k aktuální verzi |
| medium | Nový seedovaný smoke blok čekal pevných 1200 ms, zatímco zbytek souboru čeká na podmínku. Na vytíženém runneru by přečetl nuly a spadl hláškou „počítá se dvakrát" — tedy falešně a s nesprávným vysvětlením | Čeká se na `#trump-aside` a na vykreslené ruby; když se stav neobnoví, hlásí se to jako „stav se neobnovil" |
| medium | Obě pojistky proti zamrznutí (ořez v `opponentBacks` a v `syncChildren`) byly bez testu a daly se smazat se zeleným `make all` | Otestované obě. `syncChildren` je kvůli tomu exportovaná a testovací kontejner má **počítadlo otáček**: bez ořezu test spadne hned, místo aby CI viselo (ověřeno — bez pojistky běh skončí až timeoutem) |
| medium | Test úniku trumfové sedmy ověřoval jen SHODU obou variant. Kdyby ze `protiPossible` vypadla sedmová větev, obě by slovo předaly dál — taky shodně — a test by mlčel | Ověřuje se i to, CO má nastat: obránce drží slovo a `spoke` zůstává prázdné; nabídka se pak podle ruky lišit smí (ta je soukromá), veřejný stav ne |

Negativní kontroly: kotva a `-    run:` s injekcí do release.yml, verze savu zpět na 2, oba ořezy
zvlášť, sedmová větev `protiPossible` — každá shodí právě svůj test.

**Poučení:** třikrát jsem ten regex na `run:` látal (odsazení od pomlčky, `run :` a `"run":`,
nakonec mezery a kotvy). Strážce, který tiše přeskočí krok, budí dojem, že hlídá i to, co nehlídá
— u bezpečnostní kontroly je to horší než nic. YAML má pro tutéž věc víc zápisů; rozplétat je
regulárním výrazem je prohraná bitva a patří na to parser.

## 37. Řada akcí má vlastní pruh (2026-09-18)

Při plné licitační nabídce (devět tlačítek: „Dobrá (pas)" + celý žebříček až po Durcha) zajelo
první tlačítko **přes blok „Ty"** v levém dolním rohu sukna — jméno hráče a konto byly schované
pod „Dobrá (pas)".

Nejdřív zkusené zúžení boků (`padding-inline` na `#actions` + užší tlačítka v přeplněné řadě)
nefunguje: nejdelší popisky to neunesou. Německé „Hundert und Sieben" a anglické „Hundred and
seven" se do zbytku šířky nevejdou, řada se buď zalomí, nebo z odsazení rovnou vyteče — a
asymetrické odsazení navíc sesunulo „Rozdat" na úvodní obrazovce o 21 px mimo osu pod
vycentrovaným titulkem.

Zvoleno tedy **vlastní pruh**: `#actions` se zvedne nad blok „Ty" i nad pakl
(`margin-bottom: clamp(12px, 6cqh, 60px)`). Řada pak může být přes celou šířku a o velikosti
písma ani o šířce tlačítek není potřeba nic předpokládat. Změřeno ve všech čtyřech jazycích na
1440×900: žádný překryv s „Ty", paklem, hláškami ani vějířem; mezera k bloku „Ty" 18 px. Čeština
a francouzština drží devět tlačítek na jednom řádku, angličtina a němčina se zalomí na dva —
zalomená řada roste nahoru do prázdného sukna, takže výška stolu ani vějíř se nehnou.

## 38. Sav z v2: migrovat všechno, co migrovat jde (2026-09-18)

Verze obálky savu se kvůli změně významu `FlekState.spoke` (§36) zvedla na **3** a `loadMatch`
začal odmítat **každý** sav z v2. To bylo příliš hrubé.

`spoke` žije výhradně v payloadu fáze „fleks". Sav v kterékoli jiné fázi znamená pro nový
reduktor přesně totéž co pro starý — a přitom se v klidu (`idle`, `scored`) ukládá právě proto,
aby mezi návštěvami zůstalo **konto a archiv odehraných her**. Odmítnutý sav tedy hráči po
aktualizaci vynuluje banku, vypadá to jako ztráta dat, a další autosave starý záznam přepíše
nadobro. Za to, co se tou verzí řešilo, je to nepřiměřená cena.

Načítání se proto ptá `loadable(v, phase.name)`: v3 vždycky, v2 jen mimo komentování. Přijatý sav
z v2 se rovnou přepíše na v3, ať se migrace neopakuje. Nenačte se jen to jediné, co opravdu
přenést nejde — rozehraná komentovací kolečka.

Testy drží obě strany: v2 mimo fleky projde a konto i archiv to přežijí, v2 ve flecích neprojde,
a **tentýž stav ve v3 projít musí** — jinak by kontrola procházela i tehdy, kdyby se stav odmítal
kvůli tvaru, ne kvůli verzi.

### Fixpoint review PR #10, páté kolo (2026-09-18, po `add428d`)

Osm nálezů. Sedm sedí a je opravených, jeden odmítnut s odůvodněním.

| Závažnost | Nález | Oprava |
|---|---|---|
| high | Test strážce `release-notes.ts` **zmizel** při přepisu sousedního bloku (`f57c060`) a nikomu to nespadlo. Zbyly po něm jen nepoužité importy (`spawnSync`, `mkdtempSync`, `tmpdir`). Skript se v `make all` jinak nespouští, takže kontrolu řídicích znaků v nadpisu nic neprovádělo — selhalo by to až na tagu, v jobu s `contents: write` | Blok obnoven doslova z `14394f1` a opatřen poznámkou, že se s ním musí mazat i strážce v `release-notes.ts` |
| high | Sav: odmítnutí **všech** savů z v2 bere hráči konto a archiv, i když se ho změna `spoke` netýká | §38 výš — `loadable(v, phase.name)` a migrace na v3 |
| high | Druhá větev strážce workflow (spolknutý návratový kód u `GITHUB_OUTPUT`) neměla vlastní fixturu. Všechny čtyři vzorky obsahovaly `${{ }}`, takže počet stížností seděl i bez ní — negativní kontrola, která nekouše | Vlastní vzorek bez `${{ }}`: `echo "x=$(…)" >> $GITHUB_OUTPUT` musí stěžovat, přiřazení a teprve pak `echo` (tvar z release.yml) projít musí |
| medium | Checkout nechával v `.git/config` zapisovací token po celý job — tedy i pod `npm ci` (postinstall skripty celého stromu), instalací prohlížečů a `make all` | `persist-credentials: false`. Vydání dostane token až v posledním kroku přes `env:` |
| medium | `suitArt.ts` vznikl jako jediný zdroj znaků, ale nic ho nesvazovalo s **zakomitovanými** kartami: `make cards` v `make all` není, takže úprava cesty změní ikonku v UI a každá karta na stole zůstane stará — se zeleným testem | Kontrola v `verify.ts`: 112 karet (4 sady × 4 barvy × 7 hodnot) musí obsahovat výstup `suitArt()` doslova; král se vynechává, jeho emblém je `mono` z týchž obrysů |
| low | Release job volal `npx tsx` — přesně ten nepřipnutý vzorec, který se v témže PR odstranil z testu | Binárka z lockfilu (`node node_modules/tsx/dist/cli.mjs`), a totéž pro Playwright. Pravidlo je nově **vynucené**: třetí větev strážce workflow hlásí každé `npx` bez `--no-install` |
| low | Pruh akcí (§37) neměl geometrickou kontrolu — překryv se mohl vrátit nepozorovaně | Smoke: sav s devítinabídkou (seed 514) ve všech čtyřech jazycích, každé tlačítko musí být disjunktní od jmenovky i od hromádky. Ověřeno, že bez `margin-bottom` kontrola spadne (čeština a francouzština) |
| low | **Odmítnuto:** barvu rohového indexu srovnat s kresbou z panelu 3a | Neudělat. Panel kreslí kuli jako ČERVENOU rouli; kdyby ji následoval i index, měla by kule sedmu k nerozeznání od srdcové — a „červená" zdvojnásobuje sazby. Rozlišuje tvar **a** index, zlatá u kulí je z pásu. Důvod zapsán do `SuitDef` v `gen-cards.ts`, ať se to příště nečte jako rozejití |

Negativní kontroly: vypnutá migrace v2, migrace bez omezení na fázi, vypnutá druhá větev
strážce `GITHUB_OUTPUT`, vypnutý strážce řídicích znaků v `release-notes.ts`, změněná cesta
žilky v `suitArt.ts`, zrušený `margin-bottom` u `#actions` — každá shodí právě svůj test.

**Poučení:** test smazaný při přepisu souseda po sobě nenechá žádnou stopu kromě nepoužitých
importů — a ty nikdo nehlídá. Tenhle konkrétní blok je jediné místo, kde se `release-notes.ts`
vůbec spouští, takže jeho zmizení nebylo vidět nikde jinde než na tagu.

### Fixpoint review PR #10, šesté kolo (2026-09-18, po `0bc75e4`)

Osm nálezů (dva popisují totéž), všechny sedí, všechny opravené. Poprvé v téhle sérii nepřibyla
žádná chyba v pravidlech ani v enginu — všechno se točí kolem toho, co bylo bez testu.

| Závažnost | Nález | Oprava |
|---|---|---|
| high | `persist-credentials: false` nestačí. Token s `contents: write` byl pořád na runneru, kde běží `npm ci`, instalace prohlížečů a `make all`; postinstall skript si může podstrčit vlastní `gh` a přidat si adresář do `$GITHUB_PATH` — a poslední krok pak zavolá jeho | **Dva joby.** `overit` s `contents: read` staví a vyrábí text vydání, `vydat` s `contents: write` na čistém runneru jen spustí `gh` z image (žádný checkout, žádné závislosti). Text si předají artefaktem |
| high ×2 | `persist-credentials: false` samo bylo bez negativní kontroly: strážce workflow četl jen těla `run:`, a checkout žádné nemá. Guard, který tiše přeskočí krok — přesně to, před čím varuje jeho vlastní komentář | Strážce prochází i `uses:` a `with:`. Hlídá dvě pravidla: každý checkout musí mít `persist-credentials: false`, a job s `contents: write` nesmí stahovat repozitář ani spouštět `npm`/`make`/`node`. Fixtury na obojí, plus kontrola, že se v repozitáři nějaký checkout vůbec našel |
| medium | Migrace savu z v2 byla nechráněné čtení-uprav-zapiš nad sdíleným localStorage. Druhý panel mohl tentýž sav mezitím zmigrovat a rozehrát; první by mu konto i archiv vrátil o kus zpátky | Před zápisem se ověří, že pod klíčem leží pořád TÝŽ řetězec. Test podstrčí cizí zápis mezi obě čtení |
| low | Kontrola karet vynechávala krále — a král je jediná karta, která kreslí `mono` větev. Rozejití `mono()` nebo jeho napojení na generátor by prošlo | Králové v kontrole jsou, proti `suitArt(code, { mono: FIGURE_EMBLEM, detail: … })`. Paleta identity se přestěhovala do `suitArt.ts` jako `SUIT_IDENT`, takže ji generátor i test berou z jednoho místa (128 karet) |
| low ×2 | Rušení čekajícího „Momentíčku" bylo jediné místo v celém PR bez negativní kontroly. Smoke ho nechytí: zrušená bublina by se vykreslila až po `MIN_BUBBLE_MS`, mimo okno, ve kterém se kouká | Logika fronty vytažena do `BubbleQueue` s podstrčitelnými hodinami a časovači. Pět případů: první hláška hned, druhá čeká, tah čekající zruší, NEzrušená se dokreslí, `clear()` nenechá doskočit nic z minulého zápasu |
| low | Potvrzovací zvuk po zapnutí zvuků stál na pořadí `unlock().then(play)` napsaném v obsluze tlačítka — odtud se to dá ověřit jedině podvrženou `unlock` | Pořadí se přestěhovalo do `sounds.playWhenUnlocked()`, kde ho drží tentýž test, co ověřuje odemykání (s podvrženým `AudioContext`, tedy prohlížečovým API, ne naším kódem). Obsluha tlačítka je teď jeden řádek |

Negativní kontroly: smazané `persist-credentials`, joby zpátky do jednoho, zápis migrace naslepo,
rozbité `mono()`, změněná paleta indexu, vypnuté rušení čekající bubliny, `clear()` bez zastavení
časovačů, `playWhenUnlocked` zpátky na `unlock(); play()` — každá shodí právě svůj test.

**Poučení:** dvakrát po sobě vyšlo najevo, že kontrola nekouše, protože jí chyběl vzorek, na
kterém by MOHLA kousnout: strážce `GITHUB_OUTPUT` měl ve všech vzorcích i `${{ }}`, strážce
workflow zase neuměl číst nic než `run:`. Napsat test ke správné opravě nestačí — musí se zkusit
i ta špatná verze, jinak se neví, co test opravdu měří.

**A ještě jedno:** oprava, která je jen ŘÁDEK NA SPRÁVNÉM MÍSTĚ (pořadí `unlock().then(play)`
v obsluze tlačítka, zrušení fronty uvnitř privátní metody), se nedá otestovat, aniž by se
podstrčilo něco vlastního. Správná reakce není test odpustit, ale přesunout to pořadí do funkce,
která se zavolat dá — `playWhenUnlocked`, `BubbleQueue`. Test pak měří kód, ne atrapu.

## 39. „Vše za mnou" (2026-09-21)

Pocta originálu: ve FLEK!/RE! se hra, která je rozhodnutá, nedohrávala. Uživatel to popsal jako
„už mi zbývají v ruce jen trumfy, program to dohraje sám".

### Podmínka není „jen trumfy"

„Jen trumfy" ani nestačí (soupeř může držet vyšší trumf), ani není nutné (můžu držet nejvyšší
karty ve dvou barvách). Správná formulace: **vynáším a žádná karta, kterou může soupeř držet,
nepřebije žádnou moji.** Ptá se na to `beats()` z `tricks.ts`, ne vlastní kopie pravidla.

### Počítá se to z pohledu hráče, ne ze stavu

`claimPlan(v: PlayerView)`, nikdy `GameState`. Kdyby podmínka koukala do cizích rukou,
prozrazovala by je — **a to i tím, že se tlačítko neukáže**: „držím trumfového krále a nabídka
nepřišla" znamená „někdo drží eso". Je to přesně ta past, kterou u předávání slova ve flecích
prošla trumfová sedma (§35–§36).

Talon, který hráč nezná (obrana), se proto počítá konzervativně jako karty, které soupeř mít
**může**. Nabídka přijde méně často, nikdy ale špatně.

### Uhrát všechny štychy ≠ mít rozhodnuté vyúčtování

Tohle je důvod, proč se výsledek **nepočítá napřímo**, ale zbytek se doopravdy dohraje:

- Obrana smí hlásit hlášky i u karty, kterou jen odhazuje (ČSM čl. III/3 — „v okamžiku, kdy tuto
  kartu odehrává", žádná podmínka výnosu; viz i zamítnutý nález i2 výš). Jestli nějakou drží,
  se z pohledu hráče zjistit nedá.
- Tichá sedma se platí (`scoring.ts`), a `legalActions` ji na rozdíl od hlášené **nehlídá** —
  kdo ji vynese první, přijde o ni.
- Vlastní hlášky se musí ohlásit.

Plán tedy jen řadí vlastní ruku (sedma nakonec, hlásit, co jde) a UI pak posílá karty jednu po
druhé; AI odpovídá jako vždycky a hlásí si své hlášky. Vyúčtování vyjde stejně jako při ručním
dohrání, protože to ručním dohráním je — jen bez klikání.

### Tlačítko, ne automatika

Rozhodnuto uživatelem: originál to dělal sám, tady je to **tlačítko**. Hra se nemá rozjet bez
vyzvání. `claimRest()` v controlleru pak posílá karty po 260 ms (ne hned — hráč si zvolil, že to
za něj dohraje, ne že to zmizí) a při každé kartě si nabídku ověří znovu; kdyby stav uhnul, prostě
se zastaví a zbytek doklikne člověk.

### Jak často to přijde

Měřeno skutečnou AI, 120 rozdání na variantu: **volený 9 %, licitovaný 29 %** rozdání (to je
libovolné sedadlo; pro člověka zhruba třetina z toho), průměrně ušetří 2,5–2,9 karet. V licitovaném
to tedy stojí za to, ve voleném je to spíš třešnička.

### Testy

- **Optimalita, ne jen legalita.** Ve 24 přirozených případech se vyúčtování podle plánu porovná
  se **všemi ostatními pořadími** vlastní ruky; žádné nesmí vydělat víc. A hráč musí po celou dobu
  držet výnos (`alwaysLed`) — to je přesně to, co nabídka slibuje.
- **Tichá sedma a nehlášená hláška se staví ručně.** V 1000 rozdáních nepadl ani jeden případ, kdy
  by hráč mohl říct „vše za mnou" a držel přitom NEhlášenou trumfovou sedmu — kdo má tolik trumfů,
  ten ji ohlásí, a hlášenou hlídá `legalActions`. Totéž u hlášek. Čekat na ně by znamenalo test,
  který tiše neměří nic (v přirozených případech je počítadlo `mattered` nula), takže oba stavy
  jsou postavené natvrdo: hráč drží všechny zbylé trumfy, zbytek balíčku leží v odehraných
  štychách. Bez ohlášení trumfové hlášky se ta hra prohraje (8 vs 0).
- **AI v testu jede na `iterations`, ne na `budgetMs`.** Časový rozpočet dá na každém stroji jiný
  počet iterací, takže by test sbíral jiné případy a jednou za čas probliknul. (Chyceno až tím, že
  dva běhy po sobě daly jiné počty.)
- Smoke: seedovaný sav (licitovaný, seed 5), tlačítko se ukáže a čtyři karty se dohrají bez
  dalšího kliknutí.

Negativní kontroly: sedma na začátku plánu, vypnuté hlášení, podmínka ignorující cizí trumfy,
`claimRest()` bez efektu, skryté tlačítko — každá shodí právě svůj test.

### Co se NEUDĚLALO

- **„Nic za mnou"** (betlový protějšek — aktér prokazatelně neuhraje žádný štych). Odloženo:
  v betlu aktér nevynáší, takže důkaz musí řešit i vynucené přebití, a je to podstatně těžší než
  „vynáším a nikdo mě nepřebije". Že to originál uměl, navíc nevíme — `docs/original-notes.md`
  o tom mlčí a stojí jen na videu. Patří to k ověření v DOSBoxu (§7 bod 4), kde stojí za to
  zapsat i to, jestli originál nechává tichou sedmu na poslední štych. *(Doplněno v §43 —
  na přání uživatele, i bez ověření originálu.)*
- **Kontrola proti všem možným rozložením cizích karet.** Zkoušel jsem nabídku ověřovat i proti
  determinizacím (rozdat neviděné karty jinak a ověřit, že štychy pořád sedí). Je to silnější
  tvrzení než „platí na tomhle rozdání", jenže se mi ji nepodařilo přimět kousnout — každá chyba,
  kterou jsem do podmínky vnesl, spadla dřív na skutečném rozdání, a u chyby, proti které je ta
  kontrola postavená (únik znalosti talonu), nechytila nic ani ona. Kontrolu bez negativní kontroly
  jsem radši nenechal: budí dojem, že hlídá i to, co nehlídá.

### Fixpoint review PR #11, první kolo (2026-09-22, po `b639e68`)

Devět nálezů, všechny sedí, všechny opravené. Jeden z nich je chyba v kódu, zbytek díry v testech —
a dvě z nich přesně toho druhu, který si tenhle dokument vyčítá jinde.

| Závažnost | Nález | Oprava |
|---|---|---|
| high ×2 | **Nic netvrdilo, že `claimPlan` někdy vrátí `null`.** Konzervativní počítání neznámého talonu je ta hlavní pojistka proti úniku, a nešla odlišit od podmínky, která kouká, kam nemá: přirozená smyčka se dívá jen na sedadla, kde nabídka UŽ padla, a `alwaysLed` projde i u nabídky navíc, protože talonové karty stejně nikdo nezahraje | Případ (F): přebíječ v neznámém talonu → `null`; tentýž v ruce soupeře → `null`; a když hráč talon sám odložil → nabídka **musí** přijít (jinak by (i) procházelo i s funkcí, co vrací pořád `null`) |
| medium | **Chyba, ne jen test.** `possibleOpponentCards` odečítalo `v.talonKnown`, jenže to není „co leží mimo hru" — je to „co kdy které sedadlo v talonu vidělo", a při převzetí ve voleném si nový aktér talon VEZME DO RUKY, zatímco původnímu tazateli znalost zůstane. Ten by si pak vyškrtl karty, které soupeř drží | Odečítá se `v.talon` (nenulový přesně pro aktuálního držitele). Pro aktéra je to tentýž soubor, pro tazatele po převzetí se to vrátí ke konzervativnímu počítání. Pojistka (F-iv) to drží. **Dosažitelné to nebylo** — po převzetí se hraje betl nebo durch a obránce se v durchu na výnos nedostane (aktér vynáší a hra končí jeho první ztrátou) —, ale smysl funkce to spravuje |
| medium | Pojistky controlleru nemělo nic pokryté: smoke klikne a čeká na zúčtování, to je šťastná cesta. `claimDelayMs` přitom vzniklo právě pro test a nikdo ho nepoužíval | Tři kontroly se synchronním driverem: doprostřed štychu se nabídka odmítne, na výnosu se zahraje **přesně plán a ani karta navíc**, a po zúčtování příznak zhasne |
| medium | Strážce `if (mode === 'betl') return null` nikdy nic netvrdilo — a podmínka sama je na módu nezávislá, `beats()` odpoví „nikdo mě nepřebije" i betlovému aktérovi | Případ (G): v betlu `null`, a `shouldAnnounce` mimo barevnou hru `false` |
| low | Durch je podporovaný mód s JINOU cestou kódem (bez trumfu se přeskočí větev se sedmou, řadí se přirozeným pořadím), ale jestli ho přirozená smyčka potká, byla věc náhody | Případ (H): durch natvrdo, včetně porovnání se všemi pořadími |
| low | Smoke čeká pevných 20 s, ale `claimSave()` bral plán `>= 3` bez horní meze a pouští živou AI — jedna změna heuristiky a scénář se překlopí na šest karet, smoke spadne hláškou „nedohrálo", i když by to jen ještě hrálo | Mez `<= 4` a do savu se seedí `difficulty: 'easy'` (`playPolicy` bez hledání) |
| low | `isClaiming` byl nový veřejný getter bez jediného čtenáře, a jeho komentář sliboval zkracování animací, které nikde není | Komentář opraven (žádný slib navíc) a getter používají kontroly controlleru |
| low | Rozpočet 24 případů byl SDÍLENÝ oběma variantami, volený jde první — kdyby ho sám vyčerpal, licitovaný by se nespustil vůbec a `cases >= 8` by pořád prošlo | Rozpočet na každou variantu zvlášť, minimum se vyžaduje u obou, a hláška je vypisuje odděleně |

Při tom vypadla i jedna věc navíc: pojistka „nové rozdání zhasíná dohrávku" v `dispatch` byla
**nedosažitelná** — `playClaimed` příznak zhasne, jakmile fáze není `tricks`, a rozdávat jde jen
z `idle`/`scored`. Nedosažitelnou pojistku nejde otestovat, tak je pryč.

Negativní kontroly: vrácené `talonKnown`, smazaný betl guard, `shouldAnnounce` mimo barevnou hru,
prázdná množina možných karet soupeře, `claimRest()` bez kontroly nabídky — každá shodí právě svůj
test.

**Poučení:** u nové funkce jsem otestoval, že dělá, co má, ale ne že to **odmítne**, když nemá.
Celá bezpečnost „vše za mnou" stojí na tom, kdy nabídka NEPŘIJDE, a přesně to nešlo odlišit od
funkce, která si vidí do cizích karet. Pozitivní případ je vždycky ten první, co člověka napadne;
ten negativní je ten, co drží slib.

## 40. Licitační žebřík místo devíti pilulek (2026-09-22)

Plná nabídka v licitovaném má devět možností a do teď to bylo devět stejných tlačítek s plným
textem v jedné řadě: „Dobrá (pas) · Sedma · Sedma ♥ · Sto · Sto a sedma · Sto ♥ · Sto a sedma ♥ ·
Betl · Durch". Uživatel to poslal se slovy „tohle se nedá". Právem: nic nenapovídalo, co je vyšší,
„Sedma" a „Sedma ♥" se lišily jedním znakem na konci, a řada zabrala celou šířku sukna.

### Co se změnilo

**Čísla místo slov.** Závazek se ukazuje jako krátký box — `7`, `100`, `100+7` —, jak to dělal
FLEK! („100 ♞", „BETL"). Plný název zůstává v `title`.

**Červená se pozná barvou, ne dalším slovem.** Dvojnásobná sazba je vidět na první pohled
(červený text, světle červené pozadí, srdce), místo aby se lišila příponou.

**Rodiny slepené k sobě.** Sedma (1–2), sto (3–6), betl (7), durch (8) — rodiny jdou přesně
v pořadí žebříčku `bidRank`, takže seskupení neodporuje tomu, co je vyšší, a čte se to zleva
doprava jako „čím dál výš". Uvnitř skupiny dlaždice sousedí, dělí je vlasová linka.

**Betl a durch jsou jiný svět.** Bezbarvé závazky, kde se nehraje na body — tmavá dlaždice
a verzálky, opět po vzoru boxu „BETL" z originálu.

Řada se tím zúžila zhruba na polovinu a ve všech čtyřech jazycích se vejde na jeden řádek
(dřív se angličtina a němčina zalomily na dva).

### Pozor: jedna kontrola tím ztratila zuby

Smoke z §37 hlídá, že nabídka nepřekrývá jmenovku hráče ani pakl. Její negativní kontrola —
zrušit `margin-bottom` u `#actions` — **po téhle změně neshodí nic**: řada je teď tak malá, že
na jmenovku nedosáhne, ani když pruh zmizí. Kontrola sice pořád tvrdí správnou věc, ale to, co ji
drží, už není pruh.

Přibylo proto tvrzení, které měří přímo to, oč v redesignu jde: **nabídka se musí vejít na jeden
řádek** ve všech čtyřech jazycích. To zuby má — když se dlaždice zase roztáhnou, řada se zalomí
na tři řádky a smoke to řekne. Pruh z §37 zůstává, protože platí pro všechny fáze (fleky mají
popisky pořád dlouhé), ale pro licitaci je od téhle chvíle jen pojistka navíc.

## 41. Testy na každém pull requestu (2026-09-23)

Do teď běželo `make all` v CI jen při vydání (`release.yml` na tag `v*`), takže rozbitý PR se
poznal až na tagu. Nový `.github/workflows/ci.yml` pouští na každý PR do `main` totéž, co job
`overit` ve vydání: `npm ci`, prohlížeče Chromium a WebKit, `make all` s `SMOKE_RESTART_MS=9000`.
Jen bez kontroly verze a textu vydání — tag na PR ještě není.

**Spouštěč je `pull_request`, ne `pull_request_target`.** Ten druhý běží v kontextu cílového
repozitáře, s tokenem, který smí zapisovat, a se secrets. Jakmile si stáhne kód z PR, spouští ho
z forku kdokoli, a tady by to znamenalo i postinstall skripty celého `npm ci`. Job má jen
`contents: read` a checkout s `persist-credentials: false` (hlídá to kontrola stavby jobu
z šestého kola review PR #10 u §38, doplněná v kole níž o job bez `permissions:`). Nový push do téhož PR zruší rozběhnutý starší běh (`concurrency`).

Strážce workflow ve `verify.ts` přečte i `on:` — všechny tři zápisy (řetězec, seznam, mapa) — a
`pull_request_target` v žádném workflow nepustí. Aby nebyl strážcem, který tiše nic nehlídá,
tvrdí zároveň, že aspoň jeden workflow na `pull_request` běží: kdyby parser přestal `on:` číst,
spadne to tam.

Negativní kontroly: `pull_request_target` místo `pull_request` v `ci.yml` shodí první tvrzení,
`push` místo `pull_request` shodí druhé.

Nasazení na web (`make deploy`, §7 bod 8) zůstává ruční; vydání tagem web nemění.

### Fixpoint review PR #14, první kolo (2026-09-23, po `73b3ede`)

Tři otevřené nálezy, všechny sedí, všechny opravené. Dva z nich jsou přesně ta díra, kterou si
tenhle dokument vyčítá: kontrola, kterou jsem shodil ručně na skutečném souboru, ale kterou žádný
test neudrží.

| Závažnost | Nález | Oprava |
|---|---|---|
| high | **Odmítnutí `pull_request_target` nemělo test.** Vzorky zkoušely jen `triggersOf`, samotné odmítnutí běželo až nad soubory v repozitáři — a ty žádný zakázaný spouštěč nemají. Smazaná nebo obrácená kontrola by prošla zeleně. Moje negativní kontrola (přepsat `ci.yml`) to dokázala jednou, ale nic to nedrží | Odmítnutí je funkce `triggerComplaints` a má vzorky: řetězec, seznam i mapa s `pull_request_target` musí stěžovat, `pull_request` vedle `push` ne. Přibyl i `workflow_run` (nález téhož kola, low): běží po jiném workflow s právy cílového repozitáře a typicky si stáhne artefakt z kódu PR |
| medium | **Job bez `permissions:` strážce pustil.** `contentsOf` vracel `null` pro chybějící blok i pro `permissions: {}`, a `jobComplaints` vadil jen `write`. Smazat oba bloky v `ci.yml` nechalo `verify` zelené — a job by pak `npm ci` a `make all` pouštěl s výchozím tokenem repozitáře, který smí podle nastavení i zapisovat. §41 přitom tvrdil, že to hlídá | Chybějící blok (`null`) a prázdný blok (`none`) jsou teď dvě různé věci, jak je rozlišuje GitHub. Job, který spouští kód projektu (checkout nebo `npm`/`make`/`node`), musí mít právo napsané. Vzorky: bez bloku stížnost, jen `gh` bez stížnosti, `permissions: {}` nahoře i u jobu (i proti `write-all`) jako `none` |
| medium | **PR přesměrovaný na `main` se netestoval.** Výchozí typy `pull_request` jsou jen `opened`/`synchronize`/`reopened`; PR založený proti jiné větvi a pak přesměrovaný pošle `edited`, a filtr `branches: [main]` ho předtím nepustil | `types` včetně `edited`, job má `if:` na změnu cílové větve. Běh `edited` bez změny větve (přepsaný název, popis) jde do **vlastní** skupiny `concurrency` — jinak by zrušil rozběhnutý test a sám nic nespustil. Testem to podchytit nejde (je to chování GitHubu, ne kód), ověřeno úpravou popisu PR během běhu |

Zamítnuto soudcem panelu, a souhlasím:
- **Šest hodin na runneru bez `timeout-minutes`** — spekulativní: fork od nového přispěvatele
  potřebuje schválení správce, veřejné runnery nic nestojí a `overit` ve vydání timeout nemá taky.
- **`true:` místo `on:` (YAML 1.1) obejde zákaz** — to není překlep, před kterým strážce chrání, ale
  úmyslné obejití od někoho s právem pushnout do main; a jestli GitHub `true:` čte jako `on:`, nikdo
  neověřil.
- **`prWorkflows > 0` neověřuje, že testy existují** a **nehlídá `make all` ani `branches: [main]`** —
  tvrzení je napsané jako pojistka, že parser čte `on:`, a to dělá. Obsah `ci.yml` hlídá review.
- **Nic nedrží `ci.yml` v souladu s `overit` v `release.yml`** — zdvojení je záměrné a popsané
  v hlavičce `ci.yml`; porovnávat těla jobů by stálo víc, než kolik ta dva soubory vedle sebe riskují.

Negativní kontroly: odmítání spouštěčů vypnuté, kontrola chybějících práv vypnutá, `ci.yml` bez obou
bloků `permissions:`, prázdný blok zase jako chybějící, `workflow_run` v `ci.yml` — každá shodí právě
svůj test.

**Poučení:** ruční negativní kontrola na skutečném souboru dokáže, že kontrola kousne DNES. Že bude
kousat i zítra, drží jen vzorek v testu — u strážce, jehož soubory v repozitáři jsou čisté, dvojnásob:
nad nimi projde i strážce, který nic nedělá.

### Fixpoint review PR #14, druhé kolo (2026-09-23, po `84fac84`)

Dva běhy panelu nad tímtéž commitem, shodně: tři otevřené nálezy (jeden z nich hlášený třikrát),
všechny sedí, všechny opravené. Ten hlavní je **chyba mé opravy z prvního kola**.

| Závažnost | Nález | Oprava |
|---|---|---|
| high ×3 | **Přeskočený job se hlásí jako úspěch.** Oprava přesměrování z prvního kola pouštěla na každé `edited`, ale `overit` přes `if:` přeskočila, když se neměnila cílová větev. GitHub přeskočený job hlásí jako **Success, i u povinné kontroly**, a to na témže commitu a pod stejným jménem. Push → spadlý test → přepsaný název PR = zelený `overit`. A přepsaný název během běhu udělal PR zelený dřív, než test doběhl. Moje „ověřeno úpravou popisu PR během běhu" dokázalo jen to, že se běžící test nezrušil — ne co ten přeskočený běh na PR vyvěsil | `if:` i zvláštní skupina `concurrency` jsou pryč. `edited` pouští plný test v běžné skupině, takže úprava názvu starší běh zruší (vidět jako Cancelled, ne úspěch) a doběhne nový. Stojí to jeden běh navíc za přepsaný popis — úpravy PR jsou tu vzácné. Regresní test je obecný: **ve workflow na `pull_request` nesmí mít žádný job `if:`** (`skippableJobs`, vzorky s `if:` i bez, a `if:` na `push` projde). Ověřeno naživo: úprava popisu PR spustila plný test |
| high | **Jeden vzorek pro dvě detekce.** Kód projektu se pozná podle checkoutu, nebo podle `npm`/`make`/`node` v `run:`, a vzorek z prvního kola měl obojí — smazání kterékoli větve prošlo. Přesně ta chyba, kterou už jednou řešila tabulka u §38 | Vzorek na každou cestu zvlášť: jen checkout, jen `npm ci`, jen `node` nad staženým artefaktem |
| low | Jednořádkové `run: make` regex nezachytil: chtěl za příkazem mezeru, a skalár v YAML nemá ani konec řádku | `(\s|$)` a vzorek `run: make`. Oprava platí i pro kontrolu zapisujících jobů, která regex sdílí |

Zamítnuto soudcem, a souhlasím: `issue_comment` do zákazu (sám kód z PR nestáhne, a nic tu na něm
neběží), kontrola jen `contents` a ne ostatních práv (návrh z §38, žádný job o jiná práva nežádá),
detekce kódu projektu výčtem příkazů (každý výčet má tuhle mez), akce `uses:` třetích stran s výchozím
tokenem (jiná otázka důvěry), akce připnuté na tag místo SHA, přesnější text stížnosti a znovu
kontroly obsahu `ci.yml` (už zamítnuté v prvním kole).

Negativní kontroly: checkout zase ne jako kód projektu, `run:` zase ne jako kód projektu, regex zpět
na `\s`, kontrola `if:` vypnutá, `if:` z prvního kola zpátky v `ci.yml` — každá shodí právě svůj test.

**Poučení:** u workflow neověřuj jen to, co se stalo s během, ale co zůstalo viset na PR. „Nezrušilo
se to" a „nic se nezměnilo" jsou dvě různé věci, a oprava prvního kola prošla jen tou první.

## 42. Ruka se nepřeskládává skokem (2026-09-23)

Uživatel hlásil z licitovaného: „objeví se mi deset karet a najednou tam skočí další dvě a celá
ruka se posune". Stav byl správně, přechod ne. Po poslední nabídce se fáze přepne rovnou na odhoz,
`renderHand` překreslil vějíř z 10 na 12 karet v jediném snímku — a protože se tlačítka
recyklovala **podle pořadí**, dvě karty z talonu zařazené doprostřed znamenaly nový obrázek pro
každé tlačítko za nimi. Talon přitom během licitace na stole neleží, takže karty přišly odnikud.

**Co se změnilo:**
- **Ruka je klíčovaná kartou** (`syncKeyed`): karta si drží svůj prvek, i když se vějíř přeskládá.
  Ruby druhé pětice („z lidu") klíč nemají a recyklují se mezi sebou.
- **Dosavadní karty dojedou** (FLIP, 240 ms): poloha se změří před změnou a po ní a rozdíl se
  pustí k nule přes Web Animations. Polohu dělá flexbox a změnu layoutu CSS přechod sám nezanimuje.
- **Nové karty se zjeví** stejným rytmem jako při rozdávání: dvě z talonu, odkrytá druhá pětice
  i trumf, který se ze stolu vrací do ruky. Totéž u soupeře, když licitaci vyhraje on — dva ruby
  navíc se zjeví, místo aby naskočily.
- Platí to pro každou změnu ruky, takže i zahraná karta už vějíř nezavírá skokem. Rozdávání má
  svou animaci dál a `prefers-reduced-motion` dojíždění vypíná.

**Testy:** `verify` drží identitu prvků v `syncKeyed` (talon doprostřed, zahraná karta, přeřazení,
ruby se nepřevléknou za kartu). Smoke vezme sav z licitovaného (seed 514), dá durch a po snímcích
měří: v prvním snímku po změně nesmí žádná dosavadní karta skočit o víc než 3 px, obě karty
z talonu musí být ještě průhledné, a na konci musí karty doopravdy dojet a být vidět.

Negativní kontroly: `syncKeyed` bez klíčů (verify: „karta se převlékla"), dojíždění vypnuté (smoke:
„10 karet skočilo o 75 px"), zjevení vypnuté (smoke: „karty z talonu jsou hned vidět"). Zjevení rubů
u soupeře samostatný test nemá: potřeboval by vlastní sav, kde licitaci vyhraje AI.

## 43. „Nic za mnou" v betlu (2026-09-23)

Betlový protějšek „vše za mnou" (§39), odložený tam kvůli vynucenému přebití. Uživatel se ptal,
jestli se jednoduše ložený betl nemůže dohrát sám, když aktér drží karty, které nic nepřebijou.

### Podmínka

V betlu (bez trumfů) vezme štych jen nejvyšší karta vynesené barvy. Aktér ho proto nevezme, když:

1. **V každé barvě jsou všechny jeho karty nižší než všechny, které soupeři mohou mít.** Vynese-li
   soupeř, leží na stole vyšší karta, než aktér má, a přiznat může jen nižší; barvu nemá-li,
   odhodí cokoli. Obě množiny jen ubývají, takže to platí do konce hry. Neznámý talon se počítá
   jako karty soupeřů — podmínka je tím přísnější, nikdy slabší (stejné pravidlo jako v §39).
2. **V rozehraném štychu už leží karta, kterou nepřebije** — nebo barvu výnosu nemá. Bez toho
   by devítka proti vynesené sedmě musela přebít (povinnost přebíjet platí i v betlu) a třetí
   hráč nemusí mít čím.
3. **Na výnosu** (jen v prvním štychu — kdo vynáší později, předchozí štych vzal) vynese barvu,
   kterou soupeři **určitě** mají: kdo ji má, musí přiznat a přebít. „Určitě" jde říct jen se
   známým talonem, jinak by ta karta mohla ležet v něm. Neznámý talon na výnosu nabídku vylučuje.

Nabízí se jen aktérovi, počítá se z `PlayerView` a hlášky ani tichá sedma v betlu nejsou, takže
na pořadí zbytku nezáleží — aktér shazuje od nejvyšší.

### Plán na jeden tah

Na rozdíl od „vše za mnou" aktér nevynáší, ale přiznává barvu, a kterou kartu dá, záleží na
výnosu soupeře. `claimPlan` proto v betlu vrací kartu pro **tenhle** tah (a za ní zbytek ruky)
a controller ho přepočítává na každém tahu — to dělal už pro §39, takže se na něm nic neměnilo.
Nabídka se přijme i uprostřed štychu. Tlačítko má v betlu nápis „Nic za mnou".

### Testy

- `verify`: jednoduše ložený betl nabídku dostane už na výnosu (I); devítka proti vynesené sedmě
  ne, pod vyneseným králem ano (J); obránce ani na tahu a s nejnižšími kartami ne (K); na výnosu
  s neznámým talonem ne, se známým ano (L); neznámá nižší karta v talonu ji vylučuje (M).
  Náhodná rozdání: jakmile se nabídka objeví, **musí vydržet a betl musí být vyhraný** — u krátkých
  rukou proti všem tahům obrany (49 případů, 281 konců hry), u dlouhých proti náhodným. Controller
  přijme nabídku uprostřed štychu a dohraje ji k vyhranému betlu. Pomocník `mkBetl` hlídá, že je
  stavěný stav možný (kdo je na tahu, kolik kdo drží) — jeden z mých prvních scénářů možný nebyl.
- `smoke`: licitovaný seed 55 — tlačítko „Nic za mnou" uprostřed pátého štychu, dohrávka bez
  kliknutí k zúčtování a ze savu betl vyhraný.

Negativní kontroly: bez podmínky (1), bez (2), bez kontroly talonu na výnosu, bez kontroly aktéra,
betl vždy `null`, a v UI starý nápis — každá shodí právě svůj test.

**Co zůstává:** tlačítko stojí v liště akcí jako všechna ostatní, a protože se v betlu nabízí
uprostřed štychu, lehce zakrývá spodní rohy vynesených karet. U „vše za mnou" se to nestane
(nabízí se na prázdném stole). Jestli originál „nic za mnou" uměl, pořád nevíme.
## 44. Mobil (2026-09-23)

Na telefonu (390×844) byl stůl pruh přes 40 % displeje: rám držel poměr 1400/900 i na výšku, karta
spadla na spodní mez 46 px, a přesto dvanáct karet přeteklo přes kraje. Řádek se stavem se mezi
jmenovkami soupeřů lámal do kulaté bubliny a „VOLENÝ (FLEK!)" vlezl do „rozdává" u Lojzy.

**Stůl přes celou výšku.** Na malé obrazovce (do 640 px šířky nebo do 500 px výšky) a v každé
orientaci na výšku (i tablet, i úzké okno na desktopu) se rám chová jako ve fullscreenu: vyplní
výšku okna a poměr stran se zruší. Lišta pod stolem je na jeden řádek. Na šířku to víc nepotřebuje
— desktopová sazba z výšky sukna (§30) tam funguje.

**Na výšku rozhoduje šířka:**
- Řádek se stavem jde pod soupeře přes celou šířku (`order`, `flex-basis: 100%`).
- `--card-w` (štych, ruby) se odvozuje i od šířky a ruka má vlastní `--hand-w`: šířka podle
  **počtu karet** (`--hand-n`, nastavuje `renderHand`), karty se překrývají víc (`--hand-overlap`).
  Dvanáct karet se vejde, s ubývající rukou karty rostou až po strop.
- Desktop pod ruby soupeře drží pevné místo pro pakl a vystavené hlášky — na výšku 70 px, které
  chyběly prostředku. Tady nic nerezervují, a přesto se nic neposune, až přibudou: pakl leží
  v mezeře pod ruby, hlášky (karty lícem) přes spodek rubů, bubliny soupeřů přes jejich ruby.
- Pruh akcí se zvedá nad blok „Ty" se závazkem (§37 platí i tady, jen s jinou výškou) a štych je
  ukotvený výš, protože ruka zabírá větší díl stolu.
- Písmo a odsazení herních tlačítek i dlaždic licitace se řídí i šířkou — podle výšky by rodina
  „sto" přerostla stůl. Dvojice polí „Protihráči" v nastavení se smí zúžit.
- Dekorační karty na úvodu mají šířku v jedné proměnné (`--deco-w`), odsazení na střed se z ní
  počítá, takže se na výšku dají zmenšit.

**Dotyk:** zvednutí karty je jen pod `@media (hover: hover)` — na dotykovém displeji by po ťuknutí
zůstalo viset. Tlačítka mají `touch-action: manipulation` (ťuknutí není dvojklik na zoom).

**Testy:** smoke „Mobil" — Chromium 390×844 a 360×640 a WebKit 390×844 (na iPhonu je to Safari),
tři savy: volba trumfu s dvanácti kartami, flekování, licitace. Stránka se neposouvá do strany,
stůl zabírá aspoň 85 % výšky, karty ruky i tlačítka leží uvnitř stolu, akce nejsou přes blok
„Ty", soupeři stojí v jedné řadě a řádek se stavem je až pod jejich ruby a jeho TEXT (`Range`,
ne box) nezasahuje do jmenovek.

Negativní kontroly: rám zpátky s poměrem („stůl zabírá jen 21 % výšky"), ruka bez `--hand-w`
(„6 karet přečnívá"), pruh akcí bez zvednutí („tlačítka leží přes blok Ty"), stav zpátky mezi
jmenovkami („soupeři nestojí v jedné řadě; stav není pod ruby"), dlaždice licitace bez úpravy
písma i odsazení („2 tlačítka přečnívají"). Dvě z nich napoprvé nekously: kontrola boxů neviděla
text přetékající z úzkého boxu a zalomení Lojzy na druhý řádek nic nepřekrylo — rozbité to bylo,
jen ne tak, jak se kontrola ptala. Teď se ptá na to, co rozložení slibuje. A samotné zmenšení písma
licitace se ukázalo zbytečné: přetečení drží už užší odsazení dlaždic.

**Co zůstává:** na malém telefonu (360×640) při licitaci žebřík překryje řádek se stavem
(„Licitace") — místa je tam 566 px a žebřík má čtyři řádky. Stav je v tu chvíli jen popisek,
nabídka sama je vidět celá.

### Fixpoint review PR #17, první kolo (2026-09-23, po `5027089`)

Verdikt APPROVE, sedm otevřených nálezů (3 medium, 4 low), všechny sedí, všechny opravené. Dva
z nich — chybějící běhy na šířku a na tabletu — hned po přidání našly tři skutečné chyby.

| Závažnost | Nález | Oprava |
|---|---|---|
| medium | `touch-action` měla jen `.action-btn` a jen v mobilním `@media` — dlaždice licitace a tablet na šířku ne | Pravidlo pro `.action-btn`, `.bid-chip` a `.ctl-btn` mimo `@media` |
| medium | Sehrávka na výšku (štych, pakl, bubliny) neměla test — savy byly jen volba trumfu, fleky a licitace | Sav ze sehrávky (třetí štych a dál, dvě karty na stole, soupeř má pakl): štych nesmí ležet přes ruku, akce ani blok „Ty", pakl uvnitř stolu a mimo řádek se stavem |
| medium | Telefon na šířku a tablet na výšku neměly test | Běhy 844×390 a 768×1024; kontroly jen pro výšku (stav pod ruby) se na šířce vynechají, výška stolu tam stačí 75 %. **Našly tři chyby:** na šířku žebřík licitace ležel přes blok „Ty" a štych dosedal na vějíř (blok jde do levého dolního rohu vedle vějíře, štych výš), na tabletu krajní karty ruky vyčnívaly o 7 px (rezerva na natočení vějíře 0,6 → 0,9 karty — vyklonění roste s kartou, okraj ne) |
| low | Panel zúčtování měl `min-width: 340px` a na 360 px ho stůl ořízl | `min(340px, 100%)` jako u nastavení; sav se zúčtováním v mobilním smoke |
| low | Bublina soupeře na pevném `top: 64px` sedala na jeho závazek | Ukotvená k rubům (`100% − 1,12 × card-w + 8px`) |
| low | Hlášky počítaly s kartou vysokou 0,7 × card-w — skutečně 0,89 — a přečnívaly na pakl | Posun o 0,9 × card-w |
| low | Kontrola „stav pod ruby" prošla naprázdno, když se ruby nenašly (`Math.max()` prázdného pole je −∞) | Vyžaduje dva řádky rubů |

Zamítnuto soudcem, a souhlasím: svislý obrys ruky (ruka schválně sahá pod hranu sukna), test na
hover (kosmetika, drahý postroj), „WebKit neemuluje iPhone" (šířka i `width=device-width` jsou tytéž),
růst karet s ubývající rukou (bez `--hand-n` padá na 12 a všechno se vejde), a kontrola akcí proti
řádku se stavem na 360×640 (to je přiznaný zbytek z „Co zůstává").

Negativní kontroly: panel zpátky na `min-width: 340px` (smoke: „panel zúčtování vyčnívá"); tři chyby
na šířku a na tabletu shodily nové běhy dřív, než byly opravené. Bez testu zůstávají hlášky a bubliny
na výšku: hláška potřebuje vystavený pár a bublina je přechodná.

## 45. Hlášení závazku jako žebřík (2026-09-23)

Uživatel chtěl volby při hlášení stejné jako licitační žebřík z §40. Hlášení (ve voleném po odhozu,
v licitovaném u vydražitele) mělo pořád dlouhá tlačítka „Hra ♦ + Sedma + Kilo" — ve voleném čtyři,
v licitovaném až čtrnáct (čtyři barvy a betl, durch), a ty se na stůl nevešly na jeden řádek.

**Co se změnilo.** Každá trumfová barva je jedna skupina slepených dlaždic: **ikona barvy** (prostá
hra) · `7` · `100` · `100+7` — tytéž glyfy a totéž pořadí jako v licitaci. Červená skupina se zbarví
jako červené nabídky (platí dvojnásob), betl a durch jsou samostatné tmavé dlaždice na konci. Plný
název je v `title`.

**Proč prostá hra nemá slovo.** „Hra" by se v angličtině a němčině natáhlo na „Game"/„Spiel" a čtyři
skupiny by se na stole 1400 px zalomily na dva řádky (ověřeno smoke). Glyfy žebříku mají být
nezávislé na jazyce, a barva sama na dlaždici říká „hra v téhle barvě" — jako boxy „100 ♞" ve FLEK!.
Když prostá hra v nabídce není (vysoutěžené sto), nese ikonu první dlaždice skupiny.

**Kód.** Rozvržení je čistá funkce (`declareChips`, pro licitaci `bidChips`) a vykreslení obou
žebříků sdílí `renderLadder` — licitace se tím jen přestěhovala, nezměnila.

**Cestou opravené:** u červené nabídky v licitaci byl v `title` surový `<svg …>` (`bidLabel` vrací
HTML s ikonou). `title` je teď čistý text („Sto (červené)").

**Testy:** `verify` — pořadí a skupiny po barvách, ikona na prosté hře i na první dlaždici skupiny
bez ní, červená skupina, betl a durch samostatně, `title` bez HTML v obou žebřících. Smoke kontrola
„na jednom řádku ve všech čtyřech jazycích a mimo jmenovku a hromádku" z §40 běží teď i nad
hlášením se čtrnácti volbami (licitovaný seed 1).

Negativní kontroly: `title` zpátky z `bidLabel` (verify: „Sto <svg …" — přesně ta původní chyba),
prostá hra bez ikony (verify), stará dlouhá tlačítka hlášení (smoke: cs na dva řádky, en na tři).

## 46. Celá obrazovka na telefonu (2026-09-24)

Uživatel zkusil v0.0.14 na iPhonu na šířku: se záložkami a adresním řádkem Safari zbylo na hru
kolem 200 px a tlačítko celé obrazovky nic neudělalo. **Safari na iPhonu Fullscreen API pro stránku
nemá** — `document.fullscreenEnabled` je false, jde jen video — a CSS náhrada (`fs-fallback`) lišty
prohlížeče neschová. Jediná cesta k celé obrazovce je **web spuštěný z plochy**.

**Co se změnilo:**
- `public/manifest.json` (`display: fullscreen`, `start_url: /`), ikony 192 a 512 (i maskovatelná)
  a `apple-touch-icon` 180 — vyrábí je `scripts/assets.ts` z `favicon.svg`, podložené barvou rámu
  (iOS i Android si ikonu zaoblí samy a průhledné rohy by zčernaly). V hlavičce `apple-mobile-web-app-*`
  a `viewport-fit=cover`; stůl se od výřezu displeje a indikátoru domů drží přes
  `env(safe-area-inset-*)`. Manifest je `.json`, ne `.webmanifest`: S3 by příponě nepřiřadil typ.
- Tlačítko celé obrazovky na **dotykovém zařízení bez Fullscreen API** (iPhone) ukáže návod „Sdílet →
  Přidat na plochu" ve čtyřech jazycích, místo aby zapnulo CSS náhradu. Android a desktop dál
  používají Fullscreen API.
- **Spuštěno z plochy** (`navigator.standalone` nebo `display-mode`) tlačítko zmizí — celá obrazovka
  už je. Test tu našel skutečnou chybu: `.ctl-btn.icon { display: grid }` přebíjelo atribut
  `hidden`, tlačítko by zůstalo. Přibylo `.ctl-btn[hidden] { display: none }`.
- **Zúčtování na nízkém displeji** (uživatel hlásil): panel byl vyšší než stůl a k „Další hra" se
  nedalo dostat. Panely zúčtování a nastavení mají `max-height: 100%` a vlastní scroll — scrolluje
  panel, ne vrstva, protože vrstva `#center-float` má `pointer-events: none`.

**Testy (smoke):** manifest je platný JSON s `display: fullscreen` a každá ikona je PNG přesně té
velikosti, kterou slibuje; hlavička má manifest, `apple-touch-icon`, `apple-mobile-web-app-capable`
a `viewport-fit=cover`. Simulovaný iPhone (dotyk, `fullscreenEnabled` false) po klepnutí ukáže
návod a nezapne náhradu; se `navigator.standalone` je tlačítko skryté; na desktopu se návod
neukáže. Zúčtování 812×220 (Safari na šířku s lištami) a 360×640: po doscrollování panelu je
„Další hra" celá ve stole a bere klik (`elementFromPoint`); na 812×220 se navíc hlídá, že panel
opravdu scrolluje — jinak by se scroll neověřil.

Negativní kontroly: iPhone bez návodu, návod vždycky (shodí desktop), hlavička bez manifestu, panel
bez scrollu („Další hra není ani po doscrollování vidět"). Skryté tlačítko shodilo test samo, dřív
než bylo opravené.

**Co zůstává:** v Safari (ne z plochy) na šířku je hra na ~200 px pořád těsná — to je výška, kterou
Safari nechá, a obejít ji nejde. Web na plochu neověříme jinak než na skutečném telefonu.
