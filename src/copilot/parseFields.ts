import {
  ARC_TEMPLATE_NAMES,
  EVIDENCE_FROM,
  GATE_OPERATORS,
  NPC_REPLY_KINDS,
  NPC_REPLY_TRIGGERS,
  QUALITY_READ_AS,
  QUALITY_SOURCES,
  QUALITY_TYPES,
  TENSION_LEVELS,
  type ArcBridge,
  type ArcTemplate,
  type ArcTemplateName,
  type Checkpoint,
  type CheckpointEffects,
  type GateNode,
  type GateOperator,
  type NpcReplyEffect,
  type NpcReplyKind,
  type NpcReplyTrigger,
  type PrimitiveValue,
  type Quality,
  type QualityCriteria,
  type QualityReadAs,
  type QualityLedgerBinding,
  type QualityScopeHint,
  type QualitySource,
  type QualityType,
  type RosterMember,
  type StoryRequirements,
  type TensionLevel,
  type Transition,
  type TransitionEffects,
} from "@engine/index";
import { readChanceRoll } from "@engine/chance";
import type { TransitionRef } from "./types";
import { isRecord } from "@utils/guards";
import { nearestKey } from "@utils/levenshtein";

const isPrimitive = (value: unknown): value is PrimitiveValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const isPrimitiveOrArray = (value: unknown): value is PrimitiveValue | PrimitiveValue[] => isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive));

