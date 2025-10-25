import { z } from "zod";
import {
  type Role,
  type RegexSpec,
  StorySchema,
  type Story,
  WorldInfoActivationsSchema,
  type OnActivate,
  type RolePresetOverrides,
  type PresetOverrides,
  type PresetOverrideKey,
  type TransitionTrigger as StoryTransitionTrigger,
  type AuthorNoteDefinition,
  type AuthorNoteSettings,
  type AuthorNoteRole,
  type AuthorNotePosition,
  type TalkControlConfig,
  type TalkControlDefaults,
  type TalkControlReply,
  type TalkControlReplyContent,
  type TalkControlTrigger,
} from "./story-schema";
import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DEFAULT_POSITION,
  AUTHOR_NOTE_DEFAULT_ROLE,
} from "@constants/defaults";

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

export interface NormalizedOnActivate {
  authors_note?: Partial<Record<Role, NormalizedAuthorNote>>;
  world_info?: NormalizedWorldInfo;
  preset_overrides?: RolePresetOverrides;
  arbiter_preset?: PresetOverrides;
  automations?: string[];
}

export interface NormalizedCheckpoint {
  id: string;
  name: string;
  objective: string;
  onActivate?: NormalizedOnActivate;
  talkControl?: NormalizedTalkControlCheckpoint;
}

export type NormalizedTriggerType = "regex" | "timed";

export interface NormalizedTransitionTrigger {
  id?: string;
  label?: string;
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

export interface NormalizedTalkControlDefaults { }

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
  content: NormalizedTalkControlReplyContent;
}

export interface NormalizedTalkControlCheckpoint {
  replies: NormalizedTalkControlReply[];
  repliesByTrigger: Map<TalkControlTrigger, NormalizedTalkControlReply[]>;
}

export interface NormalizedTalkControl {
  defaults?: NormalizedTalkControlDefaults;
  checkpoints: Map<string, NormalizedTalkControlCheckpoint>;
}

export interface NormalizedStory {
  schemaVersion: "1.0";
  title: string;
  description?: string;
  global_lorebook: string;
  roles?: Partial<Record<Role, string>>;
  checkpoints: NormalizedCheckpoint[];
  checkpointIndexById: Map<string, number>;
  checkpointById: Map<string, NormalizedCheckpoint>;
  transitions: NormalizedTransition[];
  transitionById: Map<string, NormalizedTransition>;
  transitionsByFrom: Map<string, NormalizedTransition[]>;
  startId: string;
  roleDefaults?: RolePresetOverrides;
  authorNoteDefaults: NormalizedAuthorNoteSettings;
  talkControl?: NormalizedTalkControl;
}

export interface NormalizeOptions {
  stripExtension?: boolean;
}

export const normalizeName = (value: string | null | undefined, options?: NormalizeOptions): string => {
  const normalized = (value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized) return "";
  return options?.stripExtension ? normalized.replace(/\.\w+$/, "") : normalized;
};

export type CheckpointResult =
  | { file: string; ok: true; json: NormalizedStory }
  | { file: string; ok: false; error: unknown };

const REGEX_FROM_SLASHES = /^\/([\s\S]*)\/([dgimsuvy]*)$/;

function normalizeRegexSpec(spec: RegexSpec, defaultFlags = "i"): { pattern: string; flags?: string } {
  if (typeof spec === "string") {
    const m = spec.match(REGEX_FROM_SLASHES);
    if (m) return { pattern: m[1], flags: m[2] || undefined };
    return { pattern: spec, flags: defaultFlags };
  }
  return { pattern: spec.pattern, flags: spec.flags ?? defaultFlags };
}

