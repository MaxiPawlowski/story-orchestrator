import { renderGateText, type GateLeaf, type GateNode, type PrimitiveValue, type StoryV2 } from "@engine/index";

type ArrivalCode = "gate-open-on-arrival";

export const ARRIVAL_CONSEQUENCES: Record<ArrivalCode, string> = {
  "gate-open-on-arrival": "This checkpoint is skipped after one turn: its way out is already open when the story arrives, so its scene never gets played.",
};

export interface ArrivalRun {
  draft: StoryV2;
  push: (code: ArrivalCode, severity: "warning", path: string, message: string) => void;
}

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

const implies = (held: GateLeaf, wanted: GateLeaf): boolean => {
  if (held.q !== wanted.q) return false;
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

export const checkGateOpenOnArrival = ({ draft, push }: ArrivalRun) => {
  const snapshotKeys = new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, new Set(Object.keys(checkpoint.state_snapshot ?? {}))]));
  draft.transitions.forEach((exit, index) => {
    const wanted = conjuncts(exit.gate);
    if (!wanted?.length || exit.from === exit.to) return;
    const reset = snapshotKeys.get(exit.from) ?? new Set<string>();
    if (wanted.some((leaf) => reset.has(leaf.q))) return;
    const entry = draft.transitions.find((candidate) => {
      if (candidate.to !== exit.from || candidate.from === candidate.to) return false;
      const held = conjuncts(candidate.gate);
      return held !== null && wanted.every((leaf) => held.some((given) => implies(given, leaf)));
    });
    if (!entry) return;
    push(
      "gate-open-on-arrival",
      "warning",
      `transitions.${index}.gate`,
      `'${exit.from}' is passed straight through: its way out to '${exit.to}' asks for ${renderGateText(exit.gate)}, which the way in from '${entry.from}' already ` +
        "required, so it fires at the next turn. Gate the way out on something that happens in this checkpoint.",
    );
  });
};
