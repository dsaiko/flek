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

Sazebník z křížového voleného (násobky základní sazby): **hra 1×, sedma 2×, sto 4×, betl 10×,
durch 20×, červené dvojnásob**; tichá sedma = polovina hlášené; tiché sto zvyšuje hodnotu
vyflekované hry 2× (neplatí při hlášených hrách sto, sto a sedm). Renonc paušál 1 = 10×,
paušál 2 = 50×, limit 500×/750×.

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

### 5.7 Zvuky

- Jemné zvukové efekty (vypnutelné v nastavení, pocta volbě „Zvuky" z originálu):
  **míchání**, **rozdávání**, položení karty, sebrání štychu, flek/re (důraz), výhra/prohra
- Zdroj: CC0 samply (freesound.org) nebo vlastní nahrávky skutečných karet; krátké, tiché,
  bez hudby; implementace Web Audio API, soubory v `public/sounds/`, licence zdokumentovat
- **Autoplay policy**: AudioContext se odemyká prvním uživatelským gestem (klik na „Rozdat")
  — do té doby se zvuky tiše zahazují, žádná chyba v konzoli

### 5.8 Mariášové hlášky (table talk)

AI hráči „mluví" — bubliny u hráče v příslušné situaci (volba, flek, mazání, zúčtování).
Dvě sady, přepínatelné v nastavení (výchozí **slušná**; „hospodská" = drsnější, pro pamětníky):

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
6. ✅ **UI — první hratelná verze**: stůl, interakce všech fází, bubliny (základ hlášek),
   zúčtování, nastavení (varianta/IQ/vzor), autosave+resume, fullscreen, Playwright smoke test.
   Zbývá: animace karet, zvuky (§5.7), plné hlášky (§5.8), mince/bank, klávesnice, mobil polish
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
- Forhont = hráč po rozdávajícím; všechna pořadí mluvení (takeover, fleky) začínají od forhonta
- Determinizátor nikdy nesmí dostat `GameState` — typově vynuceno (`PlayerView` only)

## 10. Otevřené otázky k revizi

1. ✅ **Žebříček licitace** ověřen proti PDF ČSM (soutěžní licitovaný mariáš, čl. I):
   sedma < sedma červená < sto < sto a sedma < sto červených < sto a sedma červených
   < betl < durch < dvě sedmy < dvě sedmy a sto < dvě sedmy červená < dvě sedmy červená a sto.
   Sazebník licitovaného (násobky hry): sedma 2×, sto 4×, **betl 15×, durch 30×, dvě sedmy 40×**,
   tichá sedma 1×, omyl 6× — jiné poměry než volený (betl 10×, durch 20×) ⇒ preset per varianta.
   Závazek **dvě sedmy** (trumfová 7 poslední + pomocná 7 předposlední štych) je v typech,
   v1 za config přepínačem `enableDveSedmy`. Chování originálu RE! stále ověřit v DOSBoxu.
2. Defaulty house-rules (`talonForbidsTrump`, `talonOnTakeover`,
   `maxFlekLevel` — kajzr ano/ne) — navrhnout podle chování originálu, vše zůstane konfigurovatelné
3. Jednotky konta: desetihaléře jako ČSM pravidla / Kč / abstraktní body?
4. ✅ Zvuky budou (§5.7 — míchání, rozdávání, karty; vypnutelné); rozhodnuto s uživatelem
5. Hlášky (§5.8): rozsah hospodské sady — jak drsná smí být?
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