function compileRegex(spec: RegexSpec, where: string): RegExp {
  const { pattern, flags } = normalizeRegexSpec(spec);
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex at ${where}: /${pattern}/${flags ?? ""} -> ${msg}`);
  }
}

function compileRegexList(spec: RegexSpec | RegexSpec[] | undefined, where: string): RegExp[] {
  if (spec === undefined) return [];
  if (Array.isArray(spec)) {
    return spec.map((item, idx) => compileRegex(item, `${where}[${idx}]`));
  }
  return [compileRegex(spec, where)];
}

function dedupeOrdered<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) if (!seen.has(x)) { seen.add(x); out.push(x); }
  return out;
}

const normalizeId = (value: string | null | undefined, fallback: string): string => {
  return value?.trim() || fallback;
};

const cleanScalar = (value: string): string => value.trim();

const clampInterval = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : fallback;
};

const clampInteger = (value: unknown, fallback: number, min: number, max?: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  let result = Math.floor(num);
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(result, max);
  return result;
};

const clampProbability = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  const rounded = Math.round(num);
  if (rounded <= 0) return undefined;
  if (rounded >= 100) return 100;
  return Math.max(1, rounded);
};

const TALK_CONTROL_DEFAULT_SETTINGS: NormalizedTalkControlDefaults = Object.freeze({
  cooldownTurns: 2,
  maxPerTurn: 1,
  maxCharsPerAuto: 600,
  sendAsQuiet: false,
  forceSpeaker: true,
});

const TALK_CONTROL_MAX_CHARS = 4000;
const TALK_CONTROL_MAX_COOLDOWN = 10000;
const TALK_CONTROL_MAX_ACTIONS = 10;
const TALK_CONTROL_TRIGGERS: TalkControlTrigger[] = ["afterSpeak", "beforeArbiter", "afterArbiter", "onEnter", "onExit"];

const clampDepth = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
};

const sanitizeRoleMap = (input?: Partial<Record<Role, string>>): Partial<Record<Role, string>> | undefined => {
  if (!input) return undefined;
  const result: Partial<Record<Role, string>> = {};
  for (const [role, value] of Object.entries(input) as [Role, unknown][]) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) result[role] = trimmed;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

function normalizeAuthorNoteDefaults(input?: AuthorNoteSettings | null): NormalizedAuthorNoteSettings {
  return {
    position: input?.position ?? AUTHOR_NOTE_DEFAULT_POSITION,
    interval: clampInterval(input?.interval, AUTHOR_NOTE_DEFAULT_INTERVAL),
    depth: clampDepth(input?.depth, AUTHOR_NOTE_DEFAULT_DEPTH),
    role: input?.role ?? AUTHOR_NOTE_DEFAULT_ROLE,
  };
}

function normalizeAuthorNoteDefinition(
  definition: AuthorNoteDefinition | undefined,
  defaults: NormalizedAuthorNoteSettings,
): NormalizedAuthorNote | null {
  if (!definition) return null;
  const text = definition.text?.trim();
  if (!text) return null;

  return {
    text,
    position: definition.position ?? defaults.position,
    interval: clampInterval(definition.interval, defaults.interval),
    depth: clampDepth(definition.depth, defaults.depth),
    role: definition.role ?? defaults.role,
  };
}

function normalizeAuthorsNote(
  input: OnActivate["authors_note"],
  defaults: NormalizedAuthorNoteSettings,
): Partial<Record<Role, NormalizedAuthorNote>> | undefined {
  if (!input) return undefined;

  const result: Partial<Record<Role, NormalizedAuthorNote>> = {};
  for (const [role, rawValue] of Object.entries(input) as [Role, AuthorNoteDefinition][]) {
    const normalized = normalizeAuthorNoteDefinition(rawValue, defaults);
    if (normalized) result[role] = normalized;
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizePresetOverrides(input?: RolePresetOverrides | null): RolePresetOverrides | undefined {
  if (!input) return undefined;
  const result: RolePresetOverrides = {};

  for (const [role, overrides] of Object.entries(input) as [Role, any][]) {
    if (!overrides || typeof overrides !== "object") continue;
    const cleaned: PresetOverrides = {};
    for (const key of Object.keys(overrides) as PresetOverrideKey[]) {
      const value = overrides[key];
      if (value !== undefined) cleaned[key] = value;
    }
    if (Object.keys(cleaned).length) result[role] = cleaned;
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizePresetOverride(input?: PresetOverrides | null): PresetOverrides | undefined {
  if (!input) return undefined;
  const cleaned: PresetOverrides = {};
  for (const key of Object.keys(input) as PresetOverrideKey[]) {
    const value = input[key];
    if (value !== undefined) cleaned[key] = value;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function normalizeWorldInfo(input?: unknown): NormalizedWorldInfo | undefined {
  if (!input) return undefined;
  const wi = WorldInfoActivationsSchema.parse(input);
  const cleanList = (list: string[]) =>
    [...new Set(list.map(item => item.trim()).filter(Boolean))];

  return {
    activate: cleanList(wi.activate),
    deactivate: cleanList(wi.deactivate),
  };
}

function normalizeAutomations(input?: unknown): string[] | undefined {
  if (!input) return undefined;
  const list = Array.isArray(input) ? input : [input];
  const cleaned = [...new Set(list.map(item => item.trim()).filter(Boolean))];
  return cleaned.length ? cleaned : undefined;
}

const normalizeTalkControlDefaults = (input: TalkControlDefaults | undefined): NormalizedTalkControlDefaults => {
  return {};
};

const normalizeTalkControlReplyContent = (
  content: TalkControlReplyContent | undefined,
  maxChars: number,
): NormalizedTalkControlReplyContent | null => {
  if (!content) return null;

  if (content.kind === "static") {
    const text = content.text?.trim();
    if (!text) return null;
    return { kind: "static", text: text.slice(0, maxChars) };
  }

  if (content.kind === "llm") {
    const instruction = content.instruction?.trim();
    if (!instruction) return null;
    return { kind: "llm", instruction };
  }

  return null;
};

const normalizeTalkControlReply = (
  reply: TalkControlReply,
  defaults: NormalizedTalkControlDefaults,
): NormalizedTalkControlReply | null => {
  if (!reply) return null;

  const speakerId = reply.speakerId?.trim();
  if (!speakerId) return null;

  if (!TALK_CONTROL_TRIGGERS.includes(reply.trigger)) return null;

  const content = normalizeTalkControlReplyContent(reply.content, TALK_CONTROL_MAX_CHARS);
  if (!content) return null;

  return {
    memberId: reply.memberId?.trim() ?? "",
    normalizedId: normalizeName(reply.memberId),
    speakerId,
    normalizedSpeakerId: normalizeName(speakerId),
    enabled: reply.enabled ?? true,
    trigger: reply.trigger,
    probability: clampProbability(reply.probability) ?? 100,
    content,
  };
};

const normalizeTalkControl = (
  config: TalkControlConfig | undefined,
  checkpointById: Map<string, NormalizedCheckpoint>,
): NormalizedTalkControl | undefined => {
  if (!config || typeof config !== "object") return undefined;

  const sanitizedDefaults = config.defaults ? normalizeTalkControlDefaults(config.defaults) : undefined;
  const baseDefaults = sanitizedDefaults ?? TALK_CONTROL_DEFAULT_SETTINGS;
  const checkpoints = new Map<string, NormalizedTalkControlCheckpoint>();

  const source = config.checkpoints && typeof config.checkpoints === "object" ? config.checkpoints : {};
  for (const [rawId, checkpointConfig] of Object.entries(source)) {
    if (!checkpointConfig || typeof checkpointConfig !== "object") continue;
    const normalizedId = normalizeId(rawId, rawId);
    const checkpoint = checkpointById.get(normalizedId);
    if (!checkpoint) {
      console.warn(`[StoryValidator] Talk control references unknown checkpoint '${rawId}'.`);
      continue;
    }

    const repliesRaw = Array.isArray(checkpointConfig.replies) ? checkpointConfig.replies : [];
    const replies: NormalizedTalkControlReply[] = [];
    const repliesByTrigger = new Map<TalkControlTrigger, NormalizedTalkControlReply[]>();

    repliesRaw.forEach((entry) => {
      const normalizedReply = normalizeTalkControlReply(entry, baseDefaults);
      if (!normalizedReply) return;
      replies.push(normalizedReply);

      const triggerList = repliesByTrigger.get(normalizedReply.trigger) ?? [];
      triggerList.push(normalizedReply);
      repliesByTrigger.set(normalizedReply.trigger, triggerList);
    });

    if (!replies.length) continue;

    checkpoints.set(checkpoint.id, {
      replies,
      repliesByTrigger,
    });
  }

  if (!checkpoints.size) {
    return undefined;
  }

  return {
    defaults: sanitizedDefaults,
    checkpoints,
  };
};

function normalizeOnActivateBlock(
  input: OnActivate | null | undefined,
  defaults: NormalizedAuthorNoteSettings,
): NormalizedOnActivate | undefined {
  if (!input) return undefined;
  return {
    authors_note: normalizeAuthorsNote(input.authors_note, defaults),
    world_info: normalizeWorldInfo(input.world_info),
    preset_overrides: normalizePresetOverrides((input as any).preset_overrides ?? (input as any).preset_override),
    arbiter_preset: normalizePresetOverride((input as any).arbiter_preset),
    automations: normalizeAutomations((input as any).automations),
  };
}

function normalizeTransitionTrigger(trigger: StoryTransitionTrigger, path: string): NormalizedTransitionTrigger {
  const type = (trigger.type ?? "regex") as NormalizedTriggerType;
  const label = typeof trigger.label === "string" ? cleanScalar(trigger.label) : undefined;
  const id = typeof trigger.id === "string" ? cleanScalar(trigger.id) : undefined;

  if (type === "regex") {
    const rawTrigger = trigger as StoryTransitionTrigger & { patterns?: RegexSpec | RegexSpec[] };
    const patternSource = (rawTrigger.patterns ?? (rawTrigger as any).regex ?? (rawTrigger as any).match) as RegexSpec | RegexSpec[] | undefined;
    const regexes = compileRegexList(patternSource, `${path}.patterns`);
    if (!regexes.length) {
      throw new Error(`Transition trigger at ${path} produced no regex patterns`);
    }
    const rawCondition = (trigger as any).condition;
    const condition = typeof rawCondition === "string" ? cleanScalar(rawCondition) : "";
    if (!condition) {
      throw new Error(`Regex trigger at ${path} requires a non-empty 'condition' string`);
    }
    return {
      id: id || undefined,
      label: label || undefined,
      type,
      regexes,
      withinTurns: undefined,
      condition,
      raw: trigger,
    };
  }

  const rawWithin = (trigger as any).within_turns;
  const normalized = Number(rawWithin);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`Timed trigger at ${path} requires a positive 'within_turns' value`);
  }

  return {
    id: id || undefined,
    label: label || undefined,
    type,
    regexes: [],
    withinTurns: Math.floor(normalized),
    raw: trigger,
  };
}

export function validateStoryShape(input: unknown): Story {
  return StorySchema.parse(input);
}

export function parseAndNormalizeStory(input: unknown): NormalizedStory {
  const story = validateStoryShape(input);

  const authorNoteDefaults = normalizeAuthorNoteDefaults(story.author_note_defaults as AuthorNoteSettings | undefined);
  const rawDescription = typeof story.description === "string" ? cleanScalar(story.description) : "";
  const normalizedDescription = rawDescription ? rawDescription : undefined;

  const checkpoints: NormalizedCheckpoint[] = story.checkpoints.map((cp, idx) => {
    const id = normalizeId(cp.id, `cp-${idx + 1}`);
    return {
      id,
      name: cp.name,
      objective: cleanScalar(cp.objective),
      onActivate: normalizeOnActivateBlock(cp.on_activate, authorNoteDefaults),
    };
  });

  const checkpointById = new Map<string, NormalizedCheckpoint>();
  checkpoints.forEach((cp) => {
    checkpointById.set(cp.id, cp);
  });

  const transitions: NormalizedTransition[] = (story.transitions ?? []).map((edge, idx) => {
    const edgeId = normalizeId(edge.id, `edge-${idx + 1}`);
    const from = normalizeId(edge.from, `from-${idx + 1}`);
    const to = normalizeId(edge.to, `to-${idx + 1}`);
    const label = typeof edge.label === "string" ? cleanScalar(edge.label) : undefined;
    const description = typeof edge.description === "string" ? cleanScalar(edge.description) : undefined;
    const trigger = normalizeTransitionTrigger(edge.trigger, `transitions[${idx}].trigger`);

    return {
      id: edgeId,
      from,
      to,
      trigger,
      label: label || undefined,
      description: description || undefined,
    };
  });

  const nodeIdSet = new Set(checkpoints.map((cp) => cp.id));
  const adjacency = new Map<string, NormalizedTransition[]>();
  const indegree = new Map<string, number>();

  checkpoints.forEach((cp) => indegree.set(cp.id, 0));

  transitions.forEach((edge, idx) => {
    if (!nodeIdSet.has(edge.from)) {
      throw new Error(`Transition ${edge.id} references unknown source checkpoint '${edge.from}' (index ${idx}).`);
    }
    if (!nodeIdSet.has(edge.to)) {
      throw new Error(`Transition ${edge.id} references unknown target checkpoint '${edge.to}' (index ${idx}).`);
    }
    const list = adjacency.get(edge.from);
    if (list) list.push(edge); else adjacency.set(edge.from, [edge]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  });

  let startId: string;

  if (story.start !== undefined && story.start !== null) {
    const resolved = normalizeId(story.start as string, String(story.start));
    if (!nodeIdSet.has(resolved)) {
      throw new Error(`Story start references unknown checkpoint id '${story.start}'.`);
    }
    startId = resolved;
  } else {
    const roots = checkpoints.filter((cp) => (indegree.get(cp.id) ?? 0) === 0).map((cp) => cp.id);
    if (roots.length === 0) {
      throw new Error("Story transitions form a cycle and no starting checkpoint could be inferred. Provide a 'start' id.");
    }
    if (roots.length > 1) {
      const names = roots.map((id) => checkpointById.get(id)?.name ?? id);
      throw new Error(`Ambiguous start checkpoint. Candidates: ${names.join(", ")}. Provide a 'start' id.`);
    }
    [startId] = roots;
  }

  const indegreeForSort = new Map(indegree);
  const queue: string[] = [startId];
  const visited = new Set<string>();
  const order: string[] = [];

  while (queue.length) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    order.push(key);

    const outgoing = adjacency.get(key) ?? [];
    for (const edge of outgoing) {
      const nextId = edge.to;
      const nextDegree = (indegreeForSort.get(nextId) ?? 0) - 1;
      indegreeForSort.set(nextId, nextDegree);
      if (nextDegree <= 0) {
        queue.push(nextId);
      }
    }
  }

  if (visited.size !== checkpoints.length) {
    const missing = checkpoints.filter((cp) => !visited.has(cp.id));
    const names = missing.map((cp) => cp.name || String(cp.id));
    throw new Error(`Story graph contains unreachable or cyclic checkpoints: ${names.join(", ")}`);
  }

  const orderedCheckpoints = order.map((id) => checkpointById.get(id)!).filter(Boolean);

  const checkpointIndexById = new Map<string, number>();
  orderedCheckpoints.forEach((cp, idx) => {
    checkpointIndexById.set(cp.id, idx);
  });

  const talkControlRaw = (story as any)?.talkControl ?? (story as any)?.talk_control;
  const talkControl = normalizeTalkControl(talkControlRaw as TalkControlConfig | undefined, checkpointById);
  if (talkControl) {
    orderedCheckpoints.forEach((cp) => {
      const entry = talkControl.checkpoints.get(cp.id);
      if (entry) {
        cp.talkControl = entry;
      }
    });
  }

  const transitionsByFrom = new Map<string, NormalizedTransition[]>();
  const transitionById = new Map<string, NormalizedTransition>();
  transitions.forEach((edge) => {
    const bucket = transitionsByFrom.get(edge.from);
    if (bucket) bucket.push(edge); else transitionsByFrom.set(edge.from, [edge]);
    transitionById.set(edge.id, edge);
  });

  const startCheckpoint = checkpointById.get(startId);
  if (!startCheckpoint) {
    throw new Error(`Unable to resolve starting checkpoint '${startId}'.`);
  }

  return {
    schemaVersion: "1.0",
    title: cleanScalar(story.title),
    description: normalizedDescription,
    global_lorebook: cleanScalar(story.global_lorebook),
    roles: sanitizeRoleMap(story.roles as Partial<Record<Role, string>> | undefined),
    checkpoints: orderedCheckpoints,
    checkpointIndexById,
    checkpointById,
    transitions,
    transitionById,
    transitionsByFrom,
    startId: startCheckpoint.id,
    roleDefaults: normalizePresetOverrides(story.role_defaults as RolePresetOverrides | undefined),
    authorNoteDefaults,
    talkControl,
  };
}

export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
