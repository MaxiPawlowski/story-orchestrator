import StoryOrchestrator, { type StoryEvaluationEvent } from "@services/StoryOrchestrator";
import { createTurnController } from "@controllers/turnController";
import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import { DEFAULT_INTERVAL_TURNS } from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";

interface RuntimeHooks {
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (ev: StoryEvaluationEvent) => void;
}

const clampIntervalTurns = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_TURNS;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : DEFAULT_INTERVAL_TURNS;
};

const turnController = createTurnController();
let orchestrator: StoryOrchestrator | null = null;
let pendingInit: Promise<void> | null = null;
let currentStory: NormalizedStory | null = null;
let intervalTurns = DEFAULT_INTERVAL_TURNS;
let runtimeHooks: RuntimeHooks = {};

const setReady = (next: boolean) => {
  try {
    storySessionStore.getState().setOrchestratorReady(next);
  } catch (err) {
    console.warn("[OrchestratorManager] failed to set ready flag", err);
  }
};

const initialize = async (story: NormalizedStory) => {
  let instance: StoryOrchestrator;
  instance = new StoryOrchestrator({
    story,
    shouldApplyRole: (role: Role) => turnController.shouldApplyRole(role, instance?.index ?? 0),
    setEvalHooks: (hooks) => {
      hooks.onEvaluated?.((ev) => {
        try {
          runtimeHooks.onEvaluated?.(ev);
        } catch (err) {
          console.warn("[OrchestratorManager] onEvaluated handler failed", err);
        }
      });
    },
    onTurnTick: ({ turn, sinceEval }) => {
      try {
        runtimeHooks.onTurnTick?.({ turn, sinceEval });
      } catch (err) {
        console.warn("[OrchestratorManager] onTurnTick handler failed", err);
      }
    },
    onActivateIndex: undefined,
  });

  orchestrator = instance;
  instance.setIntervalTurns(intervalTurns);

  turnController.attach(instance);
  turnController.start();

  setReady(false);
  try {
    await instance.init();
    setReady(true);
  } catch (err) {
    console.error("[OrchestratorManager] orchestrator init failed", err);
    turnController.detach();
    instance.dispose();
    orchestrator = null;
    setReady(false);
    throw err;
  }
};

const teardown = async () => {
  if (pendingInit) {
    try {
      await pendingInit;
    } catch {
      // ignore previous init failure
    }
    pendingInit = null;
  }

  turnController.detach();

  if (orchestrator) {
    try {
      orchestrator.dispose();
    } catch (err) {
      console.warn("[OrchestratorManager] orchestrator dispose failed", err);
    }
    orchestrator = null;
  } else {
    try {
      storySessionStore.getState().setStory(null);
      storySessionStore.getState().resetRequirements();
    } catch (err) {
      console.warn("[OrchestratorManager] store reset failed", err);
    }
  }

  setReady(false);
  currentStory = null;
};

export const setHooks = (next: RuntimeHooks | undefined) => {
  runtimeHooks = next ?? {};
};

export const setIntervalTurns = (value: number) => {
  intervalTurns = clampIntervalTurns(value);
  orchestrator?.setIntervalTurns(intervalTurns);
};

export const ensureStory = async (story: NormalizedStory | null | undefined): Promise<void> => {
  const target = story ?? null;
  if (target === currentStory) {
    orchestrator?.setIntervalTurns(intervalTurns);
    return;
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
