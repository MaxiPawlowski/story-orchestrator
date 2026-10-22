import { CHECK_DEGREES, GENERATED_CHECKPOINT_PREFIX, checkRolledKey, type Checkpoint, type Quality, type StoryCheck, type Transition, type ValidationError } from "../schema";
import { gateKeys } from "../gates";
import { nearestKey } from "@utils/levenshtein";
import { addError } from "./common";
import { validateGate, validateLiteral } from "./gates";

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

export const addCheckQualities = (qualities: Quality[], checkpoints: Checkpoint[], errors: ValidationError[]): Quality[] => {
  const kept = checkpoints.flatMap((checkpoint) => (checkpoint.checks ?? []).filter((check) => check.when)).map((check): Quality => ({
    key: checkRolledKey(check.id), type: "int", source: "code", rubric: "Set by the story to the boundary this check rolled at, once its when held",
  }));
  const existing = new Set(qualities.map((quality) => quality.key));
  kept.filter((quality) => existing.has(quality.key)).forEach((quality) => addError(errors, `qualities.${quality.key}`, "this key is kept for a check's attempt"));
  return [...qualities, ...kept.filter((quality) => !existing.has(quality.key))];
};

const checkOwnGate = (placed: PlacedCheck, field: "when" | "hint_when", qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  const { check, path } = placed;
  const gate = check[field];
  if (!gate) return;
  const own = new Set([...written(check).map(([key]) => key), checkRolledKey(check.id)]);
  const keys = gateKeys(gate);
  const unknown = keys.filter((key) => !qualityByKey[key]);
  const known = Object.keys(qualityByKey);
  unknown.forEach((key) => {
    const hint = nearestKey(key, known);
    addError(errors, `${path}.${field}`, hint ? `unknown quality '${key}' (did you mean "${hint}"?)` : `unknown quality '${key}'`);
  });
  keys.filter((key) => own.has(key)).forEach((key) => addError(errors, `${path}.${field}`, `${field} reads '${key}', which this check writes; gate it on the attempt`));
  if (!unknown.length) validateGate(gate, qualityByKey, `${path}.${field}`, errors);
};

const checkWhen = (placed: PlacedCheck, transition: boolean, qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  checkOwnGate(placed, "hint_when", qualityByKey, errors);
  if (!placed.check.when) return;
  if (transition) {
    addError(errors, `${placed.path}.when`, "a transition check is attempted when the rest of its gate holds; when is for checkpoint checks");
    return;
  }
  checkOwnGate(placed, "when", qualityByKey, errors);
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
    checkWhen(placed, path.startsWith("transitions."), qualityByKey, errors);
  }
};
