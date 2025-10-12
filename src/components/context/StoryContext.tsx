import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { Story } from "@utils/story-schema";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { useStoryLibrary } from "@hooks/useStoryLibrary";
import type { StoryLibraryEntry, SaveLibraryStoryResult } from "@utils/storyLibrary";
import { eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  DEFAULT_INTERVAL_TURNS,
  deriveCheckpointStatuses,
  CheckpointStatus,
  getPersistedStorySelection,
} from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";

export type { StoryLibraryEntry, SaveLibraryStoryResult } from "@utils/storyLibrary";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type CheckpointSummary = { id: string; name: string; objective: string; status: CheckpointStatus };

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  applyStory: (input: Story) => ValidationResult;
  loading: boolean;

  story?: NormalizedStory | null;
  title?: string;
  libraryEntries: StoryLibraryEntry[];
  selectedLibraryKey: string | null;
  selectedLibraryError: string | null;
  selectLibraryEntry: (key: string) => void;
  reloadLibrary: () => Promise<void>;
  saveLibraryStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
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
  } = useStoryLibrary();
  const lastAppliedChatRef = useRef<string | null>(null);

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
  const intervalTurns = Number.isFinite(arbiterFrequency) ? arbiterFrequency : DEFAULT_INTERVAL_TURNS;

  const { ready, activateIndex, requirements, runtime, reloadPersona, updateCheckpointStatus } = useStoryOrchestrator(
    story,
    intervalTurns,
    {
      onEvaluated: ({ outcome, cpIndex, transition }) => {
        if (!story) return;
        if (outcome === "win") {
          updateCheckpointStatus(cpIndex, "complete");
          if (transition && transition.outcome === "win") {
            const nextIndex = transition.targetIndex;
            if (Number.isFinite(nextIndex) && nextIndex >= 0 && nextIndex < (story.checkpoints?.length ?? 0) && nextIndex !== cpIndex) {
              activateIndex(nextIndex);
            }
          }
        } else if (outcome === "fail") {
          updateCheckpointStatus(cpIndex, CheckpointStatus.Failed);
          if (transition && transition.outcome === "fail") {
            const nextIndex = transition.targetIndex;
            if (Number.isFinite(nextIndex) && nextIndex >= 0 && nextIndex < (story.checkpoints?.length ?? 0) && nextIndex !== cpIndex) {
              activateIndex(nextIndex);
            }
          }
        }
      },
      arbiterPrompt,
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

  const applyStory = useCallback((input: Story): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      setStory(normalized);
      setTitle(normalized.title);
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

  useEffect(() => {
    const updateChatId = () => {
      try {
        const ctx = getContext();
        const raw = ctx?.chatId;
        const groupId = ctx?.groupId;

        if (!groupId) return;

        const key = raw === null || raw === undefined ? null : String(raw).trim();
        setActiveChatId(key ? key : null);

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
    const unsubscribe = subscribeToEventSource({
      source: eventSource,
      eventName: event_types.CHAT_CHANGED,
      handler: updateChatId,
    });

    return () => {
      try {
        unsubscribe();
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
      applyStory,
      loading: libraryLoading,
      story,
      title,
      libraryEntries,
      selectedLibraryKey: selectedKey,
      selectedLibraryError: selectedError,
      selectLibraryEntry,
      reloadLibrary: reloadLibraryEntries,
      saveLibraryStory,
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
