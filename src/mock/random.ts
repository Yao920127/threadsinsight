/** 以字串產生 32-bit 種子（FNV-1a）。 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Random {
  /** [0, 1) 浮點數 */
  next(): number;
  /** [min, max] 整數 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(probability: number): boolean;
}

/** mulberry32：小而快、可重現的 PRNG。內部狀態封裝在閉包中。 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    chance: (probability) => next() < probability,
  };
}

/** 依權重挑選。 */
export function pickWeighted<T>(rng: Random, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * 以每 `blockSize` 筆為一組的方式產生序列，每組內各值出現次數固定再打亂，
 * 確保任意以組為單位的前綴都維持相同比例。
 */
export function blockPattern<T>(
  rng: Random,
  total: number,
  blockComposition: readonly (readonly [T, number])[],
): T[] {
  const block = blockComposition.flatMap(([value, times]) => Array<T>(times).fill(value));
  const blocks = Math.ceil(total / block.length);
  return Array.from({ length: blocks }, () => rng.shuffle(block))
    .flat()
    .slice(0, total);
}
