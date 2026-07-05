import type { Blackboard } from "./blackboard";
import type { GateNode, NormalizedStoryV2, Checkpoint, Transition } from "./schema";

export const progressQualityForAnchor = (anchorId: string): string => `progress_toward_${anchorId}`;

export const thresholdFor = (anchor: Checkpoint): number => anchor.convergence_threshold ?? 1;

export const chainThresholdFor = (anchor: Checkpoint, chainSum: number): number => anchor.convergence_threshold ?? chainSum;

const findProgressGateValue = (gate: GateNode, key: string): number | undefined => {
  if ("q" in gate) return gate.q === key && gate.op === ">=" && typeof gate.v === "number" ? gate.v : undefined;
  if ("all" in gate) for (const entry of gate.all) { const v = findProgressGateValue(entry, key); if (v !== undefined) return v; }
  if ("any" in gate) for (const entry of gate.any) { const v = findProgressGateValue(entry, key); if (v !== undefined) return v; }
  if ("not" in gate) return findProgressGateValue(gate.not, key);
  return undefined;
};

export const effectiveThresholdFor = (story: NormalizedStoryV2, anchorId: string): number => {
  const key = progressQualityForAnchor(anchorId);
  let found: number | undefined;
  for (const transitions of Object.values(story.outgoingByCheckpoint)) {
    for (const transition of transitions) {
      if (transition.to !== anchorId) continue;
      const v = findProgressGateValue(transition.gate, key);
      if (v !== undefined && (found === undefined || v > found)) found = v;
    }
  }
  return found ?? story.checkpointById[anchorId]?.convergence_threshold ?? 1;
};

export const applyTransitionProgress = (blackboard: Blackboard, transition: Transition) => {
  const progress = transition.effects?.progress;
  if (!progress) return null;
  const key = progressQualityForAnchor(progress.anchor);
  const current = blackboard.get(key);
  const base = typeof current === "number" ? current : 0;
  return blackboard.applyDelta({ q: key, v: base + progress.amount, source: "code" });
};
