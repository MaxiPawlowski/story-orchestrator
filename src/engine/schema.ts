export const QUALITY_TYPES = ["int", "float", "bool", "enum", "string"] as const;
export const QUALITY_SOURCES = ["code", "extractor"] as const;
export const EVIDENCE_FROM = ["any", "world", "party"] as const;
export const GATE_OPERATORS = ["==", "!=", ">=", "<=", ">", "<", "in"] as const;
export const TENSION_LEVELS = ["calm", "stirring", "tense", "critical", "peak"] as const;
export const GENERATED_CHECKPOINT_PREFIX = "gen_";
// A latching enum freezes on the first read, so a value meaning "not set yet"
// freezes the quality on it forever. The unset state is the absence of a value; listing one of these
// as an option makes the first read a decision nobody made.
export const PLACEHOLDER_ENUM_VALUES = ["undecided", "none", "pending", "unset", "tbd"] as const;
export const ARC_TEMPLATE_NAMES = ["rising", "fall_recovery", "three_act"] as const;
export const TENSION_CURRENT_KEY = "tension_current";
export const TENSION_FRESH_MESSAGES = 3;
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

// How a quality opts in to the judged typed read (never inferred).
export type QualityReadAs = "choice" | "stated" | "rating";

export interface QualityCriterion {
  what: string;
  not_for?: string;
  examples?: string[];
}

export interface QualityRatingLevel {
  value: number;
  label: string;
}

export type QualityCriteria = Record<string, string | QualityCriterion> | { levels: QualityRatingLevel[] };

export const ROLL_TYPES = ["bool", "int"] as const;

export interface QualityRoll {
  sides: number;
  target: number;
}

export interface Quality {
  key: string;
  type: QualityType;
  values?: string[];
  player_labels?: Record<string, string>;
  source: QualitySource;
  latching?: boolean;
  monotonic?: boolean;
  rubric: string;
  scope_hint?: QualityScopeHint;
  ledger_binding?: QualityLedgerBinding;
  read_as?: QualityReadAs;
  criteria?: QualityCriteria;
  evidence_from?: EvidenceFrom;
  /**
   * A regex an extractor delta's quoted evidence must match before it may set this quality. It marks
   * a value whose whole meaning is that something was COMMITTED to (taking a posting, swearing an
   * oath): a latching gate read from a scene aside otherwise advances the story on a model mistake.
   * Absent means any evidence is accepted, as before.
   */
  commit_evidence?: string;
  roll?: QualityRoll;
}

export type EvidenceFrom = typeof EVIDENCE_FROM[number];

export const PARTY_LOCATION_KEY = "location";

export const readsWorldEvidence = (quality: Pick<Quality, "evidence_from">): boolean => quality.evidence_from === "world" || quality.evidence_from === "party";

export const movesParty = (quality: Pick<Quality, "key" | "evidence_from">): boolean =>
  quality.evidence_from === "party" || (quality.evidence_from === "world" && quality.key === PARTY_LOCATION_KEY);

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
  reasoning?: CheckpointReasoning;
  scenario?: string | null;
}

export const CHECKPOINT_REASONING = ["off", "low", "medium", "high"] as const;

export type CheckpointReasoning = (typeof CHECKPOINT_REASONING)[number];

// Deterministic stagecraft (spec addendum §Stagecraft): the checkpoint names a background and the
// boundary switches to it. A bare string authored form normalizes into this shape at parse time.
export interface BackgroundEffect {
  name: string;
}

