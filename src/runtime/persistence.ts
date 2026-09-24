import { getContext } from "@services/STAPI";
import { migrateMetadataBlob, migrateV3ToV4 } from "./persistenceMigration";
import { listStoryRecords } from "./storyLibrary";
import type { PersistedStoryRuntime, StoryOrchestratorMetadataBlob } from "./types";

const METADATA_KEY = "story_orchestrator";

// Keep the selected story plus the most recent others; a pinned copy is ~17 KB, so an unbounded
// map would grow chat_metadata without limit.
export const STORY_STATE_RETENTION = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const openChatId = (): string | null => {
  const id = getContext().chatId;
  return id === undefined || id === null ? null : String(id);
};

const createBlob = (): StoryOrchestratorMetadataBlob => ({ version: 4, chatId: openChatId(), selectedStoryId: null, stories: {} });

/**
 * v2.3 plan 03. A blob stamped for another chat is not this chat's to read.
 *
 * `chat_metadata` belongs to the host, which swaps it when the chat changes. A read racing that
 * swap used to be indistinguishable from an ordinary read, and the result is the defect v2.1
 * plan 08 recorded from the other side: one chat's run appearing in another chat.
 *
 * It is neither read nor destroyed (V5, 2026-09-23). The read answers an empty, DETACHED blob — "no
 * story selected", the honest answer when the state on hand belongs to somebody else — and leaves the
 * stored one exactly as it was: the first version wrote the empty blob back, so the next save of
 * whatever metadata object was open erased the other chat's run. Automatic writes into a foreign
 * blob are refused; an explicit selection adopts it (`adoptChatState`, from `selectStory`), and a rename re-stamps it.
 */
const belongsHere = (blob: StoryOrchestratorMetadataBlob): boolean => blob.chatId === null || blob.chatId === openChatId();

export type BlobMismatch =
  | { kind: "foreign"; stampedFor: string; openChat: string | null }
  | { kind: "unreadable"; foundVersion: number | string | null; openChat: string | null };

let mismatch: BlobMismatch | null = null;

export const blobMismatch = (): BlobMismatch | null => mismatch;

const KNOWN_VERSIONS: unknown[] = [2, 3, 4];

const storedValue = (): unknown => (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY];

const recognized = (value: unknown): value is Record<string, unknown> => isRecord(value) && KNOWN_VERSIONS.includes(value.version) && isRecord(value.stories);

const unrecognized = (value: unknown): boolean => value !== undefined && value !== null && !recognized(value);

const foundVersionOf = (value: unknown): number | string | null => {
  const version = isRecord(value) ? value.version : undefined;
  return typeof version === "number" || typeof version === "string" ? version : null;
};

export const describeMismatch = (found: BlobMismatch): string => (found.kind === "foreign"
  ? `stamped for chat ${found.stampedFor}`
  : `unreadable by this build (version ${found.foundVersion === null ? "missing" : JSON.stringify(found.foundVersion)})`);

export type UnreadableBlob = Extract<BlobMismatch, { kind: "unreadable" }>;

export const unreadableNotice = (found: UnreadableBlob): string => (typeof found.foundVersion === "number" && found.foundVersion > 4
  ? `saved by a newer Story Orchestrator (v${found.foundVersion}): update, or Restart to replace it`
  : `${describeMismatch(found)}: Restart to replace it`);

const storedBlob = (): StoryOrchestratorMetadataBlob | null => {
  const metadata = getContext().chatMetadata as Record<string, unknown>;
  const existing = storedValue();
  if (!recognized(existing)) return null;
  const current = existing.version === 4
    ? (existing as unknown as StoryOrchestratorMetadataBlob)
    // v3 is one step behind: it has the right shape and only wants the stamp. v2 and earlier go
    // through the full migration, which ends by calling migrateV3ToV4 itself.
    : existing.version === 3
      ? migrateV3ToV4(existing as unknown as { selectedStoryId: string | null; stories: StoryOrchestratorMetadataBlob["stories"] })
      : migrateMetadataBlob(existing, listStoryRecords());
  if (current && belongsHere(current)) metadata[METADATA_KEY] = current;
  return current;
};

const noteMismatch = (next: BlobMismatch) => {
  if (JSON.stringify(mismatch) !== JSON.stringify(next)) {
    const tag = next.kind === "foreign" ? "blob-chat-mismatch" : "blob-unreadable";
    console.warn(`[Story Orchestrator] ${tag}: chat_metadata holds state ${describeMismatch(next)} while ${String(next.openChat)} is open; left untouched, read as no story selected`);
  }
  mismatch = next;
};

export function getMetadataBlob(): StoryOrchestratorMetadataBlob {
  const current = storedBlob();
  if (current && belongsHere(current)) {
    mismatch = null;
    return current;
  }
  if (current) {
    noteMismatch({ kind: "foreign", stampedFor: String(current.chatId), openChat: openChatId() });
    return createBlob();
  }
  const existing = storedValue();
  if (unrecognized(existing)) {
    noteMismatch({ kind: "unreadable", foundVersion: foundVersionOf(existing), openChat: openChatId() });
    return createBlob();
  }
  mismatch = null;
  const blob = createBlob();
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = blob;
  return blob;
}

