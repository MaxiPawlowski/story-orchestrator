import type { StoryOrchestratorSession } from "@services/runtime/createStoryOrchestratorSession";

let activeSession: StoryOrchestratorSession | null = null;

export const getActiveOrchestratorSession = (): StoryOrchestratorSession | null => activeSession;

export const setActiveOrchestratorSession = (session: StoryOrchestratorSession | null) => {
  activeSession = session;
};

export const getOrchestrator = () => getActiveOrchestratorSession()?.getOrchestrator() ?? null;

export const getTalkControlInterceptor = () => {
  return getActiveOrchestratorSession()?.getTalkControlInterceptor();
};

export type { StoryOrchestratorSession };
