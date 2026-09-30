import {
  CHAPTER_KINDS, OPEN_THREAD_POLICIES, RECORD_STYLES, STORY_SO_FAR_MODES, type Chapter, type Checkpoint, type StoryMemoryOptions, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, rejectUnknownKeys } from "./common";

type FieldRule = readonly string[] | "text" | "flag" | "count";

const fits = (value: unknown, rule: FieldRule) => (rule === "text" ? typeof value === "string"
  : rule === "flag" ? typeof value === "boolean"
    : rule === "count" ? Number.isInteger(value) && (value as number) >= 0
      : rule.includes(value as string));

const readFields = (value: Record<string, unknown>, rules: Record<string, FieldRule>, path: string, errors: ValidationError[]) => {
  rejectUnknownKeys(value, Object.keys(rules), path, errors);
  const out: Record<string, unknown> = {};
  Object.entries(rules).forEach(([key, rule]) => {
    const found = value[key];
    if (found === undefined || rule === "text" && typeof found === "string" && !found.trim()) return;
    if (fits(found, rule)) out[key] = typeof found === "string" ? found.trim() : found;
    else addError(errors, `${path}.${key}`, `${key} must be ${EXPECTED[typeof rule === "string" ? rule : "list"] ?? ""}${Array.isArray(rule) ? rule.join(", ") : ""}`);
  });
  return out;
};

const EXPECTED: Record<string, string> = { count: "a whole number >= 0", flag: "true or false", text: "text", list: "one of " };

const SEAL_RULES = { open_threads: OPEN_THREAD_POLICIES, keep_tail: "count", fold_messages: "flag", record_style: RECORD_STYLES } as const;
const CHAPTER_RULES = { id: "text", title: "text", player_title: "text", kind: CHAPTER_KINDS, final: "flag" } as const;

const readChapter = (value: unknown, path: string, errors: ValidationError[]): Chapter | null => {
  if (!isRecord(value)) {
    addError(errors, path, "chapter must be an object");
    return null;
  }
  const { seal: _seal, ...rest } = value;
  const chapter = readFields(rest, CHAPTER_RULES, path, errors) as Partial<Chapter>;
  if (!chapter.id) addError(errors, `${path}.id`, "chapter id is required");
  if (!chapter.title) addError(errors, `${path}.title`, "chapter title is required");
  if (value.seal !== undefined) {
    if (!isRecord(value.seal)) addError(errors, `${path}.seal`, "seal must be an object");
    else chapter.seal = readFields(value.seal, SEAL_RULES, `${path}.seal`, errors);
  }
  return chapter.id && chapter.title ? chapter as Chapter : null;
};

export const readChapters = (value: unknown, errors: ValidationError[]): Chapter[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return void addError(errors, "chapters", "chapters must be an array");
  const chapters = value.map((entry, index) => readChapter(entry, `chapters.${index}`, errors)).filter((entry): entry is Chapter => entry !== null);
  chapters.forEach((chapter, index) => {
    if (chapters.findIndex((other) => other.id === chapter.id) !== index) addError(errors, `chapters.${index}.id`, `duplicate chapter '${chapter.id}'`);
  });
  return chapters.length ? chapters : undefined;
};

export const readCheckpointChapter = (value: Record<string, unknown>, checkpoint: Checkpoint, path: string, errors: ValidationError[]) => {
  if (value.chapter === undefined) return;
  const id = asString(value.chapter)?.trim();
  if (id) checkpoint.chapter = id;
  else addError(errors, `${path}.chapter`, "chapter must be a chapter id");
};

export const indexChapters = (chapters: Chapter[] | undefined, checkpoints: Checkpoint[], errors: ValidationError[]) => {
  const chapterById = Object.fromEntries((chapters ?? []).map((chapter) => [chapter.id, chapter]));
  const chapterByCheckpoint: Record<string, string> = {};
  checkpoints.forEach((checkpoint, index) => {
    const path = `checkpoints.${index}.chapter`;
    if (!checkpoint.chapter) return void (chapters && addError(errors, path, "every checkpoint needs a chapter once chapters are declared"));
    if (!chapterById[checkpoint.chapter]) return addError(errors, path, `unknown chapter '${checkpoint.chapter}'`);
    chapterByCheckpoint[checkpoint.id] = checkpoint.chapter;
  });
  return chapters ? { chapterById, chapterByCheckpoint } : {};
};

export const readMemoryOptions = (value: unknown, errors: ValidationError[]): StoryMemoryOptions | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "memory", "memory must be an object");
  const options = readFields(value, { story_so_far: STORY_SO_FAR_MODES }, "memory", errors) as StoryMemoryOptions;
  return options.story_so_far ? options : undefined;
};
