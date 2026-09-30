import type { NormalizedStoryV2 } from "@engine/index";
import { classifyFired, firedEntries, type LoreSlot } from "./worldInfoEvidence";

export const LORE_FIRED_LIMIT = 100;

export const LORE_VIAS = ["constant", "key", "forced", "mirror"] as const;
export type LoreVia = (typeof LORE_VIAS)[number];

export interface LoreFiredEntry {
  book: string;
  uid: number;
  comment: string;
  via: LoreVia;
  gated?: boolean;
}

export interface LoreFiredRecord {
  messageId: number;
  entries: LoreFiredEntry[];
}

export interface LoreRuntimeState {
  fired: LoreFiredRecord[];
}

export const createLore = (): LoreRuntimeState => ({ fired: [] });

const isEntry = (value: unknown): value is LoreFiredEntry => {
  const entry = value as Partial<LoreFiredEntry> | null;
  return Boolean(entry) && typeof entry?.book === "string" && typeof entry.uid === "number" && typeof entry.comment === "string"
    && (LORE_VIAS as readonly unknown[]).includes(entry.via);
};

const isFiredRecord = (value: unknown): value is LoreFiredRecord => {
  const record = value as Partial<LoreFiredRecord> | null;
  return Boolean(record) && typeof record?.messageId === "number" && Number.isFinite(record.messageId) && Array.isArray(record.entries);
};

export const sanitizeLore = (value: unknown): LoreRuntimeState => {
  const fired = (value as Partial<LoreRuntimeState> | null | undefined)?.fired;
  if (!Array.isArray(fired)) return createLore();
  return {
    fired: fired.filter(isFiredRecord).map((record) => ({ messageId: record.messageId, entries: record.entries.filter(isEntry) })).slice(-LORE_FIRED_LIMIT),
  };
};

export const recordLoreFired = (state: LoreRuntimeState, record: LoreFiredRecord): LoreRuntimeState => ({
  fired: [...state.fired.filter((existing) => existing.messageId !== record.messageId), record]
    .sort((left, right) => left.messageId - right.messageId)
    .slice(-LORE_FIRED_LIMIT),
});

export const rollbackLoreFired = (state: LoreRuntimeState, messageId: number): LoreRuntimeState =>
  (Number.isFinite(messageId) ? { fired: state.fired.filter((record) => record.messageId < messageId) } : state);

export function loreFiredRecord(slot: LoreSlot, story: NormalizedStoryV2 | null, mirrorBook: string | null): LoreFiredRecord | null {
  if (slot.rendered !== true || slot.lastMessageId === null || !slot.scans.some((scan) => scan.loud)) return null;
  const entries = firedEntries(slot.scans).map((entry): LoreFiredEntry => {
    const origin = classifyFired(entry, story, slot.forced, mirrorBook);
    const via: LoreVia = origin === "pick" ? "forced" : origin === "mirror" ? "mirror" : entry.constant ? "constant" : "key";
    return { book: entry.world, uid: entry.uid, comment: entry.comment, via, ...(origin === "gated" ? { gated: true } : {}) };
  });
  return { messageId: slot.lastMessageId, entries };
}
