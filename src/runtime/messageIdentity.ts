import { fnv1a } from "./hash";

// v2.4 plan 01 T1. `MESSAGE_DELETED` carries the post-delete `chat.length` (host-facts 01-H1), which
// names the removed message only for a tail cut. A middle delete, a `/cut` range and a tool-call run
// removed with its reply (01-H3, 01-H4) all need the chat as it was before the event, so the bridge
// keeps one identity snapshot per chat and diffs it against the chat the event leaves behind.
// `is_system` is not part of a key (hiding must never misalign a delete), and neither is `swipe_id`
// (deleting a lower swipe decrements it with `mes` unchanged; a real swipe already changes `mes`).

export type DeleteBasis = "exact" | "ambiguous" | "stale";

export interface DeleteDecode {
  start: number;
  count: number;
  basis: DeleteBasis;
}

export interface DecodeJournal {
  summary: string;
  note: string;
}

interface IdentifiedMessage {
  send_date?: unknown;
  name?: unknown;
  is_user?: unknown;
  mes?: unknown;
}

interface CachedKey {
  send_date: unknown;
  name: unknown;
  is_user: unknown;
  mes: unknown;
  key: string;
}

const keyCache = new WeakMap<object, CachedKey>();

const computeKey = (message: IdentifiedMessage): string => {
  const text = typeof message.mes === "string" ? message.mes : "";
  return `${String(message.send_date ?? "")}|${String(message.name ?? "")}|${message.is_user === true ? 1 : 0}|${text.length}|${fnv1a(text)}`;
};

export function messageKey(message: unknown): string {
  if (!message || typeof message !== "object") return computeKey({});
  const shaped = message as IdentifiedMessage;
  const cached = keyCache.get(message);
  if (cached && cached.mes === shaped.mes && cached.name === shaped.name && cached.send_date === shaped.send_date && cached.is_user === shaped.is_user) return cached.key;
  const key = computeKey(shaped);
  keyCache.set(message, { send_date: shaped.send_date, name: shaped.name, is_user: shaped.is_user, mes: shaped.mes, key });
  return key;
}

export const messageKeys = (chat: readonly unknown[]): string[] => chat.map(messageKey);

export function decodeDelete(before: readonly string[] | null, afterChat: readonly unknown[] | null | undefined, postLength: number): DeleteDecode {
  const stale = (): DeleteDecode => ({ start: postLength, count: Math.max(0, (before?.length ?? postLength) - postLength), basis: "stale" });
  if (!before || !Array.isArray(afterChat) || afterChat.length !== postLength || before.length <= postLength) return stale();
  const after = messageKeys(afterChat);
  const count = before.length - postLength;
  let prefix = 0;
  while (prefix < postLength && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < postLength && before[before.length - 1 - suffix] === after[postLength - 1 - suffix]) suffix += 1;
  const earliest = postLength - suffix;
  if (earliest > prefix) return stale();
  return { start: earliest, count, basis: earliest === prefix ? "exact" : "ambiguous" };
}

export function describeDecode(decode: DeleteDecode, postLength: number): DecodeJournal | null {
  if (decode.basis === "exact") return null;
  if (decode.basis === "ambiguous") {
    return { summary: "message delete decoded ambiguously", note: `${decode.count} message(s) removed; repeated messages allow more than one start, so the story steps back from the earliest (${decode.start}); chat length now ${postLength}` };
  }
  return { summary: "message delete not decoded", note: `the chat before the delete is unknown or no longer lines up with it (no snapshot, a length that did not shrink, or a change no event announced); stepped back from the post-delete length ${postLength}, which is right only for a tail delete` };
}

export class ChatIdentity {
  private snapshot: { chatId: string; keys: string[] } | null = null;

  refresh(chatId: string, chat: unknown) {
    this.snapshot = Array.isArray(chat) ? { chatId, keys: messageKeys(chat) } : null;
  }

  clear() {
    this.snapshot = null;
  }

  decode(chatId: string, chat: unknown, postLength: number): DeleteDecode {
    const before = this.snapshot?.chatId === chatId ? this.snapshot.keys : null;
    const decoded = decodeDelete(before, Array.isArray(chat) ? chat : null, postLength);
    this.refresh(chatId, chat);
    return decoded;
  }
}
