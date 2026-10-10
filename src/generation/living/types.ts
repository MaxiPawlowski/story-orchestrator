import type { DivergenceState } from "./divergence";
import type { Chapter, Checkpoint, GateNode, LivingAutonomy, PrimitiveValue, Quality, TensionLevel, Transition } from "@engine/index";

export const LIVING_MAX_NEW_QUALITIES = 2;
export const LIVING_CHAPTER_CAP_WITHOUT_SEALS = 3;
export const LIVING_PROPOSAL_LIMIT = 12;
export const LIVING_OP_CAP = 400;
export const LIVING_STUB_SUFFIX = "_way";
export const LIVING_CHAPTER_PREFIX = "liv_ch_";
export const LIVING_BRANCH_PREFIX = "liv_b";

export type LivingOpPayload =
  | { kind: "add-checkpoint"; checkpoint: Checkpoint }
  | { kind: "add-stub"; checkpoint: Checkpoint }
  | { kind: "add-transition"; transition: Transition }
  | { kind: "add-quality"; quality: Quality }
  | { kind: "add-chapter"; chapter: Chapter };

export type LivingOp = LivingOpPayload & {
  id: string;
  boundary: number;
  messageId: number;
  proposalId: string;
};

export interface LivingAuthored {
  raw: Record<string, unknown>;
  hash: string;
}

export interface DirectorAnchorDraft {
  name: string;
  objective: string;
  tension: TensionLevel;
  snapshot: Record<string, PrimitiveValue>;
  final: boolean;
}

export type DirectorOpening =
  | { kind: "reuse"; gate: GateNode }
  | { kind: "new"; key: string; rubric: string };

export interface DirectorDraft {
  anchor: DirectorAnchorDraft;
  opensWhen: DirectorOpening;
  newQualities: Array<{ key: string; type: "bool" | "int"; rubric: string }>;
  buildsOn: string | null;
  newChapter: boolean;
  chapterTitle?: string;
  reason: string;
}

export type ProposalStatus = "proposed" | "accepted" | "applied" | "rejected" | "withdrawn" | "failed";

export interface DirectorProposal {
  id: string;
  status: ProposalStatus;
  epoch: string;
  frontierId: string;
  anchorId: string;
  draft: DirectorDraft | null;
  ops: LivingOpPayload[];
  issues: string[];
  reason: string;
  boundary: number;
  messageId: number;
  attempts: number;
  autonomy: LivingAutonomy;
  kind?: "branch";
  convergeTo?: string;
  why?: string;
  appliedAt?: { boundary: number; messageId: number };
  at: string;
}

export interface LivingRuntimeState {
  authored: LivingAuthored | null;
  folded: LivingOp[];
  ops: LivingOp[];
  proposals: DirectorProposal[];
  epochBumps: number;
  passes: number;
  lastPass: { boundary: number; frontierId: string; at: string } | null;
  divergence?: DivergenceState;
}

export const createLivingState = (): LivingRuntimeState => ({ authored: null, folded: [], ops: [], proposals: [], epochBumps: 0, passes: 0, lastPass: null });
