import { storySessionStore } from "@store/storySessionStore";
import type {
  Consequence,
  ForegoneTransition,
  NarrativeMemoryState,
  NarrativeSeed,
  RoleState,
  SceneMemoryEntry,
} from "../types/narrative-memory";

const CONSEQUENCE_ID_PREFIX = "csq-";
const SEED_ID_PREFIX = "seed-";

type RuntimeSnapshot = ReturnType<typeof storySessionStore.getState>;

const sanitizeLimit = (value: number | undefined, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
};

const cloneMemory = (memory: NarrativeMemoryState | undefined): NarrativeMemoryState => {
  const source = memory ?? createEmptyMemory();
  return {
    consequences: [...source.consequences],
    seeds: [...source.seeds],
    roleStates: { ...source.roleStates },
    sceneMemory: [...source.sceneMemory],
    foregoneTransitions: [...source.foregoneTransitions],
  };
};

const writeMemory = (updater: (memory: NarrativeMemoryState, snapshot: RuntimeSnapshot) => NarrativeMemoryState): NarrativeMemoryState => {
  const snapshot = storySessionStore.getState();
  const nextMemory = updater(cloneMemory(snapshot.runtime.memory), snapshot);
  snapshot.writeRuntime({
    ...snapshot.runtime,
    memory: nextMemory,
  });
  return nextMemory;
};

const nextSequentialId = (items: { id: string }[], prefix: string): string => {
  let max = 0;
  for (const item of items) {
    if (!item.id.startsWith(prefix)) continue;
    const suffix = Number(item.id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) {
      max = suffix;
    }
  }
  return `${prefix}${max + 1}`;
};

const countTagMatches = (entryTags: string[], requestedTags: string[]): number => {
  if (!requestedTags.length) return 0;
  const requested = new Set(requestedTags);
  let matches = 0;
  for (const tag of entryTags) {
    if (requested.has(tag)) {
      matches += 1;
    }
  }
  return matches;
};

export const createEmptyMemory = (): NarrativeMemoryState => ({
  consequences: [],
  seeds: [],
  roleStates: {},
  sceneMemory: [],
  foregoneTransitions: [],
});

export const addConsequence = (entry: Omit<Consequence, "id">): Consequence => {
  let created: Consequence = { ...entry, id: "" };
  writeMemory((memory) => {
    created = {
      ...entry,
      id: nextSequentialId(memory.consequences, CONSEQUENCE_ID_PREFIX),
    };
    return {
      ...memory,
      consequences: [...memory.consequences, created],
    };
  });
  return created;
};

export const removeConsequence = (id: string): boolean => {
  let removed = false;
  writeMemory((memory) => {
    const consequences = memory.consequences.filter((entry) => entry.id !== id);
    removed = consequences.length !== memory.consequences.length;
    return removed
      ? { ...memory, consequences }
      : memory;
  });
  return removed;
};

export const getTopConsequences = (opts: { tags?: string[]; limit?: number } = {}): Consequence[] => {
  const requestedTags = (opts.tags ?? []).filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
  const limit = sanitizeLimit(opts.limit, 10);
  if (limit === 0) return [];

  return [...(storySessionStore.getState().runtime.memory?.consequences ?? [])]
    .filter((entry) => requestedTags.length === 0 || countTagMatches(entry.tags, requestedTags) > 0)
    .sort((left, right) => {
      const matchDelta = countTagMatches(right.tags, requestedTags) - countTagMatches(left.tags, requestedTags);
      if (matchDelta !== 0) return matchDelta;
      return right.weight - left.weight;
    })
    .slice(0, limit);
};

export const addSeed = (entry: Omit<NarrativeSeed, "id">): NarrativeSeed => {
  let created: NarrativeSeed = { ...entry, id: "" };
  writeMemory((memory) => {
    created = {
      ...entry,
      id: nextSequentialId(memory.seeds, SEED_ID_PREFIX),
    };
    return {
      ...memory,
      seeds: [...memory.seeds, created],
    };
  });
  return created;
};

export const resolveSeed = (id: string): boolean => {
  let resolved = false;
  writeMemory((memory) => {
    const seeds = memory.seeds.map((entry) => {
      if (entry.id !== id || entry.resolved) return entry;
      resolved = true;
      return { ...entry, resolved: true };
    });
    return resolved
      ? { ...memory, seeds }
      : memory;
  });
  return resolved;
};

export const getOpenSeeds = (): NarrativeSeed[] => {
  return [...(storySessionStore.getState().runtime.memory?.seeds ?? [])]
    .filter((entry) => entry.resolved === false)
    .sort((left, right) => left.createdAtTurn - right.createdAtTurn);
};

export const updateRoleState = (role: string, summary: string, turn: number): RoleState => {
  const nextState: RoleState = {
    role,
    summary,
    lastUpdatedTurn: turn,
  };
  writeMemory((memory) => ({
    ...memory,
    roleStates: {
      ...memory.roleStates,
      [role]: nextState,
    },
  }));
  return nextState;
};

export const getRoleStates = (): Record<string, RoleState> => {
  return { ...(storySessionStore.getState().runtime.memory?.roleStates ?? {}) };
};

export const addSceneMemory = (entry: Omit<SceneMemoryEntry, never>): void => {
  writeMemory((memory) => ({
    ...memory,
    sceneMemory: [...memory.sceneMemory, entry],
  }));
};

export const getRecentSceneMemory = (limit = 5): SceneMemoryEntry[] => {
  const normalizedLimit = sanitizeLimit(limit, 5);
  if (normalizedLimit === 0) return [];

  return [...(storySessionStore.getState().runtime.memory?.sceneMemory ?? [])]
    .slice(-normalizedLimit)
    .reverse();
};

export const addForegoneTransition = (entry: ForegoneTransition): void => {
  writeMemory((memory) => ({
    ...memory,
    foregoneTransitions: [...memory.foregoneTransitions, entry],
  }));
};