export const readGate = (value: unknown, path: string, issues: string[]): GateNode | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: gate must be an object`);
    return null;
  }
  if ("q" in value || "op" in value || "v" in value) {
    const okQ = typeof value.q === "string" && value.q.length > 0;
    const okOp = typeof value.op === "string" && (GATE_OPERATORS as readonly string[]).includes(value.op);
    const okV = isPrimitiveOrArray(value.v);
    if (!okQ) issues.push(`${path}.q: required quality key`);
    if (!okOp) issues.push(`${path}.op: invalid operator`);
    if (!okV) issues.push(`${path}.v: invalid value`);
    if (!okQ || !okOp || !okV) return null;
    return { q: value.q as string, op: value.op as GateOperator, v: value.v as PrimitiveValue | PrimitiveValue[] };
  }
  if (Array.isArray(value.all)) return { all: value.all.map((entry, index) => readGate(entry, `${path}.all.${index}`, issues)).filter((entry): entry is GateNode => Boolean(entry)) };
  if (Array.isArray(value.any)) return { any: value.any.map((entry, index) => readGate(entry, `${path}.any.${index}`, issues)).filter((entry): entry is GateNode => Boolean(entry)) };
  if ("not" in value) {
    const not = readGate(value.not, `${path}.not`, issues);
    return not ? { not } : null;
  }
  issues.push(`${path}: invalid gate`);
  return null;
};

export const readSnapshot = (value: unknown, path: string, issues: string[]): Record<string, PrimitiveValue> => {
  if (!isRecord(value)) {
    issues.push(`${path}: snapshot must be an object`);
    return {};
  }
  const snapshot: Record<string, PrimitiveValue> = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (isPrimitive(entry)) snapshot[key] = entry;
    else issues.push(`${path}.${key}: value must be primitive`);
  });
  return snapshot;
};

const readScopeHint = (value: unknown): QualityScopeHint | undefined => {
  if (!isRecord(value)) return undefined;
  const hint: QualityScopeHint = {};
  if (typeof value.from === "string") hint.from = value.from;
  if (typeof value.until === "string") hint.until = value.until;
  return hint.from || hint.until ? hint : undefined;
};

const readLedgerBinding = (value: unknown): QualityLedgerBinding | undefined => {
  if (!isRecord(value) || typeof value.entity !== "string" || typeof value.field !== "string") return undefined;
  return { entity: value.entity, field: value.field };
};

export const QUALITY_FIELDS = [
  "key", "type", "source", "rubric", "values", "player_labels", "latching", "monotonic", "scope_hint", "ledger_binding",
  "read_as", "criteria", "evidence_from", "commit_evidence", "roll",
] as const;

export const REQUIREMENT_FIELDS = ["personas", "members", "lorebooks"] as const;

const FIELD_POINTERS: Record<string, string> = {
  groups: "a group is not a requirement: list its cast in members, and the group that holds them is found by its members",
};

export const unknownFieldIssues = (value: Record<string, unknown>, known: readonly string[], path: string): string[] =>
  Object.keys(value).filter((key) => !known.includes(key)).map((key) => {
    const pointer = FIELD_POINTERS[key];
    const near = nearestKey(key, known);
    const hint = pointer ? ` (${pointer})` : near ? ` (did you mean "${near}"?)` : "";
    return `${path}.${key}: unknown field "${key}"${hint}; known: ${known.join(", ")}`;
  });

const readPlayerLabels = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const kept = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0);
  return kept.length ? Object.fromEntries(kept.map(([option, label]) => [option, label.trim()])) : undefined;
};

const qualityFieldIssues = (value: Record<string, unknown>, path: string): string[] => [
  ...unknownFieldIssues(value, QUALITY_FIELDS, path),
  ...(value.evidence_from !== undefined && !(EVIDENCE_FROM as readonly unknown[]).includes(value.evidence_from)
    ? [`${path}.evidence_from: ${JSON.stringify(value.evidence_from)} is not allowed, expected any, world or party`] : []),
  ...(value.player_labels !== undefined && !readPlayerLabels(value.player_labels) ? [`${path}.player_labels: expected an object mapping enum values to the words a player reads`] : []),
  ...(value.roll !== undefined && !readChanceRoll(value.roll) ? [`${path}.roll: expected { sides, target }: whole numbers, at least 2 sides, a target from 1 to sides`] : []),
];

export const readQualityPatch = (value: Record<string, unknown>, path?: string, issues?: string[]): Partial<Quality> => {
  if (path !== undefined && issues) issues.push(...qualityFieldIssues(value, path));
  const patch: Partial<Quality> = {};
  if (typeof value.key === "string") patch.key = value.key;
  if (typeof value.type === "string" && (QUALITY_TYPES as readonly string[]).includes(value.type)) patch.type = value.type as QualityType;
  if (typeof value.source === "string" && (QUALITY_SOURCES as readonly string[]).includes(value.source)) patch.source = value.source as QualitySource;
  if (typeof value.rubric === "string") patch.rubric = value.rubric;
  if (Array.isArray(value.values)) patch.values = value.values.filter((entry): entry is string => typeof entry === "string");
  if (typeof value.latching === "boolean") patch.latching = value.latching;
  if (typeof value.monotonic === "boolean") patch.monotonic = value.monotonic;
  const scopeHint = readScopeHint(value.scope_hint);
  if (scopeHint) patch.scope_hint = scopeHint;
  const ledgerBinding = readLedgerBinding(value.ledger_binding);
  if (ledgerBinding) patch.ledger_binding = ledgerBinding;
  if (typeof value.read_as === "string" && (QUALITY_READ_AS as readonly string[]).includes(value.read_as)) patch.read_as = value.read_as as QualityReadAs;
  if (isRecord(value.criteria)) patch.criteria = value.criteria as QualityCriteria;
  if (typeof value.commit_evidence === "string" && value.commit_evidence.trim()) patch.commit_evidence = value.commit_evidence;
  if (typeof value.evidence_from === "string" && (EVIDENCE_FROM as readonly string[]).includes(value.evidence_from)) patch.evidence_from = value.evidence_from as Quality["evidence_from"];
  const labels = readPlayerLabels(value.player_labels);
  if (labels) patch.player_labels = labels;
  const roll = readChanceRoll(value.roll);
  if (roll) patch.roll = roll;
  return patch;
};

export const readQuality = (value: unknown, path: string, issues: string[]): Quality | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: quality must be an object`);
    return null;
  }
  if (typeof value.key !== "string" || !value.key.trim()) {
    issues.push(`${path}.key: required`);
    return null;
  }
  const patch = readQualityPatch(value, path, issues);
  return {
    key: value.key,
    type: patch.type ?? "string",
    source: patch.source ?? "extractor",
    rubric: patch.rubric ?? "",
    ...(patch.values ? { values: patch.values } : {}),
    ...(patch.latching !== undefined ? { latching: patch.latching } : {}),
    ...(patch.monotonic !== undefined ? { monotonic: patch.monotonic } : {}),
    ...(patch.scope_hint ? { scope_hint: patch.scope_hint } : {}),
    ...(patch.ledger_binding ? { ledger_binding: patch.ledger_binding } : {}),
    ...(patch.read_as ? { read_as: patch.read_as } : {}),
    ...(patch.read_as && patch.criteria ? { criteria: patch.criteria } : {}),
    ...(patch.commit_evidence ? { commit_evidence: patch.commit_evidence } : {}),
    ...(patch.evidence_from ? { evidence_from: patch.evidence_from } : {}),
    ...(patch.player_labels ? { player_labels: patch.player_labels } : {}),
    ...(patch.roll ? { roll: patch.roll } : {})
  };
};

