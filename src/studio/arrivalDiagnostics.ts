import { renderGateText, type GateLeaf, type GateNode, type PrimitiveValue, type Quality, type StoryV2, type Transition } from "@engine/index";

type ArrivalCode = "gate-open-on-arrival";

export const ARRIVAL_CONSEQUENCES: Record<ArrivalCode, string> = {
  "gate-open-on-arrival": "This checkpoint is skipped after one turn: its way out is already open when the story arrives, so its scene never gets played.",
};

export interface ArrivalRun {
  draft: StoryV2;
  push: (code: ArrivalCode, severity: "warning", path: string, message: string) => void;
}

export interface PassThrough {
  index: number;
  exit: Transition;
  because: string;
}

const MAX_ROUTES = 256;

const conjuncts = (gate: GateNode): GateLeaf[] | null => {
  if ("q" in gate) return [gate];
  if (!("all" in gate)) return null;
  const parts = gate.all.map(conjuncts);
  return parts.every((part): part is GateLeaf[] => part !== null) ? parts.flat() : null;
};

const scalar = (value: GateLeaf["v"]): PrimitiveValue | null => (Array.isArray(value) ? null : value);

const number = (value: GateLeaf["v"]): number | null => (typeof value === "number" ? value : null);

const lowerBound = (leaf: GateLeaf): { at: number; strict: boolean } | null => {
  const at = number(leaf.v);
  if (at === null) return null;
  if (leaf.op === ">=" || leaf.op === "==") return { at, strict: false };
  return leaf.op === ">" ? { at, strict: true } : null;
};

const upperBound = (leaf: GateLeaf): { at: number; strict: boolean } | null => {
  const at = number(leaf.v);
  if (at === null) return null;
  if (leaf.op === "<=" || leaf.op === "==") return { at, strict: false };
  return leaf.op === "<" ? { at, strict: true } : null;
};

const impliesBound = (held: { at: number; strict: boolean } | null, wanted: number, strict: boolean, above: boolean): boolean => {
  if (!held) return false;
  const tighter = above ? held.at > wanted : held.at < wanted;
  return tighter || (held.at === wanted && (held.strict || !strict));
};

const impliesMembership = (held: GateLeaf, wanted: PrimitiveValue[]): boolean => {
  if (held.op === "==") return wanted.includes(scalar(held.v) as PrimitiveValue);
  return held.op === "in" && Array.isArray(held.v) && held.v.every((value) => wanted.includes(value));
};

const impliesOpen = (held: GateLeaf, wanted: GateLeaf): boolean => {
  const target = number(wanted.v);
  switch (wanted.op) {
    case "==": return held.op === "==" && scalar(held.v) === scalar(wanted.v);
    case "!=": return (held.op === "==" || held.op === "!=") && (scalar(held.v) === scalar(wanted.v)) === (held.op === "!=");
    case "in": return Array.isArray(wanted.v) && impliesMembership(held, wanted.v);
    case ">=": case ">": return target !== null && impliesBound(lowerBound(held), target, wanted.op === ">", true);
    case "<=": case "<": return target !== null && impliesBound(upperBound(held), target, wanted.op === "<", false);
    default: return false;
  }
};

const BOOL_OPTIONS: readonly PrimitiveValue[] = Object.freeze([true, false]);

const optionsOf = (quality: Quality | undefined): readonly PrimitiveValue[] | null => {
  if (quality?.type === "bool") return BOOL_OPTIONS;
  return quality?.type === "enum" && quality.values?.length ? quality.values : null;
};

const allowed = (leaf: GateLeaf, options: readonly PrimitiveValue[]): PrimitiveValue[] | null => {
  if (leaf.op === "==") return options.filter((option) => option === scalar(leaf.v));
  if (leaf.op === "!=") return options.filter((option) => option !== scalar(leaf.v));
  if (leaf.op === "in" && Array.isArray(leaf.v)) return options.filter((option) => (leaf.v as PrimitiveValue[]).includes(option));
  return null;
};

