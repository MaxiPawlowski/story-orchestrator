import type { Blackboard } from "./blackboard";
import type { GateLeaf, GateNode, PrimitiveValue } from "./schema";

const compareLeaf = (leaf: GateLeaf, current: PrimitiveValue | undefined): boolean => {
  if (current === undefined) return false;
  if (leaf.op === "==") return current === leaf.v;
  if (leaf.op === "!=") return current !== leaf.v;
  if (leaf.op === "in") return Array.isArray(leaf.v) && leaf.v.includes(current);
  if (typeof current !== "number" || typeof leaf.v !== "number") return false;
  if (leaf.op === ">=") return current >= leaf.v;
  if (leaf.op === "<=") return current <= leaf.v;
  if (leaf.op === ">") return current > leaf.v;
  if (leaf.op === "<") return current < leaf.v;
  return false;
};

export type GateReader = Pick<Blackboard, "get">;

// Every quality a gate reads, deduped in order. Shared by the story diff, the commit-evidence
// diagnostics and the recovery that resets a fired transition's keys.
export const gateLeaves = (gate: GateNode, out: GateLeaf[] = []): GateLeaf[] => {
  if ("q" in gate) out.push(gate);
  else if ("all" in gate) gate.all.forEach((entry) => gateLeaves(entry, out));
  else if ("any" in gate) gate.any.forEach((entry) => gateLeaves(entry, out));
  else gateLeaves(gate.not, out);
  return out;
};

export const gateKeys = (gate: GateNode): string[] => [...new Set(gateLeaves(gate).map((leaf) => leaf.q))];

export const evaluateGate = (gate: GateNode, blackboard: GateReader): boolean => {
  if ("q" in gate) return compareLeaf(gate, blackboard.get(gate.q));
  if ("all" in gate) return gate.all.every((entry) => evaluateGate(entry, blackboard));
  if ("any" in gate) return gate.any.some((entry) => evaluateGate(entry, blackboard));
  return !evaluateGate(gate.not, blackboard);
};

const renderValue = (value: PrimitiveValue | PrimitiveValue[]): string => {
  if (Array.isArray(value)) return `[${value.map(renderValue).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
};

export const renderGateText = (gate: GateNode): string => {
  if ("q" in gate) return `${gate.q} ${gate.op} ${renderValue(gate.v)}`;
  if ("all" in gate) return gate.all.map(renderGateText).join(" AND ");
  if ("any" in gate) return gate.any.map((entry) => `(${renderGateText(entry)})`).join(" OR ");
  return `NOT (${renderGateText(gate.not)})`;
};
