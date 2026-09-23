import { hashMemoryText } from "@memory/stores";
import type { MemoryEntry } from "@memory/types";
import type { ChatLorebookBinding, Lorebook, WIUpsertResult } from "@services/STAPI";
import type { MemoryMirrorBook } from "./types";
import { beginRun, type RunOwnership } from "./runToken";

export interface MemoryMirrorHost {
  getChatId: () => string | null;
  ensureLorebook: (name: string) => Promise<{ name: string; created: boolean } | null>;
  loadLorebook: (name: string) => Promise<Lorebook | null>;
  upsertWIEntry: (lorebook: string, comment: string, content: string, keys?: string[]) => Promise<WIUpsertResult>;
  disableWIEntry: (lorebook: string, comments: string | string[]) => Promise<boolean>;
  bindChatLorebook: (name: string, replaceable?: string[]) => ChatLorebookBinding;
  // v2.3 plan 03. Optional: without it the chat-id comparison below still runs, so behaviour is
  // unchanged for a caller that supplies none.
  ownership?: RunOwnership;
}

export interface MemoryMirrorSummary {
  created: number;
  updated: number;
  unchanged: number;
  disabled: number;
  lorebook: string | null;
  binding: ChatLorebookBinding | null;
}

export interface MemoryMirrorInput {
  title: string;
  entries: MemoryEntry[];
  writes: Record<string, string>;
  book: MemoryMirrorBook | null;
}

export interface MemoryMirrorResult {
  summary: MemoryMirrorSummary;
  book: MemoryMirrorBook | null;
  writes: Record<string, string>;
  changed: boolean;
}

const COMMENT_PREFIX = "so_";

export const mirrorComment = (entry: MemoryEntry) => `${COMMENT_PREFIX}${entry.id}`;

// One book per chat, bound to that chat's own lorebook slot: its entries are this chat's memory and
// nothing else, so another chat of the same story cannot fire them. The name is fixed when the chat
// adopts the book and then travels with the memory state, so renaming the chat keeps the book.
export const mirrorLorebookName = (title: string, chatId: string) => `Story Orchestrator - ${title} - ${chatId}`;

export const mirroredEntries = (entries: MemoryEntry[]) => entries.filter((entry) =>
  !entry.supersededBy && !entry.foldedInto && (entry.type === "relationship" || (entry.tier === "scene_history" && entry.type === "scene")));

export const emptyMirrorSummary = (): MemoryMirrorSummary => ({ created: 0, updated: 0, unchanged: 0, disabled: 0, lorebook: null, binding: null });

async function leftoverComments(host: MemoryMirrorHost, lorebook: string, live: Set<string>): Promise<string[]> {
  const data = await host.loadLorebook(lorebook);
  return Object.values(data?.entries ?? {})
    .filter((entry) => entry.disable !== true)
    .map((entry) => entry.comment?.trim() ?? "")
    .filter((comment) => comment.startsWith(COMMENT_PREFIX) && !live.has(comment));
}

// Adopting a book (first write in this chat, a branch, a restart, or the book deleted under us)
// starts from nothing: earlier `wiWrites` describe another book or entries that are gone, and any
// `so_` entry already in the book belongs to a playthrough this chat no longer plays. Returns null
// when the chat changed mid-sync, so nothing is written into the next chat's state or lorebook slot.
export async function syncMemoryMirror(input: MemoryMirrorInput, host: MemoryMirrorHost): Promise<MemoryMirrorResult | null> {
  const summary = emptyMirrorSummary();
  const idle: MemoryMirrorResult = { summary, book: input.book, writes: input.writes, changed: false };
  const chatId = host.getChatId();
  if (!chatId) return idle;
  // v2.3 plan 03. This function already had an ownership check — the `host.getChatId() !== chatId`
  // comparison before the binding below — but it was hand-rolled, so the write-edge census could
  // not see it and it only ever asked about the chat. A STORY SWAP inside the same chat passed it,
  // and the mirror book is per-chat but shared across the stories played in that chat, so the
  // previous story's memory could be written and then recorded in the new story's extras.
  const run = beginRun(host.ownership);
  const live = mirroredEntries(input.entries);
  const owned = input.book?.chatId === chatId ? input.book : null;
  if (!owned && !live.length) return idle;

  const ensured = await host.ensureLorebook(owned?.name ?? mirrorLorebookName(input.title, chatId));
  if (!ensured) return idle;
  summary.lorebook = ensured.name;
  const adopting = !owned || ensured.created;
  const liveComments = new Set(live.map(mirrorComment));
  const writes = adopting ? {} : { ...input.writes };

  const stale = adopting
    ? (ensured.created ? [] : await leftoverComments(host, ensured.name, liveComments))
    : Object.keys(writes).filter((comment) => !liveComments.has(comment));
  if (stale.length) {
    await host.disableWIEntry(ensured.name, stale);
    for (const comment of stale) delete writes[comment];
    summary.disabled = stale.length;
  }

  for (const entry of live) {
    const comment = mirrorComment(entry);
    const hash = hashMemoryText(entry.text);
    if (writes[comment] === hash) {
      summary.unchanged += 1;
      continue;
    }
    const result = await host.upsertWIEntry(ensured.name, comment, entry.text, entry.entities);
    if (result === "failed") continue;
    writes[comment] = hash;
    if (result === "created") summary.created += 1;
    else if (result === "updated") summary.updated += 1;
    else summary.unchanged += 1;
  }

  // Both halves: the original chat comparison, plus story, version and epoch via the token.
  if (host.getChatId() !== chatId || !run.stillOwns()) return null;
  if (adopting) summary.binding = host.bindChatLorebook(ensured.name, input.book ? [input.book.name] : []);
  const changed = adopting || summary.created > 0 || summary.updated > 0 || summary.disabled > 0;
  return { summary, book: { name: ensured.name, chatId }, writes, changed };
}
