import { agencyFor, gateKeys, type ApplyQueueEntry, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2, type StoryEngine, type ValidationError } from "@engine/index";
import type { DriverContext } from "@copilot/index";
import { castVoices, sceneFieldsInConflict, withoutExcludedThreads, type LedgerView, type MemoryInjectionView } from "@memory/index";
import { curatorLorebooks } from "@stagecraft/index";
import { confirmedSceneFacts, isSceneStale, judgeMeterView } from "@judge/index";
import { buildConvergenceReadout, buildPendingDeltas, buildStoryIdentity, buildTensionSnapshot, playerLastTransition } from "./snapshot";
import { currentThreads, latestScene } from "./recapCurrent";
import { buildNarrativeStatus, playerLocation, type NarrativeTransition, type RollbackNotice, type RollbackUnavailable } from "./narrative";
import { agencyRecovery as agencyRecoveryOf, playerTurnIds, REFUSAL_PLAYER_TEXT, type AgencyRecovery } from "./agencyRecovery";
import { jumpIndex } from "./messageJump";
import { firstLines } from "./castInPlay";
import type { MessageFingerprints } from "./fingerprints";
import { derivePipelineStatus, expansionInFlight, playerPendingCount, type PipelineStatus } from "./pipeline";
import { playerSaveNotice } from "./saveHealth";
import { blobMismatch, loadPersistedRuntime, UNREADABLE_NOTICE } from "./persistence";
import { findStoryRecord, listStoryRecords } from "./storyLibrary";
import { orphanedLorebooks, reapDecisions } from "./mirrorReaper";
import { loreEvidenceView } from "./worldInfoEvidence";
import { samplerOverlay } from "./samplerOverlay";
import { scanGateView, wiGatingStatus } from "./worldInfoMode";
import { globalStoryLore } from "./storyLore";
import { buildForeignRows, buildNextTurnCost, buildNextTurnPreview, type NextTurnSourceBlock } from "./nextTurn";
import { promptCost } from "./promptCost";
import { promptBuckets } from "./promptBuckets";
import { roleHealth } from "./roleHealth";
import { buildModelCalls } from "./modelCalls";
import type { InlineSources, InlineView } from "./inlineTimeline";
import { effectiveInlineLevel } from "./settingsModel";
import { readChatIdentity } from "./chatIdentity";
import { chapterKit, storyEnded } from "./chapterPort";
import type { ExtensionPromptBlocks } from "@services/STAPI";
import type { ExtractionHealth } from "@extraction/index";
import type { CopilotCoordinator } from "./coordinators/copilotCoordinator";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { PacingCoordinator } from "./coordinators/pacingCoordinator";
import type { LastFiredTransition, LoadedStory, PayloadCapture, RuntimeExtras, RuntimeSnapshot } from "./types";

// The single composed model the UI subscribes to. Everything a rendering component needs lives
// here — read-models the coordinators own (ledger, driver, nudge) are handed in rather than
// pulled by the component, so one subscription is the whole contract (finding I2).
const readerFields = (reader: { reader: "judge" | "llm"; confidence?: number } | undefined) => (reader
  ? { reader: reader.reader, ...(reader.confidence !== undefined ? { confidence: reader.confidence } : {}) }
  : {});

const playerTransition = (story: NormalizedStoryV2 | null, boundaryLog: BoundaryLogEntry[]): NarrativeTransition | null => playerLastTransition(story, boundaryLog);

const publishedIntro = (story: NormalizedStoryV2 | null): string | null => story?.player_intro || story?.description || null;

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
  privateBlocks?: NextTurnSourceBlock[];
  driver: DriverContext | null;
  activeNudge: string | null;
  payloadCaptures: PayloadCapture[];
  /** Every extension prompt ST holds right now, ours and other extensions'. */
  promptBlocks: ExtensionPromptBlocks;
  /** The open chat: counts the player's own lines in it (a refusal counts turns, not replies), and
   * Reads its messages against the stored fingerprints for "changed since". */
  chat: readonly unknown[];
  fingerprints: MessageFingerprints | null;
  extractionHealth?: ExtractionHealth | null;
  characters?: ReadonlyArray<{ avatar?: string; name?: string }>;
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
  characters?: ReadonlyArray<{ avatar?: string; name?: string }>;
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
  characters: port.characters ?? [],
});

