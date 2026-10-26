import { ILLUSTRATION_PURPOSES, type BundledWorkflow, type IllustrationLook, type StoryIllustrations, type StoryVisualPacks, type ValidationError, type VisualPackRef,
  type WorkflowMap } from "../schema";
import { isRecord } from "@utils/guards";
import { addError, rejectUnknownKeys } from "./common";

const LOOK_KEYS = ["style", "appearances"] as const;
const STORY_KEYS = ["checkpoints", "scenes", "workflows", "bundle", "packs", ...LOOK_KEYS] as const;
const PACK_KEYS = ["style", "identities", "places"] as const;
export const VISUAL_PACK_ID = /^[a-z0-9][a-z0-9_.-]{0,127}$/;
export const VISUAL_PACK_DIGEST = /^[a-f0-9]{64}$/;
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

const readPackRef = (value: unknown, path: string, errors: ValidationError[]): VisualPackRef | undefined => {
  if (!isRecord(value)) return void addError(errors, path, "a pack binding is {id, digest}");
  rejectUnknownKeys(value, ["id", "digest"], path, errors);
  if (typeof value.id !== "string" || !VISUAL_PACK_ID.test(value.id)) return void addError(errors, `${path}.id`, "a pack id is lowercase letters, digits, '.', '_' or '-'");
  if (typeof value.digest !== "string" || !VISUAL_PACK_DIGEST.test(value.digest)) return void addError(errors, `${path}.digest`, "a pack digest is the pack's sha256, 64 hex characters");
  return { id: value.id, digest: value.digest };
};

const readPackMap = (value: unknown, path: string, errors: ValidationError[]): Record<string, VisualPackRef> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, path, "must map ids to pack bindings");
  const map = Object.fromEntries(Object.entries(value).flatMap(([key, ref]) => {
    const read = readPackRef(ref, `${path}.${key}`, errors);
    return read ? [[key, read]] : [];
  }));
  return Object.keys(map).length ? map : undefined;
};

const readVisualPacks = (value: unknown, errors: ValidationError[]): StoryVisualPacks | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "illustrations.packs", "packs must be an object");
  rejectUnknownKeys(value, PACK_KEYS, "illustrations.packs", errors);
  const style = value.style === undefined ? undefined : readPackRef(value.style, "illustrations.packs.style", errors);
  const identities = readPackMap(value.identities, "illustrations.packs.identities", errors);
  const places = readPackMap(value.places, "illustrations.packs.places", errors);
  const packs = { ...(style ? { style } : {}), ...(identities ? { identities } : {}), ...(places ? { places } : {}) };
  return Object.keys(packs).length ? packs : undefined;
};

export const checkPackBindings = (packs: StoryVisualPacks | undefined, rosterIds: ReadonlySet<string>, checkpointIds: ReadonlySet<string>, errors: ValidationError[]): void => {
  for (const id of Object.keys(packs?.identities ?? {})) {
    if (!rosterIds.has(id)) addError(errors, `illustrations.packs.identities.${id}`, `unknown cast member '${id}'`);
  }
  for (const id of Object.keys(packs?.places ?? {})) {
    if (!checkpointIds.has(id)) addError(errors, `illustrations.packs.places.${id}`, `unknown checkpoint '${id}'`);
  }
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
  const packs = readVisualPacks(image.packs, errors);
  const illustrations: StoryIllustrations = {
    ...(image.checkpoints === true ? { checkpoints: true } : {}),
    ...(image.scenes === true ? { scenes: true } : {}),
    ...readLookFields(image, "illustrations", errors),
    ...(workflows ? { workflows } : {}),
    ...(isRecord(bundle) ? { bundle: bundle as Record<string, BundledWorkflow> } : {}),
    ...(packs ? { packs } : {}),
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
