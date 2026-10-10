import type { EngineState, LivingAutonomy, NormalizedStoryV2 } from "@engine/index";
import type { LivingRuntimeState, ProposalStatus } from "@generation/living/types";

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
  branch: { why: string; prepared: boolean; convergeTo: string | null; fromName: string; toName: string } | null;
}

export interface LivingAuthorView {
  living: boolean;
  branching: boolean;
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
  branching: boolean;
  epoch: string | null;
}

type AuthorViewBuilder = (input: LivingSliceInput) => LivingAuthorView;

let buildAuthorView: AuthorViewBuilder | null = null;

export const installLivingAuthorView = (builder: AuthorViewBuilder) => { buildAuthorView = builder; };

export function livingSlice(input: LivingSliceInput): LivingView | null {
  const { story, state, living } = input;
  if (!story || !state) return null;
  const branched = (living?.proposals ?? []).some((proposal) => proposal.kind === "branch");
  if (!story.living && !branched) return null;
  if (!input.authorView) return story.living ? { canSave: true, author: null } : null;
  return { canSave: Boolean(story.living), author: buildAuthorView ? buildAuthorView(input) : null };
}
