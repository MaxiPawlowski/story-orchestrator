import { CHECK_DEGREES, GENERATED_CHECKPOINT_PREFIX, type Checkpoint, type Quality, type StoryCheck, type Transition, type ValidationError } from "../schema";
import { addError } from "./common";
import { validateLiteral } from "./gates";

const written = (check: StoryCheck): Array<[string, "bool" | "outcome", string]> => [
  [check.quality, "bool", "quality"],
  ...(check.outcome ? [[check.outcome.quality, "outcome", "outcome.quality"] as [string, "outcome", string]] : []),
  ...(check.twist ? [[check.twist.quality, "bool", "twist.quality"] as [string, "bool", string]] : []),
];

const DEGREE_VALUES = [...CHECK_DEGREES].sort().join(",");

const writtenProblem = (quality: Quality | undefined, wants: "bool" | "outcome"): string | null => {
  if (!quality) return "is not a declared quality";
  if (quality.source !== "code" || quality.latching || quality.monotonic || quality.roll) return "must be a code quality that is not latching, monotonic or rolled";
  if (wants === "bool") return quality.type === "bool" ? null : "must be a bool";
  return quality.type === "enum" && [...(quality.values ?? [])].sort().join(",") === DEGREE_VALUES ? null : "must be an enum of exactly miss, weak and strong";
};

export interface PlacedCheck {
  check: StoryCheck;
  path: string;
  checkpointId: string;
}

export const placedChecks = (checkpoints: Checkpoint[], transitions: Transition[]): PlacedCheck[] => [
  ...checkpoints.flatMap((checkpoint, index) => (checkpoint.checks ?? []).map((check, at) => ({ check, path: `checkpoints.${index}.checks.${at}`, checkpointId: checkpoint.id }))),
  ...transitions.flatMap((transition, index) => (transition.check ? [{ check: transition.check, path: `transitions.${index}.check`, checkpointId: transition.from }] : [])),
];

const checkModifiers = (placed: PlacedCheck, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  (placed.check.modifiers ?? []).forEach((modifier, index) => {
    const quality = qualityByKey[modifier.q];
    if (!quality) addError(errors, `${placed.path}.modifiers.${index}.q`, `unknown quality '${modifier.q}'`);
    else validateLiteral(quality, modifier.v, `${placed.path}.modifiers.${index}.v`, errors);
  });
};

export const checkStoryChecks = (checkpoints: Checkpoint[], transitions: Transition[], qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  const ids = new Set<string>();
  const writers = new Map<string, string>();
  for (const placed of placedChecks(checkpoints, transitions)) {
    const { check, path, checkpointId } = placed;
    if (ids.has(check.id)) addError(errors, `${path}.id`, `duplicate check '${check.id}'`);
    ids.add(check.id);
    if (checkpointId.startsWith(GENERATED_CHECKPOINT_PREFIX)) addError(errors, path, "a generated beat carries no check");
    for (const [key, wants, field] of written(check)) {
      const problem = writtenProblem(qualityByKey[key], wants);
      if (problem) addError(errors, `${path}.${field}`, `the quality ${problem}`);
      const owner = writers.get(key);
      if (owner && owner !== check.id) addError(errors, `${path}.${field}`, `'${key}' is already written by check '${owner}'`);
      writers.set(key, check.id);
    }
    checkModifiers(placed, qualityByKey, errors);
  }
};
