import StoryOrchestrator, { type StoryEvaluationEvent } from "@services/StoryOrchestrator";
import { createTurnController } from "@controllers/turnController";
import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import {
  sanitizeArbiterFrequency,
  sanitizeArbiterPrompt,
  type ArbiterFrequency,
  type ArbiterPrompt,
} from "@utils/arbiter";
import { storySessionStore } from "@store/storySessionStore";

interface RuntimeHooks {
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (ev: StoryEvaluationEvent) => void;
}

const normalizeIntervalTurns = (value: unknown): ArbiterFrequency => sanitizeArbiterFrequency(value);
const normalizeArbiterPrompt = (value: unknown): ArbiterPrompt => sanitizeArbiterPrompt(value);

const turnController = createTurnController();
let orchestrator: StoryOrchestrator | null = null;
let pendingInit: Promise<void> | null = null;
let currentStory: NormalizedStory | null = null;
let intervalTurns: ArbiterFrequency;
let arbiterPrompt: ArbiterPrompt;
let runtimeHooks: RuntimeHooks = {};
let automationPaused = false;

const setReady = (next: boolean) => {
  storySessionStore.getState().setOrchestratorReady(next);
};

const initialize = async (story: NormalizedStory) => {
  const instance: StoryOrchestrator = new StoryOrchestrator({
    story,
    intervalTurns,
    arbiterPrompt,
    shouldApplyRole: (role: Role) => turnController.shouldApplyRole(role, instance?.index ?? 0),
    setEvalHooks: (hooks) => {
      hooks.onEvaluated?.(runtimeHooks.onEvaluated ?? (() => void (0)));
    },
    onTurnTick: ({ turn, sinceEval }) => {
      runtimeHooks.onTurnTick?.({ turn, sinceEval });
    },
    onActivateIndex: undefined,
  });

  orchestrator = instance;
  instance.setIntervalTurns(intervalTurns);
  instance.setArbiterPrompt(arbiterPrompt);

  turnController.attach(instance);
  if (!automationPaused) {
    turnController.start();
  }

  setReady(false);
  try {
    await instance.init();
    setReady(true);
  } catch (err) {
    console.error("[Story - OrchestratorManager] orchestrator init failed", err);
    turnController.detach();
    instance.dispose();
    orchestrator = null;
    setReady(false);
    throw err;
  }
};

const teardown = async () => {
  if (pendingInit) {
    await pendingInit.catch((err) => {
      console.warn("[Story - OrchestratorManager] Pending init rejected during teardown", err);
    });
    pendingInit = null;
  }

  turnController.detach();

  if (orchestrator) {
    orchestrator.dispose();
    orchestrator = null;
  } else {
    storySessionStore.getState().setStory(null);
    storySessionStore.getState().resetRequirements();
  }

  setReady(false);
  currentStory = null;
};

export const setHooks = (next: RuntimeHooks | undefined) => {
  runtimeHooks = next ?? {};
};

export const setIntervalTurns = (value: ArbiterFrequency) => {
  intervalTurns = normalizeIntervalTurns(value);
  orchestrator?.setIntervalTurns(intervalTurns);
};

export const setArbiterPrompt = (value: ArbiterPrompt) => {
  arbiterPrompt = normalizeArbiterPrompt(value);
  orchestrator?.setArbiterPrompt(arbiterPrompt);
};

export const ensureStory = async (story: NormalizedStory | null): Promise<void> => {
  const target = story ?? null;
  if (target === currentStory) {
    orchestrator?.setIntervalTurns(intervalTurns);
    orchestrator?.setArbiterPrompt(arbiterPrompt);
    return;
  }

  if (target && currentStory && target.title === currentStory.title) {
    const targetJson = JSON.stringify(target);
    const currentJson = JSON.stringify(currentStory);

    if (targetJson === currentJson) {
      console.log("[Story - OrchestratorManager] Story reference changed but content identical, preserving state");
      currentStory = target;
      orchestrator?.setIntervalTurns(intervalTurns);
      orchestrator?.setArbiterPrompt(arbiterPrompt);
      return;
    }
  }

  if (!target) {
    await teardown();
    return;
  }

  await teardown();


  currentStory = target;
  const thisInit = pendingInit = initialize(target);
  try {
    await thisInit;
  } catch (err) {
    currentStory = null;
    throw err;
  } finally {
    if (pendingInit === thisInit) {
      pendingInit = null;
    }
  }
};

export const dispose = async () => {
  await teardown();
};

export const getOrchestrator = () => orchestrator;

export const getTalkControlInterceptor = () => {
  return orchestrator?.getTalkControlInterceptor();
};

export const pauseAutomation = (): boolean => {
  if (automationPaused) return false;
  automationPaused = true;
  turnController.stop();
  return true;
};

export const resumeAutomation = (): boolean => {
  const wasPaused = automationPaused;
  automationPaused = false;
  if (!wasPaused) return false;
  if (orchestrator) {
    turnController.start();
    return true;
  }
  return true;
};

export const isAutomationPaused = () => automationPaused;
