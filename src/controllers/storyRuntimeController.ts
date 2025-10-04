import StoryOrchestrator from "@services/StoryOrchestrator";
import { createTurnController } from "@controllers/turnController";
import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import { DEFAULT_INTERVAL_TURNS } from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";

interface RuntimeHooks {
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (ev: { outcome: "continue" | "win" | "fail"; reason: "interval" | "win" | "fail"; turn: number; matched?: string; cpIndex: number }) => void;
}

const clampIntervalTurns = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_TURNS;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : DEFAULT_INTERVAL_TURNS;
};

class StoryRuntimeController {
  private orchestrator: StoryOrchestrator | null = null;
  private readonly turnController = createTurnController();
  private currentStory: NormalizedStory | null = null;
  private intervalTurns = DEFAULT_INTERVAL_TURNS;
  private hooks: RuntimeHooks = {};
  private pendingInit: Promise<void> | null = null;

  setHooks(next: RuntimeHooks | undefined) {
    this.hooks = next ?? {};
  }

  setIntervalTurns(value: number) {
    this.intervalTurns = clampIntervalTurns(value);
    if (this.orchestrator) {
      this.orchestrator.setIntervalTurns(this.intervalTurns);
    }
  }

  async ensureStory(story: NormalizedStory | null | undefined): Promise<void> {
    const target = story ?? null;
    if (target === this.currentStory && this.orchestrator) {
      this.orchestrator.setIntervalTurns(this.intervalTurns);
      return;
    }

    if (!target) {
      await this.teardown();
      this.currentStory = null;
      return;
    }

    await this.teardown();

    this.currentStory = target;
    this.pendingInit = this.initialize(target);
    try {
      await this.pendingInit;
    } finally {
      this.pendingInit = null;
    }
  }

  dispose() {
    void this.teardown();
  }

  activateIndex(index: number) {
    this.orchestrator?.activateIndex(index);
  }

  reloadPersona() {
    return this.orchestrator?.reloadPersona();
  }

  updateCheckpointStatus(index: number, status: any) {
    this.orchestrator?.updateCheckpointStatus(index, status);
  }

  setOnActivateCheckpoint(cb?: (index: number) => void) {
    this.orchestrator?.setOnActivateCheckpoint(cb);
  }

  private async initialize(story: NormalizedStory) {
    const orchestrator = new StoryOrchestrator({
      story,
      shouldApplyRole: (role: Role) => {
        if (!this.orchestrator) return true;
        return this.turnController.shouldApplyRole(role, this.orchestrator.index());
      },
      setEvalHooks: (hooks) => {
        hooks.onEvaluated?.((ev) => {
          try {
            this.hooks.onEvaluated?.(ev);
          } catch (err) {
            console.warn("[StoryRuntimeController] onEvaluated handler failed", err);
          }
        });
      },
      onTurnTick: ({ turn, sinceEval }) => {
        try {
          this.hooks.onTurnTick?.({ turn, sinceEval });
        } catch (err) {
          console.warn("[StoryRuntimeController] onTurnTick handler failed", err);
        }
      },
      onActivateIndex: undefined,
    });

    this.orchestrator = orchestrator;
    orchestrator.setIntervalTurns(this.intervalTurns);

    this.turnController.attach(orchestrator);
    this.turnController.start();

    this.setReady(false);
    try {
      await orchestrator.init();
      this.setReady(true);
    } catch (err) {
      console.error("[StoryRuntimeController] orchestrator init failed", err);
      this.turnController.detach();
      orchestrator.dispose();
      this.orchestrator = null;
      this.setReady(false);
      throw err;
    }
  }

  private async teardown() {
    if (this.pendingInit) {
      try {
        await this.pendingInit;
      } catch {
        /* ignore */
      }
      this.pendingInit = null;
    }

    this.turnController.detach();

    if (this.orchestrator) {
      this.orchestrator.dispose();
      this.orchestrator = null;
    } else {
      storySessionStore.getState().setStory(null);
      storySessionStore.getState().resetRequirements();
    }

    this.setReady(false);
    this.currentStory = null;
  }

  private setReady(next: boolean) {
    storySessionStore.getState().setOrchestratorReady(next);
  }
}

export const storyRuntimeController = new StoryRuntimeController();
