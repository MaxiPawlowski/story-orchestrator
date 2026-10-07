import type { AgencyPolicy, ArcTemplate, EngineState, NormalizedStoryV2, PrimitiveValue, TensionLevel, ValidationError } from "@engine/index";
import type { JudgeCallRecord, JudgeMeterView, JudgeRuntimeState, SceneReadRecord } from "@judge/index";
import type { ExtractionHealth, ReconciliationEvent, SharedReadAudit } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type {
  CastVoice, ConflictPair, ArcEntry, ChapterRecord, ChronicleState, DerivedRecord, EpistemicEntry, InnerBeat, LedgerEntry, LedgerView, MemoryEntry, MemoryInjectionView,
  MemoryStoreState, MemoryTier, Provenance, ScoreWeights,
} from "@memory/index";
import type { ChapterSettings, ChapterView } from "./chapters";
import type { SealSkip } from "@memory/reverse";
import type { OnEnterPost } from "./npcReplyRewind";
import type { BriefingRecord, BriefingState } from "./briefing";
import type { DeferredOpener } from "./openerDeferral";
import type { DriverContext } from "@copilot/index";
import type { SteeringHint } from "@pacing/index";
import type { CuratorDecline, CuratorPassAudit, CuratorProposalRecord, StagecraftAcceptMode } from "@stagecraft/index";
import type { JournalRecord } from "./journal";
import type { EngineHistory } from "@engine/index";
import type { NarrativeStatus, RollbackNotice, RollbackUnavailable } from "./narrative";
import type { AgencyRecovery } from "./agencyRecovery";
import type { NextTurnContributor, NextTurnCost, NextTurnForeignRow } from "./nextTurn";
import type { ChatJumpIndex } from "./messageJump";
import type { PassProfiles, RoleRoutes } from "./passProfiles";
import type { ReasoningBudget, ReplyEffort } from "@utils/reasoningEffort";
import type { RoleRouteView } from "./roleHealth";
import type { ModelCallRow } from "./modelCalls";
import type { ModelCallRecord } from "./modelCallLog";
import type { PromptBucketState } from "./promptBuckets";
import type { PipelineStatus } from "./pipeline";
import type { OrphanedLorebook, ReapDecision } from "./mirrorReaper";
import type { ImageHealthView } from "./imageHealth";
import type { SpriteLookIssue } from "./spriteLookHealth";
import type { NoGroupView } from "./noGroup";
import type { LoreEvidenceView } from "./worldInfoEvidence";
import type { SamplerOverlayView } from "./samplerOverlay";
import type { ScanGateView, WiGatingStatus } from "./worldInfoMode";
import type { MessageFingerprints } from "./fingerprints";
import type { ChatIdentitySnapshot } from "./chatIdentity";
import type { InjectedPromptBlock } from "@services/STAPI";
import type { TalkDecisionSource } from "@talk/index";
import type { BLOB_VERSION } from "./persistence";
import type { LoreRuntimeState } from "./loreFired";
import type { InlineView } from "./inlineTimeline";
import type { InlineSettings } from "./settingsModel";
import type { PresenceSettings } from "./displayToggles";
import type { ChanceRuntimeState, RollRecord } from "./rolls";
import type { PresenceView } from "./presence";

export interface PayloadCapture {
  at: string;
  boundary: number;
  messageId?: number;
  reason: string;
  blocks: InjectedPromptBlock[];
  folded?: number;
}

export interface StoryLibraryRecord {
  id: string;
  version: number;
  hash: string;
  title: string;
  description: string;
  raw: Record<string, unknown>;
  importedAt: string;
  updatedAt: string;
}

export type LoreSource = "global" | "chat" | "persona" | "character" | "story";

export interface SlotConflict {
  book: string;
  kind: "story-book" | "user-book";
}

