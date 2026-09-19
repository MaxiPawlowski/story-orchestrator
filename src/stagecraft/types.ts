// v2.1 plan 07. A curator proposes; it never writes. Everything here is data: the runtime turns an
// accepted proposal into World Info writes at the next boundary, and nothing in this module can
// reach the blackboard or the memory tiers (spec addendum §Stagecraft).
export const CURATOR_MAX_OPS = 4;
export const CURATOR_MAX_TEXT = 600;
export const CURATOR_PROPOSAL_LIMIT = 5;
export const PATCH_ANCHOR_SEPARATOR = "||";

export const STAGECRAFT_ACCEPT_MODES = ["off", "review", "auto"] as const;
export type StagecraftAcceptMode = (typeof STAGECRAFT_ACCEPT_MODES)[number];

export type WiCuratorOp =
  | { kind: "enable"; lorebook: string; comment: string }
  | { kind: "disable"; lorebook: string; comment: string }
  | { kind: "rewrite"; lorebook: string; comment: string; text: string }
  // ST-Copilot's small-model-safe partial edit: the anchor names the first and last words of the
  // span to replace ("first words || last words"), so the model never restates a whole entry.
  | { kind: "patch"; lorebook: string; comment: string; anchor: string; replace: string };

// v2.2 plan 05: the continuity warden's one-turn note. It never reaches a lorebook: applyAccepted
// skips it, and only the generation-start path injects it, for one loud generation.
export type WardenNoteOp = { kind: "note"; text: string; facts: string[]; replyMessageId: number };

export type CuratorOp = WiCuratorOp | WardenNoteOp;

export const isNoteOp = (op: CuratorOp): op is WardenNoteOp => op.kind === "note";

export const CURATOR_KINDS = ["wi", "warden"] as const;
export type CuratorKind = (typeof CURATOR_KINDS)[number];

export type CuratorOpKind = WiCuratorOp["kind"];

export interface CuratorEntryView {
  lorebook: string;
  comment: string;
  keys: string[];
  content: string;
  disabled: boolean;
}

export interface CuratorScope {
  storyTitle: string;
  checkpointName: string;
  objective: string;
  canon: string;
  openArcs: string[];
  entries: CuratorEntryView[];
}

export interface CuratorProposal {
  summary: string;
  ops: WiCuratorOp[];
  dropped: string[];
}

export type CuratorOpStatus = "pending" | "accepted" | "rejected" | "applied" | "failed";

export interface CuratorOpRecord {
  op: CuratorOp;
  status: CuratorOpStatus;
  message?: string;
  // What the entry held before this op ran — the only thing a rollback needs to put it back.
  before?: { content: string; disabled: boolean };
}

// A pass that never ran and a pass that found nothing are different answers, and a caller (or an
// author watching the ring) has to be able to tell them apart — conflating them made a live gate
// read "the curator proposed nothing" when it had in fact never been asked (v2.1 plan 07).
export type CuratorSkipReason = "disabled" | "no-scope" | "empty-scope" | "in-flight";

export interface CuratorPassOutcome {
  ran: boolean;
  skipped?: CuratorSkipReason;
  record: CuratorProposalRecord | null;
}

// What the last pass actually said, kept whether it proposed anything or not — "the curator stayed
// quiet" has to be auditable, or a silent curator is indistinguishable from a broken one. Same
// bargain the extraction audits strike (prompt + raw response, one entry).
export interface CuratorPassAudit {
  at: string;
  reason: string;
  prompt: string;
  rawResponse: string;
  proposed: number;
  dropped: string[];
  focus?: { shown: number; total: number };
}

export interface CuratorProposalRecord {
  id: string;
  curator: CuratorKind;
  at: string;
  boundary: number;
  messageId: number;
  checkpointId: string;
  reason: string;
  summary: string;
  mode: StagecraftAcceptMode;
  ops: CuratorOpRecord[];
  dropped: string[];
  appliedAt?: string;
}

// Each curator keeps its own last few, so a chatty warden never evicts a lorebook change that is
// still waiting for review.
export function capProposalRing(records: CuratorProposalRecord[]): CuratorProposalRecord[] {
  return records.filter((record, index) => records.slice(index + 1).filter((later) => later.curator === record.curator).length < CURATOR_PROPOSAL_LIMIT);
}
