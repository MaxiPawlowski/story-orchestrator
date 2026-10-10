import type { ChatOwner, ChatPresence, ConfirmAnswer } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import type { WriteResult } from "@utils/writeResult";
import { serialQueue } from "./serialQueue";
import { beginRun, mintToken, tokenMatches, type RunContext, type RunGuard, type RunOwnership } from "./runToken";

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

export interface MirrorReaperDeps {
  listLorebooks: () => string[];
  /** The `so-owner` entry's content, or null when the book has none. */
  readMarker: (book: string) => Promise<string | null>;
  probeChat: (owner: Pick<ChatOwner, "chatId" | "groupId" | "avatar">) => Promise<ChatPresence>;
  confirm: (book: string, chatId: string, title: string | null) => Promise<ConfirmAnswer>;
  deleteLorebook: (name: string) => Promise<WriteResult<{ name: string }>>;
  notify: () => void;
  record?: (decision: ReapDecision) => void;
  now?: () => string;
  ownership: RunOwnership;
  registry?: OrphanRegistry;
}

export type ReapResult = "deleted" | "gone" | "not-ours" | "chat-present" | "declined" | "dismissed" | OrphanReason;

export interface ReapOutcome {
  book: string;
  result: ReapResult;
}

export class MirrorReaper {
  private readonly queue = serialQueue();

  constructor(private readonly deps: MirrorReaperDeps) {}

  private get registry() {
    return this.deps.registry ?? orphanRegistry;
  }

  /** Serialised, so a group delete that announces every chat asks one question at a time. */
  onChatDeleted(chatId: string): Promise<ReapOutcome[]> {
    return this.queue(() => this.reapChat(chatId));
  }

  private async reapChat(chatId: string): Promise<ReapOutcome[]> {
    const id = typeof chatId === "string" ? chatId.trim() : "";
    if (!id) return [];
    const run = beginRun(this.deps.ownership);
    const outcomes: ReapOutcome[] = [];
    for (const book of reapCandidates(this.deps.listLorebooks(), id)) outcomes.push(await this.reap(book, id, run));
    return outcomes;
  }

  private journal(summary: string, book: string, chatId: string, result: ReapResult) {
    const decision: ReapDecision = { at: this.deps.now?.() ?? new Date().toISOString(), chatId, book, result, summary };
    (this.deps.record ?? ((entry: ReapDecision) => reapLog.note(entry)))(decision);
  }

  private orphan(book: string, chatId: string, reason: OrphanReason, detail: string, title: string | null = null): ReapOutcome {
    const label = deletedChatLabel(book, chatId, title);
    this.registry.note({ name: book, chatId, reason, detail, label });
    this.journal(`Left the story-memory lorebook of ${label}: ${detail}.`, book, chatId, reason);
    this.deps.notify();
    return { book, result: reason };
  }

  private kept(book: string, chatId: string, answer: "declined" | "dismissed", title: string | null): ReapOutcome {
    const label = deletedChatLabel(book, chatId, title);
    this.journal(answer === "declined"
      ? `Kept the story-memory lorebook of ${label}.`
      : `Kept the story-memory lorebook of ${label}: the question was closed without an answer.`, book, chatId, answer);
    if (this.registry.forget(book)) this.deps.notify();
    return { book, result: answer };
  }

  // Deleted elsewhere while a read or the question was open (by hand, or a harness cleanup): nothing is
  // orphaned, and a missing marker on a book that is gone says nothing about ownership.
  private gone(book: string): ReapOutcome | null {
    if (this.deps.listLorebooks().includes(book)) return null;
    if (this.registry.forget(book)) this.deps.notify();
    return { book, result: "gone" };
  }

  private async reap(book: string, chatId: string, run: RunGuard): Promise<ReapOutcome> {
    const marker = parseOwnerMarker(await this.deps.readMarker(book));
    const goneAfterRead = this.gone(book);
    if (goneAfterRead) return goneAfterRead;
    if (!marker) return this.orphan(book, chatId, "no-marker", "it carries no ownership marker");
    if (marker.chatId !== chatId) return { book, result: "not-ours" };
    const presence = await this.deps.probeChat(marker);
    if (presence === "present") return { book, result: "chat-present" };
    if (presence !== "absent") return this.orphan(book, chatId, "unverifiable", "the chat's deletion could not be confirmed", marker.title);
    const answer = await this.deps.confirm(book, chatId, marker.title);
    const goneAfterConfirm = this.gone(book);
    if (goneAfterConfirm) return goneAfterConfirm;
    if (answer !== "confirmed") return this.kept(book, chatId, answer, marker.title);
    if (!run.stillOwns()) return this.orphan(book, chatId, "lapsed", "the extension stopped before it could be deleted", marker.title);
    const deleted = await this.deps.deleteLorebook(book);
    if (!deleted.ok) return this.orphan(book, chatId, "delete-failed", deleted.reason, marker.title);
    this.registry.forget(book);
    this.journal(`Deleted the story-memory lorebook of ${deletedChatLabel(book, chatId, marker.title)}.`, book, chatId, "deleted");
    this.deps.notify();
    return { book, result: "deleted" };
  }
}