const allowedFor = (index: ArrivalIndex, leaf: GateLeaf): PrimitiveValue[] | null => {
  if (index.allowed.has(leaf)) return index.allowed.get(leaf) ?? null;
  if (!index.options.has(leaf.q)) index.options.set(leaf.q, optionsOf(index.qualities.get(leaf.q)));
  const options = index.options.get(leaf.q);
  const result = options ? allowed(leaf, options) : null;
  index.allowed.set(leaf, result);
  return result;
};

const implies = (index: ArrivalIndex, held: GateLeaf, wanted: GateLeaf): boolean => {
  if (held.q !== wanted.q) return false;
  const given = allowedFor(index, held);
  const needed = allowedFor(index, wanted);
  if (given && needed && given.length) return given.every((option) => needed.includes(option));
  return impliesOpen(held, wanted);
};

const persists = (quality: Quality | undefined): boolean =>
  Boolean(quality && (quality.latching || quality.monotonic || quality.type === "enum" || quality.type === "bool"));

interface Fact {
  leaves: GateLeaf[];
  origin: string;
  entering: boolean;
}

const snapshotLeaves = (snapshot: Record<string, PrimitiveValue> | undefined): GateLeaf[] =>
  Object.entries(snapshot ?? {}).map(([q, v]) => ({ q, op: "==", v }));

const byQuality = (index: ArrivalIndex, leaves: GateLeaf[]): Map<string, GateLeaf[]> => {
  const cached = index.grouped.get(leaves);
  if (cached) return cached;
  const grouped = new Map<string, GateLeaf[]>();
  leaves.forEach((leaf) => {
    const list = grouped.get(leaf.q);
    if (list) list.push(leaf);
    else grouped.set(leaf.q, [leaf]);
  });
  index.grouped.set(leaves, grouped);
  return grouped;
};

const NO_LEAVES: GateLeaf[] = [];

const conjunctsOf = (index: ArrivalIndex, gate: GateNode): GateLeaf[] | null => {
  if (index.conjuncts.has(gate)) return index.conjuncts.get(gate) ?? null;
  const leaves = conjuncts(gate);
  index.conjuncts.set(gate, leaves);
  return leaves;
};

interface ArrivalIndex {
  draft: StoryV2;
  qualities: Map<string, Quality>;
  incoming: Map<string, Transition[]>;
  snapshots: Map<string, GateLeaf[]>;
  routes: Map<string, Transition[][]>;
  conjuncts: WeakMap<GateNode, GateLeaf[] | null>;
  grouped: WeakMap<GateLeaf[], Map<string, GateLeaf[]>>;
  options: Map<string, readonly PrimitiveValue[] | null>;
  allowed: WeakMap<GateLeaf, PrimitiveValue[] | null>;
}

const arrivalIndex = (draft: StoryV2): ArrivalIndex => {
  const incoming = new Map<string, Transition[]>();
  draft.transitions.filter((entry) => entry.from !== entry.to).forEach((entry) => incoming.set(entry.to, [...(incoming.get(entry.to) ?? []), entry]));
  return {
    draft,
    qualities: new Map(draft.qualities.map((quality) => [quality.key, quality])),
    incoming,
    snapshots: new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, snapshotLeaves(checkpoint.state_snapshot)])),
    routes: new Map(),
    conjuncts: new WeakMap(),
    grouped: new WeakMap(),
    options: new Map(),
    allowed: new WeakMap(),
  };
};

