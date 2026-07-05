import { getGenerationBias, getTensionTrajectory } from "@pacing/index";
import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import { computeStateDelta } from "./delta";
import type { PlannedExpansionInput, StubExpansionCandidate } from "./types";

const tensionToNumeric: Record<string, number> = { calm: 0, stirring: 0.25, tense: 0.5, critical: 0.75, peak: 1 };

export function isStubCheckpoint(story: NormalizedStoryV2, checkpointId: string): boolean {
  const checkpoint = story.checkpointById[checkpointId];
  return Boolean(checkpoint && checkpoint.type === "intermediate" && !checkpoint.state_snapshot && !checkpoint.guidance && !checkpoint.effects && story.reachableByCheckpoint[checkpointId]?.some((id) => story.checkpointById[id]?.type === "anchor"));
}

export function findFirstReachableAnchor(story: NormalizedStoryV2, checkpointId: string): string | null {
  const queue = [...(story.outgoingByCheckpoint[checkpointId] ?? []).map((transition) => transition.to)];
  const seen = new Set<string>();
  while (queue.length) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    if (story.checkpointById[next]?.type === "anchor") return next;
    queue.push(...(story.outgoingByCheckpoint[next] ?? []).map((transition) => transition.to));
  }
  return null;
}

export function findStubExpansionCandidate(story: NormalizedStoryV2, sourceCheckpointId: string): StubExpansionCandidate | null {
  for (const transition of story.outgoingByCheckpoint[sourceCheckpointId] ?? []) {
    if (!isStubCheckpoint(story, transition.to)) continue;
    const targetAnchorId = findFirstReachableAnchor(story, transition.to);
    if (targetAnchorId) return { sourceCheckpointId, stubId: transition.to, targetAnchorId, transition };
  }
  return null;
}

export function planExpansion(
  story: NormalizedStoryV2,
  blackboard: { values: Record<string, PrimitiveValue> },
  candidate: StubExpansionCandidate,
  canon: string,
  facts: string[],
): PlannedExpansionInput {
  const target = story.checkpointById[candidate.targetAnchorId];
  const deltas = computeStateDelta({ values: blackboard.values, versions: {}, latched: {} }, target.state_snapshot, story);
  const currentTension = typeof blackboard.values.tension_current === "number" ? blackboard.values.tension_current : 0;
  const targetTension = target.tension_target ? tensionToNumeric[target.tension_target] : currentTension;
  const deltaWeight = deltas.reduce((sum, delta) => sum + (delta.distance ?? 1), 0);
  const beats = Math.max(2, Math.min(6, Math.ceil(deltaWeight)));
  return {
    candidate,
    beats,
    deltas,
    tensionTrajectory: getTensionTrajectory(currentTension, targetTension, beats),
    generationBias: getGenerationBias(currentTension, targetTension),
    canon,
    facts,
  };
}