const stem = (value: string) => value.replace(/\.(png|webp|jpe?g)$/i, "");

export const buildCastNames = (story: NormalizedStoryV2 | null, characters: ReadonlyArray<{ avatar?: string; name?: string }>): Record<string, string> => {
  const names: Record<string, string> = {};
  for (const character of characters) {
    if (!character.avatar || !character.name) continue;
    names[character.avatar] = character.name;
    names[stem(character.avatar)] = character.name;
  }
  for (const member of story?.roster ?? []) names[member.id] = member.name ?? names[member.id] ?? member.id;
  return names;
};

const lastFiredTransition = (log: BoundaryLogEntry[], story: NormalizedStoryV2 | null, activeCheckpointId: string | undefined): LastFiredTransition | null => {
  const entry = [...log].reverse().find((candidate) => candidate.fired?.to === activeCheckpointId);
  if (!entry?.fired) return null;
  return {
    from: entry.fired.from,
    to: entry.fired.to,
    keys: gateKeys(entry.fired.gate),
    checkpointName: story?.checkpointById[entry.fired.to]?.name ?? entry.fired.to,
  };
};

export const CHAT_LOADING_STATUS = "Loading this chat's story";

let inlineComposer: ((sources: InlineSources) => InlineView) | null = null;

export const loadInlineComposer = async () => {
  inlineComposer = (await import("./inlineTimeline")).composeInlineTimeline;
};

const gateQualitiesOf = (story: NormalizedStoryV2 | null, activeId: string | undefined): string[] => (story && activeId
  ? [...new Set((story.outgoingByCheckpoint[activeId] ?? []).flatMap((transition) => gateKeys(transition.gate)))].filter((key) => Boolean(story.qualityByKey[key]))
  : []);

const authorMoves = (extras: RuntimeExtras) => extras.journal.filter((record) => record.kind === "author");

const inlineView = (sources: SnapshotSources, story: NormalizedStoryV2 | null, live: { tension: RuntimeSnapshot["tension"]; pipeline: PipelineStatus; agencyRecovery: boolean },
  castNames: Record<string, string>) => {
  const { extras } = sources;
  const { memory } = extras;
  const { inline: settings, authorView } = extras.ui;
  if (!inlineComposer) {
    const level = effectiveInlineLevel(settings.level, authorView);
    return { level, requested: settings.level, window: settings.window, categories: settings.categories, newestMessageId: sources.chat.length - 1, byMessage: {} };
  }
  return inlineComposer({
    story, settings: extras.ui.inline, authorView: extras.ui.authorView, chatLength: sources.chat.length,
    boundaryLog: sources.boundaryLog, audits: extras.extraction.audits, pending: sources.pendingWrites, reconciliation: extras.extraction.reconciliationEvents,
    memory: { entries: memory.entries, arcs: memory.arcs, derived: memory.derived, conflicts: memory.conflicts, verifyDrops: memory.verifyDrops },
    loreFired: extras.lore.fired, talkDecisions: extras.talk.decisions, judgeCalls: extras.judge.calls, proposals: extras.stagecraft.proposals,
    curatorPass: extras.stagecraft.lastPass, effects: extras.effects.ledger, tensionHistory: extras.tension.history,
    tension: { expected: live.tension.expected, hint: live.tension.hint?.text ?? null }, payloadCaptures: sources.payloadCaptures, pipeline: live.pipeline,
    agencyRecovery: live.agencyRecovery, lastRollback: sources.lastRollback, saveNotice: playerSaveNotice(extras.saveHealth), castNames,
    firstLines: firstLines(sources.chat), authorMoves: authorMoves(extras),
  });
};

