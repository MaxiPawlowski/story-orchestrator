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

const optionsOf = (quality: Quality | undefined): PrimitiveValue[] | null => {
  if (quality?.type === "bool") return [true, false];
  return quality?.type === "enum" && quality.values?.length ? quality.values : null;
};

const allowed = (leaf: GateLeaf, options: PrimitiveValue[]): PrimitiveValue[] | null => {
  if (leaf.op === "==") return options.filter((option) => option === scalar(leaf.v));
  if (leaf.op === "!=") return options.filter((option) => option !== scalar(leaf.v));
  if (leaf.op === "in" && Array.isArray(leaf.v)) return options.filter((option) => (leaf.v as PrimitiveValue[]).includes(option));
  return null;
};

const implies = (held: GateLeaf, wanted: GateLeaf, quality: Quality | undefined): boolean => {
  if (held.q !== wanted.q) return false;
  const options = optionsOf(quality);
  const given = options ? allowed(held, options) : null;
  const needed = options ? allowed(wanted, options) : null;
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

const byQuality = (leaves: GateLeaf[]): Map<string, GateLeaf[]> => {
  const grouped = new Map<string, GateLeaf[]>();
  leaves.forEach((leaf) => grouped.set(leaf.q, [...(grouped.get(leaf.q) ?? []), leaf]));
  return grouped;
};

const routesInto = (draft: StoryV2, target: string): Transition[][] => {
  const routes: Transition[][] = [];
  const walk = (route: Transition[], seen: Set<string>) => {
    if (routes.length >= MAX_ROUTES) return;
    const head = route[0].from;
    const before = draft.transitions.filter((entry) => entry.to === head && entry.from !== entry.to && !seen.has(entry.from));
    if (!before.length) {
      routes.push(route);
      return;
    }
    before.forEach((entry) => walk([entry, ...route], new Set([...seen, entry.from])));
  };
  draft.transitions.filter((entry) => entry.to === target && entry.from !== entry.to).forEach((entry) => walk([entry], new Set([target, entry.from])));
  return routes;
};

const factsAlong = (draft: StoryV2, route: Transition[], qualities: Map<string, Quality>): Map<string, Fact> => {
  const facts = new Map<string, Fact>();
  const snapshots = new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, snapshotLeaves(checkpoint.state_snapshot)]));
  route.forEach((edge, index) => {
    const entering = index === route.length - 1;
    byQuality(conjuncts(edge.gate) ?? []).forEach((leaves, q) => facts.set(q, { leaves, origin: `when the story left '${edge.from}'`, entering }));
    byQuality(snapshots.get(edge.to) ?? []).forEach((leaves, q) => facts.set(q, { leaves, origin: `the state_snapshot of '${edge.to}'`, entering }));
  });
  return new Map([...facts].filter(([q, fact]) => fact.entering || persists(qualities.get(q))));
};

const openedBy = (facts: Map<string, Fact>, wanted: GateLeaf[], qualities: Map<string, Quality>): Fact[] | null => {
  const used: Fact[] = [];
  for (const leaf of wanted) {
    const fact = facts.get(leaf.q);
    if (!fact || !fact.leaves.some((given) => implies(given, leaf, qualities.get(leaf.q)))) return null;
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

const exitOpenOnArrival = (draft: StoryV2, exit: Transition, qualities: Map<string, Quality>): string | null => {
  const wanted = conjuncts(exit.gate);
  if (!wanted?.length || exit.from === exit.to) return null;
  const own = snapshotLeaves(draft.checkpoints.find((checkpoint) => checkpoint.id === exit.from)?.state_snapshot);
  if (own.length && wanted.every((leaf) => own.some((given) => implies(given, leaf, qualities.get(leaf.q))))) return "the checkpoint's own state_snapshot already sets it";
  const routes = routesInto(draft, exit.from).sort((left, right) => left.length - right.length);
  for (const route of routes) {
    for (let start = route.length - 1; start >= 0; start -= 1) {
      const tail = route.slice(start);
      const used = openedBy(factsAlong(draft, tail, qualities), wanted, qualities);
      if (used) return reason(exit, tail, used);
    }
  }
  return null;
};

export const passThroughExits = (draft: StoryV2): PassThrough[] => {
  const qualities = new Map(draft.qualities.map((quality) => [quality.key, quality]));
  return draft.transitions.flatMap((exit, index) => {
    const because = exitOpenOnArrival(draft, exit, qualities);
    return because ? [{ index, exit, because }] : [];
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
