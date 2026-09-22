# Změny

Poznámky k vydání. Sekci pro daný tag z tohohle souboru vytáhne CI a použije ji
jako text releasu na GitHubu (`.github/workflows/release.yml`) — nadpis sekce se
stane názvem vydání. Nová verze = **přidat sekci sem** a až pak tagovat.

## v0.0.11 — sazebník originálu

Minulé vydání změřilo, kolik se v originálu za co platí. Teď se podle toho dá hrát.

### Co originál počítá jinak

Hra, sedma a sto stojí stejně jako v soutěžních pravidlech. **Betl, durch a dvě sedmy jsou ale
v originálu levnější** — 10×, 20× a 30× místo 15×, 30× a 40×. A prohrané sto se **zdvojnásobuje**
za každých deset bodů, místo aby se přičítalo lineárně.

Originál taky nezná **limit**: soutěžní pravidla stropují jedno rozdání na pětisetnásobek
základu, jenže v RE! se jedno rozdání vyrovnalo na šestnáctitisícinásobek. A **fleků** pustí
nejmíň devět tam, kde soutěžní licitovaný končí na botách.

### Jak si to zapnout

Přidej do adresy **`?sazby=flek`** — třeba `flek.saiko.cz/?sazby=flek`. Funguje to stejně jako
`?seed=`, a když se v parametru upíšeš, hra se prostě vrátí k soutěžnímu sazebníku místo aby
odmítla rozdat.

**V nastavení to zatím není.** Přepnout sazebník uprostřed zápasu znamená pohnout kontem
a zaslouží si to vlastní rozmyšlení, ne jen další přepínač.

### Co se nezměnilo

Výchozí sazebník zůstává soutěžní — kdo si nic nepřidá do adresy, hraje jako dosud.
A dvě sedmy zůstávají vypnuté, i když je originál umí: to už není otázka ceny, ale pravidel.

## v0.0.10 — originál změřen

**Samotná hra se v tomhle vydání nemění.** Mění se, co o originálu víme.

FLEK! a RE! od Pivoňka Software jsme doteď znali z videa a z pravidel. Teď běžely v DOSBoxu
a daly se pořádně změřit — rozdání po rozdání, vyúčtování po vyúčtování.

### Sazebník je jinde, než jsme mysleli

Základ je desetihaléř a běžné závazky odpovídají soutěžním pravidlům přesně: sedma je dvakrát
hra, sto čtyřikrát. Ale **betl, durch a dvě sedmy originál platí levněji** — 10×, 20× a 30×
místo 15×, 30× a 40×. U betlu a durchu jsou to dokonce sazby křížového mariáše, který se tady
vůbec nehraje.

### Odpovědi na staré otázky

