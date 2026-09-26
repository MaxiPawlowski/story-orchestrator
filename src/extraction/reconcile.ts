import type { GateNode, NormalizedStoryV2, PrimitiveValue, Quality } from "@engine/index";
import type { ChatWindowReader, ReconciliationDescriptor, SharedReadWindow } from "./types";
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

type ReconcileState = {
  activeCheckpointId: string;
  boundary: number;
  checkpointStartedBoundary: number;
  checkpointStartedMessageId: number;
  lastMessageId: number;
  blackboard: { values: Record<string, unknown> };
};

export interface ReconciliationPlan {
  descriptor: ReconciliationDescriptor;
  reason: string;
  window: SharedReadWindow;
  leaves: Array<{ q: string; rubric: string; type: Quality["type"]; op: string; v: PrimitiveValue | PrimitiveValue[]; world?: boolean }>;
}

const collectUnmetLeaves = (gate: GateNode, story: NormalizedStoryV2, values: Record<string, unknown>, out: ReconciliationPlan["leaves"]) => {
  if ("q" in gate) {
    const quality = story.qualityByKey[gate.q];
    if (quality?.source === "extractor" && !compareLeaf(
      gate,
      values[gate.q],
    ) && !out.some((leaf) => leaf.q === gate.q && JSON.stringify(leaf.v) === JSON.stringify(gate.v) && leaf.op === gate.op)) out.push({
      q: gate.q,
      rubric: quality.rubric,
      type: quality.type,
      op: gate.op,
      v: gate.v,
      ...(quality.evidence_from === "world" ? { world: true } : {})
    });
    return;
  }
  if ("all" in gate) gate.all.forEach((entry) => collectUnmetLeaves(entry, story, values, out));
  if ("any" in gate) gate.any.forEach((entry) => collectUnmetLeaves(entry, story, values, out));
};

// v2.2 plan 06: the stall, planned but not scheduled, so a judge pre-check can decide first.
export function planReconciliation(story: NormalizedStoryV2 | null, state: ReconcileState | null, multiplier: number, readWindow: ChatWindowReader): ReconciliationPlan | null {
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
  const leaves: ReconciliationPlan["leaves"] = [];
  for (const transition of story.outgoingByCheckpoint[state.activeCheckpointId] ?? []) {
    if (!gateMatches(transition.gate, state.blackboard.values)) collectUnmetLeaves(transition.gate, story, state.blackboard.values, leaves);
  }
  return {
    descriptor: { checkpointId: state.activeCheckpointId, boundary: state.boundary, targetedKeys: [...unmet] },
    reason: `reconcile:${[...unmet].join(",")}`,
    window: readWindow(Math.max(0, state.checkpointStartedMessageId + 1), state.lastMessageId),
    leaves,
  };
}

export function maybeScheduleReconciliation(
  story: NormalizedStoryV2 | null, state: ReconcileState | null, multiplier: number, scheduler: ExtractionScheduler, readWindow: ChatWindowReader,
): ReconciliationDescriptor | null {
  const plan = planReconciliation(story, state, multiplier, readWindow);
  if (!plan) return null;
  scheduler.schedule({ priority: 0, reason: plan.reason, window: plan.window });
  return plan.descriptor;
}

// v2.3 plan 02 (R6). A read scheduled for a reconciliation carries the keys it was created for in
// its reason, so the log can resolve the request the answer actually belongs to: the first
// *unresolved* event is a different set of keys as soon as two stalls overlap.
export const reconciliationTargets = (reason: string): string[] =>
  reason.startsWith("reconcile:") ? reason.slice("reconcile:".length).split(",").filter(Boolean) : [];

/** `planReconciliation` lists the same leaves in the same order, but identity here is the set. */
export const reconciliationKeySet = (keys: string[]): string => [...keys].sort().join("\u0000");
