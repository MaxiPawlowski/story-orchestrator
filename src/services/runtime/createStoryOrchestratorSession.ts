import StoryOrchestrator, { type StoryEvaluationEvent } from "@services/StoryOrchestrator";
import type ContinuityKeeperService from "@services/ContinuityKeeperService";
import type { ExpansionResult } from "@services/StoryGeneratorService";
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

export interface RuntimeHooks {
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (ev: StoryEvaluationEvent) => void;
}

export interface StoryOrchestratorSession {
  setHooks: (next: RuntimeHooks | undefined) => void;
  setIntervalTurns: (value: ArbiterFrequency) => void;
  setArbiterPrompt: (value: ArbiterPrompt) => void;
  setFallbackPreset: (value: string | null) => void;
  ensureStory: (story: NormalizedStory | null) => Promise<void>;
  dispose: () => Promise<void>;
  getOrchestrator: () => StoryOrchestrator | null;
  getTalkControlInterceptor: () => ReturnType<StoryOrchestrator["getTalkControlInterceptor"]> | undefined;
  pauseAutomation: () => boolean;
  resumeAutomation: () => boolean;
  isAutomationPaused: () => boolean;
  setExpandCallback: (cb: ((result: ExpansionResult, fromId: string) => Promise<void>) | null) => void;
}

const normalizeIntervalTurns = (value: unknown): ArbiterFrequency => sanitizeArbiterFrequency(value);
const normalizeArbiterPrompt = (value: unknown): ArbiterPrompt => sanitizeArbiterPrompt(value);

const setReady = (next: boolean) => {
  storySessionStore.getState().setOrchestratorReady(next);
};

const stableSerialize = (value: unknown): string => {
  if (value == null) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof RegExp) return `/${value.source}/${value.flags}`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value instanceof Map) {
    return `map(${Array.from(value.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, entry]) => `${stableSerialize(key)}:${stableSerialize(entry)}`)
      .join(",")})`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
};

const getStoryReuseKey = (story: NormalizedStory): string => {
  return stableSerialize({
    schemaVersion: story.schemaVersion,
    title: story.title,
    description: story.description ?? null,
    global_lorebook: story.global_lorebook,
    roles: story.roles,
    defaults: story.defaults,
    checkpoints: story.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      name: checkpoint.name,
      objective: checkpoint.objective,
      authors_note: checkpoint.authors_note,
      world_info: checkpoint.world_info,
      preset_overrides: checkpoint.preset_overrides,
      arbiter_preset: checkpoint.arbiter_preset,
      automations: checkpoint.automations,
      talkControl: checkpoint.talkControl ? { replies: checkpoint.talkControl.replies } : null,
    })),
    transitions: story.transitions.map((transition) => ({
      id: transition.id,
      from: transition.from,
      to: transition.to,
      label: transition.label,
      description: transition.description,
      trigger: {
        id: transition.trigger.id,
        type: transition.trigger.type,
        regexes: transition.trigger.regexes,
        withinTurns: transition.trigger.withinTurns,
        condition: transition.trigger.condition,
        raw: transition.trigger.raw,
      },
    })),
    startId: story.startId,
    talkControl: story.talkControl ? { checkpoints: Array.from(story.talkControl.checkpoints.entries()) } : null,
  });
};

export const createStoryOrchestratorSession = (): StoryOrchestratorSession => {
  const turnController = createTurnController();
  let orchestrator: StoryOrchestrator | null = null;
  let pendingInit: Promise<void> | null = null;
  let currentStory: NormalizedStory | null = null;
  let currentStoryReuseKey: string | null = null;
  let intervalTurns = normalizeIntervalTurns(undefined);
  let arbiterPrompt = normalizeArbiterPrompt(undefined);
  let fallbackPreset: string | null = null;
  let runtimeHooks: RuntimeHooks = {};
  let automationPaused = false;
  let expandCallback: ((result: ExpansionResult, fromId: string) => Promise<void>) | null = null;

  const initialize = async (story: NormalizedStory) => {
    let keeper: ContinuityKeeperService | undefined;
    try {
      const { default: ContinuityKeeperService } = await import("@services/ContinuityKeeperService");
      keeper = new ContinuityKeeperService();
    } catch (err) {
      console.warn("[Story - OrchestratorSession] continuity keeper unavailable", err);
    }
    const instance: StoryOrchestrator = new StoryOrchestrator({
      story,
      intervalTurns,
      arbiterPrompt,
      keeper,
      fallbackPreset,
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
    if (expandCallback) {
      instance.setExpandCallback(expandCallback);
    }

    turnController.attach(instance);
    if (!automationPaused) {
      turnController.start();
    }

    setReady(false);
    try {
      await instance.init();
      setReady(true);
    } catch (err) {
      console.error("[Story - OrchestratorSession] orchestrator init failed", err);
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
        console.warn("[Story - OrchestratorSession] Pending init rejected during teardown", err);
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
    currentStoryReuseKey = null;
  };

  return {
    setHooks(next) {
      runtimeHooks = next ?? {};
    },
    setIntervalTurns(value) {
      intervalTurns = normalizeIntervalTurns(value);
      orchestrator?.setIntervalTurns(intervalTurns);
    },
    setArbiterPrompt(value) {
      arbiterPrompt = normalizeArbiterPrompt(value);
      orchestrator?.setArbiterPrompt(arbiterPrompt);
    },
    setFallbackPreset(value) {
      fallbackPreset = value;
    },
    async ensureStory(story) {
      const target = story ?? null;
      const targetReuseKey = target ? getStoryReuseKey(target) : null;

      if (target === currentStory) {
        orchestrator?.setIntervalTurns(intervalTurns);
        orchestrator?.setArbiterPrompt(arbiterPrompt);
        return;
      }

      if (target && currentStory && target.title === currentStory.title && targetReuseKey === currentStoryReuseKey) {
        currentStory = target;
        orchestrator?.setIntervalTurns(intervalTurns);
        orchestrator?.setArbiterPrompt(arbiterPrompt);
        return;
      }

      if (!target) {
        await teardown();
        return;
      }

      await teardown();

      currentStory = target;
      currentStoryReuseKey = targetReuseKey;
      const thisInit = pendingInit = initialize(target);
      try {
        await thisInit;
      } catch (err) {
        currentStory = null;
        currentStoryReuseKey = null;
        throw err;
      } finally {
        if (pendingInit === thisInit) {
          pendingInit = null;
        }
      }
    },
    async dispose() {
      await teardown();
    },
    getOrchestrator() {
      return orchestrator;
    },
    getTalkControlInterceptor() {
      return orchestrator?.getTalkControlInterceptor();
    },
    pauseAutomation() {
      if (automationPaused) return false;
      automationPaused = true;
      turnController.stop();
      return true;
    },
    resumeAutomation() {
      const wasPaused = automationPaused;
      automationPaused = false;
      if (!wasPaused) return false;
      if (orchestrator) {
        turnController.start();
        return true;
      }
      return true;
    },
    isAutomationPaused() {
      return automationPaused;
    },
    setExpandCallback(cb) {
      expandCallback = cb;
      orchestrator?.setExpandCallback(cb ?? (() => Promise.resolve()));
    },
  };
};
