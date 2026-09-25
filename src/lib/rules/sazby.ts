/**
 * sazby.ts — sazebníky a výchozí konfigurace pravidel
 *
 * Jednotka = základní sazba hry (v ČSM sazebníku obvykle 0,20 Kč nebo 1 Kč;
 * zobrazení jednotek řeší UI). Hodnoty dle Obecných pravidel ČSM čl. V.2:
 * hra 1, sedma 2, sto 4, betl 15, durch 30, dvě sedmy 40; sto se platí lineárně
 * za každých 10 bodů (čl. V.5). Tiché varianty = polovina hlášené sazby.
 * Červené dvojnásob (jen barevné hry).
 *
 * Pozor na záměnu sazebníků: betl 10× / durch 20× patří KŘÍŽOVÉMU mariáši
 * (4 hráči, desetihaléřový, ČSM 2007), který nehrajeme. Naše dvě varianty —
 * dvacetihaléřový bodovaný volený (ČSM 2007) i soutěžní licitovaný (ČSM 2014,
 * betl 3,00 / durch 6,00 při základu 0,20) — mají shodně betl 15× a durch 30×.
 * Hospodská tradice sto zdvojnásobuje (kiloScaling 'double').
 *
 * `SAZBY_FLEK` je oproti tomu sazebník ZMĚŘENÝ v originálu (viz níž) — a právě
 * u betlu a durchu z něj vychází ty „křížové" poměry 10×/20×, i když originál
 * křížový mariáš nehraje.
 */

import type { RulesConfig, Sazby, SazbyPreset, Variant } from './types';

export const SAZBY_CSM: Sazby = {
  hra: 1,
  sedma: 2,
  tichaSedma: 1,
  kilo: 4,
  ticheKilo: 2,
  betl: 15,
  durch: 30,
  dveSedmy: 40, // ve voleném se nehraje (enableDveSedmy=false), hodnota jen pro úplnost
  kiloScaling: 'linear', // oficiální ČSM; 'double' = hospodská varianta
  cervenyMultiplier: 2,
  /**
   * Volený: pravidla odkazují na „bodovací tabulku" (C/3: „flek nad rámec
   * bodovací tabulky … platí ten, který je ještě v tabulce uveden"), kterou
   * text nemá, takže zůstává tradiční strop kalhoty (5). Licitovaný má strop
   * napsaný přímo: „flek nad rámec posledního platného fleku (ČTVRTÉHO)"
   * (čl. IV, Renoncem není) — viz `defaultConfig`.
   */
  maxFlekLevel: 5, // kalhoty
  limit: 500, // čl. V/8; volený i licitovaný sazebník shodně 500× základ
  limitRaised: 750, // zvýšený limit, když flekovali oba obránci
};

/**
 * Strop, který nikdy nesepne. Originál žádný limit neuplatňuje — jedno rozdání
 * v RE! se vyrovnalo na 1638,40 Kč při základu 0,10 Kč, tedy **16384× základ**,
 * zatímco ČSM stropuje na 500×. Skutečná mez (pokud vůbec existuje) změřená
 * není, proto hodnota jen leží tak vysoko, že na ni nejde dosáhnout. Nejdražší
 * je prohrané červené kilo bez jediného bodu při devíti flecích:
 * 4 × 2^(100/10 + 1) × 2⁹ × 2 = 8 388 608 (dřívější milion na něj nestačil).
 *
 * Záměrně NENÍ `Infinity`: `applyLimit()` by si s ním poradil, ale sav by ho
 * uložil jako `null` (JSON `Infinity` neumí) a validace `isSazby()` by ho pak
 * odmítla — hráči by se při načtení vynulovalo konto.
 */
const BEZ_LIMITU = 2 ** 40;

/**
 * Sazebník ORIGINÁLU FLEK!/RE! — změřeno v DOSBoxu 2026-09-22 z vyúčtování,
 * rozpis a kontrolní výpočty v `docs/original-notes.md`.
 *
 * Základ hry je v originálu 0,10 Kč a všechno ostatní je jeho násobek. Běžné
 * závazky sedí s ČSM přesně; **liší se jen betl, durch a dvě sedmy**.
 *
 * Neměřené položky (`tichaSedma`, `ticheKilo`) zůstávají na poloviční sazbě
 * podle ČSM — originál tichou variantu v žádném z pozorovaných rozdání
 * nevypsal, takže tu není co převzít.
 */