const readNpcReplies = (value: unknown, path: string, issues: string[]): NpcReplyEffect[] | undefined => {
  if (!Array.isArray(value)) {
    issues.push(`${path}: npc_replies must be an array`);
    return undefined;
  }
  return value.map((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!isRecord(entry) || typeof entry.member !== "string") {
      issues.push(`${entryPath}: invalid npc reply`);
      return null;
    }
    const trigger = typeof entry.trigger === "string" && (NPC_REPLY_TRIGGERS as readonly string[]).includes(entry.trigger) ? (entry.trigger as NpcReplyTrigger) : null;
    const kind = typeof entry.kind === "string" && (NPC_REPLY_KINDS as readonly string[]).includes(entry.kind) ? (entry.kind as NpcReplyKind) : null;
    if (!trigger) issues.push(`${entryPath}.trigger: invalid`);
    if (!kind) issues.push(`${entryPath}.kind: invalid`);
    if (!trigger || !kind) return null;
    return {
      trigger,
      member: entry.member,
      kind,
      ...(typeof entry.text === "string" ? { text: entry.text } : {}),
      ...(typeof entry.instruction === "string" ? { instruction: entry.instruction } : {}),
      ...(typeof entry.maxTriggers === "number" ? { maxTriggers: entry.maxTriggers } : {}),
      ...(typeof entry.probability === "number" ? { probability: entry.probability } : {}),
    };
  }).filter((entry): entry is NpcReplyEffect => Boolean(entry));
};

export const readEffects = (value: unknown, path: string, issues: string[]): CheckpointEffects => {
  if (!isRecord(value)) {
    issues.push(`${path}: effects must be an object`);
    return {};
  }
  const effects: CheckpointEffects = {};
  if (value.author_note !== undefined) effects.author_note = value.author_note;
  if (value.preset !== undefined) effects.preset = value.preset;
  if (value.world_info !== undefined) effects.world_info = value.world_info;
  if (value.cast_changes !== undefined) effects.cast_changes = value.cast_changes;
  if (value.npc_replies !== undefined) {
    const replies = readNpcReplies(value.npc_replies, `${path}.npc_replies`, issues);
    if (replies) effects.npc_replies = replies;
  }
  // Same shorthand the story parser accepts, folded here so a proposal never carries a bare string
  // into the draft (validate.ts §readBackground).
  const background = typeof value.background === "string" ? value.background : isRecord(value.background) && typeof value.background.name === "string" ? value.background.name : null;
  if (background?.trim()) effects.background = { name: background.trim() };
  return effects;
};

const readMotives = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const kept = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0);
  return kept.length ? Object.fromEntries(kept.map(([id, text]) => [id, text.trim()])) : undefined;
};

const isTalkControl = (value: unknown): boolean => isRecord(value)
  && (value.speakers === undefined || (Array.isArray(value.speakers) && value.speakers.every(isRecord)));

const CHECKPOINT_FIELD_TYPES: Array<[string, string, (value: unknown) => boolean]> = [
  ["name", "a string", (value) => typeof value === "string"],
  ["objective", "a string", (value) => typeof value === "string"],
  ["type", "anchor or intermediate", (value) => value === "anchor" || value === "intermediate"],
  ["start", "true or false", (value) => typeof value === "boolean"],
  ["target_turn_length", "a number", (value) => typeof value === "number"],
  ["convergence_threshold", "a number", (value) => typeof value === "number"],
  ["tension_target", `one of ${TENSION_LEVELS.join(", ")}`, (value) => typeof value === "string" && (TENSION_LEVELS as readonly string[]).includes(value)],
  ["agency", "an object {protect_player_choice?, never_narrate_player_action?, objective_kind?, alternate?}", isRecord],
  ["talk_control", "an object {speakers?: [{member, weight?}], lead?, director?, …}", (value) => isTalkControl(value)],
];

