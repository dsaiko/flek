# FLEK! — poznámky k chování originálu

Zdroj: video **„Flek! gameplay (PC Game, 1992)"** (Squakenet, YouTube y5lUXgGqJW8, 6:37),
projito po snímcích 2026-08-21. Doplní se pozorováním v DOSBoxu.

## Organizace stolu

- **Jen vlastní ruka je vidět** (vějíř dole, mírně překryté karty). Protihráči nemají
  zobrazené ruce vůbec — existují jen skrze **barevné bubliny** (ovály) vlevo/vpravo nahoře.
- **Zvolená trumfová karta**: leží **lícem dolů** uprostřed nahoře, dokud se soupeři
  nevyjádří (Dobrá/Špatná); pak se **otočí uprostřed** (reveal).
- **Talon / odkládací místo vpravo nahoře** (oprava po diskusi s uživatelem):
  vpravo nahoře leží **odhozené karty rubem** (talon); po otočení trumfu na nich
  chvíli leží otočená trumfová karta; později místo překrývají další ruby
  (nejspíš štychy aktéra) — přesné chování ověřit v DOSBoxu.
  Bubliny „Poslouchám, pánové" se ukazují u tohoto místa (patří aktérovi).
- **Kontrakt badge**: bílý box „hra ♣" (se symbolem trumfové barvy) pod trumfovou kartou;
  betl jako červený box „BETL" uprostřed; kilo jako box „**100 ♞**".
- **Hlášky (20/40)**: malý bílý box „20" se objeví u zahrané karty.
- **Štych**: karty se pokládají lícem nahoru k hornímu okraji (pozice zhruba podle hráče);
  sebrané štychy tvoří **pakl rubem nahoru** (vpravo uprostřed / u hráče); na paklu
  protihráče jsou někdy vidět 1–2 líce navrchu.
- **Kurzor**: žlutá šipka nad vybranou kartou (klávesové ovládání).
- Rub karet: modrý paprskovitý vzor s monogramem **JP** (Jaroslav Pivoňka).

## Průběh hry (volený)

1. Intro „Pivoňka Software dává" — karty vějířovitě rozprostřené do spirály.
2. Volba trumfu (karta lícem dolů), bublina „**BARVA ?**".
3. Soupeři: bubliny „U mě dobrá" / dialog „**Co ty na to ?**" s tlačítky **Dobrá / Špatná**.
4. Převzetí: bublina „**Což takhle BETL ?**".
5. Flekování: dialog „**Dáš si větší ?**" [Ano / Ne]; bubliny „FLEK !", „Já jsem zticha",
   „Ještě jednou dokola", „A výš", „Tak se ukažte, pánové" (aktér zahajuje sehrávku).
6. Sehrávka: prompty „Hraj !", „Hraješ", „Je to na tobě", „Druhou"; nelegální tah
   vysvětlí bublina „**To bohužel nesmíš, co kule**" (říká i správnou barvu).
7. AI „přemýšlí": bublina „Momentíček...".
8. Konec hry: „Stiskni libovolnou klávesu" → **přehled štychů**: všechny štychy rozložené
   lícem nahoru v kaskádách (řádky po hráčích), talon otočený, u toho bodové boxy
   („70" / „20" — součty stran).
9. **Vyúčtování** (tyrkysový box):
   ```
   Vyúčtování:
   Prohrané kilo, 6x flek:    819.20 Kč
   Přišel jsi o              1638.40 Kč
   Máš nyní celkem          -1539.60 Kč
   ```
   + sarkastická bublina „Vykašli se na mariáš, dej se na politiku".

## Odvozený sazebník FLEK! (empiricky z vyúčtování)

`819.20 = 0.20 Kč × 4 (kilo) × 2^6 (6× flek) × 2^4 (kilo prohrané o 40 bodů — zdvojnásobování)`
`1638.40 = 2 × 819.20` (aktér platí oběma soupeřům)

