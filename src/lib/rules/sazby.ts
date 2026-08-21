/**
 * sazby.ts — sazebníky a výchozí konfigurace pravidel
 *
 * Jednotka = základní sazba hry (v ČSM soutěžním sazebníku 0,20 Kč; zobrazení
 * jednotek řeší UI). Hodnoty ověřeny proti oficiálním pravidlům ČSM:
 *  - volený (křížový, 2007):   hra 1, sedma 2, sto 4, betl 10, durch 20
 *  - licitovaný (2010/2014):   hra 1, sedma 2, sto 4, betl 15, durch 30, dvě sedmy 40
 * Tiché varianty = polovina hlášené sazby. Červené dvojnásob (jen barevné hry).
 * Preset FLEK! (podle chování originálu) se doladí ve fázi 4 — zatím = ČSM volený.
 */

import type { RulesConfig, Sazby, Variant } from './types';

export const SAZBY_CSM_VOLENY: Sazby = {
  hra: 1,
  sedma: 2,
  tichaSedma: 1,
  kilo: 4,
  ticheKilo: 2,
  betl: 10,
  durch: 20,
  dveSedmy: 40, // ve voleném se nehraje (enableDveSedmy=false), hodnota jen pro úplnost
  kiloScaling: 'double',
  cervenyMultiplier: 2,
  maxFlekLevel: 5, // kalhoty
};

export const SAZBY_CSM_LICITOVANY: Sazby = {
  ...SAZBY_CSM_VOLENY,
  betl: 15,
  durch: 30,
};

export function defaultConfig(variant: Variant): RulesConfig {
  return {
    variant,
    sazby: variant === 'voleny' ? SAZBY_CSM_VOLENY : SAZBY_CSM_LICITOVANY,
    talonForbidsTrump: false, // ČSM zakazuje jen esa/desítky (a hlášenou sedmu) — viz renonce
    talonOnTakeover: 'retake',
    countMarriagesIntoKilo: true, // klasická pravidla: hlášky se do sta počítají
    enableDveSedmy: false, // v1 vypnuto i v licitovaném; typy a žebříček připraveny
  };
}
