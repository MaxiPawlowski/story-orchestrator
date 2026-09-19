export const QUALITY_TYPES = ["int", "float", "bool", "enum", "string"] as const;
export const QUALITY_SOURCES = ["code", "extractor"] as const;
export const GATE_OPERATORS = ["==", "!=", ">=", "<=", ">", "<", "in"] as const;
export const TENSION_LEVELS = ["calm", "stirring", "tense", "critical", "peak"] as const;
export const ARC_TEMPLATE_NAMES = ["rising", "fall_recovery", "three_act"] as const;
export const TENSION_CURRENT_KEY = "tension_current";
export const NPC_REPLY_TRIGGERS = ["onEnter", "afterSpeak", "sceneBreak"] as const;
export const NPC_REPLY_KINDS = ["scripted", "llm"] as const;

export type QualityType = typeof QUALITY_TYPES[number];
export type QualitySource = typeof QUALITY_SOURCES[number];
export type GateOperator = typeof GATE_OPERATORS[number];
export type TensionLevel = typeof TENSION_LEVELS[number];
export type ArcTemplateName = typeof ARC_TEMPLATE_NAMES[number];
export interface ArcTemplatePoints {
  points: Array<{ at: number; tension: number }>;
}
export type ArcTemplate = ArcTemplateName | ArcTemplatePoints;
export type NpcReplyTrigger = typeof NPC_REPLY_TRIGGERS[number];
export type NpcReplyKind = typeof NPC_REPLY_KINDS[number];
export type PrimitiveValue = string | number | boolean;

export interface QualityScopeHint {
  from?: string;
  until?: string;
}

export interface QualityLedgerBinding {
  entity: string;
  field: string;
}

export interface Quality {
  key: string;
  type: QualityType;
  values?: string[];
  source: QualitySource;
  latching?: boolean;
  monotonic?: boolean;
  rubric: string;
  scope_hint?: QualityScopeHint;
  ledger_binding?: QualityLedgerBinding;
}

export type GateNode = GateLeaf | GateAll | GateAny | GateNot;

export interface GateLeaf {
  q: string;
  op: GateOperator;
  v: PrimitiveValue | PrimitiveValue[];
}

export interface GateAll {
  all: GateNode[];
}

export interface GateAny {
  any: GateNode[];
}

export interface GateNot {
  not: GateNode;
}

export interface CheckpointEffects {
  author_note?: unknown;
  preset?: unknown;
  world_info?: unknown;
  cast_changes?: unknown;
  npc_replies?: NpcReplyEffect[];
  background?: BackgroundEffect;
}

// Deterministic stagecraft (spec addendum §Stagecraft): the checkpoint names a background and the
// boundary switches to it. A bare string authored form normalizes into this shape at parse time.
export interface BackgroundEffect {
  name: string;
}

export interface NpcReplyEffect {
  trigger: NpcReplyTrigger;
  member: string;
  kind: NpcReplyKind;
  text?: string;
  instruction?: string;
  maxTriggers?: number;
  probability?: number;
  after_member?: string;
  enabled?: boolean;
}

export interface TalkControlSpeaker {
  member: string;
  weight?: number;
}

export interface TalkControlDirector {
  instruction?: string;
}

export interface TalkControl {
  speakers?: TalkControlSpeaker[];
  lead?: string;
  no_repeat?: boolean;
  allow_silence?: boolean;
  director?: boolean | TalkControlDirector;
}

export interface Checkpoint {
  id: string;
  name: string;
  objective: string;
  type: "anchor" | "intermediate";
  start?: boolean;
  state_snapshot?: Record<string, PrimitiveValue>;
  tension_target?: TensionLevel;
  target_turn_length?: number;
  effects?: CheckpointEffects;
  talk_control?: TalkControl;
  guidance?: string;
  convergence_threshold?: number;
}

export interface TransitionEffects {
  progress?: {
    anchor: string;
    amount: number;
  };
}

export interface Transition {
  from: string;
  to: string;
  gate: GateNode;
  priority: number;
  effects?: TransitionEffects;
  extractor_trigger?: string;
  extraction_hint?: string;
}

export interface RosterMember {
  id: string;
  name?: string;
}

export interface ScaffoldingBeat {
  objective: string;
  gate?: GateNode;
  state_snapshot?: Record<string, PrimitiveValue>;
  tension_target?: TensionLevel;
  guidance?: string;
  outcomes: ScaffoldingOutcome[];
}

export interface ScaffoldingDelta {
  q: string;
  v: PrimitiveValue;
}

export interface ScaffoldingOutcome {
  label: string;
  gate: GateNode;
  deltas?: ScaffoldingDelta[];
  progress?: {
    anchor: string;
    amount: number;
  };
}

export interface Scaffolding {
  beats: ScaffoldingBeat[];
  basis: Record<string, PrimitiveValue>;
  needs_review?: boolean;
}

export interface ArcBridge {
  arcMatch: string;
  anchor: string;
  amount: number;
}

// What a story needs from the install before it can run. Authored aliases (persona, groupMembers,
// global_lorebooks) normalize into this shape at parse time, so every reader sees one vocabulary.
export interface StoryRequirements {
  personas?: string[];
  members?: string[];
  lorebooks?: string[];
}

// The explicit allowlist a background curator may write into (user decision 2026-08-11). No
// inference from requirements or effects: an absent or empty list means the curator has nothing to
// write, full stop.
export interface StoryStagecraft {
  lorebooks: string[];
}

export const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface StoryV2 {
  format: 2;
  id?: string;
  version?: number;
  title: string;
  description: string;
  qualities: Quality[];
  checkpoints: Checkpoint[];
  transitions: Transition[];
  roster: RosterMember[];
  arc_template?: ArcTemplate;
  arc_bridges?: ArcBridge[];
  requirements?: StoryRequirements;
  stagecraft?: StoryStagecraft;
  scaffolding?: Record<string, Scaffolding>;
}

export interface NormalizedTransition extends Transition {
  declarationIndex: number;
}

export interface NormalizedStoryV2 extends StoryV2 {
  version: number;
  startCheckpointId: string;
  checkpointById: Record<string, Checkpoint>;
  outgoingByCheckpoint: Record<string, NormalizedTransition[]>;
  qualityByKey: Record<string, Quality>;
  reachableByCheckpoint: Record<string, string[]>;
}

export interface ValidationError {
  path: string;
  message: string;
}

export const isValidationErrorList = (value: unknown): value is ValidationError[] => {
  return Array.isArray(value) && value.every((entry) => {
    return Boolean(entry) && typeof entry === "object" && typeof (entry as ValidationError).path === "string";
  });
};
