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
  summary?: string;
  pinned?: boolean;
  bridgeApplied?: boolean;
}

export const EPISTEMIC_TAGS = ["knows", "unaware", "suspects", "believes", "hiding"] as const;
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
  /** v2.3 plan 05: never retired by extraction unless the author unlocks it. */
  locked?: boolean;
  /** v2.3 plan 05. Where this belief came from and whether it is still valid. */
  provenance: Provenance;
  supersededBy?: string;
  /** v2.3 plan 04 (M4). When a reveal retired this belief. The `supersededBy` marker is display
   *  only; this is what a rollback keys on. */
  retiredAt?: { messageId: number; boundary?: number };
}

export interface ParsedLedgerSignal {
  entity: string;
  entityType: string;
  field: string;
  value: string;
}

export interface LedgerEntry {
  id: string;
  /** v2.3 plan 04 (M3): the id of the version this one replaced, if any. Rows are append-only. */
  supersedes?: string;
  entity: string;
  entityType: string;
  field: string;
  value: string;
  createdAt: number;
  messageId?: number;
  pinned?: boolean;
  /** v2.3 plan 05. Where this version came from and whether it is still valid. */
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
   * v2.3 plan 04 (M1). When a consolidation retired this entry. Without it a rollback of the
   * superseding fact leaves the predecessor retired by a winner that no longer exists.
   */
  supersededAt?: { messageId: number; boundary?: number };
  /** v2.3 plan 04. Every consolidation that confirmed this row as the surviving duplicate. A
   *  scalar loses the older confirmation when the same fact is confirmed twice, so rollback could
   *  only subtract the newest increment and `rollback ≡ replay` would diverge. */
  confirmedAt?: Array<{ messageId: number; boundary?: number }>;
  foldedInto?: string;
  contradicted?: boolean;
  characterId?: string;
  createdAt: number;
  messageId?: number;
  recallCount: number;
  /** v2.3 plan 05. Retention only: a pinned row survives trimming and expiry, and may still be
   *  superseded by a newer contradicting fact. */
  pinned?: boolean;
  /** v2.3 plan 05. A lock freezes the story's truth: extraction and consolidation never supersede
   *  it, and a later contradicting candidate goes to the reconciliation queue instead. */
  locked?: boolean;
  /** v2.3 plan 05. Where this claim came from and whether it is still valid. */
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