- RE! opravdu umí **dvě sedmy**, včetně pomocné barvy („zelená trumf, žaludská pomocná").
- Kdo **přebírá hru**, bere si talon do ruky, odhodí znovu a pak smí hlásit jen betl nebo durch.
- **Fleků** pustí originál nejmíň devět; my se zastavíme na čtyřech.
- Do talonu smí trumf, ale **ne desítka** — na to hra odsekne „To nejde, ostrou do talonu!".
  V betlu desítku odložit můžeš.

### Kde jsme to trefili

Fleky na každou komponentu zvlášť, vyrovnání hry proti neflekované sedmě bez sehrávky,
i celý postup přebírání — to všechno tu vzniklo jen z pravidel, bez koukání na originál.
A sedí to.

Potvrdilo se i to, co slibovalo vydání v0.0.8: **rozhodnutou hru originál nedohrával.**
Betl i durch v něm padnou v okamžiku, kdy je o nich rozhodnuto, a hráči zůstane karta v ruce.

### Pocta

Všechno se měřilo na licencované kopii RE! **č. 40456, která patřila Josefu Saikovi** — otci,
kterému je Flek! věnován. Pivoňka na závěrečné obrazovce prosí hráče, ať mu píšou o situacích,
kdy program „urází kartiboha". Po třiceti letech je `docs/original-notes.md` ten dopis.

## v0.0.9 — čitelná licitace

Licitovaný mariáš umí nabídnout devět závazků najednou a do teď to bylo devět stejných tlačítek
s plným textem přes celou šířku stolu. Nedalo se z toho poznat, co je vyšší, a „Sedma" se lišila
od „Sedma ♥" jedním znakem na konci.

### Závazky jako boxy

Nabídka teď vypadá jako žebřík krátkých boxů — **7**, **100**, **100+7** —, jak je ukazoval
FLEK!. Plný název najdeš, když nad tlačítkem chvíli podržíš myš.

**Červená se pozná barvou.** Dvojnásobná sazba je červená a se srdcem, místo aby se lišila slovem
navíc na konci.

**Co patří k sobě, drží při sobě.** Sedmy jsou slepené dohromady, sta taky — a jdou přesně
v pořadí, v jakém se přehazují, takže se řada čte zleva doprava jako „čím dál výš".

**Betl a durch stojí stranou**, tmavě a verzálkami: jsou to hry bez trumfů, kde nejde o body,
ale o štychy.

Řada se tím zúžila zhruba na polovinu a vejde se na jeden řádek i v angličtině a němčině, kde se
dřív zalamovala na dva.

## v0.0.8 — vše za mnou

Pocta originálu: ve FLEK!/RE! se hra, která je rozhodnutá, nedohrávala. Teď ji nemusíš dohrávat
ani tady.

### Vše za mnou

Když už ti zbylé štychy nikdo nevezme, objeví se v sehrávce tlačítko **Vše za mnou** a zbytek se
dohraje za tebe. Nejčastěji to potkáš, když ti v ruce zůstanou samé trumfy a žádný vyšší už není
ve hře — ale platí to obecně: stačí, že vynášíš a na žádnou tvoji kartu nikdo nic nemá.

Není to odhad. Nabídka se počítá jen z toho, co vidíš ty sám: ze své ruky a z karet, které už
padly. Talon, do kterého jsi nekoukal, se počítá jako karty, které soupeř mít **může** — takže
nabídka přijde o něco méně často, zato nikdy neslíbí štych, který bys nedostal. A protože se
počítá z tvého pohledu, neprozrazuje ti nic o cizích kartách ani tím, že se neobjeví.

Hra se doopravdy dohraje, kartu po kartě — jen bez klikání. Obrana si tak pořád může hlásit své
hlášky a vyúčtování vyjde stejně, jako kdybys to doklikal sám. Tvoje karty přitom padají ve
správném pořadí: trumfová sedma zůstane na poslední štych (i tichá se platí) a hlášky se ohlásí.

V licitovaném to přijde skoro v každé třetí hře, ve voleném zhruba v každé desáté.

Betl zatím ne — tam se nevynáší a „neuhraju ani štych" se dokazuje podstatně hůř.

## v0.0.7 — nové znaky karet a flek na každý závazek zvlášť

Nová kresba listů, kulí, srdcí a žaludů podle vlastního návrhu — a oprava flekování, která se
počítá do peněz: na kombinovaný závazek se flekuje každá jeho část samostatně.

### Flek na každý závazek zvlášť

Pravidla to říkají jasně (čl. V/4): „U kombinovaných závazků lze flekovat každý z nich
samostatně." Hra to dřív nedodržela. Když obrana flekla hru a aktér řekl re, kolo skončilo —
druhý flek obrany, třeba na sedmu, zůstal bez odpovědi a sedma se vyúčtovala na dvojnásobek
místo čtyřnásobku. Kdo držel slovo, mluvil teď jen jednou.

Nově drží hráč slovo tak dlouho, dokud má co říct: „flek a sto proti" se dá vyslovit v jednom
tahu a na pořadí nezáleží. Vyúčtování tím sedí i u sedmy a sta v jedné hře.

### Nové znaky karet

Listy, kule, srdce a žaludy mají novou kresbu — plnobarevnou, s konturou, podle tradičního
vzoru. Moderní sada je z ní přegenerovaná ve všech čtyřech jazykových variantách (česká,
anglická, německá, francouzská), včetně es, figur a emblému na hrudi krále.

Rohový index zůstává u kulí zlatý a u žaludů hnědý, i když kresba je červená: kdyby index
kresbu následoval, byla by kulová sedma k nerozeznání od srdcové — a červená zdvojnásobuje sazby.

### Co se stane s rozehranou hrou

Konto, jméno i archiv odehraných her z v0.0.6 zůstávají. Ztratí se jediné: hra, která byla
uložená **přímo uprostřed komentování**. Slovo v flecích se totiž počítá jinak než dřív a zpětně
dopočítat, co by hráč řekl, kdyby se ho engine byl zeptal, nejde — taková hra se radši nenačte,
než aby se dohrála za špatné sazby.

### Drobnosti

Soupeřův odložený trumf se počítal dvakrát: měl ve vějíři o rub víc a při sehrávce mu jedna karta
nevysvětlitelně zmizela (potkalo to dvě hry ze tří). Nápověda a nastavení se zavírají navzájem
v obou směrech. Bublina „Momentíček…" už nezůstane viset nad hráčem, který mezitím zahrál. Po
zapnutí zvuku se ozve potvrzení. A řada tlačítek s plnou licitační nabídkou (devět tlačítek až po
Durcha) už nezakrývá jmenovku hráče ani jeho pakl — ověřeno ve všech čtyřech jazycích.

### Pod kapotou

Vydávací workflow nedosazuje text z tohohle souboru do shellu a nenechává zapisovací token
ležet po celou dobu běhu. Sav odmítne podvržený závazek, který by obešel minimum z licitace.

## v0.0.6 — převzetí podle pravidel a dvě review, která AI prohlédla do karet

Třetí kolo review pravidel proti dokumentům ČSM, tentokrát dvěma nezávislými recenzenty. Oba potvrdili to hlavní: **AI do cizích karet nevidí** — dostává jen redigovaný pohled, simulace uvnitř hledání běží nad tímtéž pohledem a seed hledání nemá se seedem rozdání nic společného. Zbytek jsou opravy toho, kde se engine od pravidel odchýlil.

### Obránce si napřed vezme talon

Podle Obecných pravidel VII/1 obránce, který nechce hrát barvu, „sebere odložený talon a následně po odhozu jiného talonu ohlásí Betl či Durch". Hra ho dřív nutila hlásit betl nebo durch naslepo a volbu mu zamkla. Teď má tlačítko **Beru talon**: zvedne ho, odhodí dvě karty a s dvanácti kartami v ruce si vybere. Po ohlášeném betlu se převzetí otevře znovu a zbývající dva hráči mohou přebrat durchem; durch jde rovnou do flekování. Aktér sám hlásí betl nebo durch dál rovnou, talon už odhodil. Vzdání se sebraným talonem platí aspoň betl, aby zvednutý talon nebyl levný únik.

### Mluví se ve směru hry od toho, kdo hlásil

Komentování závazku i odpovědi na převzetí začínaly vždy u forhonta. U aktéra-forhonta je to totéž, ale v licitovaném s aktérem-prostředním mluvil první forhont místo zadáka, a druhý mluvčí zná názor prvního. Teď jde kruh ve směru hry od toho, kdo hlásil (V/4, volený B/11).

### Strop fleků podle varianty

Licitovaná pravidla končí čtvrtým flekem, botami (čl. IV); hra dovolovala i kalhoty. Volený kalhoty drží, jeho text strop neuvádí. Nápověda to říká ve všech čtyřech jazycích. Obnovený zápas ze savu hraje další rozdání už podle aktuálních pravidel, ne podle těch z doby uložení.

### Drobnosti

Vyúčtování licitovaného betlu a durchu nechává talon rubem (čl. II/11). Tři komentáře v kódu tvrdící, že zvolená trumfová karta je veřejná, jsou přepsané — leží lícem dolů. Test úniku informací má nově přísný seznam povolených položek pohledu na každé úrovni včetně zúčtování a kontrolu, že prohození skrytých karet mezi soupeři pohled nezmění ani o bit. Každá oprava má regresní test ověřený negativní kontrolou.

## v0.0.5 — desítka v betlu, čitelný závazek a stůl, co se vejde do okna

Pět věcí, které vyplavaly při hraní. Čtyři z nich jsou o tom, že hra ukazovala něco jiného, než co se doopravdy dělo.

### Desítka klesá tam, kam patří

V betlu a durchu je desítka **nižší karta než spodek** (Obecná pravidla ČSM, čl. IV/6 a 7) — nahoru pod eso se posouvá jen ve hrách s trumfem (čl. II/1). Engine to tak počítal odjakživa, ale vějíř ne: desítka v něm ležela hned vedle esa, o dvě místa výš, než jak doopravdy brala. Ruka se teď skládá podle toho, co se hraje, a srovná se už při odhozu do talonu na vysoutěžený betl i po převzetí.

### Varování před odhozem mlčí, když nemá o čem mluvit

Kdo si vysoutěžil betl a odhazoval do talonu eso, dostal hlášku „s esem/desítkou v talonu lze hrát jen betl nebo durch" — tedy varování před něčím, co právě dělal schválně. Zákaz odkládat esa a desítky platí jen „u závazků s ustanovením trumfové barvy" (čl. IV/11) a hlášky se počítají jen tam, kde jde o body (čl. IV/1). V betlu a durchu proto varování nepřijde. Ve voleném se odhazuje ještě před deklarací, tam zůstává.

### „Barva?" je otázka, ne souhlas

Aktér se po odhozu ptá obrany, jestli smí hrát barevnou hru, a závazek hlásí až po odpovědi (čl. VII/1). Jenže otázka i souhlas jsou tatáž akce — a hra za otázku dosazovala hlášku ze sady souhlasů. Hráč, který se právě zeptal, si tak nad vlastní hlavou přečetl „Tak hraj, sakra". Teď u otázky zůstane „Barva?" a hlášky patří těm, kdo odpovídají.

### Vidíš, o čem rozhoduješ

Závazek soupeře visel v rohu pod jménem ve třinácti pixelech — a přitom je to jediné, podle čeho se člověk rozhoduje mezi „Dobrá" a flekem. **Po dobu flekování proto stojí velký uprostřed sukna** i se jménem aktéra; pak zmizí a platí zase destička u hráče, která je nově výrazně větší, se zlatým rámečkem a s ikonou barvy, která roste s písmem.

### Stůl se vejde do okna

S prohlížečem přes celou obrazovku (1440×900) utíkal spodek stolu pod dolní hranu a muselo se scrollovat: rám má pevný poměr 1400/900, takže v širokém okně rostl i do výšky, ale o výšku okna se nikdo nestaral. Teď se šířka počítá i z ní. Hlídá to smoke test přímo v tom okně, kde to selhávalo.

Zmizela taky horní záložka s odkazem na projekty — mariáš je samostatný projekt.

## v0.0.4 — pravidla podle ČSM (pořadí, sto, fleky, limit)

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

- Licitaci otevírá **zadák**, ne prostřední hráč (Čl. VII/3). README tvrdil ještě něco třetího. Draží přitom zadák s forhontem a prostřední hráč se zapojí teprve po prvním odstoupení, jak to článek popisuje.
- Vysoutěžený závazek je **minimum**, ne přesný předpis: po vylicitovaném betlu jde ohlásit durch, po nečerveném stu i červené.
- **Flekuje se po kolech**: v kole se vyjádří celá strana, otevřené je jen to, co protistrana flekovala v minulém kole, a fáze končí, jakmile jedna strana schválí. Kolo 0 patří obraně — aktér ke svému závazku nemluví.
- **Sedma/sto proti** jen ve voleném a jen v prvním kole; licitovaná pravidla je zakazují (čl. II/23).
- **Flekovaná hra se bez „re" nehraje** (volený B/19) — aktér ji rovnou platí obraně. Přepínač, ve voleném zapnutý.

### Ještě dvě pravidla, která se nehrají

- **Vyrovnané závazky** (Obecná pravidla čl. V/11): při závazku sedma, kdy obrana flekne jen hru, sedmu schválí a aktér flek nezvedne, se sehrávka nekoná — prohraná vyflekovaná hra a uhraná sedma se vyrovnají na nulu. Ve vyúčtování jsou obě komponenty vidět, ať je jasné, proč je výsledek nula.
- **Odhoz do talonu** už neomezuje vysoutěžený barevný závazek. Eso a desítka v talonu jsou renonc „vyjma betla a durcha" (čl. IV/11), a betl s durchem jdou ohlásit vždycky — kdo si eso odhodí, zavřel si barevnou hru a hraje bez trumfů. Dřív se takový odhoz v licitovaném vůbec nenabízel.

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
