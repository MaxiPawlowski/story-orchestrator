import type {
  AuthorNotePosition,
  AuthorNoteRole,
  PresetOverrides,
  Role,
  RolePresetOverrides,
  TalkControlTrigger,
  TransitionTrigger as StoryTransitionTrigger,
} from "./story-schema";

export interface NormalizedWorldInfo {
  activate: string[];
  deactivate: string[];
}

export interface NormalizedAuthorNoteSettings {
  position: AuthorNotePosition;
  interval: number;
  depth: number;
  role: AuthorNoteRole;
}

export interface NormalizedAuthorNote extends NormalizedAuthorNoteSettings {
  text: string;
}

export interface NormalizedCheckpointStub {
  isStub: true;
  stubName?: string;
}

export interface NormalizedCheckpoint {
  id: string;
  name: string;
  objective: string;
  authors_note?: Partial<Record<Role, NormalizedAuthorNote>>;
  world_info?: NormalizedWorldInfo;
  preset_overrides?: RolePresetOverrides;
  arbiter_preset?: PresetOverrides;
  automations?: string[];
  talkControl?: NormalizedTalkControlCheckpoint;
  stub?: NormalizedCheckpointStub;
}

export type NormalizedTriggerType = "regex" | "timed";

export interface NormalizedTransitionTrigger {
  id?: string;
  type: NormalizedTriggerType;
  regexes: RegExp[];
  withinTurns?: number;
  condition?: string;
  raw: StoryTransitionTrigger;
}

export interface NormalizedTransition {
  id: string;
  from: string;
  to: string;
  trigger: NormalizedTransitionTrigger;
  label?: string;
  description?: string;
}

export interface NormalizedTalkControlReplyContent {
  kind: "static" | "llm";
  text?: string;
  instruction?: string;
}

export interface NormalizedTalkControlReply {
  memberId: string;
  normalizedId: string;
  speakerId: string;
  normalizedSpeakerId: string;
  enabled: boolean;
  trigger: TalkControlTrigger;
  probability: number;
  maxTriggers?: number;
  content: NormalizedTalkControlReplyContent;
}

export interface NormalizedTalkControlCheckpoint {
  replies: NormalizedTalkControlReply[];
  repliesByTrigger: Map<TalkControlTrigger, NormalizedTalkControlReply[]>;
}

export interface NormalizedTalkControl {
  checkpoints: Map<string, NormalizedTalkControlCheckpoint>;
}

export interface NormalizedStoryExpansionMetadata {
  premise?: string;
  roadmap?: string;
}

export interface NormalizedStory {
  schemaVersion: "2.0";
  title: string;
  description?: string;
  global_lorebook: string;
  roles?: Partial<Record<Role, string>>;
  defaults?: {
    author_note: NormalizedAuthorNoteSettings;
    presets?: RolePresetOverrides;
  };
  checkpoints: NormalizedCheckpoint[];
  transitions: NormalizedTransition[];
  startId: string;
  talkControl?: NormalizedTalkControl;
  expansion?: NormalizedStoryExpansionMetadata;
}

export type CheckpointResult =
  | { file: string; ok: true; json: NormalizedStory }
  | { file: string; ok: false; error: unknown };

export function isNormalizedStubCheckpoint(
  checkpoint: NormalizedCheckpoint | null | undefined,
): checkpoint is NormalizedCheckpoint & { stub: NormalizedCheckpointStub } {
  return checkpoint?.stub?.isStub === true;
}

export function getNormalizedStubCheckpointName(
  checkpoint: NormalizedCheckpoint | null | undefined,
): string | undefined {
  const stubName = checkpoint?.stub?.stubName?.trim();
  return stubName || undefined;
}
