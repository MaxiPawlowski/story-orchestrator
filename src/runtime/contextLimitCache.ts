import type { ContextLimit } from "@extraction/inputBudget";
import type { HostSubscriptionEntry } from "@services/STAPI";

export interface ContextLimitReads {
  limit: (profileId: string | null) => ContextLimit;
  presetOf: (profileId: string | null) => string | null;
}

export interface ContextLimitCache {
  read(profileId: string | null): ContextLimit;
  invalidate(): void;
  readonly reads: number;
}

export function createContextLimitCache(host: ContextLimitReads): ContextLimitCache {
  const entries = new Map<string, ContextLimit>();
  let reads = 0;
  return {
    read(profileId) {
      const key = JSON.stringify([profileId, host.presetOf(profileId)]);
      const cached = entries.get(key);
      if (cached) return cached;
      reads += 1;
      const limit = host.limit(profileId);
      entries.set(key, limit);
      return limit;
    },
    invalidate() {
      entries.clear();
    },
    get reads() {
      return reads;
    },
  };
}

export const contextLimitInvalidators = (cache: ContextLimitCache): HostSubscriptionEntry[] => [
  { eventName: "PRESET_CHANGED", handler: () => cache.invalidate() },
  { eventName: "CONNECTION_PROFILE_UPDATED", handler: () => cache.invalidate() },
];
