import { isLivingId, LIVING_OPENING_ID, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { findFrontier, livingAutonomy, livingChapters, livingHorizon } from "@generation/living/frontier";
import type { LivingAuthorView, LivingProposalRow, LivingSliceInput } from "./livingSnapshot";

const LIVING_PROPOSALS_SHOWN = 8;

export function livingAuthorView(input: LivingSliceInput): LivingAuthorView {
  const { living } = input;
  const story = input.story as NormalizedStoryV2;
  const state = input.state as EngineState;
  const nameOf = (id: string | null | undefined) => (id ? story.checkpointById[id]?.name ?? id : "");
  const generated = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor" && isLivingId(checkpoint.id) && checkpoint.id !== LIVING_OPENING_ID);
  const reached = new Set([...state.visitedPath, state.activeCheckpointId]);
  const proposals = (living?.proposals ?? []).slice(-LIVING_PROPOSALS_SHOWN).reverse().map((proposal): LivingProposalRow => ({
    id: proposal.id, status: proposal.status, name: proposal.draft?.anchor.name ?? "", objective: proposal.draft?.anchor.objective ?? "",
    reason: proposal.reason, issues: proposal.issues, frontierId: proposal.frontierId, anchorId: proposal.anchorId, buildsOn: proposal.draft?.buildsOn ?? null,
    autonomy: proposal.autonomy, stale: (proposal.status === "proposed" || proposal.status === "accepted") && proposal.epoch !== input.epoch, at: proposal.at,
    branch: proposal.kind === "branch"
      ? { why: proposal.why ?? "", prepared: proposal.prepared === true, convergeTo: proposal.convergeTo ?? null, fromName: nameOf(proposal.frontierId), toName: nameOf(proposal.convergeTo) }
      : null,
  }));
  return {
    living: Boolean(story.living),
    branching: input.branching,
    enabled: input.enabled,
    autonomy: livingAutonomy(story),
    horizon: story.living ? livingHorizon(story.living) : 0,
    frontierId: story.living ? findFrontier(story, state.activeCheckpointId)?.frontierId ?? null : null,
    generated: generated.length,
    reachedGenerated: generated.filter((checkpoint) => reached.has(checkpoint.id)).length,
    chapters: livingChapters(story).length,
    ops: living?.ops.length ?? 0,
    folded: living?.folded.length ?? 0,
    passes: living?.passes ?? 0,
    proposals,
  };
}
