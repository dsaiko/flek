/** Malý deterministický PRNG (xorshift32) — vzor z projektu mars. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  /** Rovnoměrné číslo v intervalu [0, 1). */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }

  /** Celé číslo v intervalu [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Fisher–Yates zamíchání NOVÉHO pole (vstup nemutuje). */
  shuffled<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Odvozený nezávislý generátor (např. seed AI tahu ze seedu rozdání + čísla tahu). */
  static derive(seed: number, n: number): number {
    // dvě kola mixování, ať sousední n nedávají korelované seedy
    let x = (seed ^ (n * 0x9e3779b9)) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x || 0x6d2b79f5;
  }
}
