import type { EngineState, NormalizedStoryV2, NormalizedTransition, StoryEngine } from "@engine/index";
import type { ExtraGateSource, ModelCall, ParsedDelta, SchedulerJob, SharedReadAudit } from "@extraction/index";
import { agencyRecovery, playerTurnIds } from "./agencyRecovery";
import type { coordinatorHosts } from "./coordinatorHosts";
import { CopilotCoordinator } from "./coordinators/copilotCoordinator";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { ExtractionCoordinator } from "./coordinators/extractionCoordinator";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { StagecraftCoordinator } from "./coordinators/stagecraftCoordinator";
import { createWarden, establishedFacts } from "./continuity";
import { createCuratorFilter } from "./curatorFilter";
import type { JudgeRuntime } from "./judge";
import type { JournalRecordKind } from "./journal";
import { requestBudgetFor } from "./requestBudget";
import type { RollbackDeps } from "./rollback";
import type { StoryUpdateDeps } from "./storyUpdate";
import type { RunOwnership } from "./runToken";
import type { LoadedStory, RuntimeExtras } from "./types";
import { loadWizardSession, saveWizardSession } from "./wizardSessions";

export interface ManagerPort {
  view: { getStory: () => NormalizedStoryV2 | null; getState: () => EngineState | null; hosts: typeof coordinatorHosts };
  lifecycle: { persist: () => Promise<void>; notify: () => void; ownership: RunOwnership; model: ModelCall };
  engine: StoryEngine;
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  judge: () => JudgeRuntime | null;
  setStatus: (status: string) => void;
  unsaved: () => boolean;
  firedTransitions: () => NormalizedTransition[];
  gateSources: () => ExtraGateSource[];
  enqueueExtractorDeltas: (accepted: ParsedDelta[], window: { from: number; to: number }, origin: string) => void;
  commitBoundary: () => Promise<unknown>;
  replaceStory: (story: NormalizedStoryV2) => void;
  fireSceneBreakReplies: (occurrence: number) => Promise<void>;
  sceneBreakListeners: Set<(audit: SharedReadAudit, collect?: SchedulerJob[]) => void>;
  arcResolvedListeners: Set<(arcIds: string[]) => void>;
  journal: (kind: JournalRecordKind, summary: string, note?: string) => void;
  rollback: Pick<RollbackDeps, "journal" | "context" | "refreshRequirements" | "reapplyCheckpoint" | "notices" | "onApplied">;
  storyUpdate: Pick<StoryUpdateDeps, "swapStory" | "restart" | "journal">;
}

export function wireCoordinators(port: ManagerPort) {
  const { view, lifecycle, engine } = port;
  const memory: MemoryCoordinator = new MemoryCoordinator({
    ...view,
    historyFloor: () => (port.loaded() ? engine.historyFrom().messageId : null),
    getMemory: () => port.extras().memory,
    setMemory: (next) => { port.extras().memory = next; },
    getFiredTransitions: () => port.firedTransitions(),
    getExpansionGateSources: () => port.gateSources(),
    enqueueExtractorDeltas: (accepted, window, origin) => port.enqueueExtractorDeltas(accepted, window, origin),
    enqueueMechanical: (deltas) => engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas }),
    ...lifecycle,
    judge: () => port.judge(),
    getScene: () => port.extras().judge.scene,
    rereadWindow: (window, reason) => extraction.runNow(undefined, reason, window),
    unsaved: () => port.unsaved(),
  });
  const expansion: ExpansionCoordinator = new ExpansionCoordinator({
    ...view,
    getStoryRaw: () => port.loaded()?.record.raw,
    getExpansion: () => port.extras().expansion,
    getCanon: () => memory.canon.getCanon(),
    getFactTexts: () => memory.getFacts().map((fact) => fact.text),
    replaceStory: (story) => port.replaceStory(story),
    judge: () => port.judge(),
    getSceneRead: () => port.extras().judge.scene,
    refusing: () => {
      const loaded = port.loaded();
      const state = loaded ? engine.serialize() : null;
      const turns = playerTurnIds(view.hosts.chat.chatRows());
      return agencyRecovery(loaded?.story ?? null, state, loaded ? engine.stateLog : [], port.extras().extraction.audits, turns) !== null;
    },
    setStatus: (status) => port.setStatus(status),
    ...lifecycle,
  });
  const extraction: ExtractionCoordinator = new ExtractionCoordinator({
    ...view,
    getExtraction: () => port.extras().extraction,
    memory,
    getFiredTransitions: () => port.firedTransitions(),
    getExpansionGateSources: () => port.gateSources(),
    enqueueExtractorDeltas: (accepted, window, origin) => port.enqueueExtractorDeltas(accepted, window, origin),
    commitBoundary: () => port.commitBoundary(),
    fireSceneBreakReplies: (occurrence) => port.fireSceneBreakReplies(occurrence),
    emitSceneBreak: (audit, collect) => port.sceneBreakListeners.forEach((listener) => listener(audit, collect)),
    emitArcsResolved: (arcs) => { if (port.loaded() && arcs.length) port.arcResolvedListeners.forEach((listener) => listener(arcs.map((arc) => arc.id))); },
    setStatus: (status) => port.setStatus(status),
    judge: () => port.judge(),
    requestBudget: (role) => requestBudgetFor(role),
    ...lifecycle,
  });
  const pacing = new PacingCoordinator({
    ...view,
    getStateLog: () => engine.stateLog,
    getTensionTarget: () => engine.activeCheckpoint?.tension_target,
    getTension: () => port.extras().tension,
    setTension: (next) => { port.extras().tension = next; },
    getPacing: () => port.extras().pacing,
  });
  const stagecraft = new StagecraftCoordinator({
    ...view,
    getStagecraft: () => port.extras().stagecraft,
    setStagecraft: (next) => { port.extras().stagecraft = next; },
    getCanon: () => memory.canon.getCanon(),
    getOpenArcs: () => memory.getOpenArcs(),
    filterEntries: createCuratorFilter(() => port.judge()),
    warden: createWarden(() => port.judge(), view, {
      facts: () => establishedFacts(port.extras().memory.entries, memory.getLedger(), memory.boundProvenance(), port.extras().memory.conflicts),
      nudgeActive: () => copilot.getActiveNudge() !== null,
    }),
    journal: (summary, note) => port.journal("stagecraft", summary, note),
    ...lifecycle,
  });
  const copilot: CopilotCoordinator = new CopilotCoordinator({
    ...view,
    getSettings: () => port.extras().copilot,
    getCanon: () => memory.canon.getCanon(),
    ...lifecycle,
    wizardSession: (key) => loadWizardSession(key),
    saveWizardSession: (session) => saveWizardSession(session),
    openChat: () => String(view.hosts.chat.chatId() ?? "") || null,
  });
  const rollbackDeps: RollbackDeps = {
    ...port.rollback, engine, memory, stagecraft, pacing, revalidateExpansion: () => expansion.revalidateInserted(), extras: () => port.extras(),
    persist: lifecycle.persist, notify: lifecycle.notify, setStatus: (status) => port.setStatus(status),
  };
  const storyUpdateDeps: StoryUpdateDeps = {
    ...port.storyUpdate, getLoaded: () => port.loaded(), getState: () => (port.loaded() ? engine.serialize() : null),
    mergeStory: (raw, base) => expansion.mergedStoryOrBase(raw, base), ownership: lifecycle.ownership,
  };
  return { memory, expansion, extraction, pacing, stagecraft, copilot, rollbackDeps, storyUpdateDeps };
}
