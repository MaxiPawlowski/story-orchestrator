import type { ArcTemplate, EngineState, NormalizedStoryV2, PrimitiveValue, TensionLevel, ValidationError } from "@engine/index";
import type { ParsedFact, SharedReadAudit } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type { SteeringHint } from "@pacing/index";

export interface StoryLibraryRecord {
  hash: string;
  title: string;
  description: string;
  raw: unknown;
  importedAt: string;
}

export interface RequirementsState {
  ready: boolean;
  missingPersonas: string[];
  missingMembers: string[];
  missingLorebooks: string[];
}

export interface RuntimeExtras {
  firedNpcReplies: Record<string, number>;
  requirements: RequirementsState;
  lastAppliedCheckpointId: string | null;
  lastSelfInjectionMessageId: number | null;
  extraction: ExtractionRuntimeState;
  expansion: ExpansionRuntimeState;
  pacing: PacingSettings;
  tension: TensionRuntimeState;
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
  facts: ParsedFact[];
  audits: SharedReadAudit[];
  lastReadBoundary: number;
  scheduler: { queueDepth: number; inFlight: boolean; lastError: string | null };
}

export interface PersistedStoryRuntime {
  storyHash: string;
  storyTitle: string;
  engineState: EngineState;
  extras: RuntimeExtras;
}

export interface StoryOrchestratorMetadataBlob {
  version: 2;
  selectedStoryHash: string | null;
  stories: Record<string, PersistedStoryRuntime>;
}

export interface RuntimeSnapshot {
  ready: boolean;
  storyHash: string | null;
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
  pacing: PacingSettings;
  tension: {
    level: TensionLevel | null;
    smoothed: number | null;
    expected: number | null;
    hint: SteeringHint | null;
  };
}

export interface LoadedStory {
  record: StoryLibraryRecord;
  story: NormalizedStoryV2;
}
