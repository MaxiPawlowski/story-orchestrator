import { useCallback, useEffect, useMemo, useState } from "react";
import type { Story } from "@utils/story-schema";
import { loadCheckpointBundle, type CheckpointBundle } from "@utils/story-loader";
import { clearNumericJsonBundleCache } from "@utils/json-bundle-loader";
import {
  loadStudioState,
  persistStudioState,
  generateStoryId,
  toSavedEntries,
  toBundleEntries,
  SAVED_KEY_PREFIX,
  type StudioState,
  type StoryLibraryEntry,
  type SaveLibraryStoryResult,
} from "@utils/storyLibrary";

type SaveOptions = { targetKey?: string; name?: string };

export interface StoryLibraryHook {
  loading: boolean;
  libraryEntries: StoryLibraryEntry[];
  selectedEntry: StoryLibraryEntry | null;
  selectedKey: string | null;
  selectedError: string | null;

  selectEntry: (key: string) => void;
  saveStory: (story: Story, options?: SaveOptions) => Promise<SaveLibraryStoryResult>;
  reloadLibrary: (preferredKey?: string | null) => Promise<void>;
}

export function useStoryLibrary(): StoryLibraryHook {
  const [studioState, setStudioState] = useState<StudioState>(() => loadStudioState());
  const [bundle, setBundle] = useState<CheckpointBundle | null>(null);
  const [loading, setLoading] = useState(false);

  const savedEntries = useMemo(
    () => toSavedEntries(studioState.stories),
    [studioState.stories],
  );
  const bundleEntries = useMemo(() => toBundleEntries(bundle), [bundle]);

  const libraryEntries = useMemo<StoryLibraryEntry[]>(() => {
    return [...savedEntries, ...bundleEntries];
  }, [savedEntries, bundleEntries]);

  const selectedEntry = useMemo(() => {
    if (!studioState.lastSelectedKey) return null;
    return libraryEntries.find((entry) => entry.key === studioState.lastSelectedKey) ?? null;
  }, [libraryEntries, studioState.lastSelectedKey]);

  const selectedError = selectedEntry && !selectedEntry.ok
    ? selectedEntry.error ?? null
    : null;

  const ensureSelection = useCallback(() => {
    if (!libraryEntries.length) {
      if (studioState.lastSelectedKey !== null) {
        setStudioState((prev) => {
          if (prev.lastSelectedKey === null) return prev;
          const next = { ...prev, lastSelectedKey: null };
          persistStudioState(next);
          return next;
        });
      }
      return;
    }

    const currentKey = studioState.lastSelectedKey;
    const hasCurrent = currentKey
      ? libraryEntries.some((entry) => entry.key === currentKey)
      : false;
    if (hasCurrent) return;

    const fallback = libraryEntries.find((entry) => entry.ok) ?? libraryEntries[0];
    if (!fallback) return;

    setStudioState((prev) => {
      if (prev.lastSelectedKey === fallback.key) return prev;
      const next = { ...prev, lastSelectedKey: fallback.key };
      persistStudioState(next);
      return next;
    });
  }, [libraryEntries, studioState.lastSelectedKey]);

  useEffect(() => {
    ensureSelection();
  }, [ensureSelection]);

  const selectEntry = useCallback((key: string) => {
    setStudioState((prev) => {
      if (prev.lastSelectedKey === key) return prev;
      const next = { ...prev, lastSelectedKey: key };
      persistStudioState(next);
      return next;
    });
  }, []);

  const saveStory = useCallback(async (story: Story, options?: SaveOptions): Promise<SaveLibraryStoryResult> => {
    const fallbackName = typeof story.title === "string" && story.title.trim()
      ? story.title.trim()
      : "Untitled Story";
    const requestedName = typeof options?.name === "string" && options.name.trim()
      ? options.name.trim()
      : fallbackName;
    const normalizedName = requestedName.slice(0, 120);
    const targetKey = options?.targetKey;

    let resultKey: string | undefined;
    setStudioState((prev) => {
      const now = Date.now();
      const stories = [...prev.stories];
      if (targetKey && targetKey.startsWith(SAVED_KEY_PREFIX)) {
        const targetId = targetKey.slice(SAVED_KEY_PREFIX.length);
        const index = stories.findIndex((entry) => entry.id === targetId);
        if (index >= 0) {
          stories[index] = { ...stories[index], story, name: normalizedName, updatedAt: now };
          resultKey = `${SAVED_KEY_PREFIX}${targetId}`;
          const next = { stories, lastSelectedKey: resultKey };
          persistStudioState(next);
          return next;
        }
      }

      const used = new Set(stories.map((entry) => entry.id));
      const newId = generateStoryId(used);
      stories.push({ id: newId, name: normalizedName, story, updatedAt: now });
      resultKey = `${SAVED_KEY_PREFIX}${newId}`;
      const next = { stories, lastSelectedKey: resultKey };
      persistStudioState(next);
      return next;
    });

    if (typeof resultKey !== "string") {
      return { ok: false, error: "Failed to save story." };
    }

    return { ok: true, key: resultKey };
  }, []);

  const reloadLibrary = useCallback(async (preferredKey?: string | null) => {
    setLoading(true);
    try {
      clearNumericJsonBundleCache("story-checkpoints");
      const result = await loadCheckpointBundle({ force: true });
      setBundle(result ?? null);
      if (preferredKey) {
        selectEntry(preferredKey);
      }
    } catch (error) {
      console.warn("[useStoryLibrary] Failed to reload bundle", error);
    } finally {
      setLoading(false);
    }
  }, [selectEntry]);

  return {
    loading,
    libraryEntries,
    selectedEntry,
    selectedKey: studioState.lastSelectedKey,
    selectedError,

    selectEntry,
    saveStory,
    reloadLibrary,
  };
}
