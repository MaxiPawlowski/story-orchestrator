import { useCallback, useEffect } from "react";
import { useStore } from "zustand";
import type { NormalizedStory } from "@utils/story-validator";
import { storyRuntimeController } from "@controllers/storyRuntimeController";
import { storySessionStore, type StorySessionValueState } from "@store/storySessionStore";

export interface StoryOrchestratorResult {
  ready: boolean;
  activateIndex: (index: number) => void;
  requirements: StorySessionValueState['requirements'];
  runtime: StorySessionValueState['runtime'];
  hydrated: boolean;
  reloadPersona: () => void | Promise<void>;
  updateCheckpointStatus: (index: number, status: any) => void; // kept generic to avoid circular type import
  setOnActivateCheckpoint: (cb?: (index: number) => void) => void;
}

export function useStoryOrchestrator(
  story: NormalizedStory | null | undefined,
  intervalTurns: number,
  options?: {
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onEvaluated?: (ev: { outcome: "continue" | "win" | "fail"; reason: "interval" | "win" | "fail"; turn: number; matched?: string; cpIndex: number }) => void;
  },
): StoryOrchestratorResult {
  const requirements = useStore(storySessionStore, (s) => s.requirements);
  const runtime = useStore(storySessionStore, (s) => s.runtime);
  const hydrated = useStore(storySessionStore, (s) => s.hydrated);
  const ready = useStore(storySessionStore, (s) => s.orchestratorReady);

  useEffect(() => {
    storyRuntimeController.setHooks({
      onTurnTick: options?.onTurnTick,
      onEvaluated: options?.onEvaluated,
    });
  }, [options?.onEvaluated, options?.onTurnTick]);

  useEffect(() => {
    storyRuntimeController.setIntervalTurns(intervalTurns);
  }, [intervalTurns]);

  useEffect(() => {
    storyRuntimeController.ensureStory(story ?? null).catch((err) => {
      console.error("[Story/useStoryOrchestrator] ensureStory failed", err);
    });

    return () => {
      storyRuntimeController.dispose();
    };
  }, [story]);

  const reloadPersona = useCallback(() => storyRuntimeController.reloadPersona(), []);

  const updateCheckpointStatus = useCallback((i: number, status: any) => {
    storyRuntimeController.updateCheckpointStatus(i, status);
  }, []);

  const setOnActivateCheckpoint = useCallback((cb?: (i: number) => void) => {
    storyRuntimeController.setOnActivateCheckpoint(cb);
  }, []);

  const activateIndex = useCallback((index: number) => {
    storyRuntimeController.activateIndex(index);
  }, []);

  return {
    ready,
    activateIndex,
    requirements,
    runtime,
    hydrated,
    reloadPersona,
    updateCheckpointStatus,
    setOnActivateCheckpoint,
  };
}

export default useStoryOrchestrator;

