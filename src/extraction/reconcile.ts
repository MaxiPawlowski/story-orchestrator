import type { GateNode, NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import type { ReconciliationDescriptor } from "./types";
import { getChatWindow } from "./chatWindow";
import type { ExtractionScheduler } from "./scheduler";

const collectUnmet = (gate: GateNode, story: NormalizedStoryV2, values: Record<string, unknown>, keys: Set<string>) => {
  if ("q" in gate) {
    const quality = story.qualityByKey[gate.q];
    if (quality?.source === "extractor") keys.add(gate.q);
    return;
  }
  if ("all" in gate) gate.all.forEach((entry) => collectUnmet(entry, story, values, keys));
  if ("any" in gate) gate.any.forEach((entry) => collectUnmet(entry, story, values, keys));
  if ("not" in gate) collectUnmet(gate.not, story, values, keys);
};

const compareLeaf = (gate: Extract<GateNode, { q: string }>, value: unknown) => {
  if (value === undefined) return false;
  const current = value as PrimitiveValue;
  if (gate.op === "==") return current === gate.v;
  if (gate.op === "!=") return current !== gate.v;
  if (gate.op === "in") return Array.isArray(gate.v) && gate.v.includes(current);
  if (typeof current !== "number" || typeof gate.v !== "number") return false;
  if (gate.op === ">=") return current >= gate.v;
  if (gate.op === "<=") return current <= gate.v;
  if (gate.op === ">") return current > gate.v;
  if (gate.op === "<") return current < gate.v;
  return false;
};

const gateMatches = (gate: GateNode, values: Record<string, unknown>): boolean => {
  if ("q" in gate) return compareLeaf(gate, values[gate.q]);
  if ("all" in gate) return gate.all.every((entry) => gateMatches(entry, values));
  if ("any" in gate) return gate.any.some((entry) => gateMatches(entry, values));
  return !gateMatches(gate.not, values);
};

export function maybeScheduleReconciliation(story: NormalizedStoryV2 | null, state: { activeCheckpointId: string; boundary: number; checkpointStartedBoundary: number; checkpointStartedMessageId: number; lastMessageId: number; blackboard: { values: Record<string, unknown> } } | null, multiplier: number, scheduler: ExtractionScheduler): ReconciliationDescriptor | null {
  if (!story || !state) return null;
  const checkpoint = story.checkpointById[state.activeCheckpointId];
  const target = Math.max(Math.ceil((checkpoint?.target_turn_length ?? 4) * multiplier), 6);
  const turns = state.boundary - state.checkpointStartedBoundary;
  if (turns < target || (turns - target) % 3 !== 0) return null;
  const unmet = new Set<string>();
  for (const transition of story.outgoingByCheckpoint[state.activeCheckpointId] ?? []) {
    if (!gateMatches(transition.gate, state.blackboard.values)) {
      collectUnmet(transition.gate, story, state.blackboard.values, unmet);
    }
  }
  if (!unmet.size) return null;
  scheduler.schedule({ priority: 0, reason: `reconcile:${[...unmet].join(",")}`, window: getChatWindow(Math.max(0, state.checkpointStartedMessageId + 1), state.lastMessageId) });
  return { checkpointId: state.activeCheckpointId, boundary: state.boundary, targetedKeys: [...unmet] };
}
