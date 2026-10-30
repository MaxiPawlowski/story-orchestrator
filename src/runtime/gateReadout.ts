import { evaluateGate, gateLeaves, renderGateText, type GateNode, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { labelForKey, type KeyLabelSource } from "@engine/keyLabel";

export interface GateLeafRow {
  key: string;
  label: string;
  op: string;
  want: string;
  now: string;
  met: boolean;
}

export interface GateRow {
  to: string;
  toName: string;
  raw: string;
  met: boolean;
  leaves: GateLeafRow[];
}

const OP_TEXT: Record<string, string> = { ">=": "≥", "<=": "≤", "==": "=", "!=": "≠", ">": ">", "<": "<", in: "in" };

const shown = (value: PrimitiveValue | PrimitiveValue[] | undefined): string => {
  if (value === undefined) return "unset";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  return String(value);
};

export const qualityLabel = (story: KeyLabelSource | null, key: string): string => labelForKey(story, key);

export const gateLeafRows = (story: KeyLabelSource | null, gate: GateNode, values: Record<string, PrimitiveValue>): GateLeafRow[] => {
  const reader = { get: (key: string) => values[key] };
  return gateLeaves(gate).map((leaf) => ({
    key: leaf.q, label: qualityLabel(story, leaf.q), op: OP_TEXT[leaf.op] ?? leaf.op, want: shown(leaf.v), now: shown(values[leaf.q]), met: evaluateGate(leaf, reader),
  }));
};

export const outgoingGateRows = (story: NormalizedStory | null, checkpointId: string | null | undefined, values: Record<string, PrimitiveValue>): GateRow[] => {
  if (!story || !checkpointId) return [];
  const reader = { get: (key: string) => values[key] };
  return (story.outgoingByCheckpoint[checkpointId] ?? []).map((transition) => ({
    to: transition.to,
    toName: story.checkpointById[transition.to]?.name ?? transition.to,
    raw: renderGateText(transition.gate),
    met: evaluateGate(transition.gate, reader),
    leaves: gateLeafRows(story, transition.gate, values),
  }));
};

export const gateLeafText = (leaf: GateLeafRow): string => `${leaf.label} ${leaf.op} ${leaf.want}, now ${leaf.now}`;

export const gateRowText = (row: GateRow): string => {
  const open = row.leaves.filter((leaf) => !leaf.met);
  return `${(open.length ? open : row.leaves).map(gateLeafText).join("; ")} → ${row.toName}`;
};
