import type { ArcTemplate, EngineState, NormalizedStoryV2, PrimitiveValue, TensionLevel, ValidationError } from "@engine/index";
import type { JudgeCallRecord, JudgeRuntimeState, SceneReadRecord } from "@judge/index";
import type { ReconciliationEvent, SharedReadAudit } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type { ArcEntry, EpistemicEntry, LedgerEntry, LedgerView, MemoryEntry, MemoryStoreState, MemoryTier, ScoreWeights } from "@memory/index";
import type { DriverContext } from "@copilot/index";
import type { SteeringHint } from "@pacing/index";
import type { CuratorPassAudit, CuratorProposalRecord, StagecraftAcceptMode } from "@stagecraft/index";
import type { JournalRecord } from "./journal";
import type { NarrativeStatus, RollbackNotice } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import type { InjectedPromptBlock } from "@services/STAPI";
import type { TalkDecisionSource } from "@talk/index";

export interface PayloadCapture {
  at: string;
  boundary: number;
  reason: string;
  blocks: InjectedPromptBlock[];
}

export interface StoryLibraryRecord {
  id: string;
  version: number;
  hash: string;
  title: string;
  description: string;
  raw: unknown;
  importedAt: string;
  updatedAt: string;
}

export interface RequirementsState {
  ready: boolean;
  missingPersonas: string[];
  missingMembers: string[];
  missingLorebooks: string[];
}

export interface TalkDecisionAudit {
  at: string;
  messageId: number;
  checkpointId: string;
  chosenRosterId: string | null;
  chosenName: string | null;
  source: TalkDecisionSource;
  latencyMs: number;
  judge?: { confidence: number; via: "choice" | "composite" };
}

export interface TalkRuntimeState {
  enabled: boolean;
  decisions: TalkDecisionAudit[];
}

// v2.1 plan 07. `curatorEnabled` is the capability flag (default off until a real run earns it);
// `acceptMode` decides what happens to a proposal: review = wait for the author, auto = apply at the
// next boundary, off = record and journal it but never write.
export interface StagecraftSettings {
  curatorEnabled: boolean;
  acceptMode: StagecraftAcceptMode;
}

export interface StagecraftRuntimeState {
  settings: StagecraftSettings;
  proposals: CuratorProposalRecord[];
  lastPass: CuratorPassAudit | null;
  lastRunBoundary: number;
  lastError: string | null;
}

export interface RuntimeExtras {
  firedNpcReplies: Record<string, number>;
  requirements: RequirementsState;
  lastAppliedCheckpointId: string | null;
  lastSelfInjectionMessageId: number | null;
  extraction: ExtractionRuntimeState;
  expansion: ExpansionRuntimeState;
  memory: MemoryRuntimeState;
  pacing: PacingSettings;
  tension: TensionRuntimeState;
  copilot: CopilotRuntimeSettings;
  ui: UiRuntimeSettings;
  talk: TalkRuntimeState;
  stagecraft: StagecraftRuntimeState;
  judge: JudgeRuntimeState;
  journal: JournalRecord[];
  lastSessionAt: string | null;
  updatedAt: string;
}

export interface CopilotRuntimeSettings {
  enabled: boolean;
}

export interface UiRuntimeSettings {
  authorView: boolean;
  announceTransitions: boolean;
  hudEnabled: boolean;
}

export interface PendingDeltaReadout {
  quality: string;
  value: PrimitiveValue;
  source: string;
}

export interface MemoryRuntimeSettings {
  enabled: boolean;
  epistemicLedgerCapable: boolean;
  injectionDepths: Record<MemoryTier, number>;
  tierBudgets: Record<MemoryTier, number>;
  tierTokenBudgets: Record<MemoryTier, number>;
  scoreWeights?: ScoreWeights;
}

export interface MemoryBackfillState {
  running: boolean;
  processed: number;
  total: number;
  lastError: string | null;
}

export interface CanonState {
  text: string;
  inputHash: string;
  updatedAt: string;
}

export interface MemoryMirrorBook {
  name: string;
  chatId: string;
}

export const VERIFY_DROP_LIMIT = 20;

export interface VerifyDrop {
  entry: MemoryEntry;
  p: number;
  at: string;
  model: string | null;
}

