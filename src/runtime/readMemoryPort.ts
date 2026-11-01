import type { ReadMemory } from "@extraction/readMemory";
import type { MemoryEntry } from "@memory/types";
import type { MemoryRuntimeState, RuntimeExtras } from "./types";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

export const readMemoryOf = (memory: () => MemoryRuntimeState, resting: (entries: MemoryEntry[]) => MemoryEntry[]): ReadMemory | null => {
  const state = memory();
  const { settings } = state;
  const on = settings.enabled !== false;
  const flags = {
    neighbours: on && settings.neighbourRead !== false, keys: on && settings.readKeys !== false,
    relations: on && settings.relationRows !== false, acts: settings.socialActs !== false,
  };
  if (!Object.values(flags).some(Boolean)) return null;
  return { entries: flags.neighbours ? resting(state.entries) : [], ...flags };
};

export const readMemoryFor = (extras: () => RuntimeExtras, memory: MemoryCoordinator) => (): ReadMemory | null =>
  readMemoryOf(() => extras().memory, (entries) => memory.injector.restingEntries(entries));
