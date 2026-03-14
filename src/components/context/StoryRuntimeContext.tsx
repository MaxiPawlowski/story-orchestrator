import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { useStoryLibraryState } from "@components/context/StoryLibraryContext";
import { useStorySession } from "@components/context/StorySessionContext";
import { storySessionStore } from "@store/storySessionStore";
import { deriveCheckpointSummaries, CheckpointStatus } from "@utils/story-state";
import { parseAndNormalizeStory } from "@utils/story-validator";
import type { Checkpoint, Story } from "@utils/story-schema";
import type { ExpansionResult } from "@services/StoryGeneratorService";
import type { StoryEvaluationEvent } from "@services/StoryOrchestrator";

type CheckpointSummary = { id: string; name: string; objective: string; status: CheckpointStatus };

export interface StoryRuntimeContextValue {
  checkpoints: CheckpointSummary[];
  checkpointIndex: number;
  activeCheckpointKey: string | null;
  activateCheckpoint: (index: number) => void;
  turnsSinceEval: number;
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

const StoryRuntimeContext = createContext<StoryRuntimeContextValue | undefined>(undefined);

export const StoryRuntimeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { story, selectedEntry, selectedKey, saveStory } = useStoryLibraryState();
  const session = useStorySession();
  const { arbiterFrequency, arbiterPrompt, fallbackPreset } = useExtensionSettings();
  const requirements = useStore(storySessionStore, (state) => state.requirements);
  const runtime = useStore(storySessionStore, (state) => state.runtime);
  const ready = useStore(storySessionStore, (state) => state.orchestratorReady);

  const activateIndex = useCallback((index: number) => {
    session.getOrchestrator()?.activateIndex(index);
  }, [session]);

  const reloadPersona = useCallback(() => session.getOrchestrator()?.reloadPersona(), [session]);

  const updateCheckpointStatus = useCallback((index: number, status: CheckpointStatus) => {
    session.getOrchestrator()?.updateCheckpointStatus(index, status);
  }, [session]);

  const handleEvaluated = useCallback(({ outcome, cpIndex, selectedTransition }: StoryEvaluationEvent) => {
    if (!story) return;
    if (outcome !== "advance") return;

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
  }, [activateIndex, story, updateCheckpointStatus]);

  useEffect(() => {
    session.setHooks({ onEvaluated: handleEvaluated });
    return () => {
      session.setHooks(undefined);
    };
  }, [handleEvaluated, session]);

  useEffect(() => {
    session.setIntervalTurns(arbiterFrequency);
  }, [arbiterFrequency, session]);

  useEffect(() => {
    session.setArbiterPrompt(arbiterPrompt);
  }, [arbiterPrompt, session]);

  useEffect(() => {
    session.setFallbackPreset(fallbackPreset);
  }, [fallbackPreset, session]);

  useEffect(() => {
    session.ensureStory(story).catch((error) => {
      console.error("[StoryRuntimeContext] Failed to ensure story", error);
    });
  }, [session, story]);

  useEffect(() => {
    return () => {
      session.dispose().catch((error) => {
        console.warn("[StoryRuntimeContext] Failed to dispose session", error);
      });
    };
  }, [session]);

  useEffect(() => {
    const mergeExpansion = async (result: ExpansionResult, _fromId: string) => {
      const rawStory = selectedEntry?.storyRaw;
      if (!rawStory) return;

      const expandedCheckpoint = result.checkpoint as Checkpoint;
      const inlineTransitions = expandedCheckpoint.transitions ?? [];
      const stubbedIds = new Set(inlineTransitions.map((transition) => transition.to));
      const existingIds = new Set(rawStory.checkpoints.map((checkpoint) => checkpoint.id));

      const updatedCheckpoints: Checkpoint[] = rawStory.checkpoints.map((checkpoint) => (
        checkpoint.id === expandedCheckpoint.id ? expandedCheckpoint : checkpoint
      ));

      for (const stubId of stubbedIds) {
        if (existingIds.has(stubId)) continue;
        updatedCheckpoints.push({
          id: stubId,
          name: `Upcoming Beat (${stubId})`,
          objective: "To be revealed...",
          _isStub: true,
        } as Checkpoint);
        existingIds.add(stubId);
      }

      const storyForSave: Story = { ...rawStory, checkpoints: updatedCheckpoints };
      await saveStory(storyForSave, { targetKey: selectedKey ?? undefined });

      let normalizedUpdated;
      try {
        normalizedUpdated = parseAndNormalizeStory(storyForSave);
      } catch {
        normalizedUpdated = undefined;
      }

      if (normalizedUpdated) {
        try {
          storySessionStore.getState().setRoadmap(result.roadmap, {
            story: normalizedUpdated,
            storyKey: selectedKey ?? null,
          });
        } catch (error) {
          console.warn("[StoryRuntimeContext] Failed to persist roadmap for chat", error);
        }
      } else {
        storySessionStore.getState().setRoadmap(result.roadmap);
      }
    };

    session.setExpandCallback(mergeExpansion);
    return () => {
      session.setExpandCallback(null);
    };
  }, [saveStory, selectedEntry, selectedKey, session]);

  const checkpoints = useMemo<CheckpointSummary[]>(() => {
    return deriveCheckpointSummaries(story, runtime);
  }, [runtime.activeCheckpointKey, runtime.checkpointIndex, runtime.checkpointStatusMap, story]);

  const value = useMemo<StoryRuntimeContextValue>(() => ({
    checkpoints,
    checkpointIndex: runtime.checkpointIndex,
    activeCheckpointKey: runtime.activeCheckpointKey,
    activateCheckpoint: activateIndex,
    turnsSinceEval: runtime.turnsSinceEval,
    ready,
    requirementsReady: requirements.requirementsReady,
    currentUserName: requirements.currentUserName,
    personaDefined: requirements.personaDefined,
    groupChatSelected: requirements.groupChatSelected,
    worldLoreEntriesPresent: requirements.worldLoreEntriesPresent,
    worldLoreEntriesMissing: requirements.worldLoreEntriesMissing,
    globalLoreBookPresent: requirements.globalLoreBookPresent,
    globalLoreBookMissing: requirements.globalLoreBookMissing,
    missingGroupMembers: requirements.missingGroupMembers,
    onPersonaReload: reloadPersona,
  }), [activateIndex, checkpoints, ready, reloadPersona, requirements, runtime.activeCheckpointKey, runtime.checkpointIndex, runtime.turnsSinceEval]);

  return (
    <StoryRuntimeContext.Provider value={value}>
      {children}
    </StoryRuntimeContext.Provider>
  );
};

export const useStoryRuntimeState = (): StoryRuntimeContextValue => {
  const value = useContext(StoryRuntimeContext);
  if (!value) {
    throw new Error("useStoryRuntimeState must be used within a StoryRuntimeProvider");
  }
  return value;
};