const chapterParts = (sources: SnapshotSources, story: NormalizedStoryV2 | null, state: EngineState | null) => {
  const { memory } = sources.extras;
  const records = memory.chapters ?? [];
  const chapters = chapterKit()?.buildChapterView(story, state?.activeCheckpointId, records) ?? { declared: false, current: null, records: [], ended: storyEnded(records), epilogue: null };
  const origins = new Map(records.map((record) => [record.id, record.playerTitle]));
  const playerThreads = sources.openThreads.length ? currentThreads(withoutExcludedThreads(memory.arcs, memory.derived), state?.checkpointStartedBoundary ?? 0, state?.boundary ?? 0) : [];
  const openThreads = playerThreads.map((text) => {
    const origin = memory.arcs.find((arc) => arc.status === "open" && arc.text === text)?.originChapter;
    return origin && origins.has(origin) ? `${text} (since ${origins.get(origin)})` : text;
  });
  const now = chapters.current && !chapters.ended ? [`Now: ${chapters.current.playerTitle}`] : [];
  const chapterLines = chapters.records.length ? [...chapters.records.map((record) => `${record.playerTitle} — ${record.short}`), ...now] : [];
  const fold = chapterKit()?.foldPreview(memory, story, sources.promptBlocks.own, sources.chat.length) ?? 0;
  const scene = state ? latestScene(memory.entries, state.lastMessageId, state.checkpointStartedBoundary) : null;
  return { chapters, openThreads, chapterLines, fold, scene };
};

const modelCallSlices = (extras: SnapshotSources["extras"]) => ({
  modelCalls: buildModelCalls({
    judgeCalls: extras.judge.calls, audits: extras.extraction.audits, talkDecisions: extras.talk.decisions, curatorPass: extras.stagecraft.lastPass, routed: extras.modelCalls,
  }),
  modelCallRing: extras.modelCalls,
});