export interface MemoryRuntimeState extends MemoryStoreState {
  settings: MemoryRuntimeSettings;
  backfill: MemoryBackfillState | null;
  sceneCount: number;
  shortTermSummaryEnd: number;
  wiWrites: Record<string, string>;
  wiBook: MemoryMirrorBook | null;
  arcs: ArcEntry[];
  epistemic: EpistemicEntry[];
  ledger: LedgerEntry[];
  canon: CanonState | null;
  verifyDrops: VerifyDrop[];
  updatedAt: string;
}

export interface PacingSettings {
  alpha: number;
  shapeOverride: ArcTemplate | null;
  hintEnabled: boolean;
}

export interface TensionRuntimeState {
  levels: TensionLevel[];
  smoothed: number | null;
}

export interface ExtractionRuntimeSettings {
  enabled: boolean;
  profileId: string | null;
  cadence: number;
  reconciliationMultiplier: number;
  stabilityLag: number;
}

export interface ExtractionRuntimeState {
  settings: ExtractionRuntimeSettings;
  audits: SharedReadAudit[];
  reconciliationEvents: ReconciliationEvent[];
  lastReadBoundary: number;
  scheduler: { queueDepth: number; inFlight: boolean; lastError: string | null };
  judgedReads: JudgedReadRecord[];
}

// v2.2 plan 06: one row per judged read that is not part of an LLM read (every boundary, stall
// pre-check). Its own ring, so twenty of them never push the LLM reads out of `audits`.
export const JUDGED_READ_LIMIT = 20;

export interface JudgedReadRecord {
  at: string;
  boundary: number;
  kind: "typed" | "stall";
  window: { from: number; to: number };
  answered: string[];
  deltas: Array<{ q: string; v: PrimitiveValue; confidence: number }>;
  model: string | null;
  note?: string;
  fallback?: string;
}

export interface PersistedStoryRuntime {
  storyId: string;
  storyTitle: string;
  pinnedStory: unknown;
  playedVersion: number;
  contentHashAtLoad: string;
  engineState: EngineState;
  extras: RuntimeExtras;
}

export interface StoryOrchestratorMetadataBlob {
  version: 3;
  selectedStoryId: string | null;
  stories: Record<string, PersistedStoryRuntime>;
}

export interface ConvergenceReadout {
  anchorId: string;
  anchorName: string;
  progress: number;
  threshold: number;
  reached: boolean;
  visited: boolean;
}

export interface StoryIdentity {
  id: string | null;
  playedVersion: number | null;
  libraryVersion: number | null;
  pinned: boolean;
  drifted: boolean;
}

export interface RuntimeSnapshot {
  ready: boolean;
  storyId: string | null;
  storyHash: string | null;
  storyIdentity: StoryIdentity;
  storyTitle: string | null;
  storyDescription: string | null;
  activeCheckpointId: string | null;
  activeCheckpointName: string | null;
  activeObjective: string | null;
  boundary: number;
  blackboard: Record<string, PrimitiveValue>;
  blackboardMeta: Record<string, { version: number; latched: boolean; source: string; evidence?: string }>;
  checkpoints: Array<{ id: string; name: string; objective: string; active: boolean; visited: boolean }>;
  requirements: RequirementsState;
  validationErrors: ValidationError[];
  library: StoryLibraryRecord[];
  status: string;
  extraction: ExtractionRuntimeState;
  expansion: ExpansionRuntimeState;
  memory: MemoryRuntimeState;
  pacing: PacingSettings;
  copilot: CopilotRuntimeSettings;
  ui: UiRuntimeSettings;
  talk: TalkRuntimeState;
  stagecraft: StagecraftRuntimeState;
  scene: SceneReadRecord | null;
  loreForced: JudgeCallRecord | null;
  // The story's authored curator allowlist, so the review panel can say what is in scope without
  // reading the story record itself.
  stagecraftScope: string[];
  pendingDeltas: PendingDeltaReadout[];
  convergence: ConvergenceReadout[];
  tension: {
    level: TensionLevel | null;
    smoothed: number | null;
    expected: number | null;
    hint: SteeringHint | null;
  };
  pipeline: PipelineStatus;
  narrative: NarrativeStatus;
  lastRollback: RollbackNotice | null;
  ledger: LedgerView[];
  driver: DriverContext | null;
  activeNudge: string | null;
  payloadCaptures: PayloadCapture[];
}

export interface LoadedStory {
  record: StoryLibraryRecord;
  story: NormalizedStoryV2;
}
