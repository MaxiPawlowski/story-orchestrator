import {
  CODEX_ID_PATTERN, CODEX_PAGES, CODEX_START, OBSERVATION_TEXT_MAX, OBSERVATIONS_MAX, isObservationKey, isReached, observationKey, observationMissedKey,
  type Checkpoint, type Observation, type ObservationPassive, type ObservationWhen, type Quality, type RosterMember, type StoryCodex, type ValidationError,
} from "../schema";
import { gateKeys } from "../gates";
import { isRecord } from "@utils/guards";
import { nearestKey } from "@utils/levenshtein";
import { addError, asString, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate, validateLiteral } from "./gates";
import { readCheckRoll, readModifiers } from "./checks";

const OBSERVATION_KEYS = ["id", "text", "when", "source", "rev", "passive"] as const;
const PASSIVE_KEYS = ["roll", "modifiers"] as const;
const MACRO = /\{\{|\}\}/;

const readText = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > OBSERVATION_TEXT_MAX) return refuse(errors, path, `text of at most ${OBSERVATION_TEXT_MAX} characters is required`, null);
  if (MACRO.test(text)) return refuse(errors, path, "plain text only: macros are not expanded on player pages", null);
  return text;
};

const readWhen = (value: unknown, path: string, errors: ValidationError[]): ObservationWhen | null => {
  if (value === undefined) return refuse(errors, path, "an observation needs when: the gate or {reached} that lets the player notice it", null);
  if (value === CODEX_START) return refuse(errors, path, "a line the player knows from the start is a codex fact, not an observation: give a gate or {reached}", null);
  if (isRecord(value) && "reached" in value) {
    rejectUnknownKeys(value, ["reached"], path, errors);
    const reached = asString(value.reached)?.trim();
    return reached ? { reached } : refuse(errors, `${path}.reached`, "reached names a checkpoint id", null);
  }
  if (!isRecord(value)) return refuse(errors, path, "when is a gate or {reached: <checkpoint id>}", null);
  return readGate(value, path, errors);
};

const readPassive = (value: unknown, path: string, errors: ValidationError[]): ObservationPassive | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "passive is {roll: {sides, target, dice?}, modifiers?}", undefined);
  rejectUnknownKeys(value, PASSIVE_KEYS, path, errors);
  const roll = readCheckRoll(value.roll, `${path}.roll`, errors);
  const modifiers = readModifiers(value.modifiers, `${path}.modifiers`, errors);
  return roll ? { roll, ...(modifiers.length ? { modifiers } : {}) } : undefined;
};

export const readObservation = (value: unknown, path: string, errors: ValidationError[]): Observation | null => {
  if (!isRecord(value)) return refuse(errors, path, "an observation is {id, text, when}", null);
  rejectUnknownKeys(value, OBSERVATION_KEYS, path, errors);
  const rawId = asString(value.id)?.trim() ?? "";
  const id = CODEX_ID_PATTERN.test(rawId) ? rawId : refuse(errors, `${path}.id`, "an id is a lowercase slug of letters, digits and '-' (no '_')", null);
  const text = readText(value.text, `${path}.text`, errors);
  const when = readWhen(value.when, `${path}.when`, errors);
  const source = value.source === undefined ? undefined : asString(value.source)?.trim() ?? refuse(errors, `${path}.source`, "source is a codex entry or roster id", undefined);
  const rev = value.rev === undefined ? undefined : Number.isInteger(value.rev) && (value.rev as number) >= 1 ? value.rev as number
    : refuse(errors, `${path}.rev`, "rev is a whole number of at least 1", undefined);
  const passive = readPassive(value.passive, `${path}.passive`, errors);
  if (!id || !text || !when) return null;
  return { id, text, when, ...(source ? { source } : {}), ...(rev !== undefined && rev > 1 ? { rev } : {}), ...(passive ? { passive } : {}) };
};