export function buildRuntimeSnapshot(sources: SnapshotSources): RuntimeSnapshot {
  const { loaded, state, extras } = sources;
  const story = loaded?.story ?? null;
  const active = state && story ? story.checkpointById[state.activeCheckpointId] : null;
  const blackboard = state?.blackboard.values ?? {};
  const lastFired = lastFiredTransition(sources.boundaryLog, story, state?.activeCheckpointId);
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
  const pendingDeltas = buildPendingDeltas(sources.pendingWrites, state, playerTurnIds(sources.chat));
  const tension = buildTensionSnapshot(extras.tension.smoothed, sources.expectedTension, agencyFor(active));
  const agency = agencyFor(active);
  const agencyRecovery: AgencyRecovery | null = agencyRecoveryOf(story, state, sources.boundaryLog, extras.extraction.audits, playerTurnIds(sources.chat));
  const extractionHealth = sources.extractionHealth ?? null;
  const { chapters, openThreads, chapterLines, fold, scene } = chapterParts(sources, story, state);
  const pipeline = derivePipelineStatus(extras.extraction, { generating: expansionInFlight(extras.expansion) }, extractionHealth, chapters.ended, active);
  // What the next reply will carry, in ST's own assembly order. The private block is
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
    budget: cost.budget, privateBlocks: sources.privateBlocks,
  });
  const nextTurnForeign = buildForeignRows(sources.promptBlocks.foreign, countOf, cost.budget);
  const nextTurnCost = buildNextTurnCost(nextTurn, nextTurnForeign, cost.budget, cost.lastGenerationBudget);
  const narrative = buildNarrativeStatus({
    storyTitle: story?.title ?? null,
    checkpointName: active?.player_name ?? (active ? "Current scene" : null),
    objective: active?.player_text ?? null,
    publicIntro: publishedIntro(story),
    lastTransition: playerTransition(story, sources.boundaryLog), latestScene: scene,
    openThreads,
    canon: sources.canon,
    chapters: chapterLines,
    epilogue: chapters.epilogue,
    tensionLevel: tension.level,
    pendingCount: playerPendingCount(pendingDeltas),
    pipeline,
    sceneLocation: playerLocation(story, confirmedSceneFacts(extras.judge.scene, sceneFieldsInConflict(extras.memory.conflicts))?.location ?? null),
    // Only when a place WAS known: a tracker that has never answered has nothing to be unsure of.
    sceneUnconfirmed: isSceneStale(extras.judge.scene) && Boolean(extras.judge.scene?.facts.location),
    // A write this chat believes it made and the server has not confirmed. Player
    // wording, because the player is the one who would lose the story.
    saveNotice: playerSaveNotice(extras.saveHealth),
    agencyNotice: agencyRecovery ? REFUSAL_PLAYER_TEXT : null,
    objectiveKind: agency.objective_kind,
  });
  const castNames = buildCastNames(story, sources.characters ?? []), inline = inlineView(sources, story, { tension, pipeline, agencyRecovery: Boolean(agencyRecovery) }, castNames);
  const mismatch = loaded ? null : blobMismatch();
  const unreadable = mismatch?.kind === "unreadable" ? mismatch : null;

  return {
    ready: Boolean(loaded),
    storyId: loaded?.record.id ?? null,
    storyHash: loaded?.record.hash ?? null,
    storyIdentity: buildStoryIdentity(loaded?.record ?? null, loaded ? findStoryRecord(loaded.record.id) : null, Boolean(loaded && loadPersistedRuntime(loaded.record.id))),
    blobUnreadable: unreadable ? { foundVersion: unreadable.foundVersion, notice: UNREADABLE_NOTICE } : null,
    orphanedLorebooks: orphanedLorebooks(), reapDecisions: reapDecisions(), globalStoryLore: globalStoryLore(),
    chatIdentity: loaded ? null : readChatIdentity(),
    storyTitle: story?.title ?? null,
    storyDescription: story?.description ?? null,
    publicStoryIntro: publishedIntro(story),
    imageStory: story?.illustrations ? { checkpoints: story.illustrations.checkpoints === true, scenes: story.illustrations.scenes === true } : null,
    activeCheckpointId: active?.id ?? null,
    activeCheckpointName: active?.name ?? null,
    activeObjective: active?.objective ?? null,
    boundary: state?.boundary ?? 0,
    blackboard, gateQualities: gateQualitiesOf(story, active?.id),
    blackboardMeta: Object.fromEntries(Object.keys(blackboard).map((key) => [key, {
      version: state?.blackboard.versions[key] ?? 0,
      latched: state?.blackboard.latched[key] ?? false,
      source: story?.qualityByKey[key]?.source ?? "unknown",
      evidence: evidenceByKey.get(key),
      ...readerFields(readerByKey.get(key)),
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
    chapters,
    pacing: extras.pacing,
    copilot: extras.copilot,
    ui: extras.ui,
    talk: extras.talk,
    stagecraft: extras.stagecraft,
    // What this chat changed in shared host state, and whether it could be put back.
    effects: extras.effects,
    saveHealth: extras.saveHealth,
    scene: extras.judge.scene,
    loreForced: [...extras.judge.calls].reverse().find((call) => call.use === "lore") ?? null,
    judgeMeter: judgeMeterView(extras.judge),
    loreEvidence: loreEvidenceView(story, extras.memory.wiBook?.name ?? null),
    scanGate: scanGateView(),
    wiGating: wiGatingStatus(),
    samplerOverlay: samplerOverlay.view(),
    stagecraftScope: curatorLorebooks(story), innerCast: castVoices(story, state?.activeCheckpointId ?? null),
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
    lastFired,
    driver: sources.driver,
    activeNudge: sources.activeNudge,
    payloadCaptures: sources.payloadCaptures,
    nextTurn, authorMoves: authorMoves(extras).slice(-8).reverse(),
    chatJump: jumpIndex(sources.chat, sources.fingerprints),
    nextTurnForeign,
    nextTurnCost,
    nextTurnBuckets: promptBuckets.view(nextTurnCost.ownTokens), nextTurnFold: fold,
    roleRoutes: roleHealth.view(),
    lore: extras.lore,
    inline, castNames,
    ...modelCallSlices(extras),
  };
}
