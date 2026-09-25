/**
 * seedSequence.ts — zdroj seedů pro rozdávání (bez DOM, aby šel testovat)
 *
 * Bez `?seed=` je každý zápas náhodný. S `?seed=N` je posloupnost rozdání
 * deterministická (N, N+1, …) a **pokračuje i po obnovení zápasu** — jinak by
 * slíbený determinismus po reloadu lhal.
 */

export interface SeedSequence {
  /** Seed pro další rozdání. */
  next: () => number;
  /**
   * Zápas už `handsPlayed` rozdání spotřeboval — přeskoč je. Nový zápas
   * (vynulované konto) volá `resumeAfter(0)`: invariant je „další seed =
   * N + handNo", jinak by reload po vynulování vrátil už odehrané rozdání.
   */
  resumeAfter: (handsPlayed: number) => void;
}

/** Random pracuje s 32bitovým seedem (`seed >>> 0`). */
const MAX_SEED = 0xffff_ffff;

/**
 * `?seed=` z URL; `null` = náhodná hra.
 *
 * Přijímá jen celá čísla 0..2^32−1: zlomek se v `Random` stejně zkrátí a
 * u obřích hodnot je `counter++` bez efektu, takže by všechny hry v zápase
 * dostaly TÝŽ seed — a slíbená posloupnost N, N+1, … by tiše přestala platit.
 */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_SEED) return null;
  return n;
}

export function createSeedSequence(
  urlSeed: number | null,
  randomSeed: () => number = () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  },
): SeedSequence {
  let counter = urlSeed ?? 0;
  return {
    // `>>> 0`: za 2^32−1 pokračuje od nuly, stejně jako by seed zkrátil `Random`
    next: () => (urlSeed === null ? randomSeed() : (counter++) >>> 0),
    resumeAfter: (handsPlayed) => {
      if (urlSeed !== null) counter = urlSeed + handsPlayed;
    },
  };
}
