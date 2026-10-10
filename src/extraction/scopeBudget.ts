export const SCOPE_EXTRA_TOKENS = 250;

export interface BudgetTier {
  units: readonly (readonly string[])[];
  group?: string;
}

export interface SharedCost {
  keys: ReadonlySet<string>;
  cost: number;
}

export interface ScopeBudgetInput {
  free: ReadonlySet<string>;
  tiers: readonly BudgetTier[];
  slots: number;
  cost?: (key: string) => number;
  caps?: Readonly<Record<string, number>>;
  shared?: readonly SharedCost[];
}

export interface ScopeBudgetResult {
  kept: string[][];
  dropped: string[][];
  used: number;
}

const unitCost = (keys: readonly string[], cost: (key: string) => number, shared: readonly SharedCost[], paidShared: ReadonlySet<SharedCost>) =>
  keys.reduce((sum, key) => sum + cost(key), 0) + shared.filter((entry) => !paidShared.has(entry) && keys.some((key) => entry.keys.has(key))).reduce((sum, entry) => sum + entry.cost, 0);

export const fitScopeBudget = ({ free, tiers, slots, cost = () => 1, caps = {}, shared = [] }: ScopeBudgetInput): ScopeBudgetResult => {
  const taken = new Set(free);
  const total = Math.max(0, slots);
  let left = total;
  const paidShared = new Set(shared.filter((entry) => [...free].some((key) => entry.keys.has(key))));
  const groupUsed = new Map<string, number>();
  const kept: string[][] = [];
  const dropped: string[][] = [];
  for (const tier of tiers) {
    const cap = tier.group !== undefined && caps[tier.group] !== undefined ? Math.max(0, Math.floor(caps[tier.group])) : Infinity;
    for (const unit of tier.units) {
      const payable = [...new Set(unit)].filter((key) => !taken.has(key));
      if (!payable.length) continue;
      const used = tier.group === undefined ? 0 : groupUsed.get(tier.group) ?? 0;
      const price = unitCost(payable, cost, shared, paidShared);
      if (used + payable.length > cap || price > left) continue;
      left -= price;
      if (tier.group !== undefined) groupUsed.set(tier.group, used + payable.length);
      shared.filter((entry) => payable.some((key) => entry.keys.has(key))).forEach((entry) => paidShared.add(entry));
      payable.forEach((key) => taken.add(key));
    }
    const keys = [...new Set(tier.units.flat())];
    kept.push(keys.filter((key) => taken.has(key)));
    dropped.push(keys.filter((key) => !taken.has(key)));
  }
  return { kept, dropped, used: total - left };
};

export const scopeSlots = (free: ReadonlySet<string>, baseline: readonly string[], cost: (key: string) => number = () => 1, extra = SCOPE_EXTRA_TOKENS): number =>
  [...new Set(baseline.filter((key) => !free.has(key)))].reduce((sum, key) => sum + cost(key), 0) + extra;

export const rotated = <T>(items: readonly T[], start: number): T[] =>
  items.length ? items.map((_, at) => items[(Math.max(0, Math.floor(start)) + at) % items.length]) : [];
