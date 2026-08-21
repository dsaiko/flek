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

- **Základ 0,20 Kč**, kilo = 4× hra ✓ (ČSM shodné)
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
