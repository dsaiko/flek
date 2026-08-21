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
- **Sedma**: závazek vzít poslední štych trumfovou sedmou; **kilo (sto)**: závazek ≥100 bodů,
  výplata škáluje za každých 10 bodů nad/pod; **tiché** varianty za poloviční sazbu
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
- engine = **čistý reducer** `(stav, akce) → stav`, deterministický, bez vedlejších efektů
- hráči komunikují **jen serializovatelnými akcemi** (plain JSON)
- skryté informace řeší **projekce pohledu** `view(state, seat)` — přesně to, co by později
  posílal server vzdálenému klientovi
- replay = `history.reduce(apply, dealtState)` — základ pro rekonstrukci, ladění i budoucí síť

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
interface Contract { mode: GameMode; trump: Suit | null; sedma: boolean; kilo: boolean; declarer: Seat; }
type Seat = 0 | 1 | 2;
type FlekTarget = 'hra' | 'sedma' | 'kilo' | 'betl' | 'durch';

interface FlekState {
  levels: Partial<Record<FlekTarget, number>>;      // 0=nic, 1=flek, 2=re... multiplikátor = 2^level
  lastRaiser: Partial<Record<FlekTarget, Seat>>;    // zvyšovat smí jen druhá strana
  awaiting: Seat[];                                 // kdo se ještě musí vyjádřit
}
```

**GameState** — vše plain JSON (žádné třídy, Map, funkce) → bezpečné přes worker i budoucí síť:

```ts
interface GameState {
  variant: Variant;
  config: RulesConfig;               // sazby + house-rule přepínače (§5.3)
  dealer: Seat;
  hands: [Card[], Card[], Card[]];   // autoritativní; skrývá se přes view()
  talon: Card[];                     // aktuální 2 skryté karty (po odhozu)
  originalTalon: Card[];             // co aktér zvedl (pro view logiku)
  history: PlayerAction[];           // úplný log akcí (replay)
  ledger: [number, number, number];  // konto, zero-sum
  handNo: number;
  contract: Contract | null;
  phase: Phase;                      // discriminated union ↓
}

type Phase =
  | { name: 'choose-trump' }                                    // jen volený
  | { name: 'bidding'; bids: Bid[]; toAct: Seat; best: BidLevel | null }  // jen licitovaný
  | { name: 'discard-talon'; declarer: Seat }
  | { name: 'declare'; declarer: Seat }
  | { name: 'takeover'; toAct: Seat; standing: Contract }       // jen volený
  | { name: 'fleks'; fleks: FlekState }
  | { name: 'tricks'; trickNo: number; leader: Seat; toAct: Seat;
      trick: { seat: Seat; card: Card }[];
      won: [Card[], Card[], Card[]];
      marriages: { seat: Seat; suit: Suit }[] }
  | { name: 'scored'; result: HandResult };
```

**PlayerAction** union:

```ts
type PlayerAction =
  | { type: 'choose-trump'; seat: Seat; card: Card | 'from-people' }  // z ruky / z lidu
  | { type: 'bid'; seat: Seat; bid: BidLevel | 'pass' }               // licitovaný
  | { type: 'discard'; seat: Seat; cards: [Card, Card] }
  | { type: 'declare'; seat: Seat; mode: GameMode; sedma: boolean; kilo: boolean }
  | { type: 'takeover'; seat: Seat; claim: 'betl' | 'durch' | 'good' }
  | { type: 'flek'; seat: Seat; target: FlekTarget }
  | { type: 'good'; seat: Seat }
  | { type: 'play'; seat: Seat; card: Card; announceMarriage: boolean }
  | { type: 'ack-score'; seat: Seat };
```

Hláška je **explicitní flag na akci play** (hlásí se při zahrání K/svrška s partnerskou kartou
stále v ruce) — engine validuje nárok, ale nehlásí automaticky: je to rozhodnutí hráče
(taktika u kila) a je to multiplayer-poctivé.

**Projekce pohledu** (`rules/view.ts`):

```ts
interface PlayerView {
  seat: Seat;
  hand: Card[];
  handCounts: [number, number, number];
  talonKnown: Card[] | null;        // originalTalon jen pro toho, kdo ho zvedl
  contract; phase; ledger; dealer; config; ...
  publicHistory: PublicAction[];    // historie s redigovanými skrytými payloady
}
function view(state: GameState, seat: Seat): PlayerView;
```

Redakce: cizí ruce → jen počty; `discard` bez karet; karta „z lidu" po otočení veřejná;
zahrané karty a hlášky veřejné. **AI worker dostává výhradně `PlayerView`, nikdy `GameState`** —
fér hra je vynucená typem, ne dobrou vůlí.

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

### 5.3 Pravidla a scoring (`src/lib/rules/`)

- **`legalActions(state, seat)` = jediný zdroj pravdy legality.** `apply` validuje členstvím
  v `legalActions`, nikdy nederivuje pravidla podruhé → UI (aktivní tlačítka), AI (akční prostor)
  i validace se nemohou rozejít.
- Legalita ve štychu (`tricks.ts`): (1) urči aktuálně vítěznou kartu; (2) máš-li barvu výnosu,
  musíš ji ctít a přebít vítěznou kartu, pokud přebít lze a máš čím (po přebití trumfem už
  barvu jen ctíš); (3) bez barvy povinný trumf, vítězí-li trumf, povinnost přetrumfnout;
  (4) bez obojího cokoliv. Betl/durch: bod 2 s přirozeným pořadím, bez bodu 3.
- **Invarianty v `apply`** (levné, vždy zapnuté): konzervace všech 32 karet; velikosti rukou
  dle fáze; talon = 2 karty bez es/desítek; flek zvyšuje jen strana, která nezvyšovala naposled;
  hláška jen s partnerskou kartou v ruce; ledger zero-sum.

**Scoring** (`scoring.ts` + `sazby.ts`):

```ts
interface Sazby {
  hra: 1; sedma: 2; tichaSedma: 1; kilo: 4; ticheKilo: 2; betl: 10; durch: 20;  // dle ČSM
  kiloScaling: 'double' | 'linear';   // za každých 10 bodů nad/pod 100
  cervenyMultiplier: 2;               // jen barevné hry (hra/sedma/kilo)
  maxFlekLevel: number;               // 5 = kalhoty, 6 = kajzr
  talonForbidsTrump: boolean;         // house rules — defaulty dle originálu/ČSM
  talonOnTakeover: 'retake' | 'keep';
  countMarriagesIntoKilo: boolean;
}
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
- talon: aktér ho zná přesně; ostatní ho vzorkují z neviděných karet s omezením bez es/desítek —
  reálná informační asymetrie
