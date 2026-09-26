import { getContext, saveOpenChat, type SaveObservation } from "@services/STAPI";
import type { PersistedStoryRuntime, StoryOrchestratorMetadataBlob } from "./types";
import { isRecord } from "@utils/guards";

const METADATA_KEY = "story_orchestrator";

export const BLOB_VERSION = 5;

// Keep the selected story plus the most recent others; a pinned copy is ~17 KB, so an unbounded
// map would grow chat_metadata without limit.
export const STORY_STATE_RETENTION = 5;

const openChatId = (): string | null => {
  const id = getContext().chatId;
  return id === undefined || id === null ? null : String(id);
};

export type ChatWriteKind = "select" | "drop" | "replace" | "restamp";

export interface ChatWrite {
  kind: ChatWriteKind;
  chatId: string;
  observed: Promise<SaveObservation>;
}

let chatWriteListener: ((write: ChatWrite) => void) | null = null;

export function onChatWrite(listener: (write: ChatWrite) => void): () => void {
  chatWriteListener = listener;
  return () => { if (chatWriteListener === listener) chatWriteListener = null; };
}

const saveChatWrite = (kind: ChatWriteKind) => {
  void saveOpenChat(kind).then((result) => {
    if (result.ok && result.observed) chatWriteListener?.({ kind, chatId: result.chatId, observed: result.observed });
  });
};

const createBlob = (chatId: string): StoryOrchestratorMetadataBlob => ({ version: BLOB_VERSION, chatId, selectedStoryId: null, stories: {} });

const detachedBlob = (): StoryOrchestratorMetadataBlob => createBlob(openChatId() ?? "");

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
const belongsHere = (blob: StoryOrchestratorMetadataBlob): boolean => blob.chatId === openChatId();

export type BlobMismatch =
  | { kind: "foreign"; stampedFor: string; openChat: string | null }
  | { kind: "unreadable"; foundVersion: number | string | null; openChat: string | null };

let mismatch: BlobMismatch | null = null;

export const blobMismatch = (): BlobMismatch | null => mismatch;

const KNOWN_VERSIONS: unknown[] = [BLOB_VERSION];

const storedValue = (): unknown => (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY];

const ENGINE_NUMBERS = ["boundary", "checkpointStartedBoundary", "checkpointStartedAt", "checkpointStartedMessageId", "lastMessageId", "chatLength"];

const isEngineState = (value: unknown): boolean => isRecord(value) && typeof value.activeCheckpointId === "string" && isRecord(value.blackboard)
  && Array.isArray(value.visitedAnchors) && Array.isArray(value.visitedPath) && ENGINE_NUMBERS.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));

const isEngineHistory = (value: unknown): boolean => isRecord(value) && isRecord(value.from) && isEngineState(value.base) && Array.isArray(value.log);

/** v2.5 plan 11: a stored record is this build's only when every field this build requires is there,
 *  so "required" holds on disk and not only in the type. */
export const isCurrentRecord = (value: unknown): boolean => isRecord(value) && isEngineState(value.engineState) && isEngineHistory(value.engineHistory)
  && isRecord(value.pinnedStory) && isRecord(value.extras);

const recognized = (value: unknown): value is Record<string, unknown> => isRecord(value) && KNOWN_VERSIONS.includes(value.version) && typeof value.chatId === "string" && Boolean(value.chatId)
  && isRecord(value.stories) && Object.values(value.stories).every(isCurrentRecord);

const unrecognized = (value: unknown): boolean => value !== undefined && value !== null && !recognized(value);

const foundVersionOf = (value: unknown): number | string | null => {
  const version = isRecord(value) ? value.version : undefined;
  return typeof version === "number" || typeof version === "string" ? version : null;
};

export const describeMismatch = (found: BlobMismatch): string => (found.kind === "foreign"
  ? `stamped for chat ${found.stampedFor}`
  : `unreadable by this build (version ${found.foundVersion === null ? "missing" : JSON.stringify(found.foundVersion)})`);

export type UnreadableBlob = Extract<BlobMismatch, { kind: "unreadable" }>;

export const UNREADABLE_NOTICE = "saved by another version of Story Orchestrator: Restart to replace it";

const storedBlob = (): StoryOrchestratorMetadataBlob | null => {
  const existing = storedValue();
  return recognized(existing) ? existing as unknown as StoryOrchestratorMetadataBlob : null;
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
    noteMismatch({ kind: "foreign", stampedFor: current.chatId, openChat: openChatId() });
    return detachedBlob();
  }
  const existing = storedValue();
  if (unrecognized(existing)) {
    noteMismatch({ kind: "unreadable", foundVersion: foundVersionOf(existing), openChat: openChatId() });
    return detachedBlob();
  }
  mismatch = null;
  const chatId = openChatId();
  if (chatId === null) return detachedBlob();
  const blob = createBlob(chatId);
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = blob;
  return blob;
}

/** v2.4 plan 02 §3: the boundary the stored copy holds for the story it selects, read without adopting
 *  or stamping anything. Null when the copy is not this chat's, selects another story, or holds none. */
export const storedBoundaryFor = (storyId: string): number | null => {
  const existing = storedValue();
  if (!recognized(existing) || existing.chatId !== openChatId() || existing.selectedStoryId !== storyId) return null;
  const boundary = (existing.stories as Record<string, Partial<PersistedStoryRuntime>>)[storyId]?.engineState?.boundary;
  return typeof boundary === "number" ? boundary : null;
};

export const unreadableStored = (): UnreadableBlob | null => {
  const existing = storedValue();
  return unrecognized(existing) ? { kind: "unreadable", foundVersion: foundVersionOf(existing), openChat: openChatId() } : null;
};

const ownBlob = (write: string): StoryOrchestratorMetadataBlob | null => {
  const blob = getMetadataBlob();
  if (openChatId() === null) return null;
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
  const chatId = openChatId();
  if (chatId === null) return false;
  current.chatId = chatId;
  const integrity = openChatIntegrity();
  if (integrity) current.integrity = integrity;
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = current;
  mismatch = null;
  return true;
};

export function replaceUnreadableBlob(): boolean {
  const chatId = openChatId();
  if (chatId === null || !unrecognized(storedValue())) return false;
  mismatch = null;
  (getContext().chatMetadata as Record<string, unknown>)[METADATA_KEY] = createBlob(chatId);
  saveChatWrite("replace");
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
  saveChatWrite("restamp");
  return true;
}

export function getSelectedStoryId(): string | null {
  return getMetadataBlob().selectedStoryId ?? null;
}

export function setSelectedStoryId(id: string | null) {
  const blob = ownBlob("selecting a story");
  if (!blob) return;
  blob.selectedStoryId = id;
  saveChatWrite("select");
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

export const openChatIntegrity = (): string | null => {
  const integrity = (getContext().chatMetadata as Record<string, unknown> | undefined)?.integrity;
  return typeof integrity === "string" && integrity ? integrity : null;
};

export function savePersistedRuntime(record: PersistedStoryRuntime): string[] {
  const blob = ownBlob("saving story state");
  if (!blob) return [];
  const integrity = openChatIntegrity();
  if (integrity !== null) blob.integrity = integrity;
  blob.stories[record.storyId] = record;
  blob.selectedStoryId = record.storyId;
  return gcStories(blob);
}

export function dropPersistedRuntime(id: string) {
  const blob = ownBlob("dropping story state");
  if (!blob) return;
  delete blob.stories[id];
  saveChatWrite("drop");
}

export function dumpPersistedRuntime() {
  return getMetadataBlob();
}
