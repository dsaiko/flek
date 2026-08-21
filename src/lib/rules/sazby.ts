/**
 * sazby.ts — sazebníky a výchozí konfigurace pravidel
 *
 * Jednotka = základní sazba hry (v ČSM sazebníku obvykle 0,20 Kč nebo 1 Kč;
 * zobrazení jednotek řeší UI). Hodnoty dle Obecných pravidel ČSM čl. V.2:
 * hra 1, sedma 2, sto 4, betl 15, durch 30, dvě sedmy 40; sto se platí lineárně
 * za každých 10 bodů (čl. V.5). Tiché varianty = polovina hlášené sazby.
 * Červené dvojnásob (jen barevné hry).
 *
 * Poznámky: soutěžní křížový volený (2007) má odchylku betl 10 / durch 20;
 * hospodská tradice sto zdvojnásobuje (kiloScaling 'double'). Preset FLEK!
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
  maxFlekLevel: 5, // kalhoty
};

export function defaultConfig(variant: Variant): RulesConfig {
  return {
    variant,
    sazby: SAZBY_CSM,
    talonForbidsTrump: false, // ČSM zakazuje jen esa/desítky (a hlášenou sedmu) — viz renonce
    talonOnTakeover: 'retake',
    enableDveSedmy: false, // v1 vypnuto i v licitovaném; typy a žebříček připraveny
    autoSettlePlainHra: true, // jako FLEK!: dobrá hra se nehraje, rovnou se platí
  };
}
