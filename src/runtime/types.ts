import type { EngineState, NormalizedStoryV2, PrimitiveValue, ValidationError } from "@engine/index";

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
  updatedAt: string;
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
  blackboardMeta: Record<string, { version: number; latched: boolean; source: string }>;
  checkpoints: Array<{ id: string; name: string; objective: string; active: boolean; visited: boolean }>;
  requirements: RequirementsState;
  validationErrors: ValidationError[];
  library: StoryLibraryRecord[];
  status: string;
}

export interface LoadedStory {
  record: StoryLibraryRecord;
  story: NormalizedStoryV2;
}
