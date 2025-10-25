import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { Story } from "@utils/story-schema";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { useStoryLibrary } from "@hooks/useStoryLibrary";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@utils/story-library";
import { getContext } from "@services/STAPI";
import { subscribeToEventSource } from "@utils/event-source";
import {
  deriveCheckpointStatuses,
  CheckpointStatus,
  getPersistedStorySelection,
} from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";
import { ensureStoryMacros, refreshRoleMacros } from "@utils/story-macros";

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
  saveLibraryStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
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

export const StoryProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [title, setTitle] = useState<string>();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const {
    loading: libraryLoading,
    libraryEntries,
    selectedEntry,
    selectedKey,
    selectedError,
    selectEntry,
    reloadLibrary,
    saveStory: persistStory,
    deleteStory: removeSavedStory,
  } = useStoryLibrary();
  const lastAppliedChatRef = useRef<string | null>(null);

  useEffect(() => {
    ensureStoryMacros();
  }, []);

  useEffect(() => {
    refreshRoleMacros();
  }, [story]);

  useEffect(() => {
    if (selectedEntry && selectedEntry.ok && selectedEntry.story) {
      setStory(selectedEntry.story);
      setTitle(selectedEntry.story.title);
    } else if (!selectedEntry) {
      setStory(null);
      setTitle(undefined);
    } else {
      setStory(null);
      setTitle(undefined);
    }
  }, [selectedEntry]);

  useEffect(() => {
    try {
      storySessionStore.getState().setStoryKey(selectedKey ?? null);
    } catch (err) {
      console.warn("[StoryContext] Failed to sync story key to store", err);
    }
  }, [selectedKey]);

  const { arbiterFrequency, arbiterPrompt } = useExtensionSettings();
  const intervalTurns = arbiterFrequency;
  const normalizedArbiterPrompt = arbiterPrompt;

  const { ready, activateIndex, requirements, runtime, reloadPersona, updateCheckpointStatus } = useStoryOrchestrator(
    story,
    intervalTurns,
    {
      onEvaluated: ({ outcome, cpIndex, selectedTransition }) => {
        if (!story) return;
        if (outcome === "advance") {
          updateCheckpointStatus(cpIndex, CheckpointStatus.Complete);
          const nextIndex = selectedTransition?.targetIndex;
          if (
            typeof nextIndex === "number"
            && Number.isFinite(nextIndex)
            && nextIndex >= 0
            && nextIndex < (story.checkpoints?.length ?? 0)
            && nextIndex !== cpIndex
          ) {
            activateIndex(nextIndex);
          }
        }
      },
      arbiterPrompt: normalizedArbiterPrompt,
    },
  );

  const activateCheckpoint = useCallback((index: number) => {
    activateIndex(index);
  }, [activateIndex]);

  const {
    requirementsReady,
    currentUserName,
    personaDefined,
    groupChatSelected,
    missingGroupMembers,
    worldLoreEntriesPresent,
    worldLoreEntriesMissing,
    globalLoreBookPresent,
    globalLoreBookMissing,
  } = requirements;

  const { checkpointIndex, activeCheckpointKey, turnsSinceEval, checkpointStatusMap } = runtime;

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

  const reloadLibraryEntries = useCallback(async () => {
    await reloadLibrary(selectedKey);
  }, [reloadLibrary, selectedKey]);

  const saveLibraryStory = useCallback((input: Story, options?: { targetKey?: string; name?: string }) => {
    return persistStory(input, options);
  }, [persistStory]);

  const deleteLibraryStory = useCallback((key: string) => {
    return removeSavedStory(key);
  }, [removeSavedStory]);

  useEffect(() => {
    const { eventSource, eventTypes, chatId, groupId } = getContext();
    const updateChatId = () => {
      try {
        if (!groupId) return;
        setActiveChatId(chatId ? String(chatId).trim() : null);

        if (!story) {
          reloadLibraryEntries().catch((error) => {
            console.warn("[StoryContext] Failed to reload library on chat change", error);
          });
        }
      } catch (err) {
        console.warn("[StoryContext] Failed to resolve chatId", err);
        setActiveChatId(null);
      }
    };

    updateChatId();
    const offs: Array<() => void> = [];
    const events = [
      eventTypes.CHAT_CHANGED,
      eventTypes.CHAT_CREATED,
      eventTypes.GROUP_CHAT_CREATED,
    ].filter(Boolean);
    for (const ev of events) {
      offs.push(subscribeToEventSource({ source: eventSource, eventName: ev, handler: updateChatId }));
    }

    return () => {
      try {
        while (offs.length) {
          const off = offs.pop();
          try { off?.(); } catch (err) { console.warn("[StoryContext] unsubscribe failed", err); }
        }
      } catch (err) {
        console.warn("[StoryContext] unsubscribe failed", err);
      }
    };
  }, [story, reloadLibraryEntries]);

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

  const checkpoints = useMemo<CheckpointSummary[]>(() => {
    if (!story) return [];
    const statuses = deriveCheckpointStatuses(story, { checkpointIndex, activeCheckpointKey, checkpointStatusMap });
    return story.checkpoints.map((cp, idx) => {
      const status = statuses[idx]
        ?? (idx < checkpointIndex
          ? CheckpointStatus.Complete
          : idx === checkpointIndex
            ? CheckpointStatus.Current
            : CheckpointStatus.Pending);
      return {
        id: cp.id,
        name: cp.name,
        objective: cp.objective,
        status,
      };
    });
  }, [story, checkpointIndex, activeCheckpointKey, checkpointStatusMap]);

  return (
    <StoryContext.Provider value={{
      validate,
      loading: libraryLoading,
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
      onPersonaReload: reloadPersona,
    }}>
      {children}
    </StoryContext.Provider>
  );
};

export default StoryContext;
