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
    getFiredTransitions: () => runtimeManager.getFiredTransitions(),
    getExpansionGateSources: () => runtimeManager.getExpansionGateSources(),
    applyExtractionAudit: (audit, facts) => runtimeManager.applyExtractionAudit(audit, facts),
    onSchedulerChange: () => {
      if (scheduler) runtimeManager.setSchedulerSnapshot(scheduler.getSnapshot());
    },
    pauseExtraction: (message) => runtimeManager.pauseExtraction(message),
  };
  scheduler = new ExtractionScheduler(schedulerHost);
  runtimeManager.onBoundary((result) => {
    if (!scheduler) return;
    scheduler.onBoundary(result.boundary, Boolean(result.fired), result.context.lastMessageId);
    scheduleForcedCues(runtimeManager.getStory(), result.activeCheckpointId, scheduler);
    const reconciliation = maybeScheduleReconciliation(runtimeManager.getStory(), runtimeManager.getEngineState(), runtimeManager.getExtractionSettings().reconciliationMultiplier, scheduler);
    if (reconciliation) runtimeManager.recordReconciliation(reconciliation);
    runtimeManager.scheduleExpansionForActive((reason, run) => scheduler?.schedule({ priority: 3, reason, run }));
    const sceneHit = runtimeManager.detectSceneBreak();
    if (sceneHit?.hit) scheduler.schedule({ priority: 0, reason: `scene:${sceneHit.reason}` });
  });
  runtimeManager.onRollback((messageId, window) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  });
  runtimeManager.onSceneBreakConfirmed((audit) => {
    scheduler?.schedule({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
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