const checkpointFieldIssues = (value: Record<string, unknown>, path: string): string[] => CHECKPOINT_FIELD_TYPES
  .filter(([key, , valid]) => value[key] !== undefined && value[key] !== null && !valid(value[key]))
  .map(([key, expected]) => `${path}.${key}: ${JSON.stringify(value[key])} is not allowed, expected ${expected}`);

export const readCheckpointPatch = (value: Record<string, unknown>, path: string, issues: string[]): Partial<Checkpoint> => {
  const patch: Partial<Checkpoint> = {};
  issues.push(...checkpointFieldIssues(value, path));
  if (typeof value.name === "string") patch.name = value.name;
  if (typeof value.objective === "string") patch.objective = value.objective;
  if (value.type === "anchor" || value.type === "intermediate") patch.type = value.type;
  if (typeof value.start === "boolean") patch.start = value.start;
  if (typeof value.guidance === "string") patch.guidance = value.guidance;
  if (typeof value.target_turn_length === "number") patch.target_turn_length = value.target_turn_length;
  if (typeof value.convergence_threshold === "number") patch.convergence_threshold = value.convergence_threshold;
  if (typeof value.tension_target === "string" && (TENSION_LEVELS as readonly string[]).includes(value.tension_target)) patch.tension_target = value.tension_target as TensionLevel;
  if (isRecord(value.agency)) patch.agency = value.agency as Checkpoint["agency"];
  if (isTalkControl(value.talk_control)) patch.talk_control = value.talk_control as Checkpoint["talk_control"];
  if (value.state_snapshot !== undefined) patch.state_snapshot = readSnapshot(value.state_snapshot, `${path}.state_snapshot`, issues);
  if (value.effects !== undefined) patch.effects = readEffects(value.effects, `${path}.effects`, issues);
  const motives = readMotives(value.motives);
  if (motives) patch.motives = motives;
  return patch;
};

export const readCheckpoint = (value: unknown, path: string, issues: string[]): Checkpoint | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: checkpoint must be an object`);
    return null;
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    issues.push(`${path}.id: required`);
    return null;
  }
  const patch = readCheckpointPatch(value, path, issues);
  return {
    id: value.id,
    name: patch.name ?? value.id,
    objective: patch.objective ?? "",
    type: patch.type ?? "intermediate",
    ...(patch.start !== undefined ? { start: patch.start } : {}),
    ...(patch.guidance !== undefined ? { guidance: patch.guidance } : {}),
    ...(patch.target_turn_length !== undefined ? { target_turn_length: patch.target_turn_length } : {}),
    ...(patch.convergence_threshold !== undefined ? { convergence_threshold: patch.convergence_threshold } : {}),
    ...(patch.tension_target ? { tension_target: patch.tension_target } : {}),
    ...(patch.agency ? { agency: patch.agency } : {}),
    ...(patch.talk_control ? { talk_control: patch.talk_control } : {}),
    ...(patch.state_snapshot ? { state_snapshot: patch.state_snapshot } : {}),
    ...(patch.effects ? { effects: patch.effects } : {}),
    ...(patch.motives ? { motives: patch.motives } : {})
  };
};

const readTransitionEffects = (value: unknown, path: string, issues: string[]): TransitionEffects | undefined => {
  if (!isRecord(value)) return undefined;
  if (!isRecord(value.progress)) return undefined;
  if (typeof value.progress.anchor !== "string" || typeof value.progress.amount !== "number") {
    issues.push(`${path}.progress: needs { anchor, amount }`);
    return undefined;
  }
  return { progress: { anchor: value.progress.anchor, amount: value.progress.amount } };
};

export const readTransitionPatch = (value: Record<string, unknown>, path: string, issues: string[]): Partial<Transition> => {
  const patch: Partial<Transition> = {};
  if (typeof value.from === "string") patch.from = value.from;
  if (typeof value.to === "string") patch.to = value.to;
  if (typeof value.priority === "number") patch.priority = value.priority;
  if (typeof value.extractor_trigger === "string") patch.extractor_trigger = value.extractor_trigger;
  if (typeof value.extraction_hint === "string") patch.extraction_hint = value.extraction_hint;
  if (value.gate !== undefined) {
    const gate = readGate(value.gate, `${path}.gate`, issues);
    if (gate) patch.gate = gate;
  }
  const effects = readTransitionEffects(value.effects, path, issues);
  if (effects) patch.effects = effects;
  return patch;
};

export const readTransition = (value: unknown, path: string, issues: string[]): Transition | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: transition must be an object`);
    return null;
  }
  if (typeof value.from !== "string" || typeof value.to !== "string") {
    issues.push(`${path}: from and to are required`);
    return null;
  }
  const patch = readTransitionPatch(value, path, issues);
  return {
    from: value.from,
    to: value.to,
    gate: patch.gate ?? { all: [] },
    priority: patch.priority ?? 0,
    ...(patch.effects ? { effects: patch.effects } : {}),
    ...(patch.extractor_trigger ? { extractor_trigger: patch.extractor_trigger } : {}),
    ...(patch.extraction_hint ? { extraction_hint: patch.extraction_hint } : {})
  };
};

