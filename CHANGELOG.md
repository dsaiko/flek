# Změny

Poznámky k vydání. Sekci pro daný tag z tohohle souboru vytáhne CI a použije ji
jako text releasu na GitHubu (`.github/workflows/release.yml`) — nadpis sekce se
stane názvem vydání. Nová verze = **přidat sekci sem** a až pak tagovat.

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
