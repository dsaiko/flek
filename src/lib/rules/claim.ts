/**
 * claim.ts — „Vše za mnou" (docs/marias-design.md §39) a v betlu „Nic za mnou" (§43)
 *
 * Když hráč vynáší a žádná karta, kterou může kdokoli z protihráčů držet, už
 * nepřebije žádnou z jeho, jsou všechny zbylé štychy jeho. Ve FLEK!/RE! se
 * taková hra nedohrávala — tady se nabídne tlačítkem a zbytek odehraje UI.
 * V betlu je to obráceně: aktér nesmí vzít žádný štych, a když už žádný vzít
 * NEMŮŽE, nabídne se totéž tlačítko a zbytek se dohraje za něj.
 *
 * DVĚ VĚCI, KTERÉ JE POTŘEBA VĚDĚT, NEŽ SE TOHO NĚKDO DOTKNE:
 *
 * 1. Počítá se to VÝHRADNĚ z `PlayerView`, ne z `GameState`. Kdyby podmínka
 *    koukala do cizích rukou, prozrazovala by je — a to i tím, že se tlačítko
 *    NEUKÁŽE: „držím trumfového krále a nabídka nepřišla" znamená „někdo drží
 *    eso", což hráč vědět nesmí. Neznámý talon se proto počítá konzervativně
 *    jako karty, které soupeř mít MŮŽE: nabídka přijde méně často, nikdy ale
 *    špatně. (Stejná past jako u trumfové sedmy, §35–§36.)
 *
 * 2. Uhrát všechny štychy NENÍ totéž co mít rozhodnuté vyúčtování. Obrana smí
 *    hlásit hlášky i u karty, kterou jen odhazuje (ČSM čl. III/3 — „v okamžiku,
 *    kdy tuto kartu odehrává", žádná podmínka výnosu), a jestli nějakou drží,
 *    se z pohledu hráče zjistit nedá. Proto se zbytek DOOPRAVDY DOHRÁVÁ a
 *    zúčtuje se normálně — nikdy se nepočítá výsledek napřímo.
 */

import { type Card, DECK, R7, card, rankOf, strength, suitOf, KRAL, SVRSEK } from '../cards';
import type { PlayerView } from './types';
import { beats, legalPlays, orderMode, winningPlay } from './tricks';

/**
 * Karty, které MŮŽE držet někdo jiný.
 *
 * Všechno, co hráč nevidí ve své ruce, neviděl padnout a neleží mu v talonu.
 * Talon, který hráč nezná (obrana), tu schválně ZŮSTÁVÁ — leží sice mimo hru,
 * ale hráč to neví, a počítat s tím by znamenalo vědět něco navíc.
 *
 * Odečítá se `v.talon`, NE `v.talonKnown`. Znalost talonu se totiž nemaže:
 * `talonKnowledge` je „co kdy které sedadlo v talonu vidělo", a při převzetí
 * ve voleném (`talonOnTakeover: 'retake'`) si nový aktér ten talon VEZME DO
 * RUKY (engine.ts) — původnímu tazateli ale v `talonKnowledge` zůstane. Kdo by
 * odečítal jeho, vyškrtne si karty, které soupeř doopravdy drží, a nabídne
 * štychy, které nemá jisté. `v.talon` je proti tomu „co leží mimo hru PRÁVĚ
 * TEĎ": je nenulový přesně pro aktuálního držitele talonu.
 */
function possibleOpponentCards(v: PlayerView): Card[] {
  const seen = new Set<Card>(v.hand);
  for (const c of v.talon ?? []) seen.add(c);
  if (v.revealedTrump !== null) seen.add(v.revealedTrump);
  if (v.phase.name === 'tricks') {
    for (const trick of v.phase.played) for (const p of trick.plays) seen.add(p.card);
    for (const p of v.phase.trick) seen.add(p.card);
  }
  return DECK.filter((c) => !seen.has(c));
}

/**
 * Pořadí, ve kterém hráč zbytek odehraje — nebo `null`, když si štychy jisté
 * není.
 *
 * V betlu vrací plán jen pro TENHLE tah (viz `betlPlan`): aktér tam nevynáší,
 * přiznává barvu, a kterou kartu dá, záleží na tom, co soupeř vynesl. Controller
 * plán přepočítává při každém tahu, takže mu stačí první karta. Durch je táž
 * úloha jako hra, jen bez trumfů.
 */
export function claimPlan(v: PlayerView): Card[] | null {
  if (v.phase.name !== 'tricks' || v.contract === null) return null;
  const { mode, trump } = v.contract;
  if (mode === 'betl') return betlPlan(v);
  // jen z výnosu: doprostřed rozehraného štychu se nic tvrdit nedá
  if (v.phase.toAct !== v.seat || v.phase.trick.length > 0) return null;
  if (v.hand.length === 0) return null;

  const possible = possibleOpponentCards(v);
  const om = orderMode(mode);

  /*
   * Kartu, kterou vynáším, přebije jen vyšší v téže barvě — nebo jakýkoli
   * trumf, pokud vynáším jinou barvu. `beats` to ví, tak se to ptá jí a ne
   * vlastní kopie pravidla.
   */
  for (const mine of v.hand) {
    for (const theirs of possible) {
      if (beats(theirs, mine, trump, mode)) return null;
    }
  }

  /*
   * Trumfová sedma až nakonec. Hlášenou sedmu hlídá `legalActions`, tichou ale
   * ne — a ta se platí taky (scoring.ts, „tichá sedma"). Kdo ji vynese první,
   * připraví hráče o peníze, které by ručním dohráním dostal.
   *
   * Že se to povede, plyne z podmínky výš: kdo bere všechny zbylé štychy,
   * vynáší do všech a o pořadí své ruky rozhoduje sám.
   */
  const seven = trump === null ? null : card(trump, R7);
  const holdsSeven = seven !== null && v.hand.includes(seven);
  const rest = v.hand.filter((c) => c !== seven);

  /*
   * Na zbytku pořadí nezáleží — všechny štychy padnou stejně a s nimi i body.
   * Řadí se jen proto, aby byl plán stabilní a šel testovat; od nejvyšší, ať
   * to na stole vypadá jako sklapnutí ruky, ne jako náhoda.
   */
  rest.sort((a, b) => strength(b, om) - strength(a, om));
  return holdsSeven ? [...rest, seven] : rest;
}

