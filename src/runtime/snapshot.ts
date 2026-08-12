import { effectiveThresholdFor, progressQualityForAnchor, type ApplyQueueEntry, type ArcTemplate, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { expectedTension, getSteeringHint, levelToNumeric, numericToLevel } from "@pacing/index";
import type { ConvergenceReadout, PendingDeltaReadout, RuntimeSnapshot, StoryIdentity, StoryLibraryRecord } from "./types";

// Pure readouts over engine state — the composition half of the snapshot, kept out of the
// manager so a reader can see what the UI is handed without reading the orchestration.

export const buildStoryIdentity = (loaded: StoryLibraryRecord | null, libraryRecord: StoryLibraryRecord | null, pinned: boolean): StoryIdentity => ({
  id: loaded?.id ?? null,
  playedVersion: loaded?.version ?? null,
  libraryVersion: libraryRecord?.version ?? null,
  pinned,
  drifted: Boolean(loaded && libraryRecord && libraryRecord.hash !== loaded.hash),
});

export const buildPendingDeltas = (pendingWrites: ApplyQueueEntry[], state: EngineState | null): PendingDeltaReadout[] => {
  if (!state) return [];
  const seen = new Map<string, PendingDeltaReadout>();
  for (const entry of pendingWrites) {
    for (const delta of entry.deltas) seen.set(delta.q, { quality: delta.q, value: delta.v, source: entry.source });
  }
  return [...seen.values()].filter((pending) => state.blackboard.values[pending.quality] !== pending.value);
};

export const buildConvergenceReadout = (story: NormalizedStoryV2 | null, state: EngineState | null): ConvergenceReadout[] => {
  if (!story || !state) return [];
  const visited = new Set(state.visitedAnchors);
  return story.checkpoints
    .filter((checkpoint) => checkpoint.type === "anchor" && Boolean(story.qualityByKey[progressQualityForAnchor(checkpoint.id)]))
    .map((anchor) => {
      const raw = state.blackboard.values[progressQualityForAnchor(anchor.id)];
      const progress = typeof raw === "number" ? raw : 0;
      const threshold = effectiveThresholdFor(story, anchor.id);
      return {
        anchorId: anchor.id,
        anchorName: anchor.name,
        progress,
        threshold,
        reached: threshold > 0 && progress >= threshold,
        visited: visited.has(anchor.id),
      };
    });
};

export const computeExpectedTension = (story: NormalizedStoryV2 | null, state: EngineState | null, tensionTarget: string | undefined, shape: ArcTemplate | null): number | null => {
  if (!story || !state) return null;
  if (tensionTarget) return levelToNumeric(tensionTarget as Parameters<typeof levelToNumeric>[0]);
  if (!shape) return null;
  const totalAnchors = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").length;
  if (!totalAnchors) return null;
  return expectedTension(shape, state.visitedAnchors.length / totalAnchors);
};

export const buildTensionSnapshot = (smoothed: number | null, expected: number | null): RuntimeSnapshot["tension"] => ({
  level: smoothed === null ? null : numericToLevel(smoothed),
  smoothed,
  expected,
  hint: getSteeringHint(smoothed, expected),
});
