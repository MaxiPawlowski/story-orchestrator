import { fingerprintOf, hashAt, type MessageFingerprints } from "./fingerprints";

// v2.4 plan 08 T19d (D12). A "message N" citation opens `/chat-jump N`. ST answers that command with ''
// whether it scrolled or not (08-H2), so whether a jump is possible is decided here, before it is sent.
// The plan 02 T3 fingerprints say whether the cited message still reads as it did when a boundary
// consumed it; a message no boundary fingerprinted is best-effort, never "changed".

export type JumpFingerprint = "same" | "changed" | "unknown";

export type JumpTarget = { ok: true; id: number; changed: boolean; bestEffort: boolean } | { ok: false; reason: string };

export interface ChatJumpIndex {
  chatLength: number;
  known: { from: number; to: number } | null;
  changed: number[];
}

export function jumpIndex(chat: readonly unknown[], stored: MessageFingerprints | null): ChatJumpIndex {
  if (!stored || !stored.hashes.length) return { chatLength: chat.length, known: null, changed: [] };
  const to = stored.from + stored.hashes.length - 1;
  const changed: number[] = [];
  for (let id = stored.from; id <= Math.min(to, chat.length - 1); id += 1) {
    const hash = hashAt(stored, id);
    if (hash && hash !== fingerprintOf(chat[id])) changed.push(id);
  }
  return { chatLength: chat.length, known: { from: stored.from, to }, changed };
}

export function fingerprintAt(index: ChatJumpIndex | null, messageId: number): JumpFingerprint {
  if (!index?.known || messageId < index.known.from || messageId > index.known.to || messageId >= index.chatLength) return "unknown";
  return index.changed.includes(messageId) ? "changed" : "same";
}

export function jumpTarget(messageId: number, chatLength: number, fingerprint: JumpFingerprint = "unknown"): JumpTarget {
  if (!Number.isFinite(messageId) || messageId < 0) return { ok: false, reason: "this row came from before message ids were recorded" };
  const id = Math.floor(messageId);
  if (id >= chatLength) return { ok: false, reason: `message ${id} is past the end of this chat (${chatLength} messages)` };
  return { ok: true, id, changed: fingerprint === "changed", bestEffort: fingerprint === "unknown" };
}

export const jumpLabel = (messageId: number, fingerprint: JumpFingerprint): string =>
  `message ${messageId}${fingerprint === "changed" ? " (changed since)" : fingerprint === "unknown" ? " (best-effort)" : ""}`;
