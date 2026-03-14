import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useStorySessionState } from "@components/context/StorySessionContext";
import { useStoryLibrary } from "@hooks/useStoryLibrary";
import { storySessionStore } from "@store/storySessionStore";
import { ensureStoryMacros, refreshRoleMacros } from "@utils/story-macros";
import { getPersistedStorySelection } from "@utils/story-state";
import type { NormalizedStory } from "@utils/story-validator";

export interface StoryLibraryContextValue extends ReturnType<typeof useStoryLibrary> {
  story: NormalizedStory | null;
  title: string | undefined;
  reloadLibraryEntries: () => Promise<void>;
}

const StoryLibraryContext = createContext<StoryLibraryContextValue | undefined>(undefined);

export const StoryLibraryProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const library = useStoryLibrary();
  const { activeChatId } = useStorySessionState();
  const lastAppliedChatRef = useRef<string | null>(null);
  const {
    libraryEntries,
    selectedEntry,
    selectedKey,
    selectEntry,
    reloadLibrary,
  } = library;

  const story = useMemo<NormalizedStory | null>(() => {
    if (selectedEntry?.ok && selectedEntry.story) {
      return selectedEntry.story;
    }
    return null;
  }, [selectedEntry]);

  const title = story?.title;

  useEffect(() => {
    ensureStoryMacros();
  }, []);

  useEffect(() => {
    refreshRoleMacros(story);
  }, [story]);

  useEffect(() => {
    storySessionStore.getState().setStoryKey(selectedKey ?? null);
  }, [selectedKey]);

  const reloadLibraryEntries = useCallback(async () => {
    await reloadLibrary(selectedKey);
  }, [reloadLibrary, selectedKey]);

  useEffect(() => {
    if (!activeChatId) {
      lastAppliedChatRef.current = null;
      return;
    }
    if (story) return;
    reloadLibraryEntries().catch((error) => {
      console.warn("[StoryLibraryContext] Failed to reload library on chat change", error);
    });
  }, [activeChatId, reloadLibraryEntries, story]);

  useEffect(() => {
    if (!activeChatId) {
      lastAppliedChatRef.current = null;
      return;
    }
    if (!libraryEntries.length) return;
    if (lastAppliedChatRef.current === activeChatId) return;

    const persistedKey = getPersistedStorySelection(activeChatId);
    lastAppliedChatRef.current = activeChatId;
    if (!persistedKey) return;
    if (persistedKey === selectedKey) return;
    const exists = libraryEntries.some((entry) => entry.key === persistedKey);
    if (!exists) return;
    selectEntry(persistedKey);
  }, [activeChatId, libraryEntries, selectEntry, selectedKey]);

  const value = useMemo<StoryLibraryContextValue>(() => ({
    ...library,
    story,
    title,
    reloadLibraryEntries,
  }), [library, reloadLibraryEntries, story, title]);

  return (
    <StoryLibraryContext.Provider value={value}>
      {children}
    </StoryLibraryContext.Provider>
  );
};

export const useStoryLibraryState = (): StoryLibraryContextValue => {
  const value = useContext(StoryLibraryContext);
  if (!value) {
    throw new Error("useStoryLibraryState must be used within a StoryLibraryProvider");
  }
  return value;
};
