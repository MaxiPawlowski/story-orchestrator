import { z } from "zod";
import {
  type Role,
  type RegexSpec,
  type TransitionOutcome,
  StorySchema, type Story,
  WorldInfoActivationsSchema,
  type OnActivate,
} from "./story-schema";

export interface NormalizedWorldInfo {
  activate: string[];
  deactivate: string[];
}

export interface NormalizedOnActivate {
  authors_note?: Partial<Record<Role, string>>;
  world_info?: NormalizedWorldInfo;
  preset_overrides?: Partial<Record<Role, Record<string, any>>>;
}

export interface NormalizedCheckpoint {
  id: string | number;
  key: string;
  name: string;
  objective: string;
  winTriggers: RegExp[];
  failTriggers?: RegExp[];
  onActivate?: NormalizedOnActivate;
}

export interface NormalizedTransition {
  id: string;
  fromId: string | number;
  toId: string | number;
  fromKey: string;
  toKey: string;
  outcome: TransitionOutcome;
  label?: string;
  description?: string;
}

export interface NormalizedStory {
  schemaVersion: "1.0";
  title: string;
  global_lorebook: string;
  roles?: Partial<Record<Role, string>>;
  checkpoints: NormalizedCheckpoint[];
  checkpointIndexById: Map<string | number, number>;
  checkpointById: Map<string | number, NormalizedCheckpoint>;
  checkpointByKey: Map<string, NormalizedCheckpoint>;
  transitions: NormalizedTransition[];
  transitionsByFrom: Map<string, NormalizedTransition[]>;
  startId: string | number;
  startKey: string;
  roleDefaults?: Partial<Record<Role, Record<string, any>>>;
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

const canonicalId = (value: string | number, fallback: string): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    return String(value);
  }
  return fallback;
};

const canonicalEdgeId = (value: string | number, fallback: string): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    return String(value);
  }
  return fallback;
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
  if (typeof input === "string") return { chat: input };
  // zod already ensures only known role keys; keep as-is
  return input;
}

