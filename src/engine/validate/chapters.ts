import {
  CHAPTER_KINDS, OPEN_THREAD_POLICIES, RECORD_STYLES, STORY_SO_FAR_MODES, type Chapter, type ChapterSealPolicy, type Checkpoint,
  type StoryMemoryOptions, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, rejectUnknownKeys } from "./common";

const CHAPTER_KEYS = ["id", "title", "player_title", "kind", "seal", "final"] as const;
const SEAL_KEYS = ["open_threads", "keep_tail", "fold_messages", "record_style"] as const;

const readSeal = (value: unknown, path: string, errors: ValidationError[]): ChapterSealPolicy | undefined => {
  if (!isRecord(value)) return void addError(errors, path, "seal must be an object");
  rejectUnknownKeys(value, SEAL_KEYS, path, errors);
  const seal: ChapterSealPolicy = {};
  if (value.open_threads !== undefined) {
    if (isOneOf(value.open_threads, OPEN_THREAD_POLICIES)) seal.open_threads = value.open_threads;
    else addError(errors, `${path}.open_threads`, `open_threads must be one of ${OPEN_THREAD_POLICIES.join(", ")}`);
  }
  if (value.keep_tail !== undefined) {
    if (typeof value.keep_tail === "number" && Number.isInteger(value.keep_tail) && value.keep_tail >= 0) seal.keep_tail = value.keep_tail;
    else addError(errors, `${path}.keep_tail`, "keep_tail must be a whole number >= 0");
  }
  if (value.fold_messages !== undefined) {
    if (typeof value.fold_messages === "boolean") seal.fold_messages = value.fold_messages;
    else addError(errors, `${path}.fold_messages`, "fold_messages must be true or false");
  }
  if (value.record_style !== undefined) {
    if (isOneOf(value.record_style, RECORD_STYLES)) seal.record_style = value.record_style;
    else addError(errors, `${path}.record_style`, `record_style must be one of ${RECORD_STYLES.join(", ")}`);
  }
  return Object.keys(seal).length ? seal : undefined;
};

const readChapter = (value: unknown, path: string, errors: ValidationError[]): Chapter | null => {
  if (!isRecord(value)) {
    addError(errors, path, "chapter must be an object");
    return null;
  }
  rejectUnknownKeys(value, CHAPTER_KEYS, path, errors);
  const id = asString(value.id)?.trim();
  const title = asString(value.title)?.trim();
  if (!id) addError(errors, `${path}.id`, "chapter id is required");
  if (!title) addError(errors, `${path}.title`, "chapter title is required");
  if (!id || !title) return null;
  const chapter: Chapter = { id, title };
  if (value.player_title !== undefined) {
    if (typeof value.player_title !== "string") addError(errors, `${path}.player_title`, "player_title must be text");
    else if (value.player_title.trim()) chapter.player_title = value.player_title.trim();
  }
  if (value.kind !== undefined) {
    if (isOneOf(value.kind, CHAPTER_KINDS)) chapter.kind = value.kind;
    else addError(errors, `${path}.kind`, `kind must be one of ${CHAPTER_KINDS.join(", ")}`);
  }
  if (value.final !== undefined) {
    if (typeof value.final === "boolean") chapter.final = value.final;
    else addError(errors, `${path}.final`, "final must be true or false");
  }
  const seal = value.seal === undefined ? undefined : readSeal(value.seal, `${path}.seal`, errors);
  if (seal) chapter.seal = seal;
  return chapter;
};

export const readChapters = (value: unknown, errors: ValidationError[]): Chapter[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return void addError(errors, "chapters", "chapters must be an array");
  const chapters = value.map((entry, index) => readChapter(entry, `chapters.${index}`, errors)).filter((entry): entry is Chapter => entry !== null);
  const seen = new Set<string>();
  chapters.forEach((chapter, index) => {
    if (seen.has(chapter.id)) addError(errors, `chapters.${index}.id`, `duplicate chapter '${chapter.id}'`);
    seen.add(chapter.id);
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
  if (!chapters) {
    checkpoints.forEach((checkpoint, index) => {
      if (checkpoint.chapter) addError(errors, `checkpoints.${index}.chapter`, `unknown chapter '${checkpoint.chapter}' (the story declares no chapters)`);
    });
    return {};
  }
  const chapterById = Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter]));
  const chapterByCheckpoint: Record<string, string> = {};
  checkpoints.forEach((checkpoint, index) => {
    if (!checkpoint.chapter) return addError(errors, `checkpoints.${index}.chapter`, "every checkpoint needs a chapter once chapters are declared");
    if (!chapterById[checkpoint.chapter]) return addError(errors, `checkpoints.${index}.chapter`, `unknown chapter '${checkpoint.chapter}'`);
    chapterByCheckpoint[checkpoint.id] = checkpoint.chapter;
  });
  return { chapterById, chapterByCheckpoint };
};

export const readMemoryOptions = (value: unknown, errors: ValidationError[]): StoryMemoryOptions | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "memory", "memory must be an object");
  rejectUnknownKeys(value, ["story_so_far"], "memory", errors);
  if (value.story_so_far === undefined) return undefined;
  if (isOneOf(value.story_so_far, STORY_SO_FAR_MODES)) return { story_so_far: value.story_so_far };
  return void addError(errors, "memory.story_so_far", `story_so_far must be one of ${STORY_SO_FAR_MODES.join(", ")}`);
};