/**
 * „Nic za mnou" v betlu: aktér už žádný štych vzít nemůže, ať soupeři hrají
 * jakkoli. Vrací kartu na tenhle tah (první) a za ní zbytek ruky, nebo `null`.
 *
 * Štych vezme jen nejvyšší karta vynesené barvy (betl je bez trumfů). Aktér
 * ho proto nevezme, když platí obojí:
 *
 * 1. V KAŽDÉ barvě jsou všechny jeho karty nižší než všechny, které soupeři
 *    mohou mít. Když pak soupeř vynese, leží na stole vyšší karta, než aktér
 *    má, a přiznat může jen nižší; když barvu nemá, odhodí cokoli. Platí to
 *    i dál, protože obě množiny jen ubývají. Neznámý talon se počítá jako
 *    karty soupeřů (`possibleOpponentCards`): podmínka je pak přísnější, nikdy
 *    ne slabší.
 * 2. V rozehraném štychu už leží karta, kterou aktér nepřebije — nebo barvu
 *    výnosu nemá.
 *
 * A když aktér VYNÁŠÍ (to se stane jen v prvním štychu — kdo vynáší později,
 * ten předchozí štych vzal a betl už prohrál): vynese barvu, kterou soupeři
 * určitě mají. Kdo z nich ji má, ten ji musí přiznat a přebít, protože všechny
 * jejich karty v ní jsou vyšší (povinnost přebíjet platí i v betlu, `legalPlays`).
 * „Určitě mají" ale jde říct jen tehdy, když aktér zná talon — jinak by ta karta
 * mohla ležet v něm. Neznámý talon na výnosu nabídku vylučuje.
 *
 * Hlášky se v betlu nehlásí a tichá sedma neexistuje, takže na pořadí zbytku
 * nezáleží. Odhazuje se od nejvyšší, ať to na stole vypadá jako shazování.
 */
function betlPlan(v: PlayerView): Card[] | null {
  if (v.phase.name !== 'tricks' || v.contract === null) return null;
  if (v.contract.declarer !== v.seat) return null; // „nic za mnou" je aktérova věc
  if (v.phase.toAct !== v.seat || v.hand.length === 0) return null;
  const om = orderMode('betl');
  const possible = possibleOpponentCards(v);

  // (1) v každé barvě jsou moje karty pod všemi, které soupeři mohou mít
  for (const mine of v.hand) {
    for (const theirs of possible) {
      if (suitOf(theirs) === suitOf(mine) && !beats(theirs, mine, null, 'betl')) return null;
    }
  }

  const byHeight = (cards: readonly Card[]) => [...cards].sort((a, b) => strength(b, om) - strength(a, om));
  const trick = v.phase.trick;
  let now: Card | undefined;
  if (trick.length > 0) {
    // (2) v rozehraném štychu už leží karta, kterou nepřebiju
    const winning = winningPlay(trick, null, 'betl').card;
    if (v.hand.some((c) => beats(c, winning, null, 'betl'))) return null;
    now = byHeight(legalPlays(v.hand, trick, null, 'betl'))[0];
  } else {
    // vynáším: jen barvu, kterou soupeři určitě mají — a to ví jen ten, kdo zná talon
    if (v.talon === null) return null;
    const theirSuits = new Set(possible.map(suitOf));
    now = byHeight(v.hand.filter((c) => theirSuits.has(suitOf(c))))[0];
  }
  if (now === undefined) return null;
  return [now, ...byHeight(v.hand.filter((c) => c !== now))];
}

/**
 * Smí se u téhle karty hlásit hláška?
 *
 * Hlásit je vždycky výhodné (body jdou mé straně) a v betlu/durchu se hlášky
 * nehlásí vůbec, takže stačí: držím druhou z dvojice a v téhle barvě jsem
 * ještě nehlásil. Rozhodovat o tom podle `legalActions` by bylo totéž, ale
 * volající pak musí tu akci v seznamu najít — tohle je pro něj.
 */
export function shouldAnnounce(v: PlayerView, c: Card): boolean {
  if (v.phase.name !== 'tricks' || v.contract?.mode !== 'hra') return false;
  const rank = rankOf(c);
  if (rank !== KRAL && rank !== SVRSEK) return false;
  const already = v.phase.marriages.some((m) => m.seat === v.seat && m.suit === suitOf(c));
  if (already) return false;
  return v.hand.includes(card(suitOf(c), rank === KRAL ? SVRSEK : KRAL));
}