function normalizePresetOverrides(input?: any): Partial<Record<Role, Record<string, any>>> | undefined {
  if (!input) return undefined;
  try {
    const obj = input as Partial<Record<Role, Record<string, any>>>;
    const out: Partial<Record<Role, Record<string, any>>> = {};
    for (const k of Object.keys(obj) as Role[]) {
      const v = (obj as any)[k];
      if (v && typeof v === 'object') out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
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

export function validateStoryShape(input: unknown): Story {
  return StorySchema.parse(input);
}

export function parseAndNormalizeStory(input: unknown): NormalizedStory {
  const story = validateStoryShape(input);

  const checkpoints: NormalizedCheckpoint[] = story.checkpoints.map((cp, idx) => {
    const winSource = cp.triggers?.win;
    const winPath = cp.triggers?.win ? `checkpoints[${idx}].win_trigger` : `checkpoints[${idx}].triggers.win`;
    const winTriggers = compileRegexList(winSource, winPath);

    const failSource = cp.triggers?.fail;
    const failPath = cp.triggers?.fail ? `checkpoints[${idx}].fail_trigger` : `checkpoints[${idx}].triggers.fail`;
    const failTriggers = failSource ? compileRegexList(failSource, failPath) : undefined;

    const key = canonicalId(cp.id, String(idx));

    return {
      id: cp.id,
      key,
      name: cp.name,
      objective: cp.objective,
      winTriggers,
      failTriggers,
      onActivate: normalizeOnActivateBlock(cp.on_activate),
    };
  });

  const checkpointByKey = new Map<string, NormalizedCheckpoint>();
  const checkpointById = new Map<string | number, NormalizedCheckpoint>();
  checkpoints.forEach((cp) => {
    checkpointByKey.set(cp.key, cp);
    checkpointById.set(cp.id, cp);
  });

  const transitions: NormalizedTransition[] = (story.transitions ?? []).map((edge, idx) => {
    const idFallback = `edge-${idx + 1}`;
    const edgeId = canonicalEdgeId(edge.id, idFallback);
    const fromKey = canonicalId(edge.from, `from-${idx}`);
    const toKey = canonicalId(edge.to, `to-${idx}`);
    const label = typeof edge.label === "string" ? cleanScalar(edge.label) : undefined;
    const description = typeof edge.description === "string" ? cleanScalar(edge.description) : undefined;

    return {
      id: edgeId,
      fromId: edge.from,
      toId: edge.to,
      fromKey,
      toKey,
      outcome: edge.outcome ?? "win",
      label: label || undefined,
      description: description || undefined,
    };
  });

  const nodeKeySet = new Set(checkpoints.map((cp) => cp.key));
  const adjacency = new Map<string, NormalizedTransition[]>();
  const indegree = new Map<string, number>();

  checkpoints.forEach((cp) => indegree.set(cp.key, 0));

  transitions.forEach((edge, idx) => {
    if (!nodeKeySet.has(edge.fromKey)) {
      throw new Error(`Transition ${edge.id} references unknown source checkpoint '${String(edge.fromId)}' (index ${idx}).`);
    }
    if (!nodeKeySet.has(edge.toKey)) {
      throw new Error(`Transition ${edge.id} references unknown target checkpoint '${String(edge.toId)}' (index ${idx}).`);
    }
    const list = adjacency.get(edge.fromKey);
    if (list) list.push(edge); else adjacency.set(edge.fromKey, [edge]);
    indegree.set(edge.toKey, (indegree.get(edge.toKey) ?? 0) + 1);
  });

  let startKey: string;

  if (story.start !== undefined && story.start !== null) {
    const resolved = canonicalId(story.start as string | number, String(story.start));
    if (!nodeKeySet.has(resolved)) {
      throw new Error(`Story start references unknown checkpoint id '${String(story.start)}'.`);
    }
    startKey = resolved;
  } else {
    const roots = checkpoints.filter((cp) => (indegree.get(cp.key) ?? 0) === 0).map((cp) => cp.key);
    if (roots.length === 0) {
      throw new Error("Story transitions form a cycle and no starting checkpoint could be inferred. Provide a 'start' id.");
    }
    if (roots.length > 1) {
      const names = roots.map((key) => checkpointByKey.get(key)?.name ?? key);
      throw new Error(`Ambiguous start checkpoint. Candidates: ${names.join(", ")}. Provide a 'start' id.`);
    }
    [startKey] = roots;
  }

  const indegreeForSort = new Map(indegree);
  const queue: string[] = [startKey];
  const visited = new Set<string>();
  const order: string[] = [];

  while (queue.length) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    order.push(key);

    const outgoing = adjacency.get(key) ?? [];
    for (const edge of outgoing) {
      const nextKey = edge.toKey;
      const nextDegree = (indegreeForSort.get(nextKey) ?? 0) - 1;
      indegreeForSort.set(nextKey, nextDegree);
      if (nextDegree <= 0) {
        queue.push(nextKey);
      }
    }
  }

  if (visited.size !== checkpoints.length) {
    const missing = checkpoints.filter((cp) => !visited.has(cp.key));
    const names = missing.map((cp) => cp.name || String(cp.id));
    throw new Error(`Story graph contains unreachable or cyclic checkpoints: ${names.join(", ")}`);
  }

  const orderedCheckpoints = order.map((key) => checkpointByKey.get(key)!).filter(Boolean);

  const checkpointIndexById = new Map<string | number, number>();
  orderedCheckpoints.forEach((cp, idx) => {
    checkpointIndexById.set(cp.id, idx);
  });

  const transitionsByFrom = new Map<string, NormalizedTransition[]>();
  transitions.forEach((edge) => {
    const bucket = transitionsByFrom.get(edge.fromKey);
    if (bucket) bucket.push(edge); else transitionsByFrom.set(edge.fromKey, [edge]);
  });

  const startCheckpoint = checkpointByKey.get(startKey);
  if (!startCheckpoint) {
    throw new Error(`Unable to resolve starting checkpoint '${startKey}'.`);
  }

  return {
    schemaVersion: "1.0",
    title: cleanScalar(story.title),
    global_lorebook: cleanScalar(story.global_lorebook),
    roles: sanitizeRoleMap(story.roles as Partial<Record<Role, string>> | undefined),
    checkpoints: orderedCheckpoints,
    checkpointIndexById,
    checkpointById,
    checkpointByKey,
    transitions,
    transitionsByFrom,
    startId: startCheckpoint.id,
    startKey,
    roleDefaults: story.role_defaults ? normalizePresetOverrides(story.role_defaults) : undefined,
  };
}

export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