const routesInto = (index: ArrivalIndex, target: string): Transition[][] => {
  const cached = index.routes.get(target);
  if (cached) return cached;
  const routes: Transition[][] = [];
  const reversed: Transition[] = [];
  const seen = new Set<string>([target]);
  const step = (entry: Transition) => {
    reversed.push(entry);
    seen.add(entry.from);
    walk();
    seen.delete(entry.from);
    reversed.pop();
  };
  const walk = () => {
    if (routes.length >= MAX_ROUTES) return;
    const before = (index.incoming.get(reversed[reversed.length - 1].from) ?? []).filter((entry) => !seen.has(entry.from));
    if (!before.length) {
      routes.push(reversed.slice().reverse());
      return;
    }
    before.forEach(step);
  };
  (index.incoming.get(target) ?? []).forEach(step);
  routes.sort((left, right) => left.length - right.length);
  index.routes.set(target, routes);
  return routes;
};

const learn = (index: ArrivalIndex, facts: Map<string, Fact>, leaves: GateLeaf[], origin: string, entering: boolean) => {
  byQuality(index, leaves).forEach((grouped, q) => {
    if (!facts.has(q)) facts.set(q, { leaves: grouped, origin, entering });
  });
};

const openedBy = (index: ArrivalIndex, facts: Map<string, Fact>, wanted: GateLeaf[]): Fact[] | null => {
  const used: Fact[] = [];
  for (const leaf of wanted) {
    const fact = facts.get(leaf.q);
    if (!fact || !(fact.entering || persists(index.qualities.get(leaf.q)))) return null;
    if (!fact.leaves.some((given) => implies(index, given, leaf))) return null;
    if (!used.includes(fact)) used.push(fact);
  }
  return used;
};

const reason = (exit: Transition, route: Transition[], used: Fact[]): string => {
  const entry = route[route.length - 1];
  const own = `the state_snapshot of '${exit.from}'`;
  if (used.every((fact) => fact.origin === own)) return "the checkpoint's own state_snapshot already sets it";
  if (used.every((fact) => fact.entering)) return `the way in from '${entry.from}' already required it`;
  const origins = [...new Set(used.filter((fact) => !fact.entering).map((fact) => fact.origin))];
  const path = [...route.map((edge) => `'${edge.from}'`), `'${exit.from}'`].join(" -> ");
  return `on the way in through ${path} it already holds (${origins.join(", ")}) and nothing later on that route asks about it again`;
};

const exitOpenOnArrival = (index: ArrivalIndex, exit: Transition): string | null => {
  const wanted = conjunctsOf(index, exit.gate);
  if (!wanted?.length || exit.from === exit.to) return null;
  const own = index.snapshots.get(exit.from) ?? NO_LEAVES;
  if (own.length && wanted.every((leaf) => own.some((given) => implies(index, given, leaf)))) return "the checkpoint's own state_snapshot already sets it";
  for (const route of routesInto(index, exit.from)) {
    const facts = new Map<string, Fact>();
    for (let start = route.length - 1; start >= 0; start -= 1) {
      const edge = route[start];
      const entering = start === route.length - 1;
      learn(index, facts, index.snapshots.get(edge.to) ?? NO_LEAVES, `the state_snapshot of '${edge.to}'`, entering);
      learn(index, facts, conjunctsOf(index, edge.gate) ?? NO_LEAVES, `when the story left '${edge.from}'`, entering);
      const used = openedBy(index, facts, wanted);
      if (used) return reason(exit, route.slice(start), used);
    }
  }
  return null;
};

export const passThroughExits = (draft: StoryV2): PassThrough[] => {
  const index = arrivalIndex(draft);
  return draft.transitions.flatMap((exit, at) => {
    const because = exitOpenOnArrival(index, exit);
    return because ? [{ index: at, exit, because }] : [];
  });
};

export const checkGateOpenOnArrival = ({ draft, push }: ArrivalRun) => {
  passThroughExits(draft).forEach(({ index, exit, because }) => push(
    "gate-open-on-arrival",
    "warning",
    `transitions.${index}.gate`,
    `'${exit.from}' is passed straight through: its way out to '${exit.to}' asks for ${renderGateText(exit.gate)}, and ${because}, so it fires at the next turn. ` +
      "Gate the way out on something that happens in this checkpoint.",
  ));
};
