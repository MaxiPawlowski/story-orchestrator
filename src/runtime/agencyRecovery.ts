import { agencyForCheckpoint, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2 } from "@engine/index";

// v2.3 plan 07 (C4). The player refused the prepared route. Two boundaries in which no outgoing gate
// of the active checkpoint could be satisfied is the signal — the extraction could not classify what
// the player did against any exit the checkpoint declares — and the answer is NOT to railroad them
// down the prepared one. The runtime leaves the outcome unset, says one neutral sentence, and hands
// the author a move: an authored alternate, or the road ahead generated.
//
// Derived from the boundary log rather than counted in a new persisted field: the log already records
// `fired` and the state after each boundary, so a reload reproduces the streak exactly.

export const AGENCY_STALL_BOUNDARIES = 2;

export const REFUSAL_PLAYER_TEXT = "The story is deciding how the world answers that.";

export interface AgencyRecovery {
  checkpointId: string;
  checkpointName: string;
  boundaries: number;
  /** The checkpoint the author named for this refusal, if they named one. */
  alternate: string | null;
  alternateName: string | null;
}

export const agencyRecovery = (story: NormalizedStoryV2 | null, state: EngineState | null, log: BoundaryLogEntry[]): AgencyRecovery | null => {
  if (!story || !state) return null;
  const activeId = state.activeCheckpointId;
  const exits = story.outgoingByCheckpoint[activeId] ?? [];
  // Nothing was expected of the player here, so nothing can be refused.
  if (!exits.length) return null;
  const recent = log.slice(-AGENCY_STALL_BOUNDARIES);
  if (recent.length < AGENCY_STALL_BOUNDARIES) return null;
  const stalled = recent.every((entry) => entry.source === "gate" && entry.fired === null && entry.before.activeCheckpointId === activeId);
  if (!stalled) return null;
  const policy = agencyForCheckpoint(story, activeId);
  const alternate = policy.alternate && story.checkpointById[policy.alternate] ? policy.alternate : null;
  return {
    checkpointId: activeId,
    checkpointName: story.checkpointById[activeId]?.name ?? activeId,
    boundaries: recent.length,
    alternate,
    alternateName: alternate ? story.checkpointById[alternate]?.name ?? alternate : null,
  };
};
