import { getContext } from "@services/STAPI";
import type { PersistedStoryRuntime, StoryOrchestratorMetadataBlob } from "./types";

const METADATA_KEY = "story_orchestrator";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createBlob = (): StoryOrchestratorMetadataBlob => ({ version: 2, selectedStoryHash: null, stories: {} });

export function getMetadataBlob(): StoryOrchestratorMetadataBlob {
  const context = getContext();
  const metadata = context.chatMetadata as Record<string, unknown>;
  const existing = metadata[METADATA_KEY];
  if (isRecord(existing) && existing.version === 2 && isRecord(existing.stories)) {
    return existing as unknown as StoryOrchestratorMetadataBlob;
  }
  const created = createBlob();
  metadata[METADATA_KEY] = created;
  return created;
}

export function getSelectedStoryHash(): string | null {
  return getMetadataBlob().selectedStoryHash ?? null;
}

export function setSelectedStoryHash(hash: string | null) {
  const blob = getMetadataBlob();
  blob.selectedStoryHash = hash;
  const context = getContext();
  context.saveMetadataDebounced();
  void context.saveMetadata?.();
}

export function loadPersistedRuntime(hash: string): PersistedStoryRuntime | null {
  return getMetadataBlob().stories[hash] ?? null;
}

export function savePersistedRuntime(record: PersistedStoryRuntime) {
  const blob = getMetadataBlob();
  blob.stories[record.storyHash] = record;
  blob.selectedStoryHash = record.storyHash;
  const context = getContext();
  context.saveMetadataDebounced();
  void context.saveMetadata?.();
}

export function dumpPersistedRuntime() {
  return getMetadataBlob();
}