export interface RequirementsState {
  ready: boolean;
  missingPersonas: string[];
  missingMembers: string[];
  missingLorebooks: string[];
  absentMembers?: string[];
  absentLorebooks?: string[];
  absentPersonas?: string[];
  /** Required members present in the group but muted there: they satisfy nothing, and Repair names them. `ready` is unaffected, so a story cast effect can still unmute them. */
  mutedMembers?: string[];
  /** Which binding ST scans each present book through (author view). */
  satisfiedBy?: Record<string, LoreSource>;
  /** A book bound to some enabled members but not all: the members without it. */
  characterGaps?: Record<string, string[]>;
  /** File mode: the chat slot holds a book that is not this chat's memory mirror, so the mirror cannot bind. */
  slotConflict?: SlotConflict | null;
}

export interface TalkDecisionAudit {
  at: string;
  messageId: number;
  checkpointId: string;
  chosenRosterId: string | null;
  chosenName: string | null;
  source: TalkDecisionSource;
  latencyMs: number;
  /** Which voice in a chained turn this was; 0 or absent for the first (or only) speaker. */
  chainStep?: number;
  judge?: { confidence: number; via: "choice" | "composite" };
}

export interface TalkRuntimeState {
  enabled: boolean;
  decisions: TalkDecisionAudit[];
}

// `curatorEnabled` is the capability flag (default off until a real run earns it);
// `acceptMode` decides what happens to a proposal: review = wait for the author, auto = apply at the
// next boundary, off = record and journal it but never write.
export interface StagecraftSettings {
  curatorEnabled: boolean;
  acceptMode: StagecraftAcceptMode;
  wardenEnabled: boolean;
  wardenAcceptMode: StagecraftAcceptMode;
}

export interface StagecraftRuntimeState {
  settings: StagecraftSettings;
  proposals: CuratorProposalRecord[];
  declines?: CuratorDecline[];
  lastPass: CuratorPassAudit | null;
  lastRunBoundary: number;
  lastError: string | null;
}

export interface RuntimeExtras {
  firedNpcReplies: Record<string, number>;
  firedNpcRepliesAt: Record<string, number[]>;
  onEnterPosts?: OnEnterPost[];
  deferredOpener?: DeferredOpener;
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
  /** What this chat's effects did to shared host state, and how to put it back. */
  effects: EffectsRuntimeState;
  saveHealth: SaveHealth;
  judge: JudgeRuntimeState;
  /** Which World Info entries each rendered reply's scans activated, by message. */
  lore: LoreRuntimeState;
  /** NPC reply and talk draws, by message; quality rolls are reconstructed instead. */
  chance?: ChanceRuntimeState;
  journal: JournalRecord[];
  modelCalls: ModelCallRecord[];
  lastSessionAt: string | null;
  branchedFrom?: BranchOrigin;
  briefing?: BriefingRecord;
  updatedAt: string;
}

export interface BranchOrigin {
  chatId: string;
  at: string;
}

export interface CopilotRuntimeSettings {
  enabled: boolean;
}

export interface UiRuntimeSettings {
  authorView: boolean;
  announceTransitions: boolean;
  hudEnabled: boolean;
  briefing?: boolean;
  inline: InlineSettings;
  presence?: PresenceSettings;
}

export interface PendingDeltaReadout {
  quality: string;
  value: PrimitiveValue;
  source: string;
  opening?: boolean;
}

export interface MemoryRuntimeSettings {
  enabled: boolean;
  epistemicLedgerCapable: boolean;
  injectionDepths: Record<MemoryTier, number>;
  tierBudgets: Record<MemoryTier, number>;
  tierTokenBudgets: Record<MemoryTier, number>;
  scoreWeights?: ScoreWeights;
  innerBeat?: boolean;
  innerFanOut?: InnerFanOut;
  harvestReasoning?: boolean;
  chapters?: Partial<ChapterSettings>;
}

export type InnerFanOut = "lead" | "top2";

export interface MemoryBackfillState {
  running: boolean;
  processed: number;
  total: number;
  lastError: string | null;
  stoppedNote?: string | null;
  preparing?: boolean;
}

export interface CanonSource {
  store: "memory" | "ledger" | "epistemic" | "scene" | "blackboard";
  id: string;
  provenance?: Provenance;
}

