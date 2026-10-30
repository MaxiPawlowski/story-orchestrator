import type { GateNode, PrimitiveValue } from "@engine/index";

const OP_TEXT: Record<string, string> = { ">=": "≥", "<=": "≤", "==": "is", "!=": "is not", ">": ">", "<": "<", in: "is one of" };

const humanKey = (key: string): string => key.replace(/_+/g, " ").trim();

export const qualityLabelOf = (qualities: ReadonlyArray<{ key: string; display?: { label?: string } }>) => {
  const byKey = new Map(qualities.map((quality) => [quality.key, quality.display?.label?.trim()]));
  return (key: string): string => byKey.get(key) || humanKey(key);
};

const valueText = (value: PrimitiveValue | PrimitiveValue[]): string => (Array.isArray(value) ? value.map(String).join(", ") : String(value));

export const readableGateText = (gate: GateNode, label: (key: string) => string): string => {
  if ("q" in gate) return `${label(gate.q)} ${OP_TEXT[gate.op] ?? gate.op} ${valueText(gate.v)}`;
  if ("all" in gate) return gate.all.map((entry) => readableGateText(entry, label)).join(" and ");
  if ("any" in gate) return gate.any.map((entry) => ("q" in entry ? readableGateText(entry, label) : `(${readableGateText(entry, label)})`)).join(" or ");
  return `not (${readableGateText(gate.not, label)})`;
};
