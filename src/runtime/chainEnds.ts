import type { SourceRevision } from "@memory/audience";

export const CHAIN_END_REASONS = ["rules", "judge", "director", "cap", "budget", "yield", "player", "stopped", "interrupted", "transition", "script", "refused", "off"] as const;
export type ChainEndReason = (typeof CHAIN_END_REASONS)[number];

export interface ChainEnd {
  messageId: number;
  revision: SourceRevision | null;
  checkpointId: string;
  voices: number;
  reason: ChainEndReason;
}

export const CHAIN_END_LIMIT = 200;

export const recordChainEnd = (ends: ChainEnd[] | undefined, end: ChainEnd): ChainEnd[] => [...(ends ?? []), end].slice(-CHAIN_END_LIMIT);

export const rewindChainEnds = (ends: ChainEnd[] | undefined, messageId: number, mutation?: { kind: "edit" | "delete" | "swipe"; removed?: number }): ChainEnd[] => {
  const removed = Math.max(1, mutation?.removed ?? 1);
  return (ends ?? []).flatMap((end) => {
    if (end.messageId < messageId) return [end];
    if (!mutation) return [];
    if (mutation.kind !== "delete") return end.messageId === messageId ? [end] : [];
    return end.messageId < messageId + removed ? [] : [{ ...end, messageId: end.messageId - removed }];
  });
};

const isChainEnd = (value: unknown): value is ChainEnd => {
  if (!value || typeof value !== "object") return false;
  const end = value as ChainEnd;
  return Number.isInteger(end.messageId) && Number.isInteger(end.voices) && typeof end.checkpointId === "string"
    && (CHAIN_END_REASONS as readonly string[]).includes(end.reason) && (end.revision === null || typeof end.revision?.hash === "string");
};

export const sanitizeChainEnds = (value: unknown): ChainEnd[] => (Array.isArray(value) ? value : []).filter(isChainEnd).slice(-CHAIN_END_LIMIT);
