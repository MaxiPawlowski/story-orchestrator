import { log } from "@utils/log";

export interface LoreTokenRow {
  comment: string;
  tokens: number;
  disabled: boolean;
  constant?: boolean;
}

export interface LoreTokenSource {
  entries: (lorebook: string) => readonly LoreTokenRow[] | null;
  clear: () => void;
}

const fold = (text: string) => text.trim().toLowerCase();

export function createLoreTokenSource(load: (lorebook: string) => Promise<LoreTokenRow[]>, loaded: () => void): LoreTokenSource {
  const cache = new Map<string, LoreTokenRow[]>();
  const pending = new Set<string>();
  let epoch = 0;
  return {
    entries: (lorebook) => {
      const key = fold(lorebook);
      const hit = cache.get(key);
      if (hit) return hit;
      if (key && !pending.has(key)) {
        pending.add(key);
        const started = epoch;
        void load(lorebook).catch((error: unknown): LoreTokenRow[] => {
          log.warn("a lorebook's size could not be read for the Studio lore budget", error);
          return [];
        }).then((rows) => {
          if (started !== epoch) return;
          pending.delete(key);
          cache.set(key, rows);
          loaded();
        });
      }
      return null;
    },
    clear: () => {
      epoch += 1;
      cache.clear();
      pending.clear();
    },
  };
}
