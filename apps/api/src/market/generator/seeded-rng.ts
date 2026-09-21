/**
 * Mulberry32 — small deterministic 32-bit PRNG.
 * Same seed always yields the same sequence.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inclusive integer range. */
  nextInt(min: number, max: number): number {
    if (max < min) {
      throw new Error('max must be >= min');
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Float in [min, max). */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Pick one of two outcomes with probability of first. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
