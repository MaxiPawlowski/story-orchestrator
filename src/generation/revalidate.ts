import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import type { ExpansionCacheEntry, GeneratedBeat, RevalidationResult } from "./types";

const applyBeat = (values: Record<string, PrimitiveValue>, beat: GeneratedBeat) => {
  const next = { ...values };
  beat.outcomes[0]?.deltas?.forEach((delta) => { next[delta.q] = delta.v; });
  return next;
};

const matches = (current: PrimitiveValue | undefined, target: PrimitiveValue, tolerance: number) => {
  if (typeof current === "number" && typeof target === "number") return Math.abs(current - target) <= tolerance;
  return current === target;
};

export function revalidateExpansion(
  story: NormalizedStoryV2,
  entry: ExpansionCacheEntry,
  blackboard: Record<string, PrimitiveValue>,
  tolerance = 0.001,
): RevalidationResult {
  const target = story.checkpointById[entry.targetAnchorId];
  if (!target) return { status: "fail", validBeatCount: 0, issues: [`Unknown target anchor ${entry.targetAnchorId}`] };
  const driftIssues = Object.entries(target.state_snapshot ?? {})
    .filter(([key, value]) => key in entry.basis && blackboard[key] !== entry.basis[key] && !matches(blackboard[key], value, tolerance))
    .map(([key]) => `${key} drifted from expansion basis`);
  if (driftIssues.length) return { status: "fail", validBeatCount: 0, issues: driftIssues };
  let values = { ...blackboard };
  let validBeatCount = 0;
  for (const beat of entry.beats) {
    values = applyBeat(values, beat);
    validBeatCount += 1;
  }
  const issues = Object.entries(target.state_snapshot ?? {})
    .filter(([key, value]) => !matches(values[key], value, tolerance))
    .map(([key]) => `${key} does not bridge current blackboard to target`);
  if (!issues.length) return { status: "pass", validBeatCount, issues: [] };
  return { status: validBeatCount > 0 ? "partial" : "fail", validBeatCount: Math.max(0, validBeatCount - 1), issues };
}
