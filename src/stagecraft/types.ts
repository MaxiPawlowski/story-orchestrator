// A curator proposes; it never writes. Everything here is data: the runtime turns an
// accepted proposal into World Info writes at the next boundary, and nothing in this module can
// reach the blackboard or the memory tiers (spec addendum §Stagecraft).
export const CURATOR_MAX_OPS = 4;
export const CURATOR_MAX_TEXT = 600;
export const CURATOR_PROPOSAL_LIMIT = 5;
export const PATCH_ANCHOR_SEPARATOR = "||";
export const CURATOR_SHOWN_CONTENT = 400;
export const FUZZY_ANCHOR_THRESHOLD = 0.8;

export const collapseContent = (content: string) => content.replace(/\s+/g, " ").trim();

export const contentShownInPart = (content: string) => collapseContent(content).length > CURATOR_SHOWN_CONTENT;

export const STAGECRAFT_ACCEPT_MODES = ["off", "review", "auto"] as const;
export type StagecraftAcceptMode = (typeof STAGECRAFT_ACCEPT_MODES)[number];

export interface WiCuratorTarget {
  lorebook: string;
  comment: string;
  uid?: number;
}

export type WiCuratorOp =
  | (WiCuratorTarget & { kind: "enable" })
  | (WiCuratorTarget & { kind: "disable" })
  | (WiCuratorTarget & { kind: "rewrite"; text: string })
  // ST-Copilot's small-model-safe partial edit: the anchor names the first and last words of the
  // span to replace ("first words || last words"), so the model never restates a whole entry.
  | (WiCuratorTarget & { kind: "patch"; anchor: string; replace: string });

/**
 * One broken fact, with the record it came from — so the author's review card can say
 * which message this truth was read from, at what confidence, and whether another store disagrees.
 * Declared structurally, like the envelope above, because the stagecraft core is pure.
 */
export interface WardenFactSource {
  id: string;
  text: string;
  provenance?: CuratorProvenance;
  conflictingValue?: string;
}

// The continuity warden's one-turn note. It never reaches a lorebook: applyAccepted
// skips it, and only the generation-start path injects it, for one loud generation.
export const WARDEN_NOTE_FAMILIES = ["continuity", "agency", "house-rule"] as const;
export type WardenNoteFamily = (typeof WARDEN_NOTE_FAMILIES)[number];

export type WardenNoteOp = { kind: "note"; text: string; facts: string[]; replyMessageId: number; sources?: WardenFactSource[]; family?: WardenNoteFamily; rules?: string[]; score?: number };

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
  uid?: number;
}

export interface CuratorScope {
  storyTitle: string;
  checkpointName: string;
  objective: string;
  canon: string;
  openArcs: string[];
  entries: CuratorEntryView[];
  declined?: WiCuratorOp[];
}

export interface CuratorProposal {
  summary: string;
  ops: WiCuratorOp[];
  dropped: string[];
}

export type CuratorOpStatus = "pending" | "accepted" | "rejected" | "applied" | "failed" | "revert-failed" | "externally-edited";

export interface CuratorOpRecord {
  op: CuratorOp;
  status: CuratorOpStatus;
  message?: string;
  // What the entry held before this op ran — read AT THE WRITE EDGE — and what
  // the write made it. `after` is the compare-and-set basis: if the entry no longer holds it,
  // something else edited the book and the revert refuses rather than overwriting that.
  before?: { content: string; disabled: boolean; uid?: number };
  after?: { content: string; disabled: boolean };
  /** The host target, by file id and entry uid, never the display name. */
  target?: { lorebookFileId: string; uid?: number };
  /** Write-ahead marker (06). Persisted before the host call, with the message id the
   * Apply ran at; `StagecraftCoordinator.reconcileWriteAhead` settles it on hydrate. */
  writeAhead?: { status: "pending"; at: string; messageId?: number };
  fuzzy?: { anchor: string; span: string; score: number };
}

// A pass that never ran and a pass that found nothing are different answers, and a caller (or an
// author watching the ring) has to be able to tell them apart — conflating them made a live gate
// read "the curator proposed nothing" when it had in fact never been asked.
export type CuratorSkipReason = "disabled" | "no-scope" | "empty-scope" | "in-flight";

export interface CuratorPassOutcome {
  ran: boolean;
  skipped?: CuratorSkipReason;
  record: CuratorProposalRecord | null;
  /**
   * The pass ran, but the chat, story or story version it belongs to changed
   * while the model was answering, so its result was thrown away rather than written into whatever
   * is open now. Names which part of the world moved.
   */
  discarded?: "chat" | "story" | "version" | "epoch" | "window";
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

/**
 * The same envelope every derived record carries (`@memory/provenance`), declared
 * structurally because the stagecraft core is pure and may not import the memory layer.
 */
export interface CuratorProvenance {
  source: "extractor" | "judge" | "author" | "code" | "curator" | "blackboard";
  messageId: number;
  boundary: number;
  pass: string;
  inputs?: Array<{ store: "memory" | "ledger" | "epistemic" | "scene" | "blackboard"; id: string }>;
  confidence?: number;
  validity: "live" | "superseded" | "source-removed" | "conflicted" | "quarantined";
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
  /** A proposal is a claim about the story too: which pass made it, over which reply
   *  or boundary, at what confidence. */
  provenance?: CuratorProvenance;
  appliedAt?: string;
}

// Each curator keeps its own last few, so a chatty warden never evicts a lorebook change that is
// still waiting for review.
export function capProposalRing(records: CuratorProposalRecord[]): CuratorProposalRecord[] {
  return records.filter((record, index) => records.slice(index + 1).filter((later) => later.curator === record.curator).length < CURATOR_PROPOSAL_LIMIT);
}
