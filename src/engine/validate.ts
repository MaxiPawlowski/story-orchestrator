import {
  STORY_ID_PATTERN, type Checkpoint, type NormalizedStoryV2, type NormalizedTransition, type Quality, type StoryV2,
  type Transition, type ValidationError,
} from "./schema";
import { isRecord } from "@utils/guards";
import { addError, asString } from "./validate/common";
import { buildReachability, readTransition, validateGate, validateLiteral } from "./validate/gates";
import { readCheckpoint, readRoster } from "./validate/checkpoints";
import { addBuiltinTensionQuality, addProgressQualities, readQuality } from "./validate/qualities";
import { readArcBridges, readStoryOptions } from "./validate/storyOptions";

export const INTERMEDIATE_UNREACHABLE = "intermediate checkpoint has no reachable anchor beyond it";

const readHeader = (json: Record<string, unknown>, errors: ValidationError[]) => {
  if (json.format !== 2) addError(errors, "format", "story format must be 2");
  const storyId = json.id === undefined ? undefined : asString(json.id)?.trim().toLowerCase();
  if (json.id !== undefined && (!storyId || !STORY_ID_PATTERN.test(storyId))) {
    addError(errors, "id", "id must be a slug: lowercase letters, digits, '-' or '_', starting alphanumeric, max 64 chars");
  }
  const storyVersion = json.version === undefined ? 1 : (typeof json.version === "number" && Number.isInteger(json.version) && json.version >= 1 ? json.version : null);
  if (storyVersion === null) addError(errors, "version", "version must be an integer >= 1");
  if (typeof json.title !== "string") addError(errors, "title", "title is required");
  if (typeof json.description !== "string") addError(errors, "description", "description is required");
  if (!Array.isArray(json.qualities)) addError(errors, "qualities", "qualities must be an array");
  if (!Array.isArray(json.checkpoints)) addError(errors, "checkpoints", "checkpoints must be an array");
  if (!Array.isArray(json.transitions)) addError(errors, "transitions", "transitions must be an array");
  if (!Array.isArray(json.roster)) addError(errors, "roster", "roster must be an array");
  return { storyId, storyVersion };
};

const indexUnique = <T,>(items: T[], keyOf: (item: T) => string, path: (index: number) => string, label: string, errors: ValidationError[]) => {
  const byKey: Record<string, T> = {};
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (byKey[key]) addError(errors, path(index), `duplicate ${label} '${key}'`);
    byKey[key] = item;
  });
  return byKey;
};

interface GraphParts {
  checkpoints: Checkpoint[];
  transitions: Transition[];
  checkpointById: Record<string, Checkpoint>;
  qualityByKey: Record<string, Quality>;
  arcBridges: Array<{ arcMatch: string; anchor: string; amount: number }> | undefined;
}

const checkReferences = ({ checkpoints, transitions, checkpointById, qualityByKey, arcBridges }: GraphParts, errors: ValidationError[]) => {
  transitions.forEach((transition, index) => {
    if (!checkpointById[transition.from]) addError(errors, `transitions.${index}.from`, `unknown checkpoint '${transition.from}'`);
    if (!checkpointById[transition.to]) addError(errors, `transitions.${index}.to`, `unknown checkpoint '${transition.to}'`);
    validateGate(transition.gate, qualityByKey, `transitions.${index}.gate`, errors);
    if (transition.effects?.progress && !checkpointById[transition.effects.progress.anchor]) {
      addError(errors, `transitions.${index}.effects.progress.anchor`, `unknown anchor '${transition.effects.progress.anchor}'`);
    }
  });
  arcBridges?.forEach((bridge, index) => {
    if (!checkpointById[bridge.anchor] || checkpointById[bridge.anchor].type !== "anchor") {
      addError(errors, `arc_bridges.${index}.anchor`, `unknown anchor '${bridge.anchor}'`);
    }
  });
  checkpoints.forEach((checkpoint, checkpointIndex) => {
    Object.entries(checkpoint.state_snapshot ?? {}).forEach(([key, value]) => {
      const quality = qualityByKey[key];
      if (!quality) addError(errors, `checkpoints.${checkpointIndex}.state_snapshot.${key}`, `unknown quality '${key}'`);
      else validateLiteral(quality, value, `checkpoints.${checkpointIndex}.state_snapshot.${key}`, errors);
    });
  });
};

