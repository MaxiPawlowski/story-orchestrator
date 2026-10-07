import {
  DEFAULT_AGENCY, effectiveThresholdFor, progressQualityForAnchor, renderGateText, type AgencyPolicy,
  type ApplyQueueEntry, type ArcTemplate, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2,
} from "@engine/index";
import { expectedTension, getSteeringHint, levelToNumeric, numericToLevel } from "@pacing/index";
import type { NarrativeInput } from "./narrative";
import type { ConvergenceReadout, PendingDeltaReadout, RuntimeSnapshot, StoryIdentity, StoryLibraryRecord } from "./types";

// Pure readouts over engine state — the composition half of the snapshot, kept out of the
// manager so a reader can see what the UI is handed without reading the orchestration.

export const buildStoryIdentity = (loaded: StoryLibraryRecord | null, libraryRecord: StoryLibraryRecord | null, pinned: boolean): StoryIdentity => ({
  id: loaded?.id ?? null,
  pinned,
  drifted: Boolean(loaded && libraryRecord && libraryRecord.hash !== loaded.hash),
});

const readsOpeningOnly = (entry: ApplyQueueEntry, firstPlayerTurn: number | undefined): boolean =>
  entry.turnRange !== undefined && (firstPlayerTurn === undefined || entry.turnRange.to < firstPlayerTurn);

export const buildPendingDeltas = (pendingWrites: ApplyQueueEntry[], state: EngineState | null, playerTurns: readonly number[] = []): PendingDeltaReadout[] => {
  if (!state) return [];
  const seen = new Map<string, PendingDeltaReadout>();
  for (const entry of pendingWrites) {
    const opening = readsOpeningOnly(entry, playerTurns[0]);
    for (const delta of entry.deltas) seen.set(delta.q, { quality: delta.q, value: delta.v, source: entry.source, ...(opening ? { opening: true } : {}) });
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

export const buildLastTransition = (story: NormalizedStoryV2 | null, boundaryLog: BoundaryLogEntry[]): NarrativeInput["lastTransition"] => {
  if (!story) return null;
  for (let index = boundaryLog.length - 1; index >= 0; index -= 1) {
    const entry = boundaryLog[index];
    if (!entry.fired) continue;
    const fromName = story.checkpointById[entry.before.activeCheckpointId]?.name;
    const toName = story.checkpointById[entry.after.activeCheckpointId]?.name;
    return fromName && toName ? { fromName, toName } : null;
  }
  return null;
};

export const playerLastTransition = (story: NormalizedStoryV2 | null, boundaryLog: BoundaryLogEntry[]): NarrativeInput["lastTransition"] => {
  const entry = story ? [...boundaryLog].reverse().find((candidate) => candidate.fired) : undefined;
  if (!story || !entry) return null;
  const to = story.checkpointById[entry.after.activeCheckpointId]?.player_name ?? null;
  return to ? { fromName: story.checkpointById[entry.before.activeCheckpointId]?.player_name ?? null, toName: to } : null;
};

// The `story_possible_transitions` macro source: where the story could go from here, in names.
export const buildPossibleTransitions = (story: NormalizedStoryV2 | null, state: EngineState | null): string[] => {
  if (!story || !state) return [];
  return (story.outgoingByCheckpoint[state.activeCheckpointId] ?? []).map((transition) => {
    const toName = story.checkpointById[transition.to]?.name ?? transition.to;
    const gateText = renderGateText(transition.gate).trim();
    return `→ ${toName}${gateText ? ` when ${gateText}` : ""}`;
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

export const buildTensionSnapshot = (smoothed: number | null, expected: number | null, policy: AgencyPolicy = DEFAULT_AGENCY): RuntimeSnapshot["tension"] => ({
  level: smoothed === null ? null : numericToLevel(smoothed),
  smoothed,
  expected,
  hint: getSteeringHint(smoothed, expected, undefined, policy),
});
