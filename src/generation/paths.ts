import { renderGateText, type GateLeaf, type GateNode, type PrimitiveValue, type ScaffoldingDelta } from "@engine/index";
import type { GeneratedBeat, GeneratedOutcome } from "./types";

// A generated beat with several outcomes is several routes, and both the code
// checks and the staleness revalidation have to reason about all of them: `outcomes[0]` described one
// path and silently assumed the rest were equivalent, which is how an omitted route stalled a player
// at the anchor gate. Bounded and deduped, because a wide chain must not turn a code check into a
// combinatorial explosion.

export const MAX_OUTCOME_PATHS = 256;

// A transition fires only while its gate holds, so every value an `==` leaf (or a
// one-value `in`) of the gate pins is a FACT at that point of the route. Simulating deltas alone judged
// the real model's chains as if a route could leave `approach == safe` with approach still unknown, and
// failed every chain whose outcomes steered by gate rather than by delta (6 of 6 real generations).
export function gatePins(gate: GateNode | undefined): Record<string, PrimitiveValue> {
  if (!gate) return {};
  if ("q" in gate) {
    if (gate.op === "==") return { [gate.q]: gate.v as PrimitiveValue };
    if (gate.op === "in" && Array.isArray(gate.v) && gate.v.length === 1) return { [gate.q]: gate.v[0] as PrimitiveValue };
    return {};
  }
  return "all" in gate ? Object.assign({}, ...gate.all.map(gatePins)) : {};
}

export const applyDeltas = (values: Record<string, PrimitiveValue>, deltas: ScaffoldingDelta[] | undefined): Record<string, PrimitiveValue> => {
  const next = { ...values };
  deltas?.forEach((delta) => { next[delta.q] = delta.v; });
  return next;
};

/** The values a route holds after taking this outcome: what its gate pinned, then what it wrote. */
export const applyOutcome = (values: Record<string, PrimitiveValue>, outcome: Pick<GeneratedOutcome, "gate" | "deltas">): Record<string, PrimitiveValue> =>
  applyDeltas({ ...values, ...gatePins(outcome.gate) }, outcome.deltas);

const pathKey = (path: Record<string, PrimitiveValue>) => JSON.stringify(Object.keys(path).sort().map((name) => [name, path[name]]));

const leafKnown = (leaf: GateLeaf, value: PrimitiveValue | undefined): boolean | null => {
  if (value === undefined) return null;
  if (leaf.op === "==") return value === leaf.v;
  if (leaf.op === "!=") return value !== leaf.v;
  if (leaf.op === "in") return Array.isArray(leaf.v) && leaf.v.includes(value);
  if (typeof value !== "number" || typeof leaf.v !== "number") return null;
  if (leaf.op === ">=") return value >= leaf.v;
  if (leaf.op === "<=") return value <= leaf.v;
  if (leaf.op === ">") return value > leaf.v;
  return value < leaf.v;
};

export const gateKnown = (gate: GateNode, values: Record<string, PrimitiveValue>): boolean | null => {
  if ("q" in gate) return leafKnown(gate, values[gate.q]);
  if ("not" in gate) {
    const inner = gateKnown(gate.not, values);
    return inner === null ? null : !inner;
  }
  const parts = ("all" in gate ? gate.all : gate.any).map((entry) => gateKnown(entry, values));
  const decisive = "all" in gate ? false : true;
  if (parts.includes(decisive)) return decisive;
  return parts.includes(null) ? null : !decisive;
};

export const gatesHeldOnEntry = (entry: Record<string, PrimitiveValue>, beats: GeneratedBeat[]): string[] => {
  const issues = new Set<string>();
  let states = [entry];
  beats.forEach((beat, index) => {
    const next = new Map<string, Record<string, PrimitiveValue>>();
    for (const state of states) {
      for (const outcome of beat.outcomes) {
        if (gateKnown(outcome.gate, state) === true) {
          issues.add(`beat ${index + 1} outcome '${outcome.label}' gate ${renderGateText(outcome.gate)} already holds when the beat starts, so the beat would pass without being played`);
        }
        const after = applyOutcome(state, outcome);
        next.set(pathKey(after), after);
      }
    }
    states = [...next.values()].slice(0, MAX_OUTCOME_PATHS);
  });
  return [...issues];
};

/** Every value-vector a chain can end in, one per route. Empty means "too many routes to check". */
export const outcomePaths = (start: Record<string, PrimitiveValue>, beats: GeneratedBeat[]): Record<string, PrimitiveValue>[] => {
  let paths = [start];
  for (const beat of beats) {
    const next: Record<string, PrimitiveValue>[] = [];
    for (const path of paths) for (const outcome of beat.outcomes) next.push(applyOutcome(path, outcome));
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
