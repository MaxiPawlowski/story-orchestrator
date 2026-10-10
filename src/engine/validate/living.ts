import {
  DEFAULT_LIVING_CHAPTER_SIZE, LIVING_AUTONOMY, LIVING_CHAPTER_SIZE_MAX, LIVING_ENDING_MODES, LIVING_HORIZON_MAX, LIVING_OPENING_ID,
  LIVING_OPENING_MAX_CHARS, LIVING_PREMISE_MAX_CHARS, LIVING_TONE_MAX_CHARS, isLivingId,
  type Checkpoint, type LivingEnding, type Quality, type RosterMember, type StoryLiving, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { readText } from "./briefing";
import { readGate, validateGate } from "./gates";

const LIVING_KEYS = ["premise", "tone", "cast", "horizon", "chapter_size", "ending", "autonomy", "authored_until", "opening"] as const;

const wholeIn = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const readChapterSize = (value: unknown, errors: ValidationError[]): [number, number] | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.length === 2 && wholeIn(value[0], 1, LIVING_CHAPTER_SIZE_MAX) && wholeIn(value[1], 1, LIVING_CHAPTER_SIZE_MAX) && value[0] <= value[1]) {
    return [value[0], value[1]];
  }
  return void addError(errors, "living.chapter_size", `chapter_size must be [min, max], whole numbers from 1 to ${LIVING_CHAPTER_SIZE_MAX}, min no larger than max`);
};

const readEnding = (value: unknown, errors: ValidationError[]): LivingEnding | undefined => {
  if (value === undefined) return undefined;
  if (isOneOf(value, LIVING_ENDING_MODES)) return value;
  if (isRecord(value)) {
    rejectUnknownKeys(value, ["when"], "living.ending", errors);
    const gate = readGate(value.when, "living.ending.when", errors);
    return gate ? { when: gate } : undefined;
  }
  return void addError(errors, "living.ending", `ending must be ${LIVING_ENDING_MODES.map((mode) => `"${mode}"`).join(", ")} or { when: <gate> }`);
};

const readCast = (value: unknown, errors: ValidationError[]): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    return void addError(errors, "living.cast", "cast must be a list of roster ids");
  }
  return [...new Set((value as string[]).map((entry) => entry.trim()))];
};

export const readLiving = (value: unknown, errors: ValidationError[]): StoryLiving | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "living", "living must be an object");
  rejectUnknownKeys(value, LIVING_KEYS, "living", errors);
  const premise = readText(value.premise, "living.premise", LIVING_PREMISE_MAX_CHARS, errors, true);
  const tone = readText(value.tone, "living.tone", LIVING_TONE_MAX_CHARS, errors);
  const opening = readText(value.opening, "living.opening", LIVING_OPENING_MAX_CHARS, errors);
  if (value.horizon !== undefined && !wholeIn(value.horizon, 1, LIVING_HORIZON_MAX)) addError(errors, "living.horizon", `horizon must be a whole number from 1 to ${LIVING_HORIZON_MAX}`);
  if (value.autonomy !== undefined && !isOneOf(value.autonomy, LIVING_AUTONOMY)) addError(errors, "living.autonomy", `autonomy must be one of ${LIVING_AUTONOMY.join(", ")}`);
  const authoredUntil = value.authored_until === undefined ? undefined : typeof value.authored_until === "string" && value.authored_until.trim() ? value.authored_until.trim() : null;
  if (authoredUntil === null) addError(errors, "living.authored_until", "authored_until must be a checkpoint id");
  const cast = readCast(value.cast, errors);
  const chapterSize = readChapterSize(value.chapter_size, errors);
  const ending = readEnding(value.ending, errors);
  if (!premise) return undefined;
  return {
    premise,
    ...(tone ? { tone } : {}),
    ...(cast?.length ? { cast } : {}),
    ...(wholeIn(value.horizon, 1, LIVING_HORIZON_MAX) ? { horizon: value.horizon } : {}),
    ...(chapterSize ? { chapter_size: chapterSize } : {}),
    ...(ending ? { ending } : {}),
    ...(isOneOf(value.autonomy, LIVING_AUTONOMY) ? { autonomy: value.autonomy } : {}),
    ...(authoredUntil ? { authored_until: authoredUntil } : {}),
    ...(opening ? { opening } : {}),
  };
};

export const needsLivingOpening = (living: StoryLiving | undefined, checkpoints: readonly Checkpoint[]): boolean =>
  Boolean(living) && !checkpoints.some((checkpoint) => checkpoint.id === LIVING_OPENING_ID) && checkpoints.every((checkpoint) => isLivingId(checkpoint.id));

export const LIVING_FIRST_CHAPTER_ID = "liv_ch_1";

const declaresFirstChapter = (chapters: unknown): boolean =>
  Array.isArray(chapters) && chapters.some((chapter) => isRecord(chapter) && chapter.id === LIVING_FIRST_CHAPTER_ID);

export const livingOpening = (living: StoryLiving, chapters?: unknown): Checkpoint => ({
  id: LIVING_OPENING_ID,
  name: "The opening",
  objective: living.opening ?? living.premise,
  type: "anchor",
  start: true,
  tension_target: "calm",
  ...(declaresFirstChapter(chapters) ? { chapter: LIVING_FIRST_CHAPTER_ID } : {}),
});

export const checkLiving = (
  living: StoryLiving | undefined, checkpointById: Record<string, Checkpoint>, roster: readonly RosterMember[], qualityByKey: Record<string, Quality>, errors: ValidationError[],
) => {
  if (!living) return;
  if (typeof living.ending === "object") validateGate(living.ending.when, qualityByKey, "living.ending.when", errors);
  const ids = new Set(roster.map((member) => member.id));
  living.cast?.forEach((id, index) => {
    if (!ids.has(id)) addError(errors, `living.cast.${index}`, `unknown roster member '${id}'`);
  });
  if (living.authored_until) {
    const until = checkpointById[living.authored_until];
    if (!until) addError(errors, "living.authored_until", `unknown checkpoint '${living.authored_until}'`);
    else if (until.type !== "anchor") addError(errors, "living.authored_until", `'${living.authored_until}' must be an anchor`);
  }
};

export const livingChapterSize = (living: StoryLiving): [number, number] => living.chapter_size ?? DEFAULT_LIVING_CHAPTER_SIZE;
