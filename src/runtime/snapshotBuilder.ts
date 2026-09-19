import type { ApplyQueueEntry, BoundaryLogEntry, EngineState, ValidationError } from "@engine/index";
import type { DriverContext } from "@copilot/index";
import type { LedgerView } from "@memory/index";
import { curatorLorebooks } from "@stagecraft/index";
import { buildConvergenceReadout, buildLastTransition, buildPendingDeltas, buildStoryIdentity, buildTensionSnapshot } from "./snapshot";
import { buildNarrativeStatus, type RollbackNotice } from "./narrative";
import { derivePipelineStatus } from "./pipeline";
import { loadPersistedRuntime } from "./persistence";
import { findStoryRecord, listStoryRecords } from "./storyLibrary";
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
  ledger: LedgerView[];
  driver: DriverContext | null;
  activeNudge: string | null;
  payloadCaptures: PayloadCapture[];
}

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
  const tension = buildTensionSnapshot(extras.tension.smoothed, sources.expectedTension);
  const pipeline = derivePipelineStatus(extras.extraction);
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
    sceneLocation: extras.judge.scene?.facts.location ?? null,
  });

  return {
    ready: Boolean(loaded),
    storyId: loaded?.record.id ?? null,
    storyHash: loaded?.record.hash ?? null,
    storyIdentity: buildStoryIdentity(loaded?.record ?? null, loaded ? findStoryRecord(loaded.record.id) : null, Boolean(loaded && loadPersistedRuntime(loaded.record.id)?.pinnedStory)),
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
    scene: extras.judge.scene,
    loreForced: [...extras.judge.calls].reverse().find((call) => call.use === "lore") ?? null,
    stagecraftScope: curatorLorebooks(story),
    pendingDeltas,
    convergence: buildConvergenceReadout(story, state),
    tension,
    pipeline,
    narrative,
    lastRollback: sources.lastRollback,
    ledger: sources.ledger,
    driver: sources.driver,
    activeNudge: sources.activeNudge,
    payloadCaptures: sources.payloadCaptures,
  };
}
