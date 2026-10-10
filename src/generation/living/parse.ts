import {
  GATE_OPERATORS, LIVING_MAX_NAME_CHARS, LIVING_MAX_OBJECTIVE_CHARS, TENSION_LEVELS,
  type GateNode, type GateOperator, type NormalizedStoryV2, type PrimitiveValue, type TensionLevel,
} from "@engine/index";
import { stripReasoningBlocks } from "@extraction/parse";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import type { DirectorDraft } from "./types";

export type DirectorParse = { ok: true; draft: DirectorDraft } | { ok: false; issues: string[] };

export const LIVING_MAX_RUBRIC_CHARS = 240;

export const wordsFor = (chars: number): number => Math.max(1, Math.floor(chars / 7 / 5) * 5);

const SENTENCE = /[^.!?]+[.!?]+["'\u201d\u2019)\]]*\s*/g;

export function trimToSentences(value: string, max: number): string | null {
  const sentences = value.match(SENTENCE) ?? [];
  let kept = "";
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > max) break;
    kept += sentence;
  }
  const trimmed = kept.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

const isPrimitive = (value: unknown): value is PrimitiveValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const KEY = /^[a-z][a-z0-9_]{0,31}$/;

const jsonObject = (raw: string): unknown => {
  const text = normalizeJsonText(stripReasoningBlocks(raw));
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const text = (value: unknown, path: string, max: number, issues: string[]): string => {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${path} is required`);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push(`${path} is longer than ${max} characters (it has ${trimmed.length}; about ${wordsFor(max)} words at most)`);
  if (/\{\{[^}]*\}\}/.test(trimmed)) issues.push(`${path} holds a macro`);
  return trimmed;
};

const readReuseGate = (value: unknown, story: NormalizedStoryV2, issues: string[]): GateNode | null => {
  if (!isRecord(value) || typeof value.q !== "string" || typeof value.op !== "string" || !(GATE_OPERATORS as readonly string[]).includes(value.op)) {
    issues.push("opens_when.reuse must be {q, op, v}");
    return null;
  }
  const quality = story.qualityByKey[value.q];
  if (!quality) {
    issues.push(`opens_when.reuse names unknown '${value.q}'`);
    return null;
  }
  const raw = value.v;
  const coerce = (entry: unknown): PrimitiveValue | null => {
    if (!isPrimitive(entry)) return null;
    if (quality.type === "bool" && typeof entry === "string" && /^(true|false)$/i.test(entry)) return entry.toLowerCase() === "true";
    if ((quality.type === "int" || quality.type === "float") && typeof entry === "string" && Number.isFinite(Number(entry))) return Number(entry);
    return entry;
  };
  const v = Array.isArray(raw) ? raw.map(coerce) : coerce(raw);
  if (v === null || (Array.isArray(v) && v.some((entry) => entry === null))) {
    issues.push("opens_when.reuse.v must be a literal");
    return null;
  }
  return { q: value.q, op: value.op as GateOperator, v: v as PrimitiveValue | PrimitiveValue[] };
};

const readSnapshot = (value: unknown, issues: string[]): Record<string, PrimitiveValue> => {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    issues.push("snapshot must be an object");
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, PrimitiveValue] => {
    if (isPrimitive(entry[1])) return true;
    issues.push(`snapshot.${entry[0]} must be a literal`);
    return false;
  }));
};

export function parseDirectorDraft(raw: string, story: NormalizedStoryV2): DirectorParse {
  const parsed = jsonObject(raw);
  if (!isRecord(parsed)) return { ok: false, issues: ["the answer was not one JSON object"] };
  const issues: string[] = [];
  const name = text(parsed.name, "name", LIVING_MAX_NAME_CHARS, issues);
  const repaired: string[] = [];
  const written = typeof parsed.objective === "string" ? parsed.objective.trim() : parsed.objective;
  const cut = typeof written === "string" && written.length > LIVING_MAX_OBJECTIVE_CHARS ? trimToSentences(written, LIVING_MAX_OBJECTIVE_CHARS) : null;
  if (cut && typeof written === "string") repaired.push(`objective trimmed at a sentence boundary from ${written.length} to ${cut.length} characters`);
  const objective = text(cut ?? written, "objective", LIVING_MAX_OBJECTIVE_CHARS, issues);
  const tension = (TENSION_LEVELS as readonly string[]).includes(String(parsed.tension)) ? parsed.tension as TensionLevel : null;
  if (!tension) issues.push(`tension must be one of ${TENSION_LEVELS.join(", ")}`);
  const opens = parsed.opens_when;
  let opensWhen: DirectorDraft["opensWhen"] | null = null;
  if (isRecord(opens) && isRecord(opens.new)) {
    const key = typeof opens.new.key === "string" ? opens.new.key.trim().toLowerCase() : "";
    if (!KEY.test(key)) issues.push("opens_when.new.key must be a short snake_case key");
    const rubric = text(opens.new.rubric, "opens_when.new.rubric", LIVING_MAX_RUBRIC_CHARS, issues);
    opensWhen = { kind: "new", key, rubric };
  } else if (isRecord(opens) && opens.reuse !== undefined) {
    const gate = readReuseGate(opens.reuse, story, issues);
    opensWhen = gate ? { kind: "reuse", gate } : null;
  } else {
    issues.push("opens_when must be {new:{key,rubric}} or {reuse:{q,op,v}}");
  }
  const newQualities: DirectorDraft["newQualities"] = [];
  if (parsed.new_qualities !== undefined && parsed.new_qualities !== null) {
    if (!Array.isArray(parsed.new_qualities)) issues.push("new_qualities must be a list");
    else parsed.new_qualities.forEach((entry, index) => {
      if (!isRecord(entry)) return void issues.push(`new_qualities.${index} must be an object`);
      const key = typeof entry.key === "string" ? entry.key.trim().toLowerCase() : "";
      if (!KEY.test(key)) issues.push(`new_qualities.${index}.key must be a short snake_case key`);
      const type = entry.type === "int" ? "int" : entry.type === "bool" ? "bool" : null;
      if (!type) issues.push(`new_qualities.${index}.type must be bool or int`);
      const rubric = text(entry.rubric, `new_qualities.${index}.rubric`, LIVING_MAX_RUBRIC_CHARS, issues);
      if (type) newQualities.push({ key, type, rubric });
    });
  }
  const snapshot = readSnapshot(parsed.snapshot, issues);
  const buildsOn = typeof parsed.builds_on === "string" && parsed.builds_on.trim() && parsed.builds_on.trim().toLowerCase() !== "null" ? parsed.builds_on.trim() : null;
  const chapterTitle = typeof parsed.chapter_title === "string" && parsed.chapter_title.trim() ? parsed.chapter_title.trim().slice(0, 60) : undefined;
  if (issues.length || !opensWhen || !tension) return { ok: false, issues: issues.length ? issues : ["incomplete answer"] };
  return {
    ok: true,
    draft: {
      anchor: { name, objective, tension, snapshot, final: parsed.final === true },
      opensWhen,
      newQualities,
      buildsOn,
      newChapter: parsed.new_chapter === true,
      ...(chapterTitle ? { chapterTitle } : {}),
      reason: typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 300) : "",
      ...(repaired.length ? { repaired } : {}),
    },
  };
}
