export const MEMORY_TIERS = ["facts", "session_details", "short_term", "scene_history"] as const;
export type MemoryTier = typeof MEMORY_TIERS[number];

export const FACT_ENTRY_TYPES = ["fact", "relationship", "preference", "event"] as const;
export type FactEntryType = typeof FACT_ENTRY_TYPES[number];

export const SESSION_ENTRY_TYPES = ["scene", "revelation", "development", "detail"] as const;
export type SessionEntryType = typeof SESSION_ENTRY_TYPES[number];

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
  characterId?: string;
  createdAt: number;
  messageId?: number;
  recallCount: number;
  pinned?: boolean;
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
