import { scheduleForcedCues, ExtractionScheduler, maybeScheduleReconciliation, type SchedulerHost, type SchedulerSettings } from "@extraction/index";
import { registerRuntimeMacros } from "./macros";
import { runtimeManager } from "./runtimeManager";
import { registerSlashCommands } from "./slashCommands";
import { TurnBridge } from "./turnBridge";

let started = false;
let bridge: TurnBridge | null = null;
let slashRegistered = false;
let scheduler: ExtractionScheduler | null = null;

const registerSlashCommandsWhenReady = (attempt = 0) => {
  if (slashRegistered) return;
  try {
    slashRegistered = registerSlashCommands(runtimeManager);
  } catch (error) {
    console.warn("[Story Orchestrator] slash command registration failed", error);
  }
  if (!slashRegistered && attempt < 100) window.setTimeout(() => registerSlashCommandsWhenReady(attempt + 1), 100);
};

export function startRuntime() {
  if (started) return runtimeManager;
  started = true;
  const schedulerHost: SchedulerHost = {
    getStory: () => runtimeManager.getStory(),
    getEngineState: () => runtimeManager.getEngineState(),
    getExtractionSettings: (): SchedulerSettings => ({
      ...runtimeManager.getExtractionSettings(),
      debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null,
    }),
    getFacts: () => runtimeManager.getExtractionFacts(),
    applyExtractionAudit: (audit, facts) => runtimeManager.applyExtractionAudit(audit, facts),
    onSchedulerChange: () => {
      if (scheduler) runtimeManager.setSchedulerSnapshot(scheduler.getSnapshot());
    },
  };
  scheduler = new ExtractionScheduler(schedulerHost);
  runtimeManager.onBoundary((result) => {
    if (!scheduler) return;
    scheduler.onBoundary(result.boundary, Boolean(result.fired));
    scheduleForcedCues(runtimeManager.getStory(), result.activeCheckpointId, scheduler);
    maybeScheduleReconciliation(runtimeManager.getStory(), runtimeManager.getEngineState(), runtimeManager.getExtractionSettings().reconciliationMultiplier, scheduler);
  });
  runtimeManager.onRollback((messageId) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}` });
  });
  registerRuntimeMacros(runtimeManager);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 0);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 1000);
  bridge = new TurnBridge(runtimeManager);
  bridge.start();
  void runtimeManager.loadSelectedFromChat();
  return runtimeManager;
}

export function stopRuntime() {
  bridge?.stop();
  bridge = null;
  scheduler = null;
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