// A host effect, and what it did to a shared resource.
//
// `target` is a STABLE identity, never a display name: a group member is its chid, a World Info
// entry is its book's file id and uid, the Author's Note is a slot, a background is the file ST
// actually selected, a preset is its name plus the backend it was applied to.
export const EFFECT_LEDGER_LIMIT = 200;

export type EffectLedgerStatus = "pending" | "applied" | "failed" | "reverted" | "revert-failed" | "externally-changed";

export type EffectTarget =
  | { kind: "cast"; group: string; member: string }
  | { kind: "wi"; book: string; uid: number | null; entry: string }
  | { kind: "an" }
  | { kind: "background" }
  | { kind: "preset"; name: string; api: string }
  | { kind: "extension"; name: string };

export interface EffectLedgerRow {
  id: string;
  effect: string;
  target: EffectTarget;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  checkpointId: string | null;
  boundary: number;
  messageId: number;
  at: string;
  status: EffectLedgerStatus;
  /** Why it failed, or what the host said instead of what we wrote. */
  reason?: string;
  /** Compare-and-set, applied here: what a revert found instead of `after`. */
  found?: Record<string, unknown> | null;
}

export interface EffectsRuntimeState {
  ledger: EffectLedgerRow[];
  /** This chat's own cast, mirrored per chat. The group is never the truth. */
  cast: Array<{ member: string; disabled: boolean }>;
}

// Whether the chat's own state actually reached the server, which
// `saveMetadata` cannot say: it catches its own errors and returns normally.
export type SaveOutcome = "applied" | "unconfirmed" | "unsaved";

export interface SaveHealth {
  lastAppliedBoundary: number | null;
  pendingBoundary: number | null;
  /** The verdict of the LAST save. `unsaved` is the one that is evidence of a lost write — a read-back
   *  that could not say anything is `unconfirmed`, which is a different finding and must not refuse a
   * caller's work (the conflict queue reads this to decide whether an author's decision was written). */
  lastOutcome: SaveOutcome | null;
  consecutiveFailures: number;
  lastReason: string | null;
  lastFailureAt: string | null;
}

export interface CanonState {
  text: string;
  inputHash: string;
  updatedAt: string;
  checkpointId?: string;
  /** A decided conflict or a rollback changed what this text was built from, so it is
   *  held out of play until the next pass re-derives it. */
  stale?: boolean;
  /** What the text was built from, with each input's envelope AT THE TIME it was read.
   *  The canon is prose, so its sentences cannot carry envelopes of their own; this is what a reader
   *  can check against, and what says the text is derived rather than read. */
  sources?: CanonSource[];
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
  /** Every artifact a pass derived here, with the rows it was built from and the rows
   *  it took away, so a rollback past its input can drop it and restore what it removed. */
  derived: DerivedRecord[];
  /** Disagreements between two stores, waiting for the author. Both sides are marked
   *  `conflicted` while they sit here, so neither steers a reply. */
  conflicts: ConflictPair[];
  /** Conflict keys the author already decided, so a resolved pair does not re-queue on the next
   *  pass. */
  resolvedConflicts: string[];
  /** Pinned rows the injection budget could not fit, so the author is told
   *  instead of losing them quietly. */
  pinnedOverflow: number;
  /** The first message this story's play covers in this chat: the player's last message when it
   *  started, or 0 before the player spoke. The first scene summary starts here; earlier history is the backlog's. */
  storyStart: number;
  innerBeats?: InnerBeat[];
  chapters?: ChapterRecord[];
  chronicle?: ChronicleState;
  chapterSealSkip?: SealSkip | null;
  updatedAt: string;
}

export interface PacingSettings {
  alpha: number;
  shapeOverride: ArcTemplate | null;
  hintEnabled: boolean;
}

export interface TensionHistoryRow {
  messageId: number;
  level: TensionLevel;
  smoothed: number;
}

export interface TensionRuntimeState {
  levels: TensionLevel[];
  smoothed: number | null;
  /** The committed level per reply that moved it, so a timeline can place pacing under its message. */
  history: TensionHistoryRow[];
}

