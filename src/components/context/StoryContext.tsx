import React, { createContext, useCallback } from "react";
import { StoryLibraryProvider, useStoryLibraryState } from "@components/context/StoryLibraryContext";
import { StoryRuntimeProvider, useStoryRuntimeState } from "@components/context/StoryRuntimeContext";
import { StorySessionProvider, useStorySessionState } from "@components/context/StorySessionContext";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { Story } from "@utils/story-schema";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult, StoredStoryMeta } from "@utils/story-library";
import { CheckpointStatus } from "@utils/story-state";

export type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@utils/story-library";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type CheckpointSummary = { id: string; name: string; objective: string; status: CheckpointStatus };

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  loading: boolean;

  story: NormalizedStory | null;
  title: string | undefined;
  libraryEntries: StoryLibraryEntry[];
  selectedLibraryKey: string | null;
  selectedLibraryError: string | null;
  selectLibraryEntry: (key: string) => void;
  reloadLibrary: () => Promise<void>;
  saveLibraryStory: (story: Story, options?: { targetKey?: string; name?: string; meta?: StoredStoryMeta }) => Promise<SaveLibraryStoryResult>;
  deleteLibraryStory: (key: string) => Promise<DeleteLibraryStoryResult>;
  checkpoints: CheckpointSummary[];
  checkpointIndex: number;
  activeCheckpointKey: string | null;
  activateCheckpoint: (i: number) => void;
  turnsSinceEval: number;
  activeChatId: string | null;
  ready: boolean;
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLoreEntriesPresent: boolean;
  worldLoreEntriesMissing: string[];
  globalLoreBookPresent: boolean;
  globalLoreBookMissing: string[];
  missingGroupMembers: string[];
  onPersonaReload: () => Promise<void> | void;
}

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

const StoryProviderContent: React.FC<React.PropsWithChildren> = ({ children }) => {
  const {
    loading,
    story,
    title,
    libraryEntries,
    selectedKey,
    selectedError,
    selectEntry,
    reloadLibraryEntries,
    saveStory,
    deleteStory,
  } = useStoryLibraryState();
  const {
    checkpoints,
    checkpointIndex,
    activeCheckpointKey,
    activateCheckpoint,
    turnsSinceEval,
    ready,
    requirementsReady,
    currentUserName,
    personaDefined,
    groupChatSelected,
    worldLoreEntriesPresent,
    worldLoreEntriesMissing,
    globalLoreBookPresent,
    globalLoreBookMissing,
    missingGroupMembers,
    onPersonaReload,
  } = useStoryRuntimeState();
  const { activeChatId } = useStorySessionState();

  const validate = useCallback((input: unknown): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      return { ok: true, story: normalized };
    } catch (e) {
      const errors = formatZodError(e);
      return { ok: false, errors };
    }
  }, []);

  const selectLibraryEntry = useCallback((key: string) => {
    selectEntry(key);
  }, [selectEntry]);

  const saveLibraryStory = useCallback((input: Story, options?: { targetKey?: string; name?: string; meta?: StoredStoryMeta }) => {
    return saveStory(input, options);
  }, [saveStory]);

  const deleteLibraryStory = useCallback((key: string) => {
    return deleteStory(key);
  }, [deleteStory]);

  return (
    <StoryContext.Provider value={{
      validate,
      loading,
      story,
      title,
      libraryEntries,
      selectedLibraryKey: selectedKey,
      selectedLibraryError: selectedError,
      selectLibraryEntry,
      reloadLibrary: reloadLibraryEntries,
      saveLibraryStory,
      deleteLibraryStory,
      checkpoints,
      checkpointIndex,
      activeCheckpointKey,
      activateCheckpoint,
      turnsSinceEval,
      activeChatId,
      ready,
      requirementsReady,
      currentUserName,
      personaDefined,
      groupChatSelected,
      missingGroupMembers,
      worldLoreEntriesPresent,
      worldLoreEntriesMissing,
      globalLoreBookPresent,
      globalLoreBookMissing,
      onPersonaReload,
    }}>
      {children}
    </StoryContext.Provider>
  );
};

export const StoryProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <StorySessionProvider>
      <StoryLibraryProvider>
        <StoryRuntimeProvider>
          <StoryProviderContent>{children}</StoryProviderContent>
        </StoryRuntimeProvider>
      </StoryLibraryProvider>
    </StorySessionProvider>
  );
};

export default StoryContext;
