import { agencyFor, type ApplyQueueEntry, type BoundaryLogEntry, type EngineState, type StoryEngine, type ValidationError } from "@engine/index";
import type { DriverContext } from "@copilot/index";
import { sceneFieldsInConflict, type LedgerView, type MemoryInjectionView } from "@memory/index";
import { curatorLorebooks } from "@stagecraft/index";
import { confirmedSceneFacts, isSceneStale, judgeMeterView } from "@judge/index";
import { buildConvergenceReadout, buildLastTransition, buildPendingDeltas, buildStoryIdentity, buildTensionSnapshot } from "./snapshot";
import { buildNarrativeStatus, type RollbackNotice, type RollbackUnavailable } from "./narrative";
import { agencyRecovery as agencyRecoveryOf, playerTurnIds, REFUSAL_PLAYER_TEXT, type AgencyRecovery } from "./agencyRecovery";
import { jumpIndex } from "./messageJump";
import type { MessageFingerprints } from "./fingerprints";
import { derivePipelineStatus, expansionInFlight } from "./pipeline";
import { hasUnsavedChanges, SAVE_PLAYER_TEXT } from "./saveHealth";
import { blobMismatch, loadPersistedRuntime, UNREADABLE_NOTICE } from "./persistence";
import { findStoryRecord, listStoryRecords } from "./storyLibrary";
import { orphanedLorebooks } from "./mirrorReaper";
import { loreEvidenceView } from "./worldInfoEvidence";
import { samplerOverlay } from "./samplerOverlay";
import { scanGateView, wiGatingStatus } from "./worldInfoMode";
import { buildForeignRows, buildNextTurnCost, buildNextTurnPreview } from "./nextTurn";
import { promptCost } from "./promptCost";
import { roleHealth } from "./roleHealth";
import { readChatIdentity } from "./chatIdentity";
import type { ExtensionPromptBlocks } from "@services/STAPI";
import type { ExtractionHealth } from "@extraction/index";
import type { CopilotCoordinator } from "./coordinators/copilotCoordinator";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { PacingCoordinator } from "./coordinators/pacingCoordinator";
import type { LoadedStory, PayloadCapture, RuntimeExtras, RuntimeSnapshot } from "./types";

// The single composed model the UI subscribes to. Everything a rendering component needs lives
// here — read-models the coordinators own (ledger, driver, nudge) are handed in rather than
// pulled by the component, so one subscription is the whole contract (finding I2).
export interface SnapshotSources {
  loaded: LoadedStory | null;
  state: EngineState | null;
  extras: RuntimeExtras;
  validationErrors: ValidationError[];
  status: string;
  pendingWrites: ApplyQueueEntry[];
  boundaryLog: BoundaryLogEntry[];
  expectedTension: number | null;
  openThreads: string[];
  canon: string;
  lastRollback: RollbackNotice | null;
  rollbackUnavailable: RollbackUnavailable | null;
  ledger: LedgerView[];
  memoryInjection?: MemoryInjectionView | null;
  driver: DriverContext | null;
  activeNudge: string | null;
  payloadCaptures: PayloadCapture[];
  /** v2.3 plan 09 / v2.4 plan 08: every extension prompt ST holds right now, ours and other extensions'. */
  promptBlocks: ExtensionPromptBlocks;
  /** The open chat: V13 counts the player's own lines in it (a refusal counts turns, not replies), and
   *  v2.4 plan 08 T19d reads its messages against the stored fingerprints for "changed since". */
  chat: readonly unknown[];
  fingerprints: MessageFingerprints | null;
  extractionHealth?: ExtractionHealth | null;
}

export interface SnapshotPort {
  loaded: LoadedStory | null;
  engine: StoryEngine;
  extras: RuntimeExtras;
  validationErrors: ValidationError[];
  status: string;
  notices: { lastRollback: RollbackNotice | null; rollbackUnavailable: RollbackUnavailable | null };
  memory: MemoryCoordinator;
  pacing: PacingCoordinator;
  copilot: CopilotCoordinator;
  payloadCaptures: PayloadCapture[];
  extractionHealth: ExtractionHealth | null;
  fingerprints: MessageFingerprints | null;
  promptBlocks: ExtensionPromptBlocks;
  chat: readonly unknown[];
}

