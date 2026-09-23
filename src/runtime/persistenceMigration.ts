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
  // Emits the v3 shape, then hands it to migrateV3ToV4. Keeping the steps separate means the v2
  // path keeps its own tests and the v4 stamp has exactly one place it is applied.
  return migrateV3ToV4({
    selectedStoryId: selectedHash ? idForHash.get(selectedHash) ?? `legacy-${selectedHash}` : null,
    stories,
  });
}

/**
 * v2.3 plan 03: stamp the blob with the chat it belongs to.
 *
 * A v3 blob carries no chat id and there is no way to recover which chat it came from, so it is
 * stamped **null** rather than guessed. An unstamped blob is readable by design — it predates the
 * field — and takes the open chat's id on its first save. Guessing here would manufacture exactly
 * the false provenance the stamp exists to prevent.
 */
export function migrateV3ToV4(blob: { selectedStoryId: string | null; stories: Record<string, PersistedStoryRuntime> }): StoryOrchestratorMetadataBlob {
  return { version: 4, chatId: null, selectedStoryId: blob.selectedStoryId, stories: blob.stories };
}