- ~~**Základ 0,20 Kč**~~ — **NEPLATÍ**, změřeno 0,10 Kč v RE! i ve FLEK!.
  Tenhle řádek vznikl dopasováním rozkladu na jediné číslo; viz sekce o FLEK! níž.
- kilo = 4× hra ✓ (ČSM shodné)
- **Kilo se škáluje ZDVOJNÁSOBOVÁNÍM za každých 10 bodů** (ne lineárně jako soutěžní ČSM)
  → preset `SAZBY_FLEK` má mít `kiloScaling: 'double'`
- Platba aktéra oběma soupeřům odpovídá našemu `delta` modelu ✓
- Konto v Kč se dvěma desetinnými místy, může jít do minusu
- Fleky jdou nejméně do 2^6 (**kajzr!**) → FLEK! má `maxFlekLevel ≥ 6`

## Hlášky odpozorované z videa (materiál pro tableTalk.ts)

„BARVA ?" · „U mě dobrá" · „Co ty na to ?" · „Což takhle BETL ?" · „Já se točit nebudu" ·
„FLEK !" · „Já jsem zticha" · „Ještě jednou dokola" · „A výš" · „Dáš si větší ?" ·
„Tak se ukažte, pánové" · „Hraj !" · „Hraješ" · „Je to na tobě" · „Druhou" ·
„To bohužel nesmíš, co kule" · „Momentíček..." · „**U Bucků zhasli**" ·
„Vykašli se na mariáš, dej se na politiku" · „Pivoňka Software dává" ·
„Stiskni libovolnou klávesu"

## Nápady k převzetí (zatím neimplementovat — potvrzeno uživatelem „správný směr")

