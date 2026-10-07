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
import { enabledCharacterIds, rosterMemberName } from "./roster";
import { createCuratorFilter } from "./curatorFilter";
import { loreEvidence } from "./worldInfoEvidence";
import type { JudgeRuntime } from "./judge";
import type { JournalRecordKind } from "./journal";
import { requestBudgetFor } from "./requestBudget";
import { getGlobalSettings } from "./settingsStore";
import type { RollbackDeps } from "./rollback";
import type { StoryUpdateDeps } from "./storyUpdate";
import type { RunOwnership } from "./runToken";
import type { LoadedStory, RuntimeExtras } from "./types";
import { loadWizardSession, saveWizardSession } from "./wizardSessions";
import type { InnerBeatHost } from "./innerBeatHost";
import { loadInnerRender } from "@memory/index";
import { getPlayerName } from "@services/STAPI";
import { storyEnded } from "./chapterPort";
import { hasOpenGroup } from "./persistence";
import { createGamePort } from "./gamePort";
import { acceptedMeanwhile } from "./agendaProposals";
import type { EffectsApplier } from "./effectsApplier";

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
  fireSceneBreakReplies: (breakAt: number) => Promise<void>;
  sceneBreakListeners: Set<(audit: SharedReadAudit, collect?: SchedulerJob[]) => void>;
  arcResolvedListeners: Set<(arcIds: string[]) => void>;
  journal: (kind: JournalRecordKind, summary: string, note?: string) => void;
  announce: (text: string) => Promise<void>;
  rollback: Pick<RollbackDeps, "journal" | "context" | "refreshRequirements" | "reapplyCheckpoint" | "notices" | "onApplied">;
  storyUpdate: Pick<StoryUpdateDeps, "swapStory" | "restart" | "journal">;
  effects: () => EffectsApplier;
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
    beatFor: (rosterId) => inner.beatFor(rosterId),
    meanwhile: (rosterId) => acceptedMeanwhile(port.extras().agendaProposals, rosterId),
    journal: (summary, note) => port.journal("story", summary, note),
    chapterHost: {
      closeScene: (to) => extraction.closeSceneAt(to), announce: (text) => port.announce(text),
      journal: (summary, note) => port.journal("chapter", summary, note), playerName: () => getPlayerName(),
    },
  });
  let innerHost: InnerBeatHost | null = null;
  let innerLoad: Promise<InnerBeatHost> | null = null;
  const loadInner = () => (innerLoad ??= loadInnerRender().then(() => import("./innerBeatHost"))
    .then(({ innerBeatHostFor }) => (innerHost = innerBeatHostFor(port, memory, pacing))));
  const inner = {
    due: () => port.extras().memory.settings.innerBeat === true && Boolean(view.getStory()),
    run: async () => (await loadInner()).run(),
    prepare: async (rosterId: string) => { if (inner.due()) await (await loadInner()).prepare(rosterId); },
    beatFor: (rosterId: string) => innerHost?.beatFor(rosterId) ?? "",
  };
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
    fireSceneBreakReplies: (breakAt) => port.fireSceneBreakReplies(breakAt),
    emitSceneBreak: (audit, collect) => port.sceneBreakListeners.forEach((listener) => listener(audit, collect)),
    emitArcsResolved: (arcs) => { if (port.loaded() && arcs.length) port.arcResolvedListeners.forEach((listener) => listener(arcs.map((arc) => arc.id))); },
    setStatus: (status) => port.setStatus(status),
    judge: () => port.judge(),
    requestBudget: (role) => requestBudgetFor(role),
    spikes: () => getGlobalSettings().spikes,
    ...lifecycle,
  });
  const pacing = new PacingCoordinator({
    ...view,
    getStateLog: () => engine.stateLog,
    getTensionTarget: () => engine.activeCheckpoint?.tension_target,
    getTension: () => port.extras().tension,
    setTension: (next) => { port.extras().tension = next; },
    getPacing: () => port.extras().pacing,
    ended: () => storyEnded(port.extras().memory.chapters ?? []),
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
      lore: (replyMessageId) => loreEvidence.firedLore(replyMessageId),
      group: () => {
        const story = view.getStory();
        const enabled = new Set(enabledCharacterIds(story, view.hosts.roster));
        return (story?.roster ?? []).filter((member) => enabled.has(member.id)).map(rosterMemberName);
      },
    }),
    journal: (summary, note) => port.journal("stagecraft", summary, note),
    ...lifecycle,
  });
  const copilot: CopilotCoordinator = new CopilotCoordinator({
    ...view,
    getSettings: () => port.extras().copilot,
    getCanon: () => memory.canon.getCanonAt(view.getState()?.activeCheckpointId ?? null),
    ...lifecycle,
    wizardSession: (key) => loadWizardSession(key),
    saveWizardSession: (session) => saveWizardSession(session),
    openChat: () => String(view.hosts.chat.chatId() ?? "") || null,
  });
  const game = createGamePort({ engine, loaded: port.loaded, extras: port.extras, effects: port.effects, ownership: lifecycle.ownership, persist: lifecycle.persist, notify: lifecycle.notify });
  const rollbackDeps: RollbackDeps = {
    ...port.rollback, engine, memory, stagecraft, pacing, ownership: lifecycle.ownership, revalidateExpansion: () => expansion.revalidateInserted(),
    restoreExpansion: (boundary) => expansion.restoreStaledAfter(boundary), extras: () => port.extras(),
    persist: lifecycle.persist, notify: lifecycle.notify, setStatus: (status) => port.setStatus(status),
  };
  const storyUpdateDeps: StoryUpdateDeps = {
    ...port.storyUpdate, getLoaded: () => port.loaded(), getState: () => (port.loaded() ? engine.serialize() : null),
    getHistory: () => (port.loaded() ? engine.serializeHistory() : null),
    mergeStory: (raw, base) => expansion.mergedStoryOrBase(raw, base), ownership: lifecycle.ownership,
    chatOpen: () => Boolean(view.hosts.chat.chatId()),
    groupOpen: hasOpenGroup,
  };
  return { memory, expansion, extraction, pacing, stagecraft, copilot, inner, game, rollbackDeps, storyUpdateDeps };
}
