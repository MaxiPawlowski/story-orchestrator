import { z } from "zod";
import {
  RoleEnum, type Role,
  RegexSpecSchema, type RegexSpec,
  StoryFileSchema, type StoryFile,
  WorldInfoActivationsSchema, type WorldInfoActivations,
  OnActivateSchema, type OnActivate,
  CheckpointSchema, type Checkpoint,
} from "./story-schema";

// Normalized, runtime-friendly types
export interface NormalizedWorldInfo {
  activate: string[];
  deactivate: string[];
  make_constant: string[];
}

export interface NormalizedOnActivate {
  authors_note?: Partial<Record<Role, string>>; // string expanded into { chat: ... }
  cfg_scale?: Partial<Record<Role, number>>;
  world_info?: NormalizedWorldInfo;
}

export interface NormalizedCheckpoint {
  id: string | number;
  name: string;
  objective: string;
  winTrigger: RegExp;
  failTrigger?: RegExp;
  onActivate?: NormalizedOnActivate;
}

export interface NormalizedStory {
  schemaVersion: "1.0";
  title: string;
  roles?: { dm?: string; companion?: string };
  checkpoints: NormalizedCheckpoint[];
  checkpointIndexById: Map<string | number, number>;
}

export type CheckpointResult =
  | { file: string; ok: true; json: NormalizedStory }
  | { file: string; ok: false; error: unknown };

// helpers
const REGEX_FROM_SLASHES = /^\/([\s\S]*)\/([dgimsuvy]*)$/;

// normalize a RegexSpec into pattern/flags
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
    throw new Error(`Invalid regex at ${where}: /${pattern}/${flags ?? ""} → ${msg}`);
  }
}

function dedupeOrdered<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) if (!seen.has(x)) { seen.add(x); out.push(x); }
  return out;
}

/** Expand a string A/N into a per-role map (chat=...) */
function normalizeAuthorsNote(input?: OnActivate["authors_note"]): Partial<Record<Role, string>> | undefined {
  if (!input) return undefined;
  if (typeof input === "string") return { chat: input };
  // zod already ensures only known role keys; keep as-is
  return input;
}

/** Clamp CFG to safe-ish range without being opinionated */
function normalizeCfgScale(input?: OnActivate["cfg_scale"]): Partial<Record<Role, number>> | undefined {
  if (!input) return undefined;
  const out: Partial<Record<Role, number>> = {};
  for (const role of Object.keys(input) as Role[]) {
    const v = (input as Partial<Record<Role, number>>)[role];
    if (typeof v === "number" && Number.isFinite(v)) {
      // keep as given; optionally clamp
      out[role] = Math.min(Math.max(v, 0.1), 50);
    }
  }
  return Object.keys(out).length ? out : undefined;
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

// public API
// Validate shape only (throws ZodError on failure)
export function validateStoryShape(input: unknown): StoryFile {
  return StoryFileSchema.parse(input);
}

// Validate + normalize into runtime-friendly structure (throws on failure)
export function parseAndNormalizeStory(input: unknown): NormalizedStory {
  const story = validateStoryShape(input);

  const checkpoints: NormalizedCheckpoint[] = story.checkpoints.map((cp, idx) => {
    // compile regexes
    const winTrigger = compileRegex(cp.win_trigger, `checkpoints[${idx}].win_trigger`);
    const failTrigger = cp.fail_trigger ? compileRegex(cp.fail_trigger, `checkpoints[${idx}].fail_trigger`) : undefined;

    // normalize on_activate
    const on: NormalizedOnActivate | undefined = cp.on_activate
      ? {
        authors_note: normalizeAuthorsNote(cp.on_activate.authors_note),
        cfg_scale: normalizeCfgScale(cp.on_activate.cfg_scale),
        world_info: normalizeWorldInfo(cp.on_activate.world_info),
      }
      : undefined;

    return {
      id: cp.id,
      name: cp.name,
      objective: cp.objective,
      winTrigger,
      failTrigger,
      onActivate: on,
    };
  });

  // build id index for O(1) lookup
  const checkpointIndexById = new Map<string | number, number>();
  checkpoints.forEach((c, i) => checkpointIndexById.set(c.id, i));

  return {
    schemaVersion: "1.0",
    title: story.title,
    roles: story.roles,
    checkpoints,
    checkpointIndexById,
  };
}

// Pretty-print Zod issues
export function formatZodError(e: unknown): string[] {
  if (!(e instanceof z.ZodError)) return [String(e)];
  return e.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`);
}
