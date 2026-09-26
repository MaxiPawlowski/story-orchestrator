import { ExtractionScheduler, probeModel, setAnsweredObserver, type SchedulerHost, type SchedulerJob, type SchedulerSettings } from "@extraction/index";
import { profileExists, subscribeToHostEvents } from "@services/STAPI";
import { breakerWatchEntries } from "../breakerWatch";
import { runBoundaryWork } from "../boundaryWork";
import { requestBudget, routedProfileId } from "../requestBudget";
import { runtimeManager } from "../runtimeManager";
import { beginRun } from "../runToken";
import type { Disposers, LiveParts } from "./types";

const schedulerHost = (live: LiveParts): SchedulerHost => ({
  getStory: () => runtimeManager.getStory(),
  getEngineState: () => runtimeManager.getEngineState(),
  getExtractionSettings: (): SchedulerSettings => ({
    ...runtimeManager.getExtractionSettings(),
    profileId: routedProfileId("read"),
    budget: requestBudget(routedProfileId("read")),
  }),
  model: runtimeManager.model,
  getFacts: () => runtimeManager.getExtractionFacts(),
  getFiredTransitions: () => runtimeManager.getFiredTransitions(),
  getExpansionGateSources: () => runtimeManager.getExpansionGateSources(),
  getOpenArcs: () => runtimeManager.getOpenArcs(),
  getEpistemicLedgerCapable: () => runtimeManager.getEpistemicLedgerCapable(),
  getEntities: () => runtimeManager.getEntities(),
  applyExtractionAudit: (audit, facts, memory, arcs, epistemic, ledger, read) => runtimeManager.applyExtractionAudit(audit, facts, memory, arcs, epistemic, ledger, read),
  beginRead: (window) => beginRun(runtimeManager.getOwnership(), window),
  onSchedulerChange: () => {
    if (live.scheduler) runtimeManager.setSchedulerSnapshot(live.scheduler.getSnapshot());
  },
  noteLapse: (summary, detail) => runtimeManager.noteRecap(summary, detail),
  noteHealth: (summary, detail) => runtimeManager.noteRecap(summary, detail),
  probeModel,
  profileExists,
  mutationSettled: () => runtimeManager.rollbackSettled(),
  epoch: () => runtimeManager.getRunContext().sessionEpoch,
  judgeTyped: () => live.typedJudge,
});

const scheduleSceneBreak = (live: LiveParts) => runtimeManager.onSceneBreakConfirmed((audit, collect) => {
  const place = (job: SchedulerJob) => (collect ? collect.push(job) : live.scheduler?.schedule(job));
  place({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
  if (runtimeManager.getEpistemicLedgerCapable()) {
    place({ priority: 2, reason: `epistemic-ledger:${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runEpistemicLedgerPass(audit); } });
  }
  if (runtimeManager.curatorDueForRun()) {
    place({ priority: 4, reason: `wi-curator:scene-${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runWiCuratorPass("scene-break"); } });
  }
});

export const startScheduler = (live: LiveParts, disposers: Disposers) => {
  disposers.push(setAnsweredObserver((call) => live.scheduler?.noteAnswered(call.profileId, call.ms)));
  live.scheduler = new ExtractionScheduler(schedulerHost(live));
  runtimeManager.attachScheduler(live.scheduler);
  disposers.push(() => { live.scheduler?.dispose(); runtimeManager.attachScheduler(null); });
  disposers.push(subscribeToHostEvents(breakerWatchEntries(() => live.scheduler, () => routedProfileId("read"))));
  disposers.push(runtimeManager.onBoundary((result) => {
    if (live.scheduler) runBoundaryWork({ result, manager: runtimeManager, scheduler: live.scheduler, ...(live.scene ? { scene: live.scene } : {}) });
  }));
  disposers.push(runtimeManager.onRollback((messageId, window) => {
    live.scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  }));
  disposers.push(scheduleSceneBreak(live));
  disposers.push(runtimeManager.onArcsResolvedConfirmed((arcIds) => {
    live.scheduler?.schedule({ priority: 4, reason: `arc-summary:${arcIds.length}`, run: async () => { await runtimeManager.runArcSummaryPass(arcIds); } });
  }));
  disposers.push(runtimeManager.onEpochChanged(() => live.scheduler?.clearForNewWorld()));
};
