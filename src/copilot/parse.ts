import {
  GATE_OPERATORS,
  NPC_REPLY_KINDS,
  NPC_REPLY_TRIGGERS,
  QUALITY_SOURCES,
  QUALITY_TYPES,
  TENSION_LEVELS,
  type Checkpoint,
  type CheckpointEffects,
  type GateNode,
  type GateOperator,
  type NpcReplyEffect,
  type NpcReplyKind,
  type NpcReplyTrigger,
  type PrimitiveValue,
  type Quality,
  type QualityLedgerBinding,
  type QualityScopeHint,
  type QualitySource,
  type QualityType,
  type RosterMember,
  type TensionLevel,
  type Transition,
  type TransitionEffects,
} from "@engine/index";
import type { Proposal, ProposalOp, Suggestion, TransitionRef } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isPrimitive = (value: unknown): value is PrimitiveValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";
const isPrimitiveOrArray = (value: unknown): value is PrimitiveValue | PrimitiveValue[] => isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive));

const normalizeJsonText = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const embedded = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return embedded ? embedded[1].trim() : trimmed;
};

const readGate = (value: unknown, path: string, issues: string[]): GateNode | null => {
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

const readSnapshot = (value: unknown, path: string, issues: string[]): Record<string, PrimitiveValue> => {
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

const readQualityPatch = (value: Record<string, unknown>): Partial<Quality> => {
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
  return patch;
};

const readQuality = (value: unknown, path: string, issues: string[]): Quality | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: quality must be an object`);
    return null;
  }
  if (typeof value.key !== "string" || !value.key.trim()) {
    issues.push(`${path}.key: required`);
    return null;
  }
  const patch = readQualityPatch(value);
  return { key: value.key, type: patch.type ?? "string", source: patch.source ?? "extractor", rubric: patch.rubric ?? "", ...(patch.values ? { values: patch.values } : {}), ...(patch.latching !== undefined ? { latching: patch.latching } : {}), ...(patch.monotonic !== undefined ? { monotonic: patch.monotonic } : {}), ...(patch.scope_hint ? { scope_hint: patch.scope_hint } : {}), ...(patch.ledger_binding ? { ledger_binding: patch.ledger_binding } : {}) };
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

const readEffects = (value: unknown, path: string, issues: string[]): CheckpointEffects => {
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
  return effects;
};

const readCheckpointPatch = (value: Record<string, unknown>, path: string, issues: string[]): Partial<Checkpoint> => {
  const patch: Partial<Checkpoint> = {};
  if (typeof value.name === "string") patch.name = value.name;
  if (typeof value.objective === "string") patch.objective = value.objective;
  if (value.type === "anchor" || value.type === "intermediate") patch.type = value.type;
  if (typeof value.start === "boolean") patch.start = value.start;
  if (typeof value.guidance === "string") patch.guidance = value.guidance;
  if (typeof value.target_turn_length === "number") patch.target_turn_length = value.target_turn_length;
  if (typeof value.convergence_threshold === "number") patch.convergence_threshold = value.convergence_threshold;
  if (typeof value.tension_target === "string" && (TENSION_LEVELS as readonly string[]).includes(value.tension_target)) patch.tension_target = value.tension_target as TensionLevel;
  if (value.state_snapshot !== undefined) patch.state_snapshot = readSnapshot(value.state_snapshot, `${path}.state_snapshot`, issues);
  if (value.effects !== undefined) patch.effects = readEffects(value.effects, `${path}.effects`, issues);
  return patch;
};

const readCheckpoint = (value: unknown, path: string, issues: string[]): Checkpoint | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: checkpoint must be an object`);
    return null;
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    issues.push(`${path}.id: required`);
    return null;
  }
  const patch = readCheckpointPatch(value, path, issues);
  return { id: value.id, name: patch.name ?? value.id, objective: patch.objective ?? "", type: patch.type ?? "intermediate", ...(patch.start !== undefined ? { start: patch.start } : {}), ...(patch.guidance !== undefined ? { guidance: patch.guidance } : {}), ...(patch.target_turn_length !== undefined ? { target_turn_length: patch.target_turn_length } : {}), ...(patch.convergence_threshold !== undefined ? { convergence_threshold: patch.convergence_threshold } : {}), ...(patch.tension_target ? { tension_target: patch.tension_target } : {}), ...(patch.state_snapshot ? { state_snapshot: patch.state_snapshot } : {}), ...(patch.effects ? { effects: patch.effects } : {}) };
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

const readTransitionPatch = (value: Record<string, unknown>, path: string, issues: string[]): Partial<Transition> => {
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

const readTransition = (value: unknown, path: string, issues: string[]): Transition | null => {
  if (!isRecord(value)) {
    issues.push(`${path}: transition must be an object`);
    return null;
  }
  if (typeof value.from !== "string" || typeof value.to !== "string") {
    issues.push(`${path}: from and to are required`);
    return null;
  }
  const patch = readTransitionPatch(value, path, issues);
  return { from: value.from, to: value.to, gate: patch.gate ?? { all: [] }, priority: patch.priority ?? 0, ...(patch.effects ? { effects: patch.effects } : {}), ...(patch.extractor_trigger ? { extractor_trigger: patch.extractor_trigger } : {}), ...(patch.extraction_hint ? { extraction_hint: patch.extraction_hint } : {}) };
};

const readTransitionRef = (value: unknown, path: string, issues: string[]): TransitionRef | null => {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string") {
    issues.push(`${path}: ref needs { from, to }`);
    return null;
  }
  return { from: value.from, to: value.to, ...(typeof value.priority === "number" ? { priority: value.priority } : {}) };
};

