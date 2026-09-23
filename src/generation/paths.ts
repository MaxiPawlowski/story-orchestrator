import type { PrimitiveValue, ScaffoldingDelta } from "@engine/index";
import type { GeneratedBeat } from "./types";

// v2.3 plan 07 (R9). A generated beat with several outcomes is several routes, and both the code
// checks and the staleness revalidation have to reason about all of them: `outcomes[0]` described one
// path and silently assumed the rest were equivalent, which is how an omitted route stalled a player
// at the anchor gate. Bounded and deduped, because a wide chain must not turn a code check into a
// combinatorial explosion.

export const MAX_OUTCOME_PATHS = 256;

export const applyDeltas = (values: Record<string, PrimitiveValue>, deltas: ScaffoldingDelta[] | undefined): Record<string, PrimitiveValue> => {
  const next = { ...values };
  deltas?.forEach((delta) => { next[delta.q] = delta.v; });
  return next;
};

const pathKey = (path: Record<string, PrimitiveValue>) => JSON.stringify(Object.keys(path).sort().map((name) => [name, path[name]]));

/** Every value-vector a chain can end in, one per route. Empty means "too many routes to check". */
export const outcomePaths = (start: Record<string, PrimitiveValue>, beats: GeneratedBeat[]): Record<string, PrimitiveValue>[] => {
  let paths = [start];
  for (const beat of beats) {
    const next: Record<string, PrimitiveValue>[] = [];
    for (const path of paths) for (const outcome of beat.outcomes) next.push(applyDeltas(path, outcome.deltas));
    const seen = new Map<string, Record<string, PrimitiveValue>>();
    for (const path of next) {
      const key = pathKey(path);
      if (!seen.has(key)) seen.set(key, path);
    }
    paths = [...seen.values()];
    if (paths.length > MAX_OUTCOME_PATHS) return [];
  }
  return paths;
};
