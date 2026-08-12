import { getContext } from "@services/STAPI";
import { migrateMetadataBlob } from "./persistenceMigration";
import { listStoryRecords } from "./storyLibrary";
import type { PersistedStoryRuntime, StoryOrchestratorMetadataBlob } from "./types";

const METADATA_KEY = "story_orchestrator";

// Keep the selected story plus the most recent others; a pinned copy is ~17 KB, so an unbounded
// map would grow chat_metadata without limit.
export const STORY_STATE_RETENTION = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createBlob = (): StoryOrchestratorMetadataBlob => ({ version: 3, selectedStoryId: null, stories: {} });

export function getMetadataBlob(): StoryOrchestratorMetadataBlob {
  const context = getContext();
  const metadata = context.chatMetadata as Record<string, unknown>;
  const existing = metadata[METADATA_KEY];
  if (isRecord(existing) && existing.version === 3 && isRecord(existing.stories)) {
    return existing as unknown as StoryOrchestratorMetadataBlob;
  }
  const migrated = isRecord(existing) ? migrateMetadataBlob(existing, listStoryRecords()) : null;
  const blob = migrated ?? createBlob();
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

const gcStories = (blob: StoryOrchestratorMetadataBlob) => {
  const ids = Object.keys(blob.stories);
  if (ids.length <= STORY_STATE_RETENTION) return;
  const ranked = ids
    .filter((id) => id !== blob.selectedStoryId)
    .sort((left, right) => Date.parse(blob.stories[right]?.extras?.updatedAt ?? "") - Date.parse(blob.stories[left]?.extras?.updatedAt ?? ""));
  for (const id of ranked.slice(Math.max(0, STORY_STATE_RETENTION - 1))) delete blob.stories[id];
};

export function savePersistedRuntime(record: PersistedStoryRuntime) {
  const blob = getMetadataBlob();
  blob.stories[record.storyId] = record;
  blob.selectedStoryId = record.storyId;
  gcStories(blob);
  void getContext().saveMetadata?.();
}

export function dropPersistedRuntime(id: string) {
  const blob = getMetadataBlob();
  delete blob.stories[id];
  void getContext().saveMetadata?.();
}

export function dumpPersistedRuntime() {
  return getMetadataBlob();
}
