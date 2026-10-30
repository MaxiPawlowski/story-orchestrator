import type { GateNode, PrimitiveValue } from "@engine/index";
import { keyLabeler, type KeyLabelSource } from "@engine/keyLabel";

const OP_TEXT: Record<string, string> = { ">=": "≥", "<=": "≤", "==": "is", "!=": "is not", ">": ">", "<": "<", in: "is one of" };

export const qualityLabelOf = (source: KeyLabelSource): ((key: string) => string) => keyLabeler(source);

const valueText = (value: PrimitiveValue | PrimitiveValue[]): string => (Array.isArray(value) ? value.map(String).join(", ") : String(value));

export const readableGateText = (gate: GateNode, label: (key: string) => string): string => {
  if ("q" in gate) return `${label(gate.q)} ${OP_TEXT[gate.op] ?? gate.op} ${valueText(gate.v)}`;
  if ("all" in gate) return gate.all.map((entry) => readableGateText(entry, label)).join(" and ");
  if ("any" in gate) return gate.any.map((entry) => ("q" in entry ? readableGateText(entry, label) : `(${readableGateText(entry, label)})`)).join(" or ");
  return `not (${readableGateText(gate.not, label)})`;
};
