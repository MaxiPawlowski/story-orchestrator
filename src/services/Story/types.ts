// src/services/story/types.ts
import type {
  Story as StoryPreset,
  Role,
  Checkpoint,
} from '@services/SchemaService/story-schema';
import type {
  NormalizedStory,
  NormalizedCheckpoint,
} from '@services/SchemaService/story-validator';
import type { PresetPartial } from '../PresetService';

export type StoryInput = StoryPreset | NormalizedStory;
export type CheckpointInput =
  | Checkpoint
  | NormalizedCheckpoint
  | (Checkpoint & NormalizedCheckpoint);

export type OnActivateInput = any;

export type EvaluationOutcome = 'win' | 'fail' | 'continue';
export type EvaluationTriggerReason = 'win-trigger' | 'fail-trigger' | 'turn-interval';
export type YesNo = 'YES' | 'NO';

export interface ModelEvaluationResponse {
  completed: YesNo;
  failed: YesNo;
  reason?: string;
  confidence?: number;
}

export interface EvaluationRequest {
  reason: EvaluationTriggerReason;
  turn: number;
  text: string;
  matchedPattern?: string;
  timestamp: number;
}

export interface EvaluationDetails {
  request: EvaluationRequest;
  raw: string;
  parsed: ModelEvaluationResponse | null;
  outcome: EvaluationOutcome;
  completed: boolean;
  failed: boolean;
  error?: unknown;
}

export interface OrchestratorDeps {
  presetService: {
    initForStory(): Promise<void> | void;
    applyForRole(role: Role, overrides: PresetPartial, cpName?: string): Record<string, any>;
  };
  applyAuthorsNote: (note: any) => void;
  applyWorldInfo: (ops: any) => void;
  runAutomation?: (id: string) => Promise<void> | void;
}

export interface OrchestratorOptions {
  evaluationTurnInterval?: number; // default 3
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: any) => void;
}
