import { ILLUSTRATION_PURPOSES, type BundledWorkflow, type IllustrationLook, type StoryIllustrations, type ValidationError, type WorkflowMap } from "../schema";
import { isRecord } from "@utils/guards";
import { addError, rejectUnknownKeys } from "./common";

const LOOK_KEYS = ["style", "appearances"] as const;
const STORY_KEYS = ["checkpoints", "scenes", "workflows", "bundle", ...LOOK_KEYS] as const;
export const isWorkflowFileName = (name: unknown): name is string => typeof name === "string" && /^[\w(][\w .()[\]+,;=!@#$%&'~-]{0,194}\.json$/i.test(name);

export const readWorkflowMap = (value: unknown, path: string, errors: ValidationError[]): WorkflowMap | undefined => {
  if (value === undefined) return undefined;
  const map: Record<string, string> = {};
  for (const [purpose, name] of Object.entries(isRecord(value) ? value : { "": value })) {
    if ((ILLUSTRATION_PURPOSES as readonly string[]).includes(purpose) && isWorkflowFileName(name)) map[purpose] = name;
    else addError(errors, purpose ? `${path}.${purpose}` : path, "needs a .json workflow name");
  }
  return Object.keys(map).length ? map : undefined;
};

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
  const workflows = readWorkflowMap(image.workflows, "illustrations.workflows", errors);
  const bundle = image.bundle;
  if (bundle !== undefined && !isRecord(bundle)) addError(errors, "illustrations.bundle", "bundle must be an object");
  const illustrations: StoryIllustrations = {
    ...(image.checkpoints === true ? { checkpoints: true } : {}),
    ...(image.scenes === true ? { scenes: true } : {}),
    ...readLookFields(image, "illustrations", errors),
    ...(workflows ? { workflows } : {}),
    ...(isRecord(bundle) ? { bundle: bundle as Record<string, BundledWorkflow> } : {}),
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