export const readObservations = (value: unknown, errors: ValidationError[]): Observation[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, "observations", "observations are a list", undefined);
  if (value.length > OBSERVATIONS_MAX) addError(errors, "observations", `a story holds at most ${OBSERVATIONS_MAX} observations`);
  const list = value.map((entry, index) => readObservation(entry, `observations.${index}`, errors)).filter((entry): entry is Observation => entry !== null);
  return list.length ? list : undefined;
};

export interface ObservationRefs {
  checkpointById: Record<string, Checkpoint>;
  qualityByKey: Record<string, Quality>;
  roster: RosterMember[];
  codex?: StoryCodex;
}

const ownKeys = (observation: Observation): Set<string> => new Set([observationKey(observation.id), observationMissedKey(observation.id)]);

const checkWhen = (observation: Observation, path: string, refs: ObservationRefs, errors: ValidationError[]) => {
  const { when } = observation;
  if (isReached(when)) {
    if (!refs.checkpointById[when.reached]) {
      const hint = nearestKey(when.reached, Object.keys(refs.checkpointById));
      addError(errors, `${path}.when.reached`, `unknown checkpoint '${when.reached}'${hint ? ` (did you mean "${hint}"?)` : ""}`);
    }
    return;
  }
  const own = ownKeys(observation);
  gateKeys(when).filter((key) => own.has(key)).forEach((key) => addError(errors, `${path}.when`, `the gate reads '${key}', which this observation writes`));
  const found: ValidationError[] = [];
  validateGate(when, refs.qualityByKey, `${path}.when`, found);
  const known = Object.keys(refs.qualityByKey);
  found.forEach((error) => {
    const unknown = /^unknown quality '(.+)'$/.exec(error.message)?.[1];
    const hint = unknown ? nearestKey(unknown, known) : null;
    errors.push(unknown && hint ? { path: error.path, message: `unknown quality '${unknown}' (did you mean "${hint}"?)` } : error);
  });
};

const checkModifiers = (observation: Observation, path: string, refs: ObservationRefs, errors: ValidationError[]) => {
  (observation.passive?.modifiers ?? []).forEach((modifier, index) => {
    const quality = refs.qualityByKey[modifier.q];
    if (!quality) addError(errors, `${path}.passive.modifiers.${index}.q`, `unknown quality '${modifier.q}'`);
    else validateLiteral(quality, modifier.v, `${path}.passive.modifiers.${index}.v`, errors);
  });
};

export const checkObservations = (observations: Observation[] | undefined, refs: ObservationRefs, errors: ValidationError[]) => {
  if (!observations?.length) return;
  const sources = new Set([...CODEX_PAGES.flatMap((page) => (refs.codex?.[page] ?? []).map((entry) => entry.id)), ...refs.roster.map((member) => member.id)]);
  const seen = new Set<string>();
  observations.forEach((observation, index) => {
    const path = `observations.${index}`;
    if (seen.has(observation.id)) addError(errors, `${path}.id`, `duplicate observation '${observation.id}'`);
    seen.add(observation.id);
    checkWhen(observation, path, refs, errors);
    checkModifiers(observation, path, refs, errors);
    if (observation.source && !sources.has(observation.source)) addError(errors, `${path}.source`, `'${observation.source}' is neither a codex entry nor a roster id`);
  });
};

const latchQuality = (key: string, rubric: string): Quality => ({
  key, type: "int", source: "code", latching: true, monotonic: true, rubric: `Set once by the story: ${rubric}`,
});

export const addObservationQualities = (qualities: Quality[], observations: Observation[] | undefined, errors: ValidationError[]): Quality[] => {
  qualities.filter((quality) => isObservationKey(quality.key))
    .forEach((quality) => addError(errors, `qualities.${quality.key}`, "keys starting obs_ are kept for observations"));
  if (!observations?.length) return qualities;
  const added = observations.flatMap((observation) => [
    latchQuality(observationKey(observation.id), "the boundary at which the player noticed this observation"),
    ...(observation.passive ? [latchQuality(observationMissedKey(observation.id), "the boundary at which the player's passive check for this observation failed")] : []),
  ]);
  const existing = new Set(qualities.map((quality) => quality.key));
  return [...qualities, ...added.filter((quality) => !existing.has(quality.key))];
};
