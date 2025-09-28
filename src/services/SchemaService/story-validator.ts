import { z } from "zod";
import {
  type Role,
  type RegexSpec,
  StorySchema, type Story,
  WorldInfoActivationsSchema,
  type OnActivate,
} from "./story-schema";

export interface NormalizedWorldInfo {
  activate: string[];
  deactivate: string[];
  make_constant: string[];
}

export interface NormalizedOnActivate {
  authors_note?: Partial<Record<Role, string>>;
  world_info?: NormalizedWorldInfo;
  preset_overrides?: Partial<Record<Role, Record<string, any>>>;
  automation_ids?: string[];
}

export interface NormalizedCheckpoint {
  id: string | number;
  name: string;
  objective: string;
  winTriggers: RegExp[];
  failTriggers?: RegExp[];
  onActivate?: NormalizedOnActivate;
}

export interface NormalizedStory {
  schemaVersion: "1.0";
  title: string;
  roles?: Partial<Record<Role, string>>;
  checkpoints: NormalizedCheckpoint[];
  checkpointIndexById: Map<string | number, number>;
  basePreset?: { source: string; name?: string };
  roleDefaults?: Partial<Record<Role, Record<string, any>>>;
}

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
  return {
    activate: dedupeOrdered(wi.activate),
    deactivate: dedupeOrdered(wi.deactivate),
    make_constant: dedupeOrdered(wi.make_constant),
  };
}

function normalizeAutomationIds(input?: unknown): string[] | undefined {
  if (!input) return undefined;
  const arr = Array.isArray(input) ? input : [];
  const filtered = arr.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(v => v.trim());
  return filtered.length ? dedupeOrdered(filtered) : undefined;
}

function normalizeOnActivateBlock(input?: OnActivate | null): NormalizedOnActivate | undefined {
  if (!input) return undefined;
  return {
    authors_note: normalizeAuthorsNote(input.authors_note),
    world_info: normalizeWorldInfo(input.world_info),
    preset_overrides: normalizePresetOverrides((input as any).preset_overrides ?? (input as any).preset_override),
    automation_ids: normalizeAutomationIds((input as any).automation_ids),
  };
}

export function validateStoryShape(input: unknown): Story {
  return StorySchema.parse(input);
}

// Validate + normalize into runtime-friendly structure (throws on failure)
export function parseAndNormalizeStory(input: unknown): NormalizedStory {
  const story = validateStoryShape(input);

  const checkpoints: NormalizedCheckpoint[] = story.checkpoints.map((cp, idx) => {
    const winSource = cp.triggers?.win;
    const winPath = cp.triggers?.win ? `checkpoints[${idx}].win_trigger` : `checkpoints[${idx}].triggers.win`;
    const winTriggers = compileRegexList(winSource, winPath);

    const failSource = cp.triggers?.fail;
    const failPath = cp.triggers?.fail ? `checkpoints[${idx}].fail_trigger` : `checkpoints[${idx}].triggers.fail`;
    const failTriggers = failSource ? compileRegexList(failSource, failPath) : undefined;

    return {
      id: cp.id,
      name: cp.name,
      objective: cp.objective,
      winTriggers,
      failTriggers,
      onActivate: normalizeOnActivateBlock(cp.on_activate),
    };
  });

  const checkpointIndexById = new Map<string | number, number>();
  checkpoints.forEach((c, i) => checkpointIndexById.set(c.id, i));

  let basePreset: NormalizedStory["basePreset"] = undefined;
  if (story.base_preset) {
    basePreset = {
      source: story.base_preset.source,
      ...(story.base_preset.name ? { name: story.base_preset.name } : {}),
    };
  }

  return {
    schemaVersion: "1.0",
    title: story.title,
    roles: story.roles as Partial<Record<Role, string>> | undefined,
    checkpoints,
    checkpointIndexById,
    basePreset,
    roleDefaults: story.role_defaults ? normalizePresetOverrides(story.role_defaults) : undefined,
  };
}

export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
