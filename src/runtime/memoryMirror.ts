import { hashMemoryText } from "@memory/stores";
import { isLive } from "@memory/provenance";
import type { MemoryEntry } from "@memory/types";
import type { ChatLorebookBinding, ChatOwner, Lorebook, WIUpsertResult } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import type { MemoryMirrorBook } from "./types";
import { MIRROR_BOOK_PREFIX, OWNER_COMMENT, ownerMarkerContent } from "./mirrorReaper";
import { beginRun, type RunOwnership } from "./runToken";
import { log } from "@utils/log";

export interface MemoryMirrorHost {
  getChatId: () => string | null;
  ensureLorebook: (name: string) => Promise<{ name: string; created: boolean } | null>;
  loadLorebook: (name: string) => Promise<Lorebook | null>;
  upsertWIEntry: (lorebook: string, comment: string, content: string, keys?: string[]) => Promise<WIUpsertResult>;
  disableWIEntry: (lorebook: string, comments: string | string[]) => Promise<WriteResult<{ changed: boolean }>>;
  bindChatLorebook: (name: string, replaceable?: string[]) => ChatLorebookBinding;
  scanActive?: () => boolean;
  unbindChatLorebook?: (name: string) => Promise<WriteResult<{ name: string }>>;
  // Optional: without it the chat-id comparison below still runs, so behaviour is
  // unchanged for a caller that supplies none.
  ownership: RunOwnership;
  // Who the adopted book is for, written into it as the `so-owner` marker the reaper
  // requires. Optional like `ownership`: without it no marker is written, and such a book is never reaped.
  owner?: () => ChatOwner | null;
}

export interface MemoryMirrorSummary {
  created: number;
  updated: number;
  unchanged: number;
  disabled: number;
  lorebook: string | null;
  binding: ChatLorebookBinding | "released" | null;
  ran: boolean;
  skipped: "no-chat" | "nothing-live" | "no-book" | null;
  live: number;
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
export const mirrorLorebookName = (title: string, chatId: string) => `${MIRROR_BOOK_PREFIX}${title} - ${chatId}`;

// Scene rows are no longer mirrored. They were keyless, so inert in the book, and
// scene history already reaches the prompt through `memorySceneHistory`; the stale sweep below switches
// off the ones earlier syncs wrote.
export const mirroredEntries = (entries: MemoryEntry[]) => entries.filter((entry) =>
  !entry.supersededBy && !entry.foldedInto && isLive(entry) && entry.type === "relationship");

export const emptyMirrorSummary = (): MemoryMirrorSummary => ({ created: 0, updated: 0, unchanged: 0, disabled: 0, lorebook: null, binding: null, ran: false, skipped: null, live: 0 });

const skippedSync = (result: MemoryMirrorResult, skipped: MemoryMirrorSummary["skipped"]): MemoryMirrorResult => {
  result.summary.skipped = skipped;
  log.debug("memory mirror sync skipped", result.summary);
  return result;
};

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
  if (!chatId) return skippedSync(idle, "no-chat");
  // This function already had an ownership check — the `host.getChatId() !== chatId`
  // comparison before the binding below — but it was hand-rolled, so the write-edge census could
  // not see it and it only ever asked about the chat. A STORY SWAP inside the same chat passed it,
  // and the mirror book is per-chat but shared across the stories played in that chat, so the
  // previous story's memory could be written and then recorded in the new story's extras.
  const run = beginRun(host.ownership);
  const lapsed = () => host.getChatId() !== chatId || !run.stillOwns();
  const live = mirroredEntries(input.entries);
  summary.live = live.length;
  const owned = input.book?.chatId === chatId ? input.book : null;
  if (!owned && !live.length) return skippedSync(idle, "nothing-live");

  const ensured = await host.ensureLorebook(owned?.name ?? mirrorLorebookName(input.title, chatId));
  if (!ensured) return skippedSync(idle, "no-book");
  summary.ran = true;
  summary.lorebook = ensured.name;
  const adopting = !owned || ensured.created;
  const liveComments = new Set(live.map(mirrorComment));
  const writes = adopting ? {} : { ...input.writes };

  const stale = adopting
    ? (ensured.created ? [] : await leftoverComments(host, ensured.name, liveComments))
    : Object.keys(writes).filter((comment) => !liveComments.has(comment));
  if (lapsed()) return null;
  if (stale.length) {
    // A stale entry is forgotten only once the host has switched it off, so a refused disable
    // is retried on the next sync instead of leaving the entry live and untracked.
    const disabled = await host.disableWIEntry(ensured.name, stale);
    if (disabled.ok) {
      for (const comment of stale) delete writes[comment];
      summary.disabled = stale.length;
    }
  }

  for (const entry of live) {
    const comment = mirrorComment(entry);
    const hash = hashMemoryText(entry.text);
    if (writes[comment] === hash) {
      summary.unchanged += 1;
      continue;
    }
    if (lapsed()) return null;
    const result = await host.upsertWIEntry(ensured.name, comment, entry.text, entry.entities);
    if (result === "failed") continue;
    writes[comment] = hash;
    if (result === "created") summary.created += 1;
    else if (result === "updated") summary.updated += 1;
    else summary.unchanged += 1;
  }

  // The adopted book's `so-owner` marker. Keyless, so inert (world-info.js:4892-4907,
  // ), and switched off after the write because `upsertWIEntry` re-enables what it writes; the
  // hyphen keeps it out of the `so_` stale sweep. A marker that could not be written leaves the book
  // unreapable, never wrongly reapable.
  if (lapsed()) return null;
  const candidate = host.owner?.();
  const owner = adopting && candidate?.chatId === chatId ? candidate : null;
  if (owner?.chatId === chatId && await host.upsertWIEntry(ensured.name, OWNER_COMMENT, ownerMarkerContent(owner, new Date().toISOString())) !== "failed") {
    if (lapsed()) return null;
    await host.disableWIEntry(ensured.name, OWNER_COMMENT);
  }
  // Checked before EACH host write above, not once after them — a story swap mid-sync used to
  // let the departing story's rows land in the chat's shared book, and its stale sweep disable the
  // new story's entries. Both halves: the chat comparison, plus story, version and epoch via the token.
  if (lapsed()) return null;
  if (host.scanActive?.()) {
    const released = await host.unbindChatLorebook?.(ensured.name);
    if (released?.ok) summary.binding = "released";
  } else if (adopting) summary.binding = host.bindChatLorebook(ensured.name, input.book ? [input.book.name] : []);
  const changed = adopting || summary.created > 0 || summary.updated > 0 || summary.disabled > 0;
  log.debug("memory mirror sync", summary);
  return { summary, book: { name: ensured.name, chatId }, writes, changed };
}