const readRosterMember = (value: unknown, path: string, issues: string[]): RosterMember | null => {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    issues.push(`${path}.id: required`);
    return null;
  }
  return { id: value.id, ...(typeof value.name === "string" ? { name: value.name } : {}) };
};

const requireString = (value: unknown, field: string, path: string, issues: string[]): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${path}.${field}: required`);
    return null;
  }
  return value;
};

const readOp = (value: unknown, path: string, issues: string[]): ProposalOp | null => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    issues.push(`${path}: op must have a kind`);
    return null;
  }
  switch (value.kind) {
    case "setStoryField": {
      if (value.field !== "title" && value.field !== "description") {
        issues.push(`${path}.field: must be title or description`);
        return null;
      }
      if (typeof value.value !== "string") {
        issues.push(`${path}.value: required string`);
        return null;
      }
      return { kind: "setStoryField", field: value.field, value: value.value };
    }
    case "addQuality": {
      const quality = readQuality(value.quality, `${path}.quality`, issues);
      return quality ? { kind: "addQuality", quality } : null;
    }
    case "updateQuality": {
      const key = requireString(value.key, "key", path, issues);
      return key ? { kind: "updateQuality", key, patch: readQualityPatch(isRecord(value.patch) ? value.patch : {}) } : null;
    }
    case "removeQuality": {
      const key = requireString(value.key, "key", path, issues);
      return key ? { kind: "removeQuality", key } : null;
    }
    case "addCheckpoint": {
      const checkpoint = readCheckpoint(value.checkpoint, `${path}.checkpoint`, issues);
      return checkpoint ? { kind: "addCheckpoint", checkpoint } : null;
    }
    case "updateCheckpoint": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "updateCheckpoint", id, patch: readCheckpointPatch(isRecord(value.patch) ? value.patch : {}, `${path}.patch`, issues) } : null;
    }
    case "removeCheckpoint": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "removeCheckpoint", id } : null;
    }
    case "setStartCheckpoint": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "setStartCheckpoint", id } : null;
    }
    case "setCheckpointSnapshot": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "setCheckpointSnapshot", id, snapshot: readSnapshot(value.snapshot, `${path}.snapshot`, issues) } : null;
    }
    case "setCheckpointEffects": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "setCheckpointEffects", id, effects: readEffects(value.effects, `${path}.effects`, issues) } : null;
    }
    case "addTransition": {
      const transition = readTransition(value.transition, `${path}.transition`, issues);
      return transition ? { kind: "addTransition", transition } : null;
    }
    case "updateTransition": {
      const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
      return ref ? { kind: "updateTransition", ref, patch: readTransitionPatch(isRecord(value.patch) ? value.patch : {}, `${path}.patch`, issues) } : null;
    }
    case "removeTransition": {
      const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
      return ref ? { kind: "removeTransition", ref } : null;
    }
    case "setTransitionGate": {
      const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
      const gate = readGate(value.gate, `${path}.gate`, issues);
      return ref && gate ? { kind: "setTransitionGate", ref, gate } : null;
    }
    case "addRosterMember": {
      const member = readRosterMember(value.member, `${path}.member`, issues);
      return member ? { kind: "addRosterMember", member } : null;
    }
    case "updateRosterMember": {
      const id = requireString(value.id, "id", path, issues);
      if (!id) return null;
      const patch: Partial<RosterMember> = {};
      if (isRecord(value.patch) && typeof value.patch.name === "string") patch.name = value.patch.name;
      return { kind: "updateRosterMember", id, patch };
    }
    case "removeRosterMember": {
      const id = requireString(value.id, "id", path, issues);
      return id ? { kind: "removeRosterMember", id } : null;
    }
    default:
      issues.push(`${path}.kind: unknown '${value.kind}'`);
      return null;
  }
};

export const parseProposal = (raw: string): { proposal: Proposal; issues: string[] } => {
  const issues: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch (error) {
    return { proposal: { summary: "", ops: [] }, issues: [error instanceof Error ? error.message : "Invalid JSON"] };
  }
  if (!isRecord(parsed)) return { proposal: { summary: "", ops: [] }, issues: ["response must be a JSON object"] };
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  if (!Array.isArray(parsed.ops)) {
    issues.push("ops: required array");
    return { proposal: { summary, ops: [] }, issues };
  }
  const ops = parsed.ops.map((entry, index) => readOp(entry, `ops.${index}`, issues)).filter((entry): entry is ProposalOp => Boolean(entry));
  return { proposal: { summary, ops }, issues };
};

export const parseSuggestions = (raw: string): Suggestion[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch {
    return [];
  }
  const source = isRecord(parsed) && Array.isArray(parsed.suggestions) ? parsed.suggestions : Array.isArray(parsed) ? parsed : [];
  return source
    .map((entry) => (isRecord(entry) && typeof entry.title === "string" ? { title: entry.title, rationale: typeof entry.rationale === "string" ? entry.rationale : "" } : null))
    .filter((entry): entry is Suggestion => Boolean(entry));
};
