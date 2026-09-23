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
 * It is replaced rather than repaired. Adopting another chat's stories would be the same mistake
 * in the opposite direction, so the chat starts empty — which reads to the player as "no story
 * selected", the honest answer when the state on hand belongs to somebody else.
 */
const belongsHere = (blob: StoryOrchestratorMetadataBlob): boolean => blob.chatId === null || blob.chatId === openChatId();

export function getMetadataBlob(): StoryOrchestratorMetadataBlob {
  const context = getContext();
  const metadata = context.chatMetadata as Record<string, unknown>;
  const existing = metadata[METADATA_KEY];
  const current = isRecord(existing) && existing.version === 4 && isRecord(existing.stories)
    ? (existing as unknown as StoryOrchestratorMetadataBlob)
    // v3 is one step behind: it has the right shape and only wants the stamp. v2 and earlier go
    // through the full migration, which ends by calling migrateV3ToV4 itself.
    : isRecord(existing) && existing.version === 3 && isRecord(existing.stories)
      ? migrateV3ToV4(existing as unknown as { selectedStoryId: string | null; stories: StoryOrchestratorMetadataBlob["stories"] })
      : isRecord(existing) ? migrateMetadataBlob(existing, listStoryRecords()) : null;
  if (current && belongsHere(current)) {
    metadata[METADATA_KEY] = current;
    return current;
  }
  if (current) {
    console.warn(`[Story Orchestrator] blob-chat-mismatch: chat_metadata holds state stamped for chat ${String(current.chatId)} while ${String(openChatId())} is open; treating this chat as having no story selected`);
  }
  const blob = createBlob();
  metadata[METADATA_KEY] = blob;
  return blob;
}

export function getSelectedStoryId(): string | null {
  return getMetadataBlob().selectedStoryId ?? null;
}

export function setSelectedStoryId(id: string | null) {
  const blob = getMetadataBlob();
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
  const blob = getMetadataBlob();
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
  const blob = getMetadataBlob();
  delete blob.stories[id];
  void getContext().saveMetadata?.();
}

export function dumpPersistedRuntime() {
  return getMetadataBlob();
}
