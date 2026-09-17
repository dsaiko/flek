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
 * Hospodská tradice sto zdvojnásobuje (kiloScaling 'double'). Preset FLEK!
 * (podle chování originálu) se doladí ve fázi 4.
 */

import type { RulesConfig, Sazby, Variant } from './types';

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

export function defaultConfig(variant: Variant): RulesConfig {
  return {
    variant,
    // licitovaný: poslední platný flek je čtvrtý — boty (licitovaný čl. IV)
    sazby: variant === 'licitovany' ? { ...SAZBY_CSM, maxFlekLevel: 4 } : SAZBY_CSM,
    talonForbidsTrump: false, // ČSM zakazuje jen esa/desítky (a hlášenou sedmu) — viz renonce
    talonOnTakeover: 'retake',
    enableDveSedmy: false, // v1 vypnuto i v licitovaném; typy a žebříček připraveny
    autoSettlePlainHra: true, // jako FLEK!: dobrá hra se nehraje, rovnou se platí
    // B/19 je ustanovení VOLENÉHO mariáše; licitovaná pravidla ho neznají
    autoSettleFlekkedHra: variant === 'voleny',
  };
}
