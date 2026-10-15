import type { ChatOwner } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

// A deleted chat leaves its per-chat mirror book behind (`memoryMirror.ts`). The reap is
// destructive and driven by an event ST emits even when nothing was deleted, so nothing here
// deletes on a name or an event alone: the book has to carry our in-book marker naming that chat, the
// chat file has to be confirmed gone, and the player has to say yes. Anything short of that is a
// session Repair row, never a delete.

export const MIRROR_BOOK_PREFIX = "Story Orchestrator - ";
export const OWNER_COMMENT = "so-owner";
const OWNER = "story-orchestrator";

export interface OwnerMarker extends ChatOwner {
  owner: typeof OWNER;
  createdAt: string;
  title: string | null;
}

export const ownerMarkerContent = (owner: ChatOwner, createdAt: string, title?: string): string =>
  JSON.stringify({ owner: OWNER, chatId: owner.chatId, integrity: owner.integrity, groupId: owner.groupId, avatar: owner.avatar, createdAt, ...(title?.trim() ? { title: title.trim() } : {}) });

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function parseOwnerMarker(content: string | null | undefined): OwnerMarker | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const record = parsed as Record<string, unknown> | null;
  const chatId = textOrNull(record?.chatId);
  if (!record || record.owner !== OWNER || !chatId) return null;
  return {
    owner: OWNER, chatId, integrity: textOrNull(record.integrity), groupId: textOrNull(record.groupId), avatar: textOrNull(record.avatar),
    createdAt: textOrNull(record.createdAt) ?? "", title: textOrNull(record.title),
  };
}

// A mirror book is `Story Orchestrator - <title> - <chatId>` as a listed file id. The suffix is exact, so
// chat `…-12` never matches a book of chat `…-123`; a solo chat id itself contains " - ", which is why
// the suffix only nominates and the marker decides.
export function reapCandidates(books: string[], chatId: string): string[] {
  const fileId = lorebookFileId(chatId);
  if (!fileId) return [];
  const suffix = ` - ${fileId}`;
  return books.filter((book) => book.startsWith(MIRROR_BOOK_PREFIX) && book.endsWith(suffix));
}

const CHAT_STAMP = /^(?:(.*\S)\s+-\s+)?(\d{4})-(\d{2})-(\d{2})@(\d{2})h(\d{2})m/;

export function deletedChatLabel(book: string, chatId: string, storedTitle?: string | null): string {
  const fileId = lorebookFileId(chatId);
  const suffix = ` - ${fileId}`;
  const fromBook = fileId && book.startsWith(MIRROR_BOOK_PREFIX) && book.endsWith(suffix) ? book.slice(MIRROR_BOOK_PREFIX.length, book.length - suffix.length).trim() : "";
  const title = storedTitle?.trim() || fromBook;
  const stamp = CHAT_STAMP.exec(chatId.trim());
  if (!stamp) return `${title ? `the "${title}" chat` : "the chat"} "${chatId}"`;
  const [, name, year, month, day, hour, minute] = stamp;
  return `${title ? `the "${title}" chat` : "a chat"}${name ? ` with ${name}` : ""} started ${year}-${month}-${day} ${hour}:${minute}`;
}

export const reapQuestion = (book: string, chatId: string, title?: string | null): string =>
  `You deleted ${deletedChatLabel(book, chatId, title)}. Its story memory is still kept in a lorebook. Delete that lorebook too? This cannot be undone.`;

export type ReapResult = "deleted" | "gone" | "not-ours" | "chat-present" | "declined" | "dismissed" | OrphanReason;

export type OrphanReason = "no-marker" | "unverifiable" | "lapsed" | "delete-failed";

export interface OrphanedLorebook {
  name: string;
  chatId: string;
  reason: OrphanReason;
  detail: string;
  label?: string;
}

/**
 * Session-scoped: the chat these rows describe is gone, so no chat's metadata can hold them. A row whose
 * book has since been deleted some other way (by hand, or a harness cleanup) is not shown: `watch` takes
 * the host's listing, and without one every row is shown.
 */
export class OrphanRegistry {
  private readonly rows = new Map<string, OrphanedLorebook>();
  private listed: ((name: string) => boolean) | null = null;

  watch(listed: ((name: string) => boolean) | null) {
    this.listed = listed;
  }

  list(): OrphanedLorebook[] {
    const rows = [...this.rows.values()];
    const listed = this.listed;
    return listed ? rows.filter((row) => listed(row.name)) : rows;
  }

  note(row: OrphanedLorebook) {
    this.rows.set(row.name, row);
  }

  forget(name: string): boolean {
    return this.rows.delete(name);
  }
}

export const orphanRegistry = new OrphanRegistry();

export const orphanedLorebooks = (): OrphanedLorebook[] => orphanRegistry.list();

export interface ReapDecision {
  at: string;
  chatId: string;
  book: string;
  result: ReapResult;
  summary: string;
}

const REAP_LOG_LIMIT = 20;

/**
 * Session-scoped, like the registry: the deleted chat has no metadata left to hold its reap, and
 * the chat open when the question is answered is a different chat, so no chat's journal is told.
 */
export class ReapLog {
  private rows: ReapDecision[] = [];

  note(decision: ReapDecision) {
    this.rows = [...this.rows, decision].slice(-REAP_LOG_LIMIT);
  }

  list(): ReapDecision[] {
    return [...this.rows];
  }
}

export const reapLog = new ReapLog();

export const reapDecisions = (): ReapDecision[] => reapLog.list();

// The book's chat is gone, so the open chat is not this work's world: the reap's world is the runtime
// run that heard the event. `end()` (stopRuntime) lapses every reap still waiting on its confirm.
export function lifetimeOwnership(): { ownership: RunOwnership; end: () => void } {
  let lifetime = 0;
  const context = (): RunContext => ({ chatId: null, storyId: null, storyHash: null, sessionEpoch: lifetime, windowRevision: 0 });
  return {
    ownership: { mint: () => mintToken(context()), check: (token) => tokenMatches(context(), token) },
    end: () => { lifetime += 1; },
  };
}