- rejection sampling s omezeným počtem pokusů, fallback greedy most-constrained-first

**Vyhledávání:** single-tree ISMCTS — každá iterace: nová determinizace u kořene → sestup UCB1
omezený na akce legální v této determinizaci → expanze → playout levnou politikou → back-propagace
**finanční delty v jednotkách** (ne jen výhra/prohra — search tak přirozeně respektuje sazby,
fleky, sedmu i kilo). Budget ~1500 ms dle obtížnosti, práce po chuncích ~200 iterací s kontrolou
času a `cancel`. Seedovaný PRNG → reprodukovatelné pro testy.

**Worker protokol** (`worker/messages.ts`, typované discriminated uniony jako v tsp):

```ts
type ToWorker =
  | { type: 'configure'; difficulty: 'easy' | 'normal' | 'hard'; seed: number }
  | { type: 'think'; requestId: number; view: PlayerView; budgetMs: number }
  | { type: 'cancel'; requestId: number };

type FromWorker =
  | { type: 'progress'; requestId: number; stats: ThinkStats }
  | { type: 'move'; requestId: number; action: PlayerAction; stats: ThinkStats }
  | { type: 'error'; requestId: number; message: string };
```

Worker je **bezstavový** (vše potřebné nese `view`) → triviálně korektní, restartovatelný,
identický s budoucím server-side AI procesem. Jeden worker pro obě AI (myslí sekvenčně);
`requestId` řeší zrušení a opožděné odpovědi. I heuristická rozhodnutí jdou přes worker —
jedna cesta kódu.

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
  po komponentách, konto hráčů (localStorage)
- **Fullscreen** (Fullscreen API), responzivní vč. mobilu
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
3. **Historie mariáše** — 📚 K DOHLEDÁNÍ během fáze obsahu: původ (z německých her a francouzské
   *mariage* — odtud hláška K+svršek „svatba"), rozšíření v českých hospodách v 19. století,
   Český svaz mariáše, turnajová scéna; sepsat vlastní text s odkazy na zdroje
4. **Technická karta** — jak přepis funguje (engine, fér AI vs. původní „koukání do karet")

### 5.7 Zvuky

- Jemné zvukové efekty (vypnutelné v nastavení, pocta volbě „Zvuky" z originálu):
  **míchání**, **rozdávání**, položení karty, sebrání štychu, flek/re (důraz), výhra/prohra
- Zdroj: CC0 samply (freesound.org) nebo vlastní nahrávky skutečných karet; krátké, tiché,
  bez hudby; implementace Web Audio API, soubory v `public/sounds/`, licence zdokumentovat

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
1. **Revize tohoto dokumentu** ← průběžně; implementace enginu až po odsouhlasení
2. **Skeleton**: git init, Astro projekt, Makefile (+ Makefile.local, S3_BUCKET=flek.saiko.cz),
   Layout z mars, prázdná stránka, `make deploy-s3-dryrun`
3. **Engine**: cards → types → engine/legal/tricks → talon/fleks → obě aukce → scoring/sazby
   → view; průběžně `scripts/verify.ts`; pravidla čerpat z PDF ČSM
4. **Ověření originálu**: DOSBox (brew install dosbox-x), hrát FLEK!/RE!, zdokumentovat flow,
   sazby a žebříček licitace → `docs/original-notes.md`, doladit presety v `sazby.ts`
5. **AI**: heuristiky → determinizace → ISMCTS → worker; self-play testy
6. **UI**: SVG karty → stůl a interakce → animace → zúčtování/konto → nastavení → fullscreen → mobil
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
     v kořeni je zde v pořádku, na rozdíl od guardu v mars/tsp Makefile)
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

1. Přesný **žebříček licitace** v RE! (vč. červených variant) — ověřit proti PDF licitovaného
   mariáše a proti originálu v DOSBoxu; výše uvedený je předběžný
2. Defaulty house-rules (`talonForbidsTrump`, `talonOnTakeover`, `countMarriagesIntoKilo`,
   `maxFlekLevel` — kajzr ano/ne) — navrhnout podle chování originálu, vše zůstane konfigurovatelné
3. Jednotky konta: desetihaléře jako ČSM pravidla / Kč / abstraktní body?
4. ✅ Zvuky budou (§5.7 — míchání, rozdávání, karty; vypnutelné); rozhodnuto s uživatelem
5. Hlášky (§5.8): rozsah hospodské sady — jak drsná smí být?
6. ✅ Název: **„Flek!"** (titulek webu „Flek! · Mariáš"), GitHub repo **`flek`**,
   web **`flek.saiko.cz`** (vlastní subdoména, DNS v Route 53) — rozhodnuto s uživatelem
