import { agencyForCheckpoint, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { collectGateKeys } from "@extraction/scope";
import type { SharedReadAudit } from "@extraction/types";
import { findStubExpansionCandidate } from "@generation/planner";

// v2.3 plan 07 (C4). The player refused the prepared route. The signal is the plan's own words:
// extraction READ what the player did and could not classify it against any exit the active
// checkpoint declares. Two quiet boundaries alone are not that — a checkpoint whose gate needs three
// increments of progress is quiet for two boundaries in ordinary play (V13, 2026-09-23). So each of
// the last two boundaries must be covered by a read, and no read covering them may have accepted a
// delta on any quality an exit's gate names. A read that has not landed yet is not a refusal: it
// is unknown, and the signal waits for it.
//
// The answer is NOT to railroad the player down the prepared route. The runtime leaves the outcome
// unset, says one neutral sentence, and hands the author a move: an authored alternate, or the road
// ahead generated where the checkpoint has one to generate.
//
// Derived from the boundary log and the audit ring rather than counted in a new persisted field, so
// a reload reproduces the streak exactly.

export const AGENCY_STALL_BOUNDARIES = 2;

export const REFUSAL_PLAYER_TEXT = "The story is deciding how the world answers that.";

export interface AgencyRecovery {
  checkpointId: string;
  checkpointName: string;
  boundaries: number;
  /** The checkpoint the author named for this refusal, if they named one. */
  alternate: string | null;
  alternateName: string | null;
  /** Whether "Generate the road ahead" has a stub to expand from here; an authored exit has none. */
  canGenerate: boolean;
}

const covers = (audit: SharedReadAudit, messageId: number) => audit.window.from <= messageId && audit.window.to >= messageId;

export const agencyRecovery = (story: NormalizedStoryV2 | null, state: EngineState | null, log: BoundaryLogEntry[], audits: SharedReadAudit[] = []): AgencyRecovery | null => {
  if (!story || !state) return null;
  const activeId = state.activeCheckpointId;
  const exits = story.outgoingByCheckpoint[activeId] ?? [];
  // Nothing was expected of the player here, so nothing can be refused.
  if (!exits.length) return null;
  const recent = log.slice(-AGENCY_STALL_BOUNDARIES);
  if (recent.length < AGENCY_STALL_BOUNDARIES) return null;
  const stalled = recent.every((entry) => entry.source === "gate" && entry.fired === null && entry.before.activeCheckpointId === activeId);
  if (!stalled) return null;
  const exitKeys = new Set<string>();
  exits.forEach((transition) => collectGateKeys(transition.gate, exitKeys));
  const reads = recent.map((entry) => audits.filter((audit) => covers(audit, entry.context.lastMessageId)));
  if (reads.some((covering) => !covering.length)) return null;
  const classified = reads.flat().some((audit) => audit.acceptedDeltas.some((entry) => exitKeys.has(entry.delta.q)));
  if (classified) return null;
  const policy = agencyForCheckpoint(story, activeId);
  const alternate = policy.alternate && story.checkpointById[policy.alternate] ? policy.alternate : null;
  return {
    checkpointId: activeId,
    checkpointName: story.checkpointById[activeId]?.name ?? activeId,
    boundaries: recent.length,
    alternate,
    alternateName: alternate ? story.checkpointById[alternate]?.name ?? alternate : null,
    canGenerate: findStubExpansionCandidate(story, activeId) !== null,
  };
};
