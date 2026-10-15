import type { ChatOwner, ChatPresence, ConfirmAnswer } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import { serialQueue } from "./serialQueue";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import {
  deletedChatLabel, orphanRegistry, parseOwnerMarker, reapCandidates, reapLog, type OrphanReason, type OrphanRegistry, type ReapDecision, type ReapResult,
} from "./mirrorReaper";

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
