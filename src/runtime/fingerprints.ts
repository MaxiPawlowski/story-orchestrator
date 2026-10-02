import { fnv1a, stableStringify } from "./hash";

// What each consumed message said when the boundary that consumed it was saved, so a
// message that changed with no event (a third-party rewrite, a branch cut short, an editor move that
// names only one of the rows it swapped) is found at the next boundary, hydrate or same-chat reload.
// `swipe_id` is not hashed (deleting a lower swipe decrements it with `mes` unchanged), nor
// `is_system` (hiding is not deleting), nor a user row's `name` (`/persona-sync` renames them).
// hashes[i] is message `from + i`; `null` or absent is unknown, never a mismatch.

export interface MessageFingerprints {
  v: 1;
  from: number;
  hashes: Array<string | null>;
}

interface HashedMessage {
  mes?: unknown;
  is_user?: unknown;
  name?: unknown;
}

const cache = new WeakMap<object, HashedMessage & { hash: string }>();

export function fingerprintOf(message: unknown): string {
  const shaped = (message && typeof message === "object" ? message : {}) as HashedMessage;
  const cached = message && typeof message === "object" ? cache.get(message) : undefined;
  if (cached && cached.mes === shaped.mes && cached.is_user === shaped.is_user && cached.name === shaped.name) return cached.hash;
  const user = shaped.is_user === true;
  const hash = fnv1a(stableStringify({ mes: shaped.mes ?? null, is_user: user, name: user ? null : shaped.name ?? null }));
  if (message && typeof message === "object") cache.set(message, { mes: shaped.mes, is_user: shaped.is_user, name: shaped.name, hash });
  return hash;
}

export function sanitizeFingerprints(value: unknown): MessageFingerprints | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<MessageFingerprints>;
  if (raw.v !== 1 || typeof raw.from !== "number" || !Number.isInteger(raw.from) || raw.from < 0 || !Array.isArray(raw.hashes)) return null;
  return { v: 1, from: raw.from, hashes: raw.hashes.map((hash) => (typeof hash === "string" ? hash : null)) };
}

export const hashAt = (stored: MessageFingerprints | null, messageId: number): string | null =>
  stored && messageId >= stored.from ? stored.hashes[messageId - stored.from] ?? null : null;

/** Every id after the history floor up to the last consumed message: a known hash is kept (only a
 *  rollback or a continue may forget one), an unknown one is taken from the chat as it is now. */
export function captureFingerprints(stored: MessageFingerprints | null, chat: readonly unknown[], floor: number, last: number): MessageFingerprints | null {
  const from = Math.max(0, Math.floor(floor) + 1);
  if (!Number.isFinite(last) || last < from) return null;
  const hashes: Array<string | null> = [];
  for (let id = from; id <= last; id += 1) hashes.push(hashAt(stored, id) ?? (id < chat.length ? fingerprintOf(chat[id]) : null));
  return { v: 1, from, hashes };
}

/** What replay to a boundary holds: nothing at or after `messageId`. */
export function truncateFingerprints(stored: MessageFingerprints | null, messageId: number): MessageFingerprints | null {
  if (!stored || !Number.isFinite(messageId)) return stored;
  const keep = Math.max(0, Math.floor(messageId) - stored.from);
  return keep > 0 ? { v: 1, from: stored.from, hashes: stored.hashes.slice(0, keep) } : null;
}

/** The first message the chat no longer holds as consumed: a changed hash, or the end of a chat
 *  shorter than the engine's last message (checked with or without fingerprints). */
export function diffFingerprints(stored: MessageFingerprints | null, chat: readonly unknown[], lastMessageId: number): number | null {
  const short = chat.length < lastMessageId + 1 ? chat.length : null;
  if (stored) {
    const end = Math.min(stored.from + stored.hashes.length - 1, lastMessageId, chat.length - 1);
    for (let id = stored.from; id <= end; id += 1) {
      const hash = stored.hashes[id - stored.from];
      if (hash && hash !== fingerprintOf(chat[id])) return id;
    }
  }
  return short;
}

export class FingerprintKeeper {
  private value: MessageFingerprints | null = null;
  private heldFrom: number | null = null;

  load(persisted: unknown) {
    this.value = sanitizeFingerprints(persisted);
    this.heldFrom = null;
  }

  forgetFrom(messageId: number) {
    this.value = truncateFingerprints(this.value, messageId);
    if (Number.isFinite(messageId)) this.heldFrom = Math.min(this.heldFrom ?? Infinity, Math.max(0, Math.floor(messageId)));
  }

  settle() {
    this.heldFrom = null;
  }

  capture(chat: readonly unknown[], floor: number, last: number): MessageFingerprints | null {
    this.value = captureFingerprints(this.value, chat, floor, this.heldFrom === null ? last : Math.min(last, this.heldFrom - 1));
    return this.value;
  }

  drift(chat: readonly unknown[], lastMessageId: number): number | null {
    return diffFingerprints(this.value, chat, lastMessageId);
  }

  unchanged(chat: readonly unknown[], messageId: number): boolean {
    const known = hashAt(this.value, messageId);
    return known !== null && messageId < chat.length && known === fingerprintOf(chat[messageId]);
  }

  get current(): MessageFingerprints | null {
    return this.value;
  }
}
