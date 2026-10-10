import type { ChatPresence, ConfirmAnswer } from "@services/STAPI";
import { stampedFor } from "@stagecraft/index";
import type { WriteResult } from "@utils/writeResult";
import { deletedChatLabel, reapLog, type ReapDecision } from "./mirrorReaper";
import { serialQueue } from "./serialQueue";
import { beginRun, type RunOwnership } from "./runToken";

export interface StampedEntry {
  book: string;
  uid: number;
  comment: string;
  groupId: string | null;
}

export interface LoreEntryRead {
  uid: number;
  comment: string;
  content: string;
}

export interface CreatedReaperDeps {
  books: () => string[];
  listLorebooks: () => string[];
  loadEntries: (book: string) => Promise<LoreEntryRead[] | null>;
  readEntryAt: (book: string, uid: number) => Promise<LoreEntryRead | null>;
  probeChat: (owner: { chatId: string; groupId: string | null; avatar: null }) => Promise<ChatPresence>;
  confirm: (chatId: string, entries: StampedEntry[]) => Promise<ConfirmAnswer>;
  deleteEntry: (book: string, uid: number) => Promise<WriteResult<{ confirmed: boolean }>>;
  notify: () => void;
  record?: (decision: ReapDecision) => void;
  now?: () => string;
  ownership: RunOwnership;
}

export type CreatedReapResult = "none" | "chat-present" | "unverifiable" | "declined" | "dismissed" | "delete-failed" | "deleted";

export interface CreatedReapOutcome {
  result: CreatedReapResult;
  deleted: StampedEntry[];
  kept: StampedEntry[];
}

const entriesText = (count: number) => `${String(count)} curator-created lorebook entr${count === 1 ? "y" : "ies"}`;

const titles = (entries: StampedEntry[]) => entries.map((entry) => `“${entry.comment}” (${entry.book})`).join(", ");

export const createdReapQuestion = (chatId: string, entries: StampedEntry[]): string =>
  [
    `You deleted ${deletedChatLabel("", chatId)}.`,
    `While it played, the World Info curator created ${entries.length === 1 ? "this lorebook entry" : `these ${String(entries.length)} lorebook entries`} for it: ${titles(entries)}.`,
    `Delete ${entries.length === 1 ? "it" : "them"} too? Entries the curator did not create for this chat are never touched. This cannot be undone.`,
  ].join(" ");

export class CreatedEntryReaper {
  private readonly queue = serialQueue();

  constructor(private readonly deps: CreatedReaperDeps) {}

  onChatDeleted(chatId: string): Promise<CreatedReapOutcome> {
    return this.queue(() => this.reapChat(chatId));
  }

  private journal(chatId: string, entries: StampedEntry[], result: Exclude<CreatedReapResult, "none" | "chat-present">, summary: string) {
    const decision: ReapDecision = { at: this.deps.now?.() ?? new Date().toISOString(), chatId, book: [...new Set(entries.map((entry) => entry.book))].join(", "), result, summary };
    (this.deps.record ?? ((entry: ReapDecision) => reapLog.note(entry)))(decision);
    this.deps.notify();
  }

  private async stamped(chatId: string): Promise<StampedEntry[]> {
    const listed = new Set(this.deps.listLorebooks());
    const found: StampedEntry[] = [];
    for (const book of [...new Set(this.deps.books())].filter((name) => listed.has(name))) {
      for (const entry of (await this.deps.loadEntries(book)) ?? []) {
        const stamp = stampedFor(entry.content, chatId);
        if (stamp) found.push({ book, uid: entry.uid, comment: entry.comment, groupId: stamp.groupId });
      }
    }
    return found;
  }

  private async reapChat(chatId: string): Promise<CreatedReapOutcome> {
    const id = typeof chatId === "string" ? chatId.trim() : "";
    const none: CreatedReapOutcome = { result: "none", deleted: [], kept: [] };
    if (!id) return none;
    const run = beginRun(this.deps.ownership);
    const entries = await this.stamped(id);
    if (!entries.length) return none;
    const groupId = entries.find((entry) => entry.groupId)?.groupId ?? null;
    const presence = await this.deps.probeChat({ chatId: id, groupId, avatar: null });
    if (presence === "present") return { result: "chat-present", deleted: [], kept: entries };
    const label = deletedChatLabel("", id);
    if (presence !== "absent") {
      this.journal(id, entries, "unverifiable", `Left ${entriesText(entries.length)} of ${label}: the chat's deletion could not be confirmed.`);
      return { result: "unverifiable", deleted: [], kept: entries };
    }
    const answer = await this.deps.confirm(id, entries);
    if (answer !== "confirmed") {
      this.journal(id, entries, answer, `Kept the curator-created lorebook entries of ${label}${answer === "dismissed" ? ": the question was closed without an answer" : ""}.`);
      return { result: answer, deleted: [], kept: entries };
    }
    const deleted: StampedEntry[] = [];
    const kept: StampedEntry[] = [];
    for (const entry of entries) {
      if (!run.stillOwns()) {
        kept.push(entry);
        continue;
      }
      const live = await this.deps.readEntryAt(entry.book, entry.uid);
      if (!live || !stampedFor(live.content, id) || !run.stillOwns()) {
        kept.push(entry);
        continue;
      }
      const removed = await this.deps.deleteEntry(entry.book, entry.uid);
      (removed.ok ? deleted : kept).push(entry);
    }
    const result = deleted.length ? "deleted" as const : "delete-failed" as const;
    const keptText = kept.length ? `; kept ${String(kept.length)} that changed or could not be deleted` : "";
    this.journal(id, entries, result, `Deleted ${entriesText(deleted.length)} of ${label}${keptText}.`);
    return { result, deleted, kept };
  }
}