export const snapshotSources = (port: SnapshotPort): SnapshotSources => ({
  loaded: port.loaded,
  state: port.loaded ? port.engine.serialize() : null,
  extras: port.extras,
  validationErrors: port.validationErrors,
  status: port.status,
  pendingWrites: port.loaded ? port.engine.pendingWrites : [],
  boundaryLog: port.loaded ? port.engine.stateLog : [],
  expectedTension: port.loaded ? port.pacing.expectedTension() : null,
  openThreads: port.memory.getOpenArcs(),
  canon: port.memory.canon.getCanonProse(),
  ...port.notices,
  ...port.memory.injector.readModels(),
  driver: port.copilot.getDriverContext(),
  activeNudge: port.copilot.getActiveNudge(),
  payloadCaptures: port.payloadCaptures,
  extractionHealth: port.extractionHealth,
  promptBlocks: port.promptBlocks,
  chat: port.chat,
  fingerprints: port.fingerprints,
});

export function buildRuntimeSnapshot(sources: SnapshotSources): RuntimeSnapshot {
  const { loaded, state, extras } = sources;
  const story = loaded?.story ?? null;
  const active = state && story ? story.checkpointById[state.activeCheckpointId] : null;
  const blackboard = state?.blackboard.values ?? {};
  const evidenceByKey = new Map<string, string>();
  const readerByKey = new Map<string, { reader: "judge" | "llm"; at: string; confidence?: number }>();
  const noteReader = (key: string, reader: "judge" | "llm", at: string, confidence?: number) => {
    const previous = readerByKey.get(key);
    if (!previous || previous.at <= at) readerByKey.set(key, { reader, at, ...(confidence !== undefined ? { confidence } : {}) });
  };
  extras.extraction.audits.forEach((audit) => {
    audit.acceptedDeltas.forEach((entry) => {
      evidenceByKey.set(entry.delta.q, entry.evidence);
      noteReader(entry.delta.q, entry.judge !== undefined ? "judge" : "llm", audit.createdAt, entry.judge);
    });
  });
  (extras.extraction.judgedReads ?? []).forEach((read) => read.deltas.forEach((delta) => noteReader(delta.q, "judge", read.at, delta.confidence)));
  const pendingDeltas = buildPendingDeltas(sources.pendingWrites, state);
  const tension = buildTensionSnapshot(extras.tension.smoothed, sources.expectedTension, agencyFor(active));
  const agency = agencyFor(active);
  const agencyRecovery: AgencyRecovery | null = agencyRecoveryOf(story, state, sources.boundaryLog, extras.extraction.audits, playerTurnIds(sources.chat));
  const extractionHealth = sources.extractionHealth ?? null;
  const pipeline = derivePipelineStatus(extras.extraction, { generating: expansionInFlight(extras.expansion) }, extractionHealth);
  // v2.3 plan 09: what the next reply will carry, in ST's own assembly order. The private block is
  // attributed to the member the last talk decision drafted — in a group that is who ST will swap it
  // for — and the scene block reports the tracker's own staleness and last fallback.
  const lastDecision = extras.talk.decisions[extras.talk.decisions.length - 1] ?? null;
  const lastSceneCall = [...extras.judge.calls].reverse().find((call) => call.use.startsWith("scene")) ?? null;
  const cost = promptCost.view();
  const countOf = (value: string) => promptCost.countOf(value);
  const nextTurn = buildNextTurnPreview(sources.promptBlocks.own, {
    draftedMember: lastDecision?.chosenName ?? null,
    scene: extras.judge.scene,
    sceneFallback: lastSceneCall?.fallback ?? null,
    countOf,
    budget: cost.budget,
  });
  const nextTurnForeign = buildForeignRows(sources.promptBlocks.foreign, countOf, cost.budget);
  const narrative = buildNarrativeStatus({
    storyTitle: story?.title ?? null,
    checkpointName: active?.name ?? null,
    objective: active?.objective ?? null,
    lastTransition: buildLastTransition(story, sources.boundaryLog),
    openThreads: sources.openThreads,
    canon: sources.canon,
    tensionLevel: tension.level,
    pendingCount: pendingDeltas.length,
    pipeline,
    sceneLocation: confirmedSceneFacts(extras.judge.scene, sceneFieldsInConflict(extras.memory.conflicts))?.location ?? null,
    // Only when a place WAS known: a tracker that has never answered has nothing to be unsure of.
    sceneUnconfirmed: isSceneStale(extras.judge.scene) && Boolean(extras.judge.scene?.facts.location),
    // v2.3 plan 06: a write this chat believes it made and the server has not confirmed. Player
    // wording, because the player is the one who would lose the story.
    saveNotice: hasUnsavedChanges(extras.saveHealth) ? SAVE_PLAYER_TEXT : null,
    agencyNotice: agencyRecovery ? REFUSAL_PLAYER_TEXT : null,
    objectiveKind: agency.objective_kind,
  });
  const mismatch = loaded ? null : blobMismatch();
  const unreadable = mismatch?.kind === "unreadable" ? mismatch : null;

  return {
    ready: Boolean(loaded),
    storyId: loaded?.record.id ?? null,
    storyHash: loaded?.record.hash ?? null,
    storyIdentity: buildStoryIdentity(loaded?.record ?? null, loaded ? findStoryRecord(loaded.record.id) : null, Boolean(loaded && loadPersistedRuntime(loaded.record.id))),
    blobUnreadable: unreadable ? { foundVersion: unreadable.foundVersion, notice: UNREADABLE_NOTICE } : null,
    orphanedLorebooks: orphanedLorebooks(),
    chatIdentity: loaded ? null : readChatIdentity(),
    storyTitle: story?.title ?? null,
    storyDescription: story?.description ?? null,
    activeCheckpointId: active?.id ?? null,
    activeCheckpointName: active?.name ?? null,
    activeObjective: active?.objective ?? null,
    boundary: state?.boundary ?? 0,
    blackboard,
    blackboardMeta: Object.fromEntries(Object.keys(blackboard).map((key) => [key, {
      version: state?.blackboard.versions[key] ?? 0,
      latched: state?.blackboard.latched[key] ?? false,
      source: story?.qualityByKey[key]?.source ?? "unknown",
      evidence: evidenceByKey.get(key),
      ...(readerByKey.get(key) ? { reader: readerByKey.get(key)!.reader, ...(readerByKey.get(key)!.confidence !== undefined ? { confidence: readerByKey.get(key)!.confidence } : {}) } : {}),
    }])),
    checkpoints: story?.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      name: checkpoint.name,
      objective: checkpoint.objective,
      active: checkpoint.id === active?.id,
      visited: Boolean(state?.visitedAnchors.includes(checkpoint.id)),
    })) ?? [],
    requirements: extras.requirements,
    validationErrors: sources.validationErrors,
    library: listStoryRecords(),
    status: sources.status,
    extraction: extras.extraction,
    expansion: extras.expansion,
    memory: extras.memory,
    pacing: extras.pacing,
    copilot: extras.copilot,
    ui: extras.ui,
    talk: extras.talk,
    stagecraft: extras.stagecraft,
    // v2.3 plan 06: what this chat changed in shared host state, and whether it could be put back.
    effects: extras.effects,
    saveHealth: extras.saveHealth,
    scene: extras.judge.scene,
    loreForced: [...extras.judge.calls].reverse().find((call) => call.use === "lore") ?? null,
    judgeMeter: judgeMeterView(extras.judge),
    loreEvidence: loreEvidenceView(story, extras.memory.wiBook?.name ?? null),
    scanGate: scanGateView(),
    wiGating: wiGatingStatus(),
    samplerOverlay: samplerOverlay.view(),
    stagecraftScope: curatorLorebooks(story),
    pendingDeltas,
    convergence: buildConvergenceReadout(story, state),
    tension,
    agency,
    agencyRecovery,
    pipeline,
    extractionHealth,
    narrative,
    lastRollback: sources.lastRollback,
    rollbackUnavailable: sources.rollbackUnavailable,
    ledger: sources.ledger,
    memoryInjection: sources.memoryInjection ?? null,
    driver: sources.driver,
    activeNudge: sources.activeNudge,
    payloadCaptures: sources.payloadCaptures,
    nextTurn,
    chatJump: jumpIndex(sources.chat, sources.fingerprints),
    nextTurnForeign,
    nextTurnCost: buildNextTurnCost(nextTurn, nextTurnForeign, cost.budget, cost.lastGenerationBudget),
    roleRoutes: roleHealth.view(),
  };
}