export const unreadableStored = (): UnreadableBlob | null => {
  const existing = storedValue();
  return unrecognized(existing) ? { kind: "unreadable", foundVersion: foundVersionOf(existing), openChat: openChatId() } : null;
};

const ownBlob = (write: string): StoryOrchestratorMetadataBlob | null => {
  const blob = getMetadataBlob();
  if (!mismatch) return blob;
  console.warn(`[Story Orchestrator] ${write} refused: this chat's metadata holds state ${describeMismatch(mismatch)}`);
  return null;
};

/** An explicit choice made in the open chat adopts a foreign-stamped blob (an imported chat file
 *  carries its original id). The swap race cannot reach here: nobody clicks inside it. A blob this
 *  build cannot read is never adopted: only a confirmed Restart replaces it. */
export const adoptChatState = (): boolean => {
  const current = storedBlob();
  if (!current) return !unrecognized(storedValue());
  if (belongsHere(current)) return true;
  current.chatId = openChatId();
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = current;
  mismatch = null;
  return true;
};

export function replaceUnreadableBlob(): boolean {
  if (!unrecognized(storedValue())) return false;
  mismatch = null;
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = createBlob();
  void getContext().saveMetadata?.();
  return true;
}

/** ST keeps a chat's metadata across a rename but the chat id is its file name, so the stamp has to
 *  follow it — or every renamed chat reads as someone else's and loses its story. */
export function restampRenamedChat(oldFileName: unknown, newFileName: unknown): boolean {
  const bare = (name: unknown) => (typeof name === "string" ? name.replace(/\.jsonl$/, "") : null);
  const from = bare(oldFileName);
  const to = bare(newFileName);
  const current = storedBlob();
  if (!from || !to || !current || current.chatId !== from || openChatId() !== to) return false;
  current.chatId = to;
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = current;
  mismatch = null;
  void getContext().saveMetadata?.();
  return true;
}

export function getSelectedStoryId(): string | null {
  return getMetadataBlob().selectedStoryId ?? null;
}

export function setSelectedStoryId(id: string | null) {
  const blob = ownBlob("selecting a story");
  if (!blob) return;
  blob.selectedStoryId = id;
  void getContext().saveMetadata?.();
}

export function loadPersistedRuntime(id: string): PersistedStoryRuntime | null {
  return getMetadataBlob().stories[id] ?? null;
}

// v2.3 plan 05. The retention is a promise the chat makes about its own state, so an eviction is
// reported rather than silent: the ids come back so the caller can journal them and an author can
// see WHICH story this chat just stopped keeping progress for.
const gcStories = (blob: StoryOrchestratorMetadataBlob): string[] => {
  const ids = Object.keys(blob.stories);
  if (ids.length <= STORY_STATE_RETENTION) return [];
  const ranked = ids
    .filter((id) => id !== blob.selectedStoryId)
    .sort((left, right) => Date.parse(blob.stories[right]?.extras?.updatedAt ?? "") - Date.parse(blob.stories[left]?.extras?.updatedAt ?? ""));
  const evicted = ranked.slice(Math.max(0, STORY_STATE_RETENTION - 1));
  for (const id of evicted) delete blob.stories[id];
  return evicted;
};

/** What a chat says when it stops keeping a story's progress. A story the library no longer holds is
 *  named by its id, because "this chat dropped it" is still true and the title is simply gone. */
export function evictedStoryNotice(evictedIds: string[], titleOf: (id: string) => string | null): { summary: string; detail: string } | null {
  if (!evictedIds.length) return null;
  const named = evictedIds.map((id) => titleOf(id) ?? id);
  return {
    summary: `this chat stopped keeping progress for ${named.join(", ")}`,
    detail: `a chat keeps progress for the ${STORY_STATE_RETENTION} most recent stories; export the state before switching if you need it`,
  };
}

export function savePersistedRuntime(record: PersistedStoryRuntime): string[] {
  const blob = ownBlob("saving story state");
  if (!blob) return [];
  // An unstamped blob (written before v4, or migrated from v3 where the chat could not be
  // recovered) takes the open chat's id the first time this chat writes to it.
  if (blob.chatId === null) blob.chatId = openChatId();
  blob.stories[record.storyId] = record;
  blob.selectedStoryId = record.storyId;
  const evicted = gcStories(blob);
  void getContext().saveMetadata?.();
  return evicted;
}

export function dropPersistedRuntime(id: string) {
  const blob = ownBlob("dropping story state");
  if (!blob) return;
  delete blob.stories[id];
  void getContext().saveMetadata?.();
}

export function dumpPersistedRuntime() {
  return getMetadataBlob();
}
