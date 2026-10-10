import type { BoundaryLogEntry, PrimitiveValue, Quality } from "@engine/index";
import { isRecord } from "@utils/guards";
import { sheetItem } from "./gameSheet";
import type { ProvenanceView, ProvenanceWriter } from "./gameTypes";

type Values = Readonly<Record<string, PrimitiveValue>>;

export const lastChange = (log: readonly BoundaryLogEntry[], shown: (values: Values) => string): BoundaryLogEntry | null =>
  [...log].reverse().find((entry) => shown(entry.before.blackboard.values) !== shown(entry.after.blackboard.values)) ?? null;

export const repliesSince = (chat: readonly unknown[], messageId: number): number =>
  chat.filter((row, index) => index > messageId && isRecord(row) && row.is_user !== true && row.is_system !== true).length;

export const changedAgo = (log: readonly BoundaryLogEntry[], chat: readonly unknown[], shown: (values: Values) => string): number | undefined => {
  const entry = lastChange(log, shown);
  return entry ? repliesSince(chat, entry.context.lastMessageId) : undefined;
};

export const shownItem = (quality: Quality) => (values: Values): string => {
  const item = sheetItem(quality, values, null);
  return item ? `${item.text}|${item.value ?? ""}` : "";
};

const writerOf = (entry: BoundaryLogEntry, key: string): ProvenanceWriter => {
  const applied = (entry.queue?.applied ?? []).find((write) => write.deltas.some((delta) => delta.q === key));
  const delta = applied?.deltas.find((write) => write.q === key);
  if (delta?.writer === "manual" || (!applied && entry.source === "manual")) return "author";
  return applied?.source === "extractor" || applied?.source === "reconciliation" ? "reader" : "story";
};

export const provenanceOf = (log: readonly BoundaryLogEntry[], label: string, key: string): ProvenanceView => {
  const entry = lastChange(log, (values) => JSON.stringify(values[key] ?? null));
  return { label, key, ...(entry ? { writer: writerOf(entry, key), boundary: entry.boundary, messageId: entry.context.lastMessageId } : {}) };
};
