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
} from "./story-schema";

export interface NormalizedWorldInfo {
  activate: string[];
  deactivate: string[];
}

export interface NormalizedOnActivate {
  authors_note?: Partial<Record<Role, string>>;
  world_info?: NormalizedWorldInfo;
  preset_overrides?: RolePresetOverrides;
}

export interface NormalizedCheckpoint {
  id: string;
  name: string;
  objective: string;
  onActivate?: NormalizedOnActivate;
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

export interface NormalizedStory {
  schemaVersion: "1.0";
  title: string;
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
}

export interface NormalizeOptions {
  stripExtension?: boolean;
}

export const normalizeName = (value: string | null | undefined, options?: NormalizeOptions): string => {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

  if (!normalized) return "";

  if (options?.stripExtension) {
    return normalized.replace(/\.\w+$/, "");
  }

  return normalized;
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
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
};

const cleanScalar = (value: string): string => value.trim();

const sanitizeRoleMap = (input?: Partial<Record<Role, string>>): Partial<Record<Role, string>> | undefined => {
  if (!input) return undefined;
  const result: Partial<Record<Role, string>> = {};
  (Object.entries(input) as [Role, unknown][]).forEach(([role, maybeValue]) => {
    if (typeof maybeValue !== "string") return;
    const trimmed = cleanScalar(maybeValue);
    if (trimmed) result[role] = trimmed;
  });
  return Object.keys(result).length ? result : undefined;
};

function normalizeAuthorsNote(input?: OnActivate["authors_note"]): Partial<Record<Role, string>> | undefined {
  if (!input) return undefined;

  const result: Partial<Record<Role, string>> = {};
  for (const [role, rawText] of Object.entries(input) as [Role, unknown][]) {
    if (typeof rawText !== "string") continue;
    const trimmed = rawText.trim();
    if (trimmed) result[role] = trimmed;
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
    if (Object.keys(cleaned).length > 0) result[role] = cleaned;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeWorldInfo(input?: unknown): NormalizedWorldInfo | undefined {
  if (!input) return undefined;
  const wi = WorldInfoActivationsSchema.parse(input);
  const cleanList = (list: string[]) => (
    dedupeOrdered(
      list
        .map((item) => cleanScalar(item))
        .filter(Boolean)
    )
  );
  return {
    activate: cleanList(wi.activate),
    deactivate: cleanList(wi.deactivate),
  };
}

function normalizeOnActivateBlock(input?: OnActivate | null): NormalizedOnActivate | undefined {
  if (!input) return undefined;
  return {
    authors_note: normalizeAuthorsNote(input.authors_note),
    world_info: normalizeWorldInfo(input.world_info),
    preset_overrides: normalizePresetOverrides((input as any).preset_overrides ?? (input as any).preset_override),
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

  const checkpoints: NormalizedCheckpoint[] = story.checkpoints.map((cp, idx) => {
    const id = normalizeId(cp.id, `cp-${idx + 1}`);
    return {
      id,
      name: cp.name,
      objective: cleanScalar(cp.objective),
      onActivate: normalizeOnActivateBlock(cp.on_activate),
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
  };
}

export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
