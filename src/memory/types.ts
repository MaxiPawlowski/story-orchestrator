import type { Provenance } from "./provenance";

export const MEMORY_TIERS = ["facts", "session_details", "short_term", "scene_history"] as const;
export type MemoryTier = typeof MEMORY_TIERS[number];

export const FACT_ENTRY_TYPES = ["fact", "relationship", "preference", "event"] as const;
export const SESSION_ENTRY_TYPES = ["scene", "revelation", "development", "detail"] as const;
export const MEMORY_ENTRY_TYPES = [...FACT_ENTRY_TYPES, ...SESSION_ENTRY_TYPES] as const;
export type MemoryEntryType = typeof MEMORY_ENTRY_TYPES[number];

export const TIER_FOR_ENTRY_TYPE: Record<MemoryEntryType, Extract<MemoryTier, "facts" | "session_details">> = {
  fact: "facts",
  relationship: "facts",
  preference: "facts",
  event: "facts",
  scene: "session_details",
  revelation: "session_details",
  development: "session_details",
  detail: "session_details",
};

export const MEMORY_EXPIRATIONS = ["scene", "session", "permanent"] as const;
export type MemoryExpiration = typeof MEMORY_EXPIRATIONS[number];

export const SCENE_BREAK_REASONS = ["time_skip", "location", "divider", "cast"] as const;
export type SceneBreakReason = typeof SCENE_BREAK_REASONS[number];

export const ARC_STATUSES = ["open", "resolved"] as const;
export type ArcStatus = typeof ARC_STATUSES[number];

export interface ParsedArcSignal {
  kind: "open" | "resolved";
  text: string;
}

export interface ArcEntry {
  id: string;
  text: string;
  status: ArcStatus;
  entities: string[];
  openedAt: number;
  openedMessageId?: number;
  resolvedAt?: number;
  resolvedMessageId?: number;
  summary?: string;
  pinned?: boolean;
  bridgeApplied?: boolean;
  originChapter?: string;
  resolvedBy?: string;
  foldedInto?: string;
}

export const CHAPTER_DISPOSITIONS = ["carry", "closed-offscreen", "abandoned"] as const;
export type ChapterDisposition = typeof CHAPTER_DISPOSITIONS[number];
export const CHAPTER_RECORD_STATUSES = ["sealed", "degraded", "author-edited"] as const;
export type ChapterRecordStatus = typeof CHAPTER_RECORD_STATUSES[number];

export interface ChapterRecord {
  id: string;
  chapterId: string;
  part: number;
  title: string;
  playerTitle: string;
  range: { from: number; to: number };
  boundaries: { from: number; to: number };
  checkpoints: string[];
  summary: string;
  short: string;
  consequences: Array<{ text: string; sources: string[] }>;
  people: Array<{ rosterId: string; name: string; text: string }>;
  open: Array<{ arcId: string; text: string; disposition: ChapterDisposition }>;
  blackboardDelta: Record<string, { from: unknown; to: unknown }>;
  blackboardAt: Record<string, unknown>;
  status: ChapterRecordStatus;
  provenance: Provenance;
  tokens: { summary: number; short: number };
  sealedAt: { boundary: number; messageId: number; at: number; pathLength: number };
  final?: boolean;
  epilogue?: string;
  bridge?: { text: string; committedAt?: number };
  recapSeenAt?: number;
}

export interface EraLine {
  id: string;
  recordIds: string[];
  text: string;
  messageId: number;
}

export interface ChronicleState {
  eras: EraLine[];
}

export const EPISTEMIC_TAGS = ["knows", "unaware", "suspects", "believes", "hiding", "intends"] as const;
export type EpistemicTag = typeof EPISTEMIC_TAGS[number];

export interface ParsedEpistemicSignal {
  tag: EpistemicTag;
  subject: string;
  content: string;
  hiddenFrom?: string;
}

export interface EpistemicEntry {
  id: string;
  subject: string;
  tag: EpistemicTag;
  content: string;
  hiddenFrom?: string;
  createdAt: number;
  messageId?: number;
  pinned?: boolean;
  /** Never retired by extraction unless the author unlocks it. */
  locked?: boolean;
  /** Where this belief came from and whether it is still valid. */
  provenance: Provenance;
  supersededBy?: string;
  /** When a reveal retired this belief. The `supersededBy` marker is display
   *  only; this is what a rollback keys on. */
  retiredAt?: { messageId: number; boundary?: number };
  affirmedAt?: Array<{ messageId: number; boundary: number }>;
  foldedInto?: string;
}

export interface InnerBeat {
  chatId: string;
  memberId: string;
  basedOnMessageId: number;
  checkpointId: string;
  beat: string;
  tone?: string;
  at: string;
  used?: boolean;
}

export interface ParsedLedgerSignal {
  entity: string;
  entityType: string;
  field: string;
  value: string;
}

export interface LedgerEntry {
  id: string;
  /** The id of the version this one replaced, if any. Rows are append-only. */
  supersedes?: string;
  entity: string;
  entityType: string;
  field: string;
  value: string;
  createdAt: number;
  messageId?: number;
  pinned?: boolean;
  /** Where this version came from and whether it is still valid. */
  provenance: Provenance;
}

export interface LedgerView {
  entity: string;
  field: string;
  value: string;
  bound: boolean;
  turn: number;
}

export interface SceneBreakSignal {
  at: number;
  reason: SceneBreakReason;
}

export interface ParsedMemoryLine {
  tier: Extract<MemoryTier, "facts" | "session_details">;
  type: MemoryEntryType;
  importance: 1 | 2 | 3;
  expiration: MemoryExpiration;
  entities: string[];
  characterId?: string;
  text: string;
  evidence: string;
  messageId?: number;
}

export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  text: string;
  type: MemoryEntryType;
  importance: 1 | 2 | 3;
  expiration: MemoryExpiration;
  entities: string[];
  confidence: number;
  activationTriggers: string[];
  evidence: string;
  supersededBy?: string;
  /**
   * When a consolidation retired this entry. Without it a rollback of the
   * superseding fact leaves the predecessor retired by a winner that no longer exists.
   */
  supersededAt?: { messageId: number; boundary?: number };
  /** Every consolidation that confirmed this row as the surviving duplicate. A
   *  scalar loses the older confirmation when the same fact is confirmed twice, so rollback could
   *  only subtract the newest increment and `rollback ≡ replay` would diverge. */
  confirmedAt?: Array<{ messageId: number; boundary?: number }>;
  foldedInto?: string;
  contradicted?: boolean;
  characterId?: string;
  createdAt: number;
  messageId?: number;
  recallCount: number;
  /** Retention only: a pinned row survives trimming and expiry, and may still be
   *  superseded by a newer contradicting fact. */
  pinned?: boolean;
  /** A lock freezes the story's truth: extraction and consolidation never supersede
   *  it, and a later contradicting candidate goes to the reconciliation queue instead. */
  locked?: boolean;
  /** Where this claim came from and whether it is still valid. */
  provenance: Provenance;
  tokens?: number;
}

export interface MemoryWriteLogEntry {
  key: string;
  range: { from: number; to: number };
  appliedAt: number;
}

export interface MemoryStoreState {
  entries: MemoryEntry[];
  excluded: string[];
  writeLog: MemoryWriteLogEntry[];
}

export function generateMemoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
