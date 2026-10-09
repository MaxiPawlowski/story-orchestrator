export const SCOPE_EXTRA_BUDGET = 5;

export interface BudgetTier {
  keys: readonly string[];
  rotate?: boolean;
  cap?: number;
}

export interface ScopeBudgetInput {
  free: ReadonlySet<string>;
  tiers: readonly BudgetTier[];
  slots: number;
  rotation?: number;
}

export interface ScopeBudgetResult {
  kept: string[][];
  dropped: string[][];
  used: number;
}

const window = (keys: string[], size: number, start: number): Set<string> =>
  new Set(Array.from({ length: Math.min(size, keys.length) }, (_, at) => keys[(start + at) % keys.length]));

export const fitScopeBudget = ({ free, tiers, slots, rotation = 0 }: ScopeBudgetInput): ScopeBudgetResult => {
  const taken = new Set(free);
  let left = Math.max(0, Math.floor(slots));
  const kept: string[][] = [];
  const dropped: string[][] = [];
  for (const tier of tiers) {
    const payable = [...new Set(tier.keys)].filter((key) => !taken.has(key));
    const room = Math.min(left, tier.cap === undefined ? left : Math.max(0, Math.floor(tier.cap)));
    const start = tier.rotate && payable.length > room && room > 0 ? (Math.max(0, Math.floor(rotation)) * room) % payable.length : 0;
    const paid = payable.length <= room ? new Set(payable) : window(payable, room, start);
    left -= paid.size;
    kept.push(tier.keys.filter((key) => taken.has(key) || paid.has(key)));
    dropped.push(tier.keys.filter((key) => !taken.has(key) && !paid.has(key)));
    paid.forEach((key) => taken.add(key));
  }
  return { kept, dropped, used: Math.max(0, Math.floor(slots)) - left };
};

export const scopeSlots = (free: ReadonlySet<string>, baseline: readonly string[], extra = SCOPE_EXTRA_BUDGET): number =>
  new Set(baseline.filter((key) => !free.has(key))).size + extra;