export interface ExtractionRuntimeSettings {
  enabled: boolean;
  profileId: string | null;
  fallbackProfileId?: string | null;
  /** Install-wide per-role profiles; an unset role uses `profileId`. */
  profiles?: PassProfiles;
  routes?: RoleRoutes;
  reasoningBudget?: ReasoningBudget;
  replyEffort?: ReplyEffort;
  cadence: number;
  stabilityLag: number;
}

export interface ExtractionRuntimeState {
  cardScopeCursor?: number;
  settings: ExtractionRuntimeSettings;
  audits: SharedReadAudit[];
  reconciliationEvents: ReconciliationEvent[];
  lastReadBoundary: number;
  scheduler: { queueDepth: number; inFlight: boolean; lastError: string | null; rereadReason?: string | null };
  judgedReads: JudgedReadRecord[];
}

// One row per judged read that is not part of an LLM read (every boundary, stall
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
  pinnedStory: Record<string, unknown>;
  playedVersion: number;
  contentHashAtLoad: string;
  engineState: EngineState;
  // The bounded boundary log and the floor it reaches.
  engineHistory: EngineHistory;
  extras: RuntimeExtras;
  // Absent when the capture had nothing to fingerprint; absent reads as unknown, never a mismatch.
  fingerprints?: MessageFingerprints;
}

