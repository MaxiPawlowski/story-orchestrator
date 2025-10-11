import { useCallback, useEffect } from "react";
import { useStore } from "zustand";
import type { NormalizedStory } from "@utils/story-validator";
import type { StoryEvaluationEvent } from "@services/StoryOrchestrator";
import {
  ensureStory as ensureOrchestratorStory,
  dispose as disposeOrchestrator,
  getOrchestrator,
  setHooks as setOrchestratorHooks,
  setIntervalTurns as setOrchestratorIntervalTurns,
  setArbiterPrompt as setOrchestratorArbiterPrompt,
} from "@controllers/orchestratorManager";
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

export interface UseStoryOrchestratorOptions {
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (ev: StoryEvaluationEvent) => void;
  arbiterPrompt?: string;
}

export function useStoryOrchestrator(
  story: NormalizedStory | null | undefined,
  intervalTurns: number,
  options?: UseStoryOrchestratorOptions,
): StoryOrchestratorResult {
  const requirements = useStore(storySessionStore, (s) => s.requirements);
  const runtime = useStore(storySessionStore, (s) => s.runtime);
  const hydrated = useStore(storySessionStore, (s) => s.hydrated);
  const ready = useStore(storySessionStore, (s) => s.orchestratorReady);

  useEffect(() => {
    setOrchestratorHooks({
      onTurnTick: options?.onTurnTick,
      onEvaluated: options?.onEvaluated,
    });
    return () => {
      setOrchestratorHooks(undefined);
    };
  }, [options?.onEvaluated, options?.onTurnTick]);

  useEffect(() => {
    setOrchestratorIntervalTurns(intervalTurns);
  }, [intervalTurns]);

  useEffect(() => {
    if (options?.arbiterPrompt !== undefined) {
      setOrchestratorArbiterPrompt(options.arbiterPrompt);
    }
  }, [options?.arbiterPrompt]);

  useEffect(() => {
    ensureOrchestratorStory(story ?? null).catch((err) => {
      console.error("[Story/useStoryOrchestrator] ensureStory failed", err);
    });

    return () => {
      void disposeOrchestrator();
    };
  }, [story]);

  const reloadPersona = useCallback(() => getOrchestrator()?.reloadPersona(), []);

  const updateCheckpointStatus = useCallback((i: number, status: any) => {
    getOrchestrator()?.updateCheckpointStatus(i, status);
  }, []);

  const setOnActivateCheckpoint = useCallback((cb?: (i: number) => void) => {
    getOrchestrator()?.setOnActivateCheckpoint(cb);
  }, []);

  const activateIndex = useCallback((index: number) => {
    getOrchestrator()?.activateIndex(index);
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
