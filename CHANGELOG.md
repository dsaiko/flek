# Změny

Poznámky k vydání. Sekci pro daný tag z tohohle souboru vytáhne CI a použije ji
jako text releasu na GitHubu (`.github/workflows/release.yml`) — nadpis sekce se
stane názvem vydání. Nová verze = **přidat sekci sem** a až pak tagovat.

## Nevydáno — pravidla podle ČSM (pořadí, sto, fleky, limit)

Externí review prošlo engine proti pěti dokumentům ČSM. Devět nálezů bylo oprávněných; rozbor s citacemi článků je v [`docs/marias-design.md`](https://github.com/dsaiko/flek/blob/main/docs/marias-design.md) §25.

### AI opravdu nevidí do karet

Dvě díry, každá sama o sobě dost velká na to, aby tvrzení z README neplatilo:

- zvolená trumfová karta zmizela z `revealedTrump` (v0.0.3), ale zůstala ve **veřejné historii** — soupeř i worker ji tam našli;
- **seed AI** vznikal jako `derive(seedRozdání, číslo tahu)`. `derive` je invertibilní a druhý parametr worker zná, takže si ze svého seedu spočítal seed rozdání — a z něj celé zamíchání balíčku. Seed hledání se teď losuje nezávisle.

Obojí hlídá test, který prochází **celý** pohled každého sedadla přes 60 rozdání a porovnává každé pole s kartami, které to sedadlo znát nesmí.

### Pořadí „Barva?" a deklarace

Ve voleném se hra hlásila **před** otázkou „Barva?", takže obrana rozhodovala o převzetí, když už znala aktérovu sedmu a sto. Nově se po odhozu talonu ptá aktér („Barva?", nebo rovnou betl/durch), obrana odpoví, a **teprve pak** se hlásí závazek — jak to popisuje Čl. VII/1.

### Sto, tiché sto a limit

- **Tiché sto** se počítá ze **všech hlášek** (60 + 20 + 20 je sto, dřív to bylo nedohraných 80) a neplatí se jako samostatný závazek: **zdvojnásobuje vyflekovanou hru**. Přesně za 100 tedy 2, ne 3. Nad 100 náleží navíc sazba tichého sta za každých 10 bodů.
- **Limit** 500× (a 750×, když flekovali oba obránci) stropí výslednou sazbu za hru; ve vyúčtování se ukáže, proč se komponenty nesečtou.

### Licitace a flekování

- Licitaci otevírá **zadák**, ne prostřední hráč (Čl. VII/3). README tvrdil ještě něco třetího.
- Vysoutěžený závazek je **minimum**, ne přesný předpis: po vylicitovaném betlu jde ohlásit durch, po nečerveném stu i červené.
- **Flekuje se po kolech**: v kole se vyjádří celá strana, otevřené je jen to, co protistrana flekovala v minulém kole, a fáze končí, jakmile jedna strana schválí. Kolo 0 patří obraně — aktér ke svému závazku nemluví.
- **Sedma/sto proti** jen ve voleném a jen v prvním kole; licitovaná pravidla je zakazují (čl. II/23).
- **Flekovaná hra se bez „re" nehraje** (volený B/19) — aktér ji rovnou platí obraně. Přepínač, ve voleném zapnutý.

### Co vědomě neděláme

Nově je to napsané i v README: „dvě sedmy" a „omyl", ložené hry a jejich rozúčtování, turnajové prémiové body. Engine drží podmnožinu pravidel pro tříhráčovou hru o peníze.

**Pozor:** rozehraná hra z v0.0.3 se neobnoví — sazebník má nová pole a pravidla jiné pořadí, takže se sav zahazuje.

## v0.0.3 — odložená trumfová karta (a konec koukání do karet)

Zvolená trumfová karta konečně leží na stole, jak to dělal originál. Při čtení pravidel k tomu se ale našlo, že aplikace prozrazovala víc, než měla.

### Trumf leží stranou

Podle pravidel ČSM (Obecná pravidla, Čl. VII/1) forhont **zvolenou kartu odloží stranou lícem dolů**. Teď to tak i vypadá:

- karta leží vpravo na sukně od volby do začátku sehrávky, pak si ji aktér bere zpět do ruky,
- **vlastní** kartu vidíš lícem nahoru a ve vějíři v tu dobu není — leží na stole, ne v ruce,
- **soupeřova** leží rubem,
- v licitovaném se žádná karta nevynáší, takže místo ní leží destička s barvou; betl a durch trumf nemají.

Vyřešilo to i původní stížnost: při odhazování do talonu člověk kouká do karet a text nad stolem nevnímá.

### AI už nevidí do karet

`view()` posílal zvolenou kartu **všem sedadlům**, takže obránecká AI znala forhontovu přesnou kartu a stavěla z ní determinizaci. Kartu nově dostane jen ten, kdo ji volil. Barva trumfů veřejná zůstává — ta se hlásí. (Originál FLEK! byl dobově podezřelý přesně z tohohle; tady to byla chyba a je opravená.)

### Další pravidla, která se srovnala

- **Zvolená karta do talonu nesmí** — volený B/7 odkládá dvě karty „odděleně od zvolené karty". Dřív se nabízela. Jiné nehodnotové trumfy do talonu smějí (Obecná pravidla, Čl. IV/11).
- **„Z lidu"** odhalovalo otočenou kartu všem a překrývalo tlačítko, kterým se volí. Obojí opraveno.

### Drobnosti

Badge „Hra ⬥" u vlastního sedadla se přesunul pod jméno.

Vše podložené testy včetně negativních kontrol; rozbor s citacemi článků je v [`docs/marias-design.md`](https://github.com/dsaiko/flek/blob/main/docs/marias-design.md) §24.

Hrát: **https://flek.saiko.cz**

## v0.0.2 — design stolu, francouzština, vzdání hry

Druhá verze. Stůl dostal podobu podle mockupu, přibyla čtvrtá řeč a možnost hru vzdát.

- **Nový stůl** — sazba se počítá z výšky sukna (`container-type: size` + `cqh`), takže proporce drží v okně, ve fullscreenu i při jiném poměru stran. Nastavení se schovalo za ozubené kolo.
- **Francouzština** jako čtvrtý jazyk (vedle češtiny, angličtiny a němčiny), včetně vlastní sady karet.
- **Vzdání hry** — platí se celý stojící závazek, ne jen základní sazba.
- **Zvuky a hlášky u stolu.**
- **README** s reprodukovatelným snímkem úvodní obrazovky (`make capture`).
- Tři kola `fixpoint review-pr` uzavřena, 16 nálezů opraveno (sedm high). Zápis v [`docs/marias-design.md`](https://github.com/dsaiko/flek/blob/main/docs/marias-design.md) §21–§23.

Hrát: **https://flek.saiko.cz**

## v0.0.1 — první hratelná verze

Engine obou variant (volený i licitovaný) podle pravidel ČSM, AI (heuristiky + ISMCTS ve Web
Workeru), stůl s vlastní i historickou sadou karet, tři jazyky.