- otočení trumfové karty uprostřed stolu + badge hra/barva; talon jako viditelné odkládací místo
- boxy bodů („70"/„20") a box hlášky „20" u karty
- přehled štychů po konci hry (kaskády lícem nahoru + otočený talon)
- vyúčtovací box ve stylu FLEK! + sarkastické komentáře
- „Momentíček..." při přemýšlení AI
- vysvětlení nelegálního tahu („co kule")

## Pozorování v DOSBoxu — RE! 1.1 (2026-09-22)

Poznámky z běhu v dosbox-x. **Platí rozhodnutí uživatele: při rozporu s ČSM platí ČSM** —
tyhle zápisy tedy popisují originál, nejsou to úkoly na opravu enginu.

### Nastavení pod F10

Menu má položky **Zvuky · Barva · Vzor · Menu · Standard · IQ · Uložit**.
**Žádné přepínače pravidel tam nejsou** — jsou to nastavení zobrazení, zvuku a síly AI.
Defaulty house-rules (`talonForbidsTrump`, `talonOnTakeover`, `maxFlekLevel`) se tedy z menu
vyčíst nedají a musí se odvodit z pozorované hry.

- **„IQ" není obtížnost, ale ČAS NA ROZMYŠLENOU**: posuvník je popsaný `0 ... 5" ... 10" ... 20" ... 40"`,
  tedy vteřiny na tah. Výchozí hodnota je na maximu (40").
- „Standard" přepíná barevné schéma (náhled v panelu), není to varianta pravidel.
- Ovládání menu: šipky + Enter; **Esc zavírá jen na úrovni seznamu**, v posuvníku potvrzuje Enter.

### Licitační žebříček

Po souhlasu s licitací se ukazuje mřížka 6×2:

| levý sloupec | pravý sloupec |
|---|---|
| sedma   | lepší    |
| 100     | lepší    |
| 107     | lepších  |
| Betl    | Durch    |
| dvě 7   | lepší    |
| 100+2x7 | lepší    |

- **„dvě 7" originál RE! UMÍ** — tím je zodpovězena otevřená otázka z §10 bodu 1
  (u nás je závazek za přepínačem `enableDveSedmy`).
- **„lepší" = originálův výraz pro červenou** variantu závazku.
- Sto a sedma se píše **`107`**, sto a dvě sedmy jako **`100+2x7`**.
- Pozor na výklad: mřížka je 2D, takže z ní NEJDE spolehlivě přečíst pořadí žebříčku.
  Pravý sloupec vypadá jako modifikátor („lepší") k závazku vlevo, ne jako pokračování řady.
  Řádek „Betl | Durch" do toho vzorce nezapadá. Pořadí ověřit zvlášť.

### Licitace probíhá otázkami, ne výběrem ze žebříčku

Nejdřív přijde dialog `... sedma ?` s tlačítky **[Ano] [Ne]**, a teprve po „Ano" se otevře
mřížka závazků. Bubliny u stolu při tom: „Jsem docela zticha", „Sedma ?", „Čekám".
Odznak sedadla („Forhont") stojí uprostřed pod bublinami.

### Talon: co originál pustí a co ne (ověřeno, RE! 1.1, závazek `7 ♥`)

- **Desítku odložit NEJDE.** Kurzor na desítce + Enter = karta zůstane v ruce a ukáže se
  modrá bublina:

  > **„To nejde, ostrou do talonu!"**

  („Ostrá" = mariášnický výraz pro desetibodovou kartu, tedy eso nebo desítku.)
  Hláška je **přechodná** a ze snímku vypadne — zachycena až z videa (ověřeno dvakrát,
  u trumfové desítky ♥ i ♦). Poučení k metodě: spoléhat na nahrávku, ne na snímek.
- **Trumf odložit JDE.** Srdcový král při trumfu ♥ do talonu prošel bez protestu.
  → odpovídá našemu `talonForbidsTrump = false`.
- Ověřeno negativní kontrolou: hned po odmítnuté desítce prošel odhoz sousední karty, takže
  Enter se do hry doručoval a odmítnutí bylo skutečné, ne ztracená klávesa.

Postup odhozu: hláška **„Odlož talon"**, po první kartě **„Ještě jednu"**; odložené karty leží
lícem nahoru vpravo nahoře, pak se překlopí na hromádku rubem (modrý vzor s monogramem JP).

### Fleky

Flek se hlásí **po jednotlivých komponentách** — bublina zní **„Na hru"**, ne jen „Flek!".
To odpovídá našemu řešení z v0.0.7 (flek na každou komponentu zvlášť).
Ostatní hlášky v té fázi: **„Nemám, co bych dodal"** (pas), **„Co vy na to, vážení"**,
dialog **„Dáš si větší ?"** [Ano] [Ne].

### Volba trumfu a závazek

Po výběru závazku přijde **„Která bude trumfová"** a vybírá se karta z ruky šipkami.
Závazek se pak ukazuje jako bílý odznak se symbolem, např. **`7 ♥`**.
V licitovaném drží aktér 12 karet a dvě odkládá.

### „Jako by se hrálo" — originál taky vyrovnává bez sehrávky

Po fleku na hru proti **neflekované sedmě** se rozdání NEHRÁLO a rovnou přišlo vyúčtování
nadepsané **„Jako by se hrálo:"**:

```
Jako by se hrálo:

Hra                          0.20 Kč
Sedma                        0.20 Kč
Barva lásky je drahá:        0.00 Kč
        Nula od nuly pojde
Máš nyní celkem            100.00 Kč
```

Tvrdá data:
- **Počáteční konto = 100,00 Kč.**
- Hra i sedma stojí v tomhle rozpisu shodně 0,20 Kč a **vzájemně se vyrovnaly na nulu**.
- (Pozor: `Hra 0,20` zde NENÍ základ hry — hra už byla flekovaná. Rozbor níž, sekce „Sazebník".)
- Flavour: **„Barva lásky je drahá"** (srdce = láska, tj. řádek červeného násobku),
  **„Nula od nuly pojde"** u nulového výsledku.
- Po vyúčtování dialog **„Další hru ?"** [Ano] [Ne].

Výklad (PROZATÍMNÍ, stojí na jednom pozorování): odpovídá to ČSM V/11 — flek na hru proti
neflekované sedmě se vyrovná a nehraje, což u nás dělá `flekEnding()` v `legal.ts`.
Ověřit opakováním, a hlavně zjistit, jestli originál takhle vyrovnává i jiné kombinace.

### Flekovací dialog má tlačítko na každou komponentu

Obrana dostane dialog `...?` s tlačítky:

> **[OK] [Na hru] [Na 7] [Obojí]**

- **OK** = nechávám být (pas)
- **Na hru** / **Na 7** = flek na jednotlivou komponentu
- **Obojí** = flek na obě naráz

To je přímé potvrzení, že originál fleky drží **po komponentách**, ne jedním společným žebříčkem
— stejně jako naše řešení z v0.0.7 (`raisableFleks` v `legal.ts`).

Aktérova strana dostává jinou podobu téhož: dialog **„Dáš si větší ?"** [Ano] [Ne].

Flavour u sedmy v zelené: **„Sedma zelená, neposečená, slunce na ni svítí"** (rýmovačka).
Odznak závazku ukazuje barvu symbolem, např. `7 ♠` pro zelenou.

### Omezení metody: stav fleků z obrazovky přečíst NEJDE

Po volbě „Na 7" (v situaci, kdy aktér předtím zvýšil jen „Na hru") hra nabídku přijala,
soupeři odpověděli bublinami **„Nic"** a **„Jsem potichu"** a rozdání přešlo do sehrávky.

UPŘESNĚNO později: číst se to z obrazovky **dá**, jen ne z bublin — signál nese **sada tlačítek
v dialogu**. Když aktér zvýšil jen hru, dialog se zúžil z `[OK] [Na hru] [Na 7] [Obojí]`
na pouhé `[OK] [Na 7]`; jakmile soupeři zvýšili obojí, vrátil se celý. Sada tlačítek tedy
odpovídá tomu, co u nás počítá `raisableFleks`. Přesný počet fleků pak řekne až vyúčtování.

### Přechodné bubliny a jak je nepropást

Hlášky originálu jsou **přechodné** — mizí dřív, než stihne snímek (potvrzeno uživatelem
u odmítnuté desítky, viz výš). Pracovní postup, který funguje:

1. `Capture → Record video to AVI` na začátku běhu (vše se nahrává),
2. hrát,
3. nahrávání **vypnout** (jinak AVI nemá index a `ffprobe` hlásí `duration=N/A`),
4. kontaktní list `ffmpeg -sseof -<s> -i rec.avi -vf "crop=640:270:0:0,fps=1,scale=320:-1,tile=6x6"`,
   a pro detail totéž s `fps=10` na užším okně.

Tímhle se našly hlášky **„Nic"**, **„Jsem potichu"**, které by ze snímků vypadly.

### Vyúčtování č. 2 — doopravdy sehrané rozdání (sedma zelená, flekovaná)

```
Vyúčtování:

Hra, 2x flek:                0.40 Kč
Sedma, flek:                 0.40 Kč
Celkem:                      0.00 Kč
        Je to zadarmo
Máš nyní celkem            100.00 Kč
```

Nad rozloženými štychy svítily bodové boxy **`30+60=90`** a **`60`**.
Flavour u nulového výsledku tentokrát **„Je to zadarmo"** (minule „Nula od nuly pojde").

**Násobky zatím NEDÁVAJÍ jednoznačný výklad — nedomýšlet si.** Dva zápisy vedle sebe:

| | hra | sedma |
|---|---|---|
| rozdání č. 1 (nehrálo se) | `Hra` 0,20 | `Sedma` 0,20 |
| rozdání č. 2 (flekované)  | `Hra, 2x flek` 0,40 | `Sedma, flek` 0,40 |

Dva možné výklady, ani jeden zatím nesedí na obojí:
- „2x flek" = *výsledný násobek 2* → základ hry 0,20, jeden flek zdvojnásobí. Pak ale
  „Sedma, flek" (bez čísla) taky dává 0,40, takže popisky nejsou konzistentní.
- „2x flek" = *flekováno dvakrát* → při zdvojnásobování za každý flek by mělo vyjít 0,80,
  ne 0,40; sedělo by to jen při základu hry 0,10.

Rozhodne až víc rozdání s RŮZNÝMI úrovněmi fleků a nenulovým součtem. Do té doby se
preset `SAZBY_FLEK` na tohle opírat nesmí.

### Žebříček mlčky odmítá závazek, který není vyšší

V rozdání, kde už sedma na stole padla, šel kurzor na `sedma` postavit a Enter zmáčknout,
ale **nestalo se nic** — žádná hláška, žádný posun. Ověřeno z videa (5 snímků/s): v těch
vteřinách se neukázala žádná bublina, jen bliká zvýraznění. Jakmile jsem vybral `100`
(tedy vyšší), hra hned přešla na „Která bude trumfová".

Originál tedy nabídku závazků **needituje** — ukáže celou mřížku a nelegální volbu jen
spolkne. My naopak stavíme nabídku z `legalActions`, takže se nelegální volba vůbec nezobrazí.
(Rozdíl v UX, ne v pravidlech; platí ČSM.)

### Vyúčtování č. 3 — prohrané kilo, NENULOVÉ (nejlepší data pro sazebník)

Závazek `100 ♦`, bez fleků. Bodové boxy nad štychy: **`20+40=60`** a **`70`**.

```
Vyúčtování:

Prohrané kilo:               6.40 Kč
Přišel jsi o                12.80 Kč
Máš nyní celkem             87.20 Kč
```

**Rozpad viz souhrnná sekce „Sazebník" níž** — původní výpočet v této sekci vycházel
ze špatného přiřazení bodových boxů a byl nahrazen.

### Další drobnosti

- Po vyúčtování se hra ptá **„Zobrazit průběh hry ?"** [Ano] [Ne] — originál umí přehrát
  odehrané rozdání.
- Flavour u nulových výsledků zatím dva: **„Nula od nuly pojde"**, **„Je to zadarmo"**.

### Vyúčtování č. 4 — prohraná hra i sedma, trumf ♥ (rozhodující vzorek)

Závazek `7 ♥`, flek na hru i na sedmu. Bodové boxy: **`70`** a **`20+20=40`**.

```
Vyúčtování:

Hra, flek:                   0.20 Kč
Prohraná sedma, flek:        0.40 Kč
Barva lásky je drahá:        1.20 Kč
Stálo tě to                  2.40 Kč
Máš nyní celkem             84.80 Kč
```

### Vyúčtování č. 5 — prohraná stovka s flekem, trumf ♥ (rozhodující vzorek)

Závazek `100 ♥`, flek. Bodové boxy: **`80+40=120`** a **`10`**.
Bublina: **„Zanech mariáše, běž hrát kuličky"**.

```
Vyúčtování:

Prohraná stovka, flek:       819.20 Kč
Barva lásky je drahá:       1638.40 Kč
Stálo tě to                 3276.80 Kč
Máš nyní celkem            -3192.00 Kč
```

Konto spadlo z 84,80 na −3192,00, tj. **konto smí jít do minusu**.

## Sazebník originálu RE! — odvozený z pěti vyúčtování

**Sazby (na jednoho soupeře), poměry shodné s ČSM:**

| položka | sazba | poměr k hře |
|---|---|---|
| **hra** | **0,10 Kč** | 1× |
| **sedma** | **0,20 Kč** | 2× |
| **kilo** | **0,40 Kč** | 4× |

**Násobky:**
- **flek**: ×2 za každý flek
- **červená** („Barva lásky je drahá"): ×2 na součet komponent
- **prohrané kilo**: **× 2^(schodek/10 + 1)** — tedy zdvojnásobení za každých 10 bodů schodku
  do sta, plus jedno zdvojnásobení navíc už za samotnou prohru
- **aktér platí každému soupeři zvlášť** → ×2 na konci

**Kontrola na všech pěti vyúčtováních** (aktérovy body v závorce):

| # | rozpis | výpočet | sedí |
|---|---|---|---|
| 1 | `Hra 0,20` + `Sedma 0,20`, celkem 0 | 0,10×2 prohraná vs 0,20 vyhraná → 0 | ✓ |
| 2 | `Hra, 2x flek 0,40` + `Sedma, flek 0,40`, celkem 0 | 0,10×4 vs 0,20×2 → 0 | ✓ |
| 3 | `Prohrané kilo 6,40`, celkem 12,80 (aktér 70) | 0,40 × 2^(30/10+1)=16 → 6,40; ×2 soupeři | ✓ |
| 4 | 0,20 + 0,40, červená 1,20, celkem 2,40 (aktér 40) | (0,10×2 + 0,20×2)=0,60; ×2 červená; ×2 soupeři | ✓ |
| 5 | `Prohraná stovka, flek 819,20`, celkem 3276,80 (aktér 10) | 0,40 × 2^(90/10+1)=1024 → 409,60; ×2 flek = 819,20; ×2 červená; ×2 soupeři | ✓ |

Pozn.: `0,40 × 2^(n+1)` a `0,80 × 2^n` dávají tytéž částky, takže z dat nejde rozhodnout,
jestli je „kilo" 4× hra se zdvojnásobením navíc, nebo rovnou 8×. Zapsáno v ČSM-konzistentní
podobě (kilo 4×), protože ostatní poměry ČSM sedí přesně.

### Jak číst bodové boxy — OPRAVENO PODRUHÉ

Box je CELKEM té strany, hlášky jsou v něm sčítance (`20+40=60` = 20 ze štychů + hláška 40).
Body ze štychů obou stran dají vždy 90.

**Aktérův box NEJDE poznat podle toho, že je vyšší ani nižší** — u č. 3 to byl vyšší (70),
u č. 4 a č. 5 nižší (40, resp. 10). Rozhodne jedině rozpad částky.

Poctivě: tuhle sekci jsem přepisoval dvakrát. Nejdřív jsem přiřazení tipl podle kontroly
„součet dá 90", což nic nedokazuje (splní ho obě čtení). Pak jsem ho „opravil" podle
jediného dalšího vzorku a opravil špatně. Teprve pátý rozpis, kde částky vyšly na desetník,
model uzavřel. **Poučení: u tohohle se nedá usuzovat z jednoho vzorku.**

### Hlášky posbírané po cestě

Licitace: „Jsem docela zticha", „Sedma ?", „Máš sedmu ?", „Čekám", „Je to na tobě",
„Poslouchám", „Nuže", „Nic nepovím", „Chceš se kouknout ?"
Fleky: „Na hru", „Na hru větší", „Dáš si větší ?", „Nemám, co bych dodal",
„Co vy na to, vážení", „Nic", „Jsem potichu"
Sehrávka: „Hraj !", „Hraješ", „Vynášíš", „To nejde, ostrou do talonu!"
Talon: „Odlož talon" / „Odhoď talon" (obměňuje se), „Ještě jednu"
Konec: „Nula od nuly pojde", „Je to zadarmo", „Zanech mariáše, běž hrát kuličky",
„Zobrazit průběh hry ?", „Chceš vidět štychy ?", „Pokračujeme ?"
Rýmovačka u sedmy v zelené: „Sedma zelená, neposečená, slunce na ni svítí"

## Licenční řádek při ukončení

Po ukončení RE! vypíše do konzole:

```
(c) 1991-1993 J.Pivoňka
RE!    1.1        #40456
Licence: Josef SAIKO * <adresa vypuštěna>
```

Kopie, ze které jsou všechna tahle pozorování, je **licencovaná kopie č. 40456 Josefa Saika** —
otce autora tohoto projektu, jemuž je Flek! věnován. Pivoňka v `NEJPRVE.CTI` psal, že „každá
kopie programu RE! je určena pro jediného majitele a je také individuálně identifikovatelná
číslem i jménem uživatele"; tady je to vidět.

(Adresa z licenčního řádku se do repozitáře záměrně nezapisuje — repo je veřejné.)

## FLEK! (volený, v1.12) — a oprava staré domněnky o základu

Vyúčtování z FLEK!, kde jsem byl v obraně (závazek soupeře `hra ♠`, flekovaný).
Bodové boxy: **`50`** a **`40+40=80`** (body ze štychů 50 + 40 = 90 ✓).

```
Vyúčtování:

Hra, flek:                   0.20 Kčs
Získal jsi                   0.20 Kčs
Máš nyní celkem             20.20 Kčs
```

**Základ je stejný jako v RE!: hra 0,10, s flekem 0,20.** Tím padá dřívější domněnka
z videa („Základ 0,20 Kč", viz výš v tomhle souboru) — ta vznikla dopasováním rozkladu
`0.20 × 4 × 2^6 × 2^4` na jediné číslo 819,20, a na totéž číslo sedí i náš model
`0.40 × 2^10 × 2`. Jeden vzorek nerozhodne; dva programy měřené zvlášť ano.

**Rozdíly FLEK! vs RE!:**

| | FLEK! v1.12 (1992) | RE! 1.1 (1993) |
|---|---|---|
| varianta | volený | licitovaný |
| měna | **Kčs** (československá) | **Kč** |
| počáteční konto | **20,00** | **100,00** |
| základ hry | 0,10 | 0,10 |
| „IQ" | posuvník 0–100 | posuvník ve **vteřinách** 0–40" |
| licenční řádek při ukončení | ne | ano (jméno + číslo kopie) |

`Získal jsi 0,20` je **jeden podíl** (obrana inkasuje od aktéra), zatímco u aktéra se
částka násobí dvěma (platí oběma). Model z RE! tím platí i pro FLEK!.

**Ovládání v sehrávce:** Enter na nelegální kartu se spolkne (musí se ctít barva), takže
proklikat rozdání jen Entery nejde — je nutné mezi pokusy posouvat kurzor.

### Betl: desítka do talonu SMÍ (protikontrola k „ostrou do talonu")

V betlu (RE!, závazek `BETL`) šla desítka srdcová do talonu **bez protestu** — karta se odložila
a hra pokračovala na „Ještě jednu". Táž akce v barevné hře je odmítnutá hláškou
„To nejde, ostrou do talonu!".

To je čistá protikontrola k dřívějšímu pozorování a potvrzuje ČSM čl. IV/11 tak, jak to máme
v §27 návrhu (zákaz odkládat esa a desítky platí jen u her s trumfem; v betlu/durchu se hlášky
nepočítají a zákaz odpadá).

Betl se navíc ohlašuje **bez volby trumfu** — po výběru závazku jde rovnou „Odhoď talon".

### Sazby vypsané přímo, bez násobků (definitivní potvrzení)

Rozdání vyrovnané bez sehrávky, kde nebyl žádný flek, takže hra vypsala holé sazby:

```
Jako by se hrálo:

Hra                          0.10 Kč
Sedma                        0.20 Kč
Červená je dražší:           0.60 Kč
Tratíš                       0.60 Kč
```

**`Hra 0.10` a `Sedma 0.20` jsou tu uvedené přímo** — základ už není odvozený, hra ho říká sama.
Červená zdvojnásobuje součet složek: (0,10 + 0,20) × 2 = 0,60 ✓.
`Tratíš 0,60` je jeden podíl, protože jsem byl v obraně (aktér by platil dvakrát).

Další varianta flavouru pro červený násobek: **„Červená je dražší:"** (vedle „Barva lásky je drahá").

### Strop fleků: RE! pustí nejmíň DEVĚT

Rozdání, kde jsem jako obrana stupňoval flek, jak to šlo:

```
Vyúčtování:

Hra, 9x flek:               51.20 Kč
Prohraná sedma:              0.20 Kč
Bylo to v srdcích:         102.80 Kč
Získal jsi                 102.80 Kč
Máš nyní celkem            200.60 Kč
```

Bodové boxy: `30+40=70` a `60+20=80`.

**`Hra, 9x flek: 51,20` = 0,10 × 2⁹ = 51,20 přesně.** Z toho plyne dvojí:

1. **Popisek „Nx flek" znamená doslova N fleků a násobek je 2^N.** Zpětně to potvrzuje
   i dřívější zápisy: `Hra, 2x flek 0,40` = 0,10 × 2², `Hra, flek 0,20` = 0,10 × 2¹
   (holé „flek" bez čísla = jeden).
2. **RE! nemá strop na 4 (boty).** Devět fleků prošlo, a devítka NENÍ strop — jen tam
   licitace skončila. Skutečný strop (pokud nějaký je) zůstává neznámý.

Pro srovnání: náš `defaultConfig` má `maxFlekLevel` 4 pro licitovaný (boty, ČSM čl. IV)
a 5 pro volený (kalhoty). Preset `SAZBY_FLEK` by tohle měl odlišit — originál je štědřejší.
Starší poznámka z videa („fleky jdou nejméně do 2^6") je tím překonaná směrem nahoru.

Zbytek rozpisu sedí: sedma 0,20 neflekovaná; červená zdvojnásobuje součet
(51,20 + 0,20) × 2 = 102,80 ✓; `Získal jsi` je jeden podíl, protože jsem byl v obraně.

Další varianta flavouru pro červený násobek: **„Bylo to v srdcích:"**.

## Betl: originál rozhodnuté rozdání NEDOHRÁVÁ

Ověřeno (RE!, `BETL` s flekem, aktérem jsem byl já). Soupeř vynesl zeleného spodka, já držel
zelené eso. Hra nejdřív odmítla nižší kartu hláškou:

> **„A co zelené eso ?"**

— tedy **povinné přebití v betlu, a originál rovnou jmenuje kartu**, kterou chce
(naše varování říká jen důvod). Jakmile jsem eso zahrál a štych vzal, betl byl prohraný a hra:

1. ukázala bublinu **„A je to !"**,
2. **přešla rovnou na vyúčtování** — v ruce mi přitom zůstávalo **devět karet**,
3. zbylé štychy se **vůbec nehrály**.

```
Vyúčtování:

Flekovaný betl:              2.00 Kč
Ztratil jsi                  4.00 Kč
Máš nyní celkem            196.00 Kč
```

### Dva závěry

**1. Sazba betlu je 10× hra, ne 15×.**
`Flekovaný betl 2,00` = základ × 2 (flek) → základ betlu **1,00 Kč = 10× hra (0,10)**.
ČSM má betl **15×**; poměr 10×/20× uvádí návrh (§10 bod 1) jako odchylku *křížového* mariáše,
který nehrajeme. **Originál přesto počítá 10×.** Pro `SAZBY_FLEK` to znamená vlastní poměry,
ne sdílený `SAZBY_CSM`. Durch zatím neměřen — ověřit, jestli je 20× (a ne 30×).
`Ztratil jsi 4,00` = 2 × 2,00, aktér platí oběma ✓; konto 200,00 − 4,00 = 196,00 ✓.

**2. K našemu „vše za mnou" (§39).**
Nabídku nároku, kterou by hráč sám vyvolal („vše/nic za mnou"), jsem v originálu **nikde
neviděl** — ani v betlu, ani v barevné hře. Co originál má, je **automatické ukončení, jakmile
je výsledek rozhodnutý**: betl padne v okamžiku, kdy aktér vezme štych, a dál se nehraje.
Je to jiný mechanismus než náš (tam nárok hlásí hráč), ale stejná myšlenka — rozhodnuté
rozdání nedohrávat.

Pozor na rozdíl oproti našemu rozhodnutí z §39: my zbytek **doopravdy dohráváme**, protože
obrana smí hlásit hlášky i u odhazované karty (ČSM čl. III/3). V betlu se ale hlášky nepočítají
(čl. IV/1), takže tam ten důvod odpadá — a originál toho využívá.