export interface StoryOrchestratorMetadataBlob {
  version: typeof BLOB_VERSION;
  /**
   * The chat this blob belongs to.
   *
   * `chat_metadata` is handed to us by SillyTavern, and the host swaps it when the chat changes.
   * Without a stamp there is no way to tell a blob that belongs here from one the host has just
   * swapped in or out from under a read. A stored blob without one is unreadable.
   */
  chatId: string;
  // `chat_metadata.integrity` at the last own save. Advisory: it only tells a branch from a
  // foreign blob, and a same-chat reload from a switch.
  integrity?: string | null;
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

/** The gate advance that moved this chat into the checkpoint it stands on, for the author's recovery. */
export interface LastFiredTransition {
  from: string;
  to: string;
  /** The gate qualities that opened it; a step-back resets these so it cannot re-fire. */
  keys: string[];
  checkpointName: string;
}

export interface RuntimeSnapshot {
  ready: boolean;
  storyId: string | null;
  storyHash: string | null;
  storyIdentity: StoryIdentity;
  blobUnreadable?: { foundVersion: number | string | null; notice: string } | null;
  /** Mirror books of deleted chats this session did not delete (session-scoped). */
  orphanedLorebooks?: OrphanedLorebook[];
  /** What the reaper decided for deleted chats this session, each naming its deleted chat; never in a chat's journal. */
  reapDecisions?: ReapDecision[];
  /** Set while no story is loaded and the chat holds a branch's or another chat's state. */
  chatIdentity?: ChatIdentitySnapshot | null;
  storyTitle: string | null;
  storyDescription: string | null;
  publicStoryIntro?: string | null;
  imageStory?: { checkpoints: boolean; scenes: boolean } | null;
  /** What the image service can currently do, published by the image director for the Repair checks. */
  imageHealth?: ImageHealthView | null;
  /** Install image choices that named a retired model and now use the default. */
  imageRetired?: Array<{ where: string; was: string }>;
  spriteLookIssues?: SpriteLookIssue[];
  activeCheckpointId: string | null;
  activeCheckpointName: string | null;
  activeObjective: string | null;
  boundary: number;
  blackboard: Record<string, PrimitiveValue>;
  blackboardMeta: Record<string, { version: number; latched: boolean; source: string; evidence?: string; reader?: "judge" | "llm"; confidence?: number }>;
  checkpoints: Array<{ id: string; name: string; objective: string; active: boolean; visited: boolean }>;
  requirements: RequirementsState;
  validationErrors: ValidationError[];
  library: StoryLibraryRecord[];
  status: string;
  noChat?: { notice: string } | null;
  noGroup?: NoGroupView | null;
  dismissedChecks?: string[];
  extraction: ExtractionRuntimeState;
  expansion: ExpansionRuntimeState;
  memory: MemoryRuntimeState;
  chapters?: ChapterView;
  pacing: PacingSettings;
  copilot: CopilotRuntimeSettings;
  ui: UiRuntimeSettings;
  talk: TalkRuntimeState;
  stagecraft: StagecraftRuntimeState;
  effects: EffectsRuntimeState;
  saveHealth: SaveHealth;
  scene: SceneReadRecord | null;
  loreForced: JudgeCallRecord | null;
  /** This chat's judge spend, monotonic and exempt from rollback. */
  judgeMeter: JudgeMeterView;
  /** What the last loud generation's scans activated, and books a foreign filter hid. */
  loreEvidence?: LoreEvidenceView;
  /** Spike (author only): the last gated scan, per gated entry; null unless scan gating is active. */
  scanGate?: ScanGateView | null;
  /** Lorebook gating mode, ledger summary and drift (install-wide). */
  wiGating?: WiGatingStatus | null;
  globalStoryLore?: string[];
  /** Transcript copiers switched on while a group plays a story, held secret or not: the player alert must not reveal that one is held. */
  secretLeaks?: string[];
  /** Author only: a `[hiding]`/`[unaware]` secret is held right now. Never read by player copy. */
  secretsHeld?: boolean;
  thinkingSilent?: boolean;
  competingScenarios?: string[];
  briefing?: BriefingState | null;
  /** The sampler overlay this checkpoint put on its replies, or null. */
  samplerOverlay?: SamplerOverlayView | null;
  // The story's authored curator allowlist, so the review panel can say what is in scope without
  // reading the story record itself.
  stagecraftScope: string[];
  innerCast?: CastVoice[];
  pendingDeltas: PendingDeltaReadout[];
  gateQualities?: string[];
  convergence: ConvergenceReadout[];
  tension: {
    level: TensionLevel | null;
    smoothed: number | null;
    expected: number | null;
    hint: SteeringHint | null;
  };
  /** The agency policy in effect for the active checkpoint, defaults included, so
   *  the drawer's author view can show what steering is being told to respect. */
  agency: AgencyPolicy;
  /** The player has refused the prepared route twice over, and the author is owed
   *  a move. Null when play is moving normally. */
  agencyRecovery: AgencyRecovery | null;
  pipeline: PipelineStatus;
  extractionHealth?: ExtractionHealth | null;
  narrative: NarrativeStatus;
  lastRollback: RollbackNotice | null;
  /** Display names keyed by avatar file, avatar stem and roster id, for player-facing cast lines. */
  castNames?: Record<string, string>;
  rollbackUnavailable: RollbackUnavailable | null;
  ledger: LedgerView[];
  /** Each memory row's fate and each tier's trim, from the last injection (author view, in memory only). */
  memoryInjection: MemoryInjectionView | null;
  lastFired: LastFiredTransition | null;
  driver: DriverContext | null;
  activeNudge: string | null;
  payloadCaptures: PayloadCapture[];
  /** What the next reply will receive, one row per injected block. */
  nextTurn: NextTurnContributor[];
  authorMoves?: JournalRecord[];
  /** Other extensions' blocks beside ours, read-only and never persisted. */
  nextTurnForeign: NextTurnForeignRow[];
  /** The story blocks' tokens as a share of the main API's prompt budget. */
  nextTurnCost: NextTurnCost;
  /** Which cited messages still read as a boundary fingerprinted them. */
  chatJump: ChatJumpIndex;
  /** Which profile each family of passes asks, and whether it answers. */
  roleRoutes?: RoleRouteView[];
  modelCalls?: ModelCallRow[];
  modelCallRing?: ModelCallRecord[];
  nextTurnBuckets?: PromptBucketState;
  nextTurnFold?: number;
  /** World Info activations persisted per rendered reply. */
  lore: LoreRuntimeState;
  /** The inline timeline: every item anchored under the message it is about, before the level filter. */
  inline: InlineView;
  /** One roll store: quality rolls reconstructed from the seed, NPC and talk draws from the ring. Author-only surfaces. */
  rolls?: RollRecord[];
  presence?: PresenceView;
}

export interface LoadedStory {
  record: StoryLibraryRecord;
  story: NormalizedStoryV2;
}
