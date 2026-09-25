import { agencyForCheckpoint, type BoundaryLogEntry, type EngineState, type GateLeaf, type GateNode, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import type { SharedReadAudit } from "@extraction/types";
import { findStubExpansionCandidate } from "@generation/planner";

// v2.3 plan 07 (C4). The player refused the prepared route. The signal is the plan's own words:
// extraction READ what the player did and could not classify it against any exit the active
// checkpoint declares. Two quiet boundaries alone are not that — a checkpoint whose gate needs three
// increments of progress is quiet for two boundaries in ordinary play (V13, 2026-09-23). So each of
// the boundaries since the player's last step toward an exit must be covered by a read, span two
// player turns, and no read covering them may have MOVED an
// exit: set a value that satisfies one of its leaves, or moved a numeric quality one compares. A read
// that answered `duel_accepted=false` against `duel_accepted == true` classified the action and
// moved nothing, which is the clearest refusal there is. A read that has not landed yet is not a
// refusal: it is unknown, and the signal waits for it.
//
// The answer is NOT to railroad the player down the prepared route. The runtime leaves the outcome
// unset, says one neutral sentence, and hands the author a move: an authored alternate, or the road
// ahead generated where the checkpoint has one to generate.
//
// Derived from the boundary log and the audit ring rather than counted in a new persisted field, so
// a reload reproduces the streak exactly.

export const AGENCY_STALL_TURNS = 2;

export const REFUSAL_PLAYER_TEXT = "The story is deciding how the world answers that.";

export interface AgencyRecovery {
  checkpointId: string;
  checkpointName: string;
  /** Player turns in the refused streak, never boundaries: one line can draw several replies. */
  turns: number;
  /** The checkpoint the author named for this refusal, if they named one. */
  alternate: string | null;
  alternateName: string | null;
  /** Whether "Generate the road ahead" has a stub to expand from here; an authored exit has none. */
  canGenerate: boolean;
}

const covers = (audit: SharedReadAudit, messageId: number) => audit.window.from <= messageId && audit.window.to >= messageId;

interface ExitLeaf { leaf: GateLeaf; negated: boolean }

const exitLeaves = (gate: GateNode, negated = false, out: ExitLeaf[] = []): ExitLeaf[] => {
  if ("q" in gate) out.push({ leaf: gate, negated });
  if ("all" in gate) gate.all.forEach((entry) => exitLeaves(entry, negated, out));
  if ("any" in gate) gate.any.forEach((entry) => exitLeaves(entry, negated, out));
  if ("not" in gate) exitLeaves(gate.not, !negated, out);
  return out;
};

const moves = ({ leaf, negated }: ExitLeaf, value: PrimitiveValue): boolean => {
  if (negated || [">=", ">", "<=", "<"].includes(leaf.op)) return true;
  if (leaf.op === "==") return value === leaf.v;
  if (leaf.op === "!=") return value !== leaf.v;
  if (leaf.op === "in") return Array.isArray(leaf.v) && leaf.v.includes(value);
  return true;
};

/** The chat positions of the player's own messages: what a turn is, in a group as in a solo chat. */
export const playerTurnIds = (chat: readonly unknown[]): number[] =>
  chat.flatMap((message, index) => {
    const entry = message as { is_user?: boolean; is_system?: boolean } | null;
    return entry?.is_user && !entry.is_system ? [index] : [];
  });

export const agencyRecovery = (story: NormalizedStoryV2 | null, state: EngineState | null, log: BoundaryLogEntry[], audits: SharedReadAudit[] = [], playerTurns: number[] = []): AgencyRecovery | null => {
  if (!story || !state) return null;
  const activeId = state.activeCheckpointId;
  const exits = story.outgoingByCheckpoint[activeId] ?? [];
  // Nothing was expected of the player here, so nothing can be refused.
  if (!exits.length) return null;
  const quiet = (entry: BoundaryLogEntry) => entry.source === "gate" && entry.fired === null && entry.before.activeCheckpointId === activeId;
  let start = log.length;
  while (start > 0 && quiet(log[start - 1])) start -= 1;
  const leaves = exits.flatMap((transition) => exitLeaves(transition.gate));
  const covering = (entry: BoundaryLogEntry) => audits.filter((audit) => covers(audit, entry.context.lastMessageId));
  const moved = (entry: BoundaryLogEntry) => covering(entry).some((audit) => audit.acceptedDeltas.some(({ delta }) => leaves.some((exit) => exit.leaf.q === delta.q && moves(exit, delta.v))));
  // The streak restarts after the last boundary whose read moved an exit: grinding toward a
  // threshold is play, and only what came after the last step can be a refusal.
  for (let index = log.length - 1; index >= start; index -= 1) {
    if (moved(log[index])) { start = index + 1; break; }
  }
  const streak = log.slice(start);
  if (!streak.length || streak.some((entry) => !covering(entry).length)) return null;
  // A group answers one player line with several replies, and each reply is a boundary (found live,
  // V13): three members answering one refusal is one refusal. So the streak counts player turns.
  const from = start > 0 ? log[start - 1].context.lastMessageId : -1;
  const to = streak[streak.length - 1].context.lastMessageId;
  const turns = playerTurns.filter((id) => id > from && id <= to).length;
  if (turns < AGENCY_STALL_TURNS) return null;
  const policy = agencyForCheckpoint(story, activeId);
  const alternate = policy.alternate && story.checkpointById[policy.alternate] ? policy.alternate : null;
  return {
    checkpointId: activeId,
    checkpointName: story.checkpointById[activeId]?.name ?? activeId,
    turns,
    alternate,
    alternateName: alternate ? story.checkpointById[alternate]?.name ?? alternate : null,
    canGenerate: findStubExpansionCandidate(story, activeId) !== null,
  };
};