export const SAZBY_FLEK: Sazby = {
  hra: 1, // změřeno: „Hra 0.10 Kč" holé, bez násobků
  sedma: 2, // změřeno: „Sedma 0.20 Kč"
  tichaSedma: 1, // NEZMĚŘENO — ponechána poloviční sazba dle ČSM
  kilo: 4, // změřeno: prohrané kilo 0,40 × 2^(schodek/10 + 1) — viz `originalKilo`
  ticheKilo: 2, // NEZMĚŘENO — ponechána poloviční sazba dle ČSM
  betl: 10, // změřeno: „Flekovaný betl 2.00" = 1,00 × 2
  durch: 20, // změřeno: „Durch 2.00"
  dveSedmy: 30, // změřeno: „6x flek na dvě sedmy 192.00" = 3,00 × 2⁶
  kiloScaling: 'double', // změřeno: kilo se zdvojnásobuje, nepřičítá lineárně
  cervenyMultiplier: 2, // změřeno: „Barva lásky je drahá" / „Červená je dražší"
  /**
   * Originálem prošlo devět fleků („Hra, 9x flek: 51.20" = 0,10 × 2⁹) a devítka
   * NENÍ doložený strop — jen tam licitace skončila. Ponecháno na změřeném
   * minimu; zvýšit až podle dalšího měření, ne odhadem.
   */
  maxFlekLevel: 9,
  limit: BEZ_LIMITU,
  limitRaised: BEZ_LIMITU,
  /*
   * Schodek jen z vlastních bodů a o dvě zdvojnásobení víc než ČSM. Originál
   * v obou vyúčtováních kila navíc nevypsal řádek „Hra"; tady se hra platí dál
   * jako v ČSM, protože bez ní by flek na hru v kilové hře nic neznamenal
   * a jak ho originál nabízí, změřené není (§47).
   */
  originalKilo: true,
};

const PRESETY: Record<SazbyPreset, Sazby> = { csm: SAZBY_CSM, flek: SAZBY_FLEK };

/**
 * `?sazby=flek` z URL přepne na sazebník originálu; cokoli jiného (i nesmysl)
 * padne na ČSM, protože ten je výchozí a nikdy nemá smysl hru kvůli překlepu
 * v adrese odmítnout.
 *
 * Zatím JEN parametr v URL, ne položka v nastavení: volba sazebníku mění
 * konto uprostřed zápasu a chce vlastní rozhodnutí, jak se s tím naložit
 * (a překlady do čtyř jazyků). Sem patří proto, aby šlo preset vyzkoušet
 * v reálné hře, ne jen v testech — stejně jako `?seed=`.
 */
export function parseSazbyPreset(search: string): SazbyPreset {
  return new URLSearchParams(search).get('sazby') === 'flek' ? 'flek' : 'csm';
}

export function defaultConfig(variant: Variant, preset: SazbyPreset = 'csm'): RulesConfig {
  const sazby = PRESETY[preset];
  return {
    variant,
    /*
     * Strop fleků má licitovaný jiný (čl. IV: poslední platný je čtvrtý — boty).
     * To je ale ustanovení ČSM, takže se uplatní jen na jeho sazebník; originál
     * si strop drží vlastní a devět fleků v něm projde v obou variantách.
     */
    sazby: preset === 'csm' && variant === 'licitovany'
      ? { ...sazby, maxFlekLevel: 4 }
      : sazby,
    talonForbidsTrump: false, // ČSM zakazuje jen esa/desítky (a hlášenou sedmu) — viz renonce
    talonOnTakeover: 'retake',
    enableDveSedmy: false, // v1 vypnuto i v licitovaném; typy a žebříček připraveny
    autoSettlePlainHra: true, // jako FLEK!: dobrá hra se nehraje, rovnou se platí
    // B/19 je ustanovení VOLENÉHO mariáše; licitovaná pravidla ho neznají
    autoSettleFlekkedHra: variant === 'voleny',
  };
}