const checkIntermediates = (checkpoints: Checkpoint[], checkpointById: Record<string, Checkpoint>, reachableByCheckpoint: Record<string, string[]>, errors: ValidationError[]) => {
  checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.type !== "intermediate") return;
    const reachableAnchors = reachableByCheckpoint[checkpoint.id]?.some((id) => checkpointById[id]?.type === "anchor");
    if (!reachableAnchors) addError(errors, `checkpoints.${index}`, INTERMEDIATE_UNREACHABLE);
  });
};

const orderOutgoing = (checkpoints: Checkpoint[], normalizedTransitions: NormalizedTransition[]) => {
  const outgoingByCheckpoint: Record<string, NormalizedTransition[]> = Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.id, []]));
  normalizedTransitions.forEach((transition) => outgoingByCheckpoint[transition.from]?.push(transition));
  Object.values(outgoingByCheckpoint).forEach((outgoing) => {
    outgoing.sort((left, right) => right.priority - left.priority || left.declarationIndex - right.declarationIndex);
  });
  return outgoingByCheckpoint;
};

const readList = <T,>(value: unknown, prefix: string, read: (entry: unknown, path: string, errors: ValidationError[]) => T | null, errors: ValidationError[]) =>
  (value as unknown[]).map((entry, index) => read(entry, `${prefix}.${index}`, errors)).filter((entry): entry is T => entry !== null);

export const parseStoryV2 = (json: unknown): NormalizedStoryV2 | ValidationError[] => {
  const errors: ValidationError[] = [];
  if (!isRecord(json)) return [{ path: "$", message: "story must be an object" }];
  const { storyId, storyVersion } = readHeader(json, errors);
  if (errors.length) return errors;

  const checkpoints = readList(json.checkpoints, "checkpoints", readCheckpoint, errors);
  const baseQualities = readList(json.qualities, "qualities", readQuality, errors);
  const transitions = readList(json.transitions, "transitions", readTransition, errors);
  const qualities = addBuiltinTensionQuality(addProgressQualities(baseQualities, checkpoints, errors), errors);
  const options = readStoryOptions(json, errors);
  const roster = readRoster(json.roster as StoryV2["roster"], errors);
  const arcBridges = readArcBridges(json.arc_bridges, errors);

  const checkpointById = indexUnique(checkpoints, (checkpoint) => checkpoint.id, (index) => `checkpoints.${index}.id`, "checkpoint", errors);
  const qualityByKey = indexUnique(qualities, (quality) => quality.key, (index) => `qualities.${index}.key`, "quality", errors);

  const starts = checkpoints.filter((checkpoint) => checkpoint.start);
  if (starts.length > 1) addError(errors, "checkpoints", "only one checkpoint may be start");
  if (!checkpoints.length) addError(errors, "checkpoints", "at least one checkpoint is required");
  const startCheckpointId = starts[0]?.id ?? checkpoints[0]?.id ?? "";

  checkReferences({ checkpoints, transitions, checkpointById, qualityByKey, arcBridges }, errors);
  const normalizedTransitions = transitions.map((transition, declarationIndex) => ({ ...transition, declarationIndex }));
  const reachableByCheckpoint = buildReachability(checkpoints, normalizedTransitions);
  checkIntermediates(checkpoints, checkpointById, reachableByCheckpoint, errors);
  if (errors.length) return errors;

  return {
    format: 2,
    ...(storyId ? { id: storyId } : {}),
    version: storyVersion ?? 1,
    title: json.title as string,
    description: json.description as string,
    ...(options.player_intro ? { player_intro: options.player_intro } : {}),
    ...(options.illustrations ? { illustrations: options.illustrations } : {}),
    qualities,
    checkpoints,
    transitions,
    roster,
    ...(options.arc_template !== undefined ? { arc_template: options.arc_template } : {}),
    ...(arcBridges ? { arc_bridges: arcBridges } : {}),
    ...(options.requirements ? { requirements: options.requirements } : {}),
    ...(options.stagecraft ? { stagecraft: options.stagecraft } : {}),
    ...(options.scene_read ? { scene_read: options.scene_read } : {}),
    ...(options.lore_select ? { lore_select: options.lore_select } : {}),
    ...(options.house_rules ? { house_rules: options.house_rules } : {}),
    ...(options.objective_block ? { objective_block: options.objective_block } : {}),
    startCheckpointId,
    checkpointById,
    outgoingByCheckpoint: orderOutgoing(checkpoints, normalizedTransitions),
    qualityByKey,
    reachableByCheckpoint,
  };
};

export const parseStoryV2OrThrow = (json: unknown): NormalizedStoryV2 => {
  const parsed = parseStoryV2(json);
  if (Array.isArray(parsed)) {
    throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  return parsed;
};
