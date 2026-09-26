import type { ChatOwner, ChatPresence } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import type { WriteResult } from "@utils/writeResult";
import { beginRun, mintToken, tokenMatches, type RunContext, type RunGuard, type RunOwnership } from "./runToken";

// v2.4 plan 02 T14. A deleted chat leaves its per-chat mirror book behind (`memoryMirror.ts`). The reap is
// destructive and driven by an event ST emits even when nothing was deleted (02-H11), so nothing here
// deletes on a name or an event alone: the book has to carry our in-book marker naming that chat, the
// chat file has to be confirmed gone, and the player has to say yes. Anything short of that is a
// session Repair row, never a delete.

export const MIRROR_BOOK_PREFIX = "Story Orchestrator - ";
export const OWNER_COMMENT = "so-owner";
const OWNER = "story-orchestrator";

export interface OwnerMarker extends ChatOwner {
  owner: typeof OWNER;
  createdAt: string;
}

export const ownerMarkerContent = (owner: ChatOwner, createdAt: string): string =>
  JSON.stringify({ owner: OWNER, chatId: owner.chatId, integrity: owner.integrity, groupId: owner.groupId, avatar: owner.avatar, createdAt });

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
  return { owner: OWNER, chatId, integrity: textOrNull(record.integrity), groupId: textOrNull(record.groupId), avatar: textOrNull(record.avatar), createdAt: textOrNull(record.createdAt) ?? "" };
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

export type OrphanReason = "no-marker" | "unverifiable" | "declined" | "lapsed" | "delete-failed";

export interface OrphanedLorebook {
  name: string;
  chatId: string;
  reason: OrphanReason;
  detail: string;
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

// The book's chat is gone, so the open chat is not this work's world: the reap's world is the runtime
// run that heard the event. `end()` (stopRuntime) lapses every reap still waiting on its confirm.
export function lifetimeOwnership(): { ownership: RunOwnership; end: () => void } {
  let lifetime = 0;
  const context = (): RunContext => ({ chatId: null, storyId: null, playedVersion: null, sessionEpoch: lifetime, windowRevision: 0 });
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
  confirm: (book: string, chatId: string) => Promise<boolean>;
  deleteLorebook: (name: string) => Promise<WriteResult<{ name: string }>>;
  notify: () => void;
  ownership: RunOwnership;
  registry?: OrphanRegistry;
}

export type ReapResult = "deleted" | "gone" | "not-ours" | "chat-present" | OrphanReason;

export interface ReapOutcome {
  book: string;
  result: ReapResult;
}

export class MirrorReaper {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: MirrorReaperDeps) {}

  private get registry() {
    return this.deps.registry ?? orphanRegistry;
  }

  /** Serialised, so a group delete that announces every chat asks one question at a time. */
  onChatDeleted(chatId: string): Promise<ReapOutcome[]> {
    const next = this.queue.then(() => this.reapChat(chatId));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async reapChat(chatId: string): Promise<ReapOutcome[]> {
    const id = typeof chatId === "string" ? chatId.trim() : "";
    if (!id) return [];
    const run = beginRun(this.deps.ownership);
    const outcomes: ReapOutcome[] = [];
    for (const book of reapCandidates(this.deps.listLorebooks(), id)) outcomes.push(await this.reap(book, id, run));
    return outcomes;
  }

  private orphan(book: string, chatId: string, reason: OrphanReason, detail: string): ReapOutcome {
    this.registry.note({ name: book, chatId, reason, detail });
    this.deps.notify();
    return { book, result: reason };
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
    if (presence !== "absent") return this.orphan(book, chatId, "unverifiable", "the chat's deletion could not be confirmed");
    const accepted = await this.deps.confirm(book, chatId);
    const goneAfterConfirm = this.gone(book);
    if (goneAfterConfirm) return goneAfterConfirm;
    if (!accepted) return this.orphan(book, chatId, "declined", "you chose to keep it");
    if (!run.stillOwns()) return this.orphan(book, chatId, "lapsed", "the extension stopped before it could be deleted");
    const deleted = await this.deps.deleteLorebook(book);
    if (!deleted.ok) return this.orphan(book, chatId, "delete-failed", deleted.reason);
    this.registry.forget(book);
    this.deps.notify();
    return { book, result: "deleted" };
  }
}
