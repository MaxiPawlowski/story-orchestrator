import { isLivingId, LIVING_OPENING_ID, type EngineState, type LivingAutonomy, type NormalizedStoryV2 } from "@engine/index";
import { findFrontier, livingAutonomy, livingChapters, livingHorizon } from "@generation/living/plan";
import type { LivingRuntimeState, ProposalStatus } from "@generation/living/types";

export const LIVING_PROPOSALS_SHOWN = 8;

export interface LivingProposalRow {
  id: string;
  status: ProposalStatus;
  name: string;
  objective: string;
  reason: string;
  issues: string[];
  frontierId: string;
  anchorId: string;
  buildsOn: string | null;
  autonomy: LivingAutonomy;
  stale: boolean;
  at: string;
}

export interface LivingAuthorView {
  enabled: boolean;
  autonomy: LivingAutonomy;
  horizon: number;
  frontierId: string | null;
  generated: number;
  reachedGenerated: number;
  chapters: number;
  ops: number;
  folded: number;
  passes: number;
  proposals: LivingProposalRow[];
}

export interface LivingView {
  canSave: boolean;
  author: LivingAuthorView | null;
}

export interface LivingSliceInput {
  story: NormalizedStoryV2 | null;
  state: EngineState | null;
  living: LivingRuntimeState | undefined;
  authorView: boolean;
  enabled: boolean;
  epoch: string | null;
}

export function livingSlice(input: LivingSliceInput): LivingView | null {
  const { story, state, living } = input;
  if (!story?.living || !state) return null;
  if (!input.authorView) return { canSave: true, author: null };
  const generated = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor" && isLivingId(checkpoint.id) && checkpoint.id !== LIVING_OPENING_ID);
  const reached = new Set([...state.visitedPath, state.activeCheckpointId]);
  const proposals = (living?.proposals ?? []).slice(-LIVING_PROPOSALS_SHOWN).reverse().map((proposal): LivingProposalRow => ({
    id: proposal.id, status: proposal.status, name: proposal.draft?.anchor.name ?? "", objective: proposal.draft?.anchor.objective ?? "",
    reason: proposal.reason, issues: proposal.issues, frontierId: proposal.frontierId, anchorId: proposal.anchorId, buildsOn: proposal.draft?.buildsOn ?? null,
    autonomy: proposal.autonomy, stale: (proposal.status === "proposed" || proposal.status === "accepted") && proposal.epoch !== input.epoch, at: proposal.at,
  }));
  return {
    canSave: true,
    author: {
      enabled: input.enabled,
      autonomy: livingAutonomy(story),
      horizon: livingHorizon(story.living),
      frontierId: findFrontier(story, state.activeCheckpointId)?.frontierId ?? null,
      generated: generated.length,
      reachedGenerated: generated.filter((checkpoint) => reached.has(checkpoint.id)).length,
      chapters: livingChapters(story).length,
      ops: living?.ops.length ?? 0,
      folded: living?.folded.length ?? 0,
      passes: living?.passes ?? 0,
      proposals,
    },
  };
}
