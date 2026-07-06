import { scheduleForcedCues, ExtractionScheduler, maybeScheduleReconciliation, type SchedulerHost, type SchedulerSettings } from "@extraction/index";
import { subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import { registerRuntimeMacros } from "./macros";
import { runtimeManager } from "./runtimeManager";
import { registerSlashCommands } from "./slashCommands";
import { TurnBridge } from "./turnBridge";

const CONSOLIDATION_CADENCE = 10;

let started = false;
let bridge: TurnBridge | null = null;
let slashRegistered = false;
let scheduler: ExtractionScheduler | null = null;
let privateInjectionUnsub: (() => void) | null = null;

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
    getOpenArcs: () => runtimeManager.getOpenArcs(),
    getEpistemicLedgerCapable: () => runtimeManager.getEpistemicLedgerCapable(),
    getEntities: () => runtimeManager.getEntities(),
    applyExtractionAudit: (audit, facts, memory, arcs, epistemic, ledger) => runtimeManager.applyExtractionAudit(audit, facts, memory, arcs, epistemic, ledger),
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
    if (result.boundary > 0 && result.boundary % CONSOLIDATION_CADENCE === 0) {
      scheduler.schedule({ priority: 4, reason: "consolidate", run: async () => { await runtimeManager.runConsolidation(); } });
    }
  });
  runtimeManager.onRollback((messageId, window) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  });
  runtimeManager.onSceneBreakConfirmed((audit) => {
    scheduler?.schedule({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
    if (runtimeManager.getEpistemicLedgerCapable()) {
      scheduler?.schedule({ priority: 2, reason: `epistemic-ledger:${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runEpistemicLedgerPass(audit); } });
    }
  });
  runtimeManager.onArcsResolvedConfirmed((arcIds) => {
    scheduler?.schedule({ priority: 4, reason: `arc-summary:${arcIds.length}`, run: async () => { await runtimeManager.runArcSummaryPass(arcIds); } });
  });
  registerRuntimeMacros(runtimeManager);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 0);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 1000);
  bridge = new TurnBridge(runtimeManager);
  bridge.start();
  const privateInjectionEntries: HostSubscriptionEntry[] = [
    { eventName: "group_member_drafted", handler: (characterId) => runtimeManager.onMemberDrafted(characterId as number | [number]) },
    { eventName: "generation_ended", handler: () => runtimeManager.clearPrivateInjection() },
    { eventName: "generation_stopped", handler: () => runtimeManager.clearPrivateInjection() },
  ];
  privateInjectionUnsub = subscribeToHostEvents(privateInjectionEntries);
  void runtimeManager.loadSelectedFromChat();
  return runtimeManager;
}

export function stopRuntime() {
  bridge?.stop();
  bridge = null;
  privateInjectionUnsub?.();
  privateInjectionUnsub = null;
  scheduler = null;
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
