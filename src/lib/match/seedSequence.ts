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
  /** Obnovený zápas už `handsPlayed` rozdání spotřeboval — přeskoč je. */
  resumeAfter: (handsPlayed: number) => void;
}

/** `?seed=` z URL; `null` = náhodná hra. */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
    next: () => (urlSeed === null ? randomSeed() : counter++),
    resumeAfter: (handsPlayed) => {
      if (urlSeed !== null) counter = urlSeed + handsPlayed;
    },
  };
}