export const readTransitionRef = (value: unknown, path: string, issues: string[]): TransitionRef | null => {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string") {
    issues.push(`${path}: ref needs { from, to }`);
    return null;
  }
  const index = typeof value.index === "number" && Number.isInteger(value.index) && value.index >= 1 ? { index: value.index } : {};
  return { from: value.from, to: value.to, ...(typeof value.priority === "number" ? { priority: value.priority } : {}), ...index };
};

export const readRosterMember = (value: unknown, path: string, issues: string[]): RosterMember | null => {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    issues.push(`${path}.id: required`);
    return null;
  }
  const role = typeof value.role === "string" && value.role.trim() ? { role: value.role.trim() } : {};
  return { id: value.id, ...(typeof value.name === "string" ? { name: value.name } : {}), ...role, ...readInnerVoice(value) };
};

export const readInnerVoice = (value: Record<string, unknown>): Pick<RosterMember, "drive" | "view"> => ({
  ...(typeof value.drive === "string" && value.drive.trim() ? { drive: value.drive.trim() } : {}),
  ...(value.view === "own" || value.view === "omniscient" ? { view: value.view } : {}),
});

export const readArcTemplate = (value: unknown, path: string, issues: string[]): ArcTemplate | null | undefined => {
  if (value === null) return null;
  if (typeof value === "string" && (ARC_TEMPLATE_NAMES as readonly string[]).includes(value)) return value as ArcTemplateName;
  if (isRecord(value) && Array.isArray(value.points)) {
    const points = value.points.filter((entry): entry is { at: number; tension: number } => isRecord(entry) && typeof entry.at === "number" && typeof entry.tension === "number");
    if (points.length) return { points };
  }
  issues.push(`${path}: must be ${ARC_TEMPLATE_NAMES.join("|")}, { points: [...] } or null`);
  return undefined;
};

export const readArcBridges = (value: unknown, path: string, issues: string[]): ArcBridge[] | undefined => {
  if (!Array.isArray(value)) {
    issues.push(`${path}: bridges must be an array`);
    return undefined;
  }
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.arcMatch !== "string" || typeof entry.anchor !== "string" || typeof entry.amount !== "number") {
      issues.push(`${path}.${index}: needs { arcMatch, anchor, amount }`);
      return null;
    }
    return { arcMatch: entry.arcMatch, anchor: entry.anchor, amount: entry.amount };
  }).filter((entry): entry is ArcBridge => Boolean(entry));
};

export const readRequirements = (value: unknown, path: string, issues: string[]): StoryRequirements | undefined => {
  if (!isRecord(value)) {
    issues.push(`${path}: requirements must be an object`);
    return undefined;
  }
  const list = (entry: unknown) => (Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : []);
  issues.push(...unknownFieldIssues(value, REQUIREMENT_FIELDS, path));
  const requirements: StoryRequirements = {};
  const personas = list(value.personas);
  const members = list(value.members);
  const lorebooks = list(value.lorebooks);
  if (personas.length) requirements.personas = personas;
  if (members.length) requirements.members = members;
  if (lorebooks.length) requirements.lorebooks = lorebooks;
  return requirements;
};

export const readStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : typeof value === "string" ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
      : [];

export const requireString = (value: unknown, field: string, path: string, issues: string[]): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${path}.${field}: required`);
    return null;
  }
  return value;
};
