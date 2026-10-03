import type { IllustrationLook, StoryIllustrations, ValidationError } from "../schema";
import { isRecord } from "@utils/guards";
import { addError, rejectUnknownKeys } from "./common";

const LOOK_KEYS = ["style", "appearances"] as const;
const STORY_KEYS = ["checkpoints", "scenes", ...LOOK_KEYS] as const;

const readLookFields = (image: Record<string, unknown>, path: string, errors: ValidationError[]): IllustrationLook => {
  if (image.style !== undefined && typeof image.style !== "string") addError(errors, `${path}.style`, "style must be text");
  const appearances = image.appearances;
  const mapsText = isRecord(appearances) && Object.values(appearances).every((entry) => typeof entry === "string");
  if (appearances !== undefined && !mapsText) addError(errors, `${path}.appearances`, "appearances must map cast ids to text");
  return {
    ...(typeof image.style === "string" && image.style.trim() ? { style: image.style.trim() } : {}),
    ...(mapsText ? { appearances: Object.fromEntries(Object.entries(appearances).filter(([, entry]) => (entry as string).trim()).map(([key, entry]) => [key, (entry as string).trim()])) } : {}),
  };
};

export const readStoryIllustrations = (image: unknown, errors: ValidationError[]): StoryIllustrations | undefined => {
  if (image === undefined) return undefined;
  if (!isRecord(image)) return void addError(errors, "illustrations", "illustrations must be an object");
  rejectUnknownKeys(image, STORY_KEYS, "illustrations", errors);
  for (const key of ["checkpoints", "scenes"] as const) {
    if (image[key] !== undefined && typeof image[key] !== "boolean") addError(errors, `illustrations.${key}`, `${key} must be true or false`);
  }
  const illustrations: StoryIllustrations = {
    ...(image.checkpoints === true ? { checkpoints: true } : {}),
    ...(image.scenes === true ? { scenes: true } : {}),
    ...readLookFields(image, "illustrations", errors),
  };
  return Object.keys(illustrations).length ? illustrations : undefined;
};

export const readIllustrationLook = (image: unknown, path: string, errors: ValidationError[]): IllustrationLook | undefined => {
  if (image === undefined) return undefined;
  if (!isRecord(image)) return void addError(errors, path, "illustrations must be an object");
  rejectUnknownKeys(image, LOOK_KEYS, path, errors);
  const look = readLookFields(image, path, errors);
  return Object.keys(look).length ? look : undefined;
};
