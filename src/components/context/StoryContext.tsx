import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { Story } from "@utils/story-schema";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { useStoryLibrary } from "@hooks/useStoryLibrary";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult, StoredStoryMeta } from "@utils/story-library";
import { getContext } from "@services/STAPI";
import { subscribeToEventSource } from "@utils/event-source";
import {
  deriveCheckpointStatuses,
  CheckpointStatus,
  getPersistedStorySelection,
  persistStoryState,
} from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";
import { ensureStoryMacros, refreshRoleMacros } from "@utils/story-macros";
import { setExpandCallback } from "@controllers/orchestratorManager";
import type { ExpansionResult } from "@services/StoryGeneratorService";

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
    refreshRoleMacros(story);
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

  const { arbiterFrequency, arbiterPrompt, fallbackPreset } = useExtensionSettings();
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
      fallbackPreset,
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

  const saveLibraryStory = useCallback((input: Story, options?: { targetKey?: string; name?: string; meta?: StoredStoryMeta }) => {
    return persistStory(input, options);
  }, [persistStory]);

  const deleteLibraryStory = useCallback((key: string) => {
    return removeSavedStory(key);
  }, [removeSavedStory]);

  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;

  const mergeExpansionRef = useRef<(result: ExpansionResult, fromId: string) => Promise<void>>();
  mergeExpansionRef.current = useCallback(async (result: ExpansionResult, _fromId: string) => {
    const currentKey = selectedKeyRef.current;
    const currentEntry = storySessionStore.getState().story;
    if (!currentEntry) return;

    const existing = currentEntry;
    const newCheckpointIds = new Set(existing.checkpoints.map(c => c.id));
    const expandedCheckpoint = result.checkpoint;
    const newTransitionIds = new Set(existing.transitions.map(t => t.id));

    const updatedCheckpoints = existing.checkpoints.map(cp =>
      cp.id === expandedCheckpoint.id ? expandedCheckpoint as typeof cp : cp
    );
    const stubbedIds = new Set(result.transitions.map(t => t.to));
    for (const stubId of stubbedIds) {
      if (!newCheckpointIds.has(stubId)) {
        updatedCheckpoints.push({
          id: stubId,
          name: `Upcoming Beat (${stubId})`,
          objective: "To be revealed…",
          _isStub: true,
        } as typeof updatedCheckpoints[0]);
        newCheckpointIds.add(stubId);
      }
    }

    const newTransitions = result.transitions.filter(t => !newTransitionIds.has(t.id));
    const updatedTransitions = [...existing.transitions, ...newTransitions];

    const mergedTalkControl = {
      ...existing.talkControl,
      checkpoints: {
        ...(existing.talkControl?.checkpoints ?? {}),
        ...(result.talkControl?.checkpoints ?? {}),
      },
    };

    const updatedStory = {
      ...existing,
      checkpoints: updatedCheckpoints,
      transitions: updatedTransitions,
      talkControl: Object.keys(mergedTalkControl.checkpoints).length ? mergedTalkControl : existing.talkControl,
    };

    const storyRaw = updatedStory as import("@utils/story-schema").Story;
    await persistStory(storyRaw, { targetKey: currentKey ?? undefined });

    const { chatId, groupChatSelected, runtime } = storySessionStore.getState();
    if (chatId && groupChatSelected) {
      try {
        persistStoryState({
          chatId,
          story: updatedStory as NormalizedStory,
          state: runtime,
          storyKey: currentKey ?? undefined,
          roadmap: result.roadmap,
        });
      } catch (err) {
        console.warn("[StoryContext] Failed to persist roadmap for chat", err);
      }
    }
    storySessionStore.getState().setRoadmap(result.roadmap);
  }, [persistStory]);

  useEffect(() => {
    setExpandCallback((result, fromId) => mergeExpansionRef.current?.(result, fromId) ?? Promise.resolve());
    return () => { setExpandCallback(null); };
  }, []);

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