export interface NpcReplyEffect {
  trigger: NpcReplyTrigger;
  member: string;
  kind: NpcReplyKind;
  new_chat_only?: boolean;
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

// How a scene answers a single player message with more than one voice. `director` asks the judge
// for each next speaker and stops when it hands back to the player; `scripted` walks `sequence` in
// order. Absent means the system defaults apply (chaining on, max 3), so a declared talk_control
// opts in unless it turns this off.
export const TALK_CHAIN_MAX_DEFAULT = 3;
export const TALK_CHAIN_MAX_CAP = 8;

export interface TalkControlChain {
  mode?: "director" | "scripted";
  max?: number;
  sequence?: string[];
  stop_on_transition?: boolean;
  hold_extraction?: boolean;
  stop_on_player?: boolean;
}

export interface TalkControl {
  speakers?: TalkControlSpeaker[];
  lead?: string;
  no_repeat?: boolean;
  allow_silence?: boolean;
  director?: boolean | TalkControlDirector;
  chain?: TalkControlChain | false;
}

// Which objectives are the world pressing on the player and which need the
// player's own act, and whether narration may write the player's decisions. Optional per checkpoint;
// the DEFAULTS are the policy, not "absent = today's phrasing" (spec addendum §Agency).
export type ObjectiveKind = "world_pressure" | "player_action";

export interface AgencyPolicy {
  protect_player_choice: boolean;
  never_narrate_player_action: boolean;
  objective_kind: ObjectiveKind;
  /** Optional: the checkpoint to fall back to when the player refuses the prepared route. */
  alternate?: string;
  player_attempts_only?: boolean;
}

export interface Checkpoint {
  id: string;
  name: string;
  objective: string;
  player_name?: string;
  player_text?: string;
  type: "anchor" | "intermediate";
  start?: boolean;
  state_snapshot?: Record<string, PrimitiveValue>;
  tension_target?: TensionLevel;
  target_turn_length?: number;
  effects?: CheckpointEffects;
  talk_control?: TalkControl;
  agency?: Partial<AgencyPolicy>;
  guidance?: string | MemberGuidance;
  convergence_threshold?: number;
  motives?: Record<string, string>;
  chapter?: string;
  illustrate?: false;
}

export interface MemberGuidance {
  all?: string;
  members: Record<string, string>;
}

export const CHAPTER_KINDS = ["chapter", "interlude"] as const;
export type ChapterKind = typeof CHAPTER_KINDS[number];
export const OPEN_THREAD_POLICIES = ["carry", "close", "decide"] as const;
export type OpenThreadPolicy = typeof OPEN_THREAD_POLICIES[number];
export const RECORD_STYLES = ["prose", "chronicle"] as const;
export type RecordStyle = typeof RECORD_STYLES[number];

export interface ChapterSealPolicy {
  open_threads?: OpenThreadPolicy;
  keep_tail?: number;
  fold_messages?: boolean;
  record_style?: RecordStyle;
}

export interface Chapter {
  id: string;
  title: string;
  player_title?: string;
  kind?: ChapterKind;
  seal?: ChapterSealPolicy;
  final?: boolean;
  illustrations?: IllustrationLook;
  briefing?: StoryBriefing;
}

export const STORY_SO_FAR_MODES = ["block", "macro", "off"] as const;
export type StorySoFarMode = typeof STORY_SO_FAR_MODES[number];

export interface StoryMemoryOptions {
  story_so_far?: StorySoFarMode;
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

export const ROSTER_VIEWS = ["own", "omniscient"] as const;
export type RosterView = (typeof ROSTER_VIEWS)[number];

export interface RosterMember {
  id: string;
  name?: string;
  role?: string;
  drive?: string;
  view?: RosterView;
  aliases?: string[];
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

// What a story needs from the install before it can run. One vocabulary: any other key is a
// validation error.
export interface StoryRequirements {
  personas?: string[];
  members?: string[];
  lorebooks?: string[];
}

// The explicit allowlist a background curator may write into (user decision). No
// inference from requirements or effects: an absent or empty list means the curator has nothing to
// write, full stop.
export interface StoryStagecraft {
  lorebooks: string[];
  exclude?: StagecraftExclusion[];
}

export interface StagecraftExclusion {
  lorebook: string;
  comments: string[];
}

export interface IllustrationLook {
  style?: string;
  appearances?: Record<string, string>;
}

export interface StoryIllustrations extends IllustrationLook {
  checkpoints?: boolean;
  scenes?: boolean;
}

// The scene read's vocabulary. The judge can only select, so a location is asked only
// when the story lists places (here, or as the values of an enum quality keyed `location`).
export interface StorySceneRead {
  locations?: string[];
  times?: string[];
  inject?: boolean;
}

// Which lorebooks lore-select may judge and force for one generation. Authored, never
// inferred: entry text leaves the machine.
export interface StoryLoreSelect {
  lorebooks: string[];
  top_k?: number;
  min_p?: number;
  exclusive?: boolean;
}

export const BRIEFING_MAX_SECTIONS = 6;
export const BRIEFING_SECTION_MAX_CHARS = 1200;
export const BRIEFING_HEADING_MAX_CHARS = 80;
export const BRIEFING_LINE_MAX_CHARS = 240;
export const BRIEFING_LABEL_MAX_CHARS = 40;

export interface BriefingSection {
  heading: string;
  text: string;
}

export interface StoryBriefing {
  title?: string;
  image?: string;
  sections: BriefingSection[];
  tone?: string;
  start_label?: string;
}

export const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// The id is the story's identity: derived from the title until the author fixes it, and the library
// keys by it forever after (spec addendum §Story identity). The Studio and an id-less import share it.
export const slugifyStoryId = (title: string): string =>
  title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z0-9]+|-+$/g, "").slice(0, 64) || "story";

// What the narrator is held to, story-level only. Sent to the judge only when
// judge.uses.houseRules is on; absent means no rules (today).
export const HOUSE_RULES_MAX = 8;
export const HOUSE_RULE_MAX_CHARS = 240;

export interface StoryV2 {
  format: 2;
  id?: string;
  version?: number;
  title: string;
  description: string;
  player_intro?: string;
  briefing?: StoryBriefing;
  illustrations?: StoryIllustrations;
  qualities: Quality[];
  checkpoints: Checkpoint[];
  transitions: Transition[];
  roster: RosterMember[];
  arc_template?: ArcTemplate;
  arc_bridges?: ArcBridge[];
  requirements?: StoryRequirements;
  stagecraft?: StoryStagecraft;
  scene_read?: StorySceneRead;
  lore_select?: StoryLoreSelect;
  house_rules?: string[];
  scaffolding?: Record<string, Scaffolding>;
  objective_block?: "auto" | "off";
  display?: StoryDisplay;
  chapters?: Chapter[];
  memory?: StoryMemoryOptions;
}

export interface StoryDisplay {
  lore_names_public?: boolean;
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
  chapterById?: Record<string, Chapter>;
  chapterByCheckpoint?: Record<string, string>;
}

export interface ValidationError {
  path: string;
  message: string;
}

export const placeholderEnumValues = (quality: Pick<Quality, "type" | "latching" | "values">): string[] =>
  quality.type === "enum" && quality.latching === true
    ? (quality.values ?? []).filter((value) => (PLACEHOLDER_ENUM_VALUES as readonly string[]).includes(value.trim().toLowerCase()))
    : [];

// What a story may play with but should not ship with. The parser answers a story or its
// errors, so the warnings are their own read of the parsed story, shared by the Studio's diagnostic
// and the import path.
export const storyWarnings = (story: Pick<StoryV2, "qualities">): ValidationError[] =>
  story.qualities.flatMap((quality, index) => {
    const placeholders = placeholderEnumValues(quality);
    return placeholders.length
      ? [{
        path: `qualities.${index}.values`,
        message: `'${quality.key}' latches, so the first read decides and will not change; ${placeholders.join(", ")} cannot mean "not set yet" — the unset state is the absence of a value`,
      }]
      : [];
  });

export const isValidationErrorList = (value: unknown): value is ValidationError[] => {
  return Array.isArray(value) && value.every((entry) => {
    return Boolean(entry) && typeof entry === "object" && typeof (entry as ValidationError).path === "string";
  });
};
