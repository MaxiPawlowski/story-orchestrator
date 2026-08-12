import type { PersistedStoryRuntime, StoryLibraryRecord, StoryOrchestratorMetadataBlob } from "./types";

export interface LegacyStoryRuntime {
  storyHash?: string;
  storyTitle?: string;
  engineState?: unknown;
  extras?: unknown;
}

export interface LegacyMetadataBlob {
  version?: number;
  selectedStoryHash?: string | null;
  stories?: Record<string, LegacyStoryRuntime>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// v2 keyed per-chat state by content hash and never pinned the story. v3 keys by story id and
// pins a full copy, so a chat keeps playing even if the library record changes or disappears.
export function migrateMetadataBlob(existing: unknown, library: StoryLibraryRecord[] = []): StoryOrchestratorMetadataBlob | null {
  if (!isRecord(existing)) return null;
  const legacy = existing as LegacyMetadataBlob;
  if (legacy.version !== 2 || !isRecord(legacy.stories)) return null;
  const byHash = new Map(library.map((record) => [record.hash, record]));
  // A story that gained an `id` in v2.1 also changed content hash, so fall back to the title the
  // chat recorded: without it a pre-v2.1 chat would lose its story on the first open.
  const byTitle = new Map(library.map((record) => [record.title.trim().toLowerCase(), record]));
  const stories: Record<string, PersistedStoryRuntime> = {};
  const idForHash = new Map<string, string>();

  for (const [hash, entry] of Object.entries(legacy.stories)) {
    if (!isRecord(entry)) continue;
    const legacyTitle = typeof entry.storyTitle === "string" ? entry.storyTitle.trim().toLowerCase() : "";
    const record = byHash.get(hash) ?? (legacyTitle ? byTitle.get(legacyTitle) ?? null : null);
    const id = record?.id ?? `legacy-${hash}`;
    idForHash.set(hash, id);
    stories[id] = {
      storyId: id,
      storyTitle: (entry.storyTitle as string) ?? record?.title ?? id,
      pinnedStory: record?.raw ?? null,
      playedVersion: record?.version ?? 1,
      contentHashAtLoad: hash,
      engineState: entry.engineState as PersistedStoryRuntime["engineState"],
      extras: entry.extras as PersistedStoryRuntime["extras"],
    };
    if (!record) console.warn(`[Story Orchestrator] chat state for unknown story hash ${hash} kept as '${id}' (no library record to pin from)`);
  }

  const selectedHash = legacy.selectedStoryHash ?? null;
  return {
    version: 3,
    selectedStoryId: selectedHash ? idForHash.get(selectedHash) ?? `legacy-${selectedHash}` : null,
    stories,
  };
}
