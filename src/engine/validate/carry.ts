import {
  STORY_ID_PATTERN, TENSION_CURRENT_KEY, isFactionDerivedKey, isFactionKey, isLifeKey, isLivingId, questClosedKey, standingKey, type Checkpoint,
  type Faction, type GateNode, type Milestone, type NormalizedStory, type Quality, type Quest, type RosterMember, type Transition,
  type ValidationError,
} from "../schema";
import {
  CARRY_AS, CARRY_DEFAULTS, CARRY_MODES, HERITAGE_TEXT_MAX, OUTCOME_MAX, isHeritageKey, type CarryFrom, type CarryKnownBy, type CarryMapEntry,
  type OutcomeKey,
} from "../carrySchema";
import { isRecord } from "@utils/guards";
import { gateKeys } from "../gates";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";

const OUTCOME_KEYS = ["key", "heritage_text"] as const;
const CARRY_KEYS = ["story", "mode", "map", "replay_map", "previously", "default"] as const;
const MAP_KEYS = ["from", "to", "as", "known_by"] as const;
const QUIET = new Set(["tension", TENSION_CURRENT_KEY]);

export type OutcomeKind = "quality" | "quest" | "standing";

type OutcomeStory = Pick<NormalizedStory, "qualityByKey" | "quests" | "factions">;

export const outcomeKind = (story: OutcomeStory, key: string): OutcomeKind | string => {
  const quality = story.qualityByKey[key];
  if (!quality) return `'${key}' is not a quality of this story`;
  if (QUIET.has(key) || isLivingId(key)) return `'${key}' is story bookkeeping, not an outcome`;
  if ((story.quests ?? []).some((quest) => questClosedKey(quest.id) === key)) return "quest";
  if ((story.factions ?? []).some((faction) => standingKey(faction.id) === key)) return "standing";
  if (quality.source === "code" || isFactionDerivedKey(key)) return `'${key}' is written by code, so only a quest's closed key or a group's standing can be an outcome`;
  return "quality";
};

const readHeritageText = (value: unknown, path: string, errors: ValidationError[]): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "heritage_text maps a value to the line the next story shows", undefined);
  const entries = Object.entries(value).flatMap(([key, text]) => {
    const line = asString(text)?.trim() ?? "";
    if (!line || line.length > HERITAGE_TEXT_MAX) return refuse(errors, `${path}.${key}`, `a heritage line is 1 to ${HERITAGE_TEXT_MAX} characters`, []);
    return [[key, line] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
};

export const readOutcome = (value: unknown, errors: ValidationError[]): OutcomeKey[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > OUTCOME_MAX) return refuse(errors, "outcome", `outcome is a list of 1 to ${OUTCOME_MAX} keys`, undefined);
  const outcome = value.flatMap((entry, index): OutcomeKey[] => {
    const path = `outcome.${index}`;
    if (!isRecord(entry)) return refuse(errors, path, "an outcome entry is {key, heritage_text?}", []);
    rejectUnknownKeys(entry, OUTCOME_KEYS, path, errors);
    const key = asString(entry.key)?.trim();
    if (!key) return refuse(errors, `${path}.key`, "an outcome entry names a quality key", []);
    const heritage = readHeritageText(entry.heritage_text, `${path}.heritage_text`, errors);
    return [{ key, ...(heritage ? { heritage_text: heritage } : {}) }];
  });
  outcome.forEach((entry, index) => { if (outcome.findIndex((other) => other.key === entry.key) !== index) addError(errors, `outcome.${index}.key`, `duplicate outcome '${entry.key}'`); });
  return outcome.length ? outcome : undefined;
};

const readKnownBy = (value: unknown, path: string, errors: ValidationError[]): CarryKnownBy | undefined => {
  if (value === undefined || value === "none") return undefined;
  if (value === "all") return "all";
  if (Array.isArray(value) && value.length && value.every((id) => typeof id === "string" && id.trim())) return value.map((id: string) => id.trim());
  return refuse(errors, path, "known_by is a list of roster ids, \"all\" or \"none\"", undefined);
};

const readMapEntry = (value: unknown, path: string, errors: ValidationError[]): CarryMapEntry | null => {
  if (!isRecord(value)) return refuse(errors, path, "a carry entry is {from, to, as, known_by?}", null);
  rejectUnknownKeys(value, MAP_KEYS, path, errors);
  const from = asString(value.from)?.trim();
  const to = asString(value.to)?.trim();
  if (!from) addError(errors, `${path}.from`, "from names an outcome key of the earlier story");
  if (!to) addError(errors, `${path}.to`, "to names a quality of this story");
  const as = isOneOf(value.as, CARRY_AS) ? value.as : refuse(errors, `${path}.as`, "as is heritage or state", null);
  const known = readKnownBy(value.known_by, `${path}.known_by`, errors);
  return from && to && as ? { from, to, as, ...(known ? { known_by: known } : {}) } : null;
};

export const readCarryFrom = (value: unknown, errors: ValidationError[]): CarryFrom | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, "carry_from", "carry_from is {story, mode, map, default}", undefined);
  rejectUnknownKeys(value, CARRY_KEYS, "carry_from", errors);
  const story = asString(value.story)?.trim().toLowerCase() ?? "";
  if (!STORY_ID_PATTERN.test(story)) addError(errors, "carry_from.story", "story is the id of the story a finished run comes from");
  const mode = isOneOf(value.mode, CARRY_MODES) ? value.mode : refuse(errors, "carry_from.mode", "mode is sequel or replay", null);
  const fallback = value.default === undefined ? "snapshot" : isOneOf(value.default, CARRY_DEFAULTS)
    ? value.default : refuse(errors, "carry_from.default", "default is snapshot (start fresh without a run) or require", "snapshot" as const);
  if (value.previously !== undefined && typeof value.previously !== "boolean") addError(errors, "carry_from.previously", "previously is true or false");
  const rawMap = Array.isArray(value.map) && value.map.length ? value.map : refuse(errors, "carry_from.map", "map lists at least one carried value", []);
  const map = rawMap.map((entry, index) => readMapEntry(entry, `carry_from.map.${index}`, errors)).filter((entry): entry is CarryMapEntry => entry !== null);
  const replay = value.replay_map === undefined ? undefined : Array.isArray(value.replay_map) && value.replay_map.every((key) => typeof key === "string" && key.trim())
    ? value.replay_map.map((key: string) => key.trim()) : refuse(errors, "carry_from.replay_map", "replay_map lists quality keys of this story", undefined);
  if (!STORY_ID_PATTERN.test(story) || !mode) return undefined;
  return { story, mode, map, ...(replay ? { replay_map: replay } : {}), ...(value.previously === false ? { previously: false } : {}), default: fallback };
};

const valueTexts = (quality: Quality): string[] | null => {
  if (quality.type === "enum") return quality.values ?? [];
  if (quality.type === "bool") return ["true", "false"];
  return null;
};

export const checkOutcome = (outcome: OutcomeKey[] | undefined, story: OutcomeStory, errors: ValidationError[]): void => {
  outcome?.forEach((entry, index) => {
    const kind = outcomeKind(story, entry.key);
    if (kind !== "quality" && kind !== "quest" && kind !== "standing") return addError(errors, `outcome.${index}.key`, `${kind}; nothing of it can carry into a next story`);
    const quality = story.qualityByKey[entry.key];
    const texts = quality ? valueTexts(quality) : null;
    Object.keys(entry.heritage_text ?? {}).forEach((value) => {
      const fits = texts ? texts.includes(value) : /^-?\d+(\.\d+)?$/.test(value);
      if (!fits) addError(errors, `outcome.${index}.heritage_text.${value}`, `'${value}' is not a value '${entry.key}' can take, so this line would never show`);
    });
  });
};

export interface CarryContext {
  storyId?: string;
  qualityByKey: Record<string, Quality>;
  qualities: Quality[];
  roster: RosterMember[];
  transitions: Transition[];
  quests?: Quest[];
  milestones?: Milestone[];
  checkpoints: Checkpoint[];
  factions?: Faction[];
}

const questGates = (quest: Quest): GateNode[] => [quest.visible_when, quest.offered_when, quest.done_when, quest.failed_when,
  ...quest.steps.flatMap((step) => [step.done_when, step.failed_when, step.visible_when])].filter((gate): gate is GateNode => Boolean(gate));

export const progressKeys = (context: Pick<CarryContext, "transitions" | "quests" | "milestones">): Set<string> => new Set([
  ...context.transitions.flatMap((transition) => gateKeys(transition.gate)),
  ...(context.quests ?? []).flatMap((quest) => questGates(quest).flatMap(gateKeys)),
  ...(context.milestones ?? []).flatMap((milestone) => gateKeys(milestone.when)),
]);

const stateTargetProblem = (quality: Quality): string | null => {
  if (isHeritageKey(quality.key)) return `'${quality.key}' is a heritage key: carry into it with as: heritage`;
  if (quality.source === "code" || isFactionKey(quality.key)) return `'${quality.key}' is written by code, so a carried value would be overwritten`;
  if (isLifeKey(quality.key)) return `'${quality.key}' is recomputed by character life, so a carried value would not last`;
  if (isLivingId(quality.key) || QUIET.has(quality.key)) return `'${quality.key}' is story bookkeeping`;
  return null;
};

const checkMapEntry = (entry: CarryMapEntry, path: string, carry: CarryFrom, context: CarryContext, errors: ValidationError[]) => {
  const target = context.qualityByKey[entry.to];
  if (!target) return addError(errors, `${path}.to`, `'${entry.to}' is not a quality of this story, so nothing could receive the carried value`);
  if (entry.as === "heritage" && !isHeritageKey(entry.to)) addError(errors, `${path}.to`, `a heritage value lands in a heritage_ quality, not '${entry.to}', so it never stands in for progress`);
  if (entry.as === "state") {
    const problem = stateTargetProblem(target);
    if (problem) addError(errors, `${path}.to`, `${problem}; the value cannot carry`);
    else if (carry.mode === "replay" && !carry.replay_map?.includes(entry.to)) {
      addError(errors, `${path}.as`, `a replay carries heritage values only, unless replay_map names '${entry.to}'; otherwise a carried result could skip the story being replayed`);
    }
  }
  const members = new Set(context.roster.map((member) => member.id));
  const strangers = Array.isArray(entry.known_by) ? entry.known_by.filter((id) => !members.has(id)) : [];
  strangers.forEach((id) => addError(errors, `${path}.known_by`, `'${id}' is not in this story's roster, so nobody would know it`));
};

const checkHeritageQualities = (carry: CarryFrom | undefined, context: CarryContext, errors: ValidationError[]) => {
  const mapped = new Set(carry?.map.filter((entry) => entry.as === "heritage").map((entry) => entry.to) ?? []);
  context.qualities.forEach((quality, index) => {
    if (!isHeritageKey(quality.key)) return;
    if (quality.source !== "code") addError(errors, `qualities.${index}.source`, `'${quality.key}' is a heritage key: its source is code, so no read or effect ever writes it`);
    if (!mapped.has(quality.key)) addError(errors, `qualities.${index}.key`, `nothing carries into '${quality.key}': heritage_ keys are written only by carry_from`);
  });
  const writes = [
    ...context.checkpoints.flatMap((checkpoint, index) => Object.keys(checkpoint.state_snapshot ?? {}).map((key) => ({ path: `checkpoints.${index}.state_snapshot.${key}`, key }))),
    ...(context.quests ?? []).flatMap((quest, index) => Object.keys(quest.reward?.set ?? {}).map((key) => ({ path: `quests.${index}.reward.set.${key}`, key }))),
  ];
  writes.filter((entry) => isHeritageKey(entry.key)).forEach((entry) => addError(errors, entry.path, `'${entry.key}' is written only by a carry, never by a state_snapshot or reward`));
};

export const readCarry = (json: Record<string, unknown>, context: CarryContext, errors: ValidationError[]): Pick<NormalizedStory, "outcome" | "carry_from"> => {
  const outcome = readOutcome(json.outcome, errors);
  const carry = readCarryFrom(json.carry_from, errors);
  checkOutcome(outcome, context, errors);
  checkCarry(carry, context, errors);
  return { ...(outcome ? { outcome } : {}), ...(carry ? { carry_from: carry } : {}) };
};

export const checkCarry = (carry: CarryFrom | undefined, context: CarryContext, errors: ValidationError[]): void => {
  checkHeritageQualities(carry, context, errors);
  if (!carry) return;
  const own = context.storyId;
  if (carry.mode === "replay" && own !== carry.story) addError(errors, "carry_from.story", "a replay carries from this same story: story is its own id");
  if (carry.mode === "sequel" && own === carry.story) addError(errors, "carry_from.mode", "a story carrying from itself is a replay: set mode to replay");
  if (carry.mode === "sequel" && carry.replay_map) addError(errors, "carry_from.replay_map", "replay_map is for mode replay only");
  const progress = progressKeys(context);
  carry.replay_map?.forEach((key, index) => {
    if (!context.qualityByKey[key]) addError(errors, `carry_from.replay_map.${index}`, `'${key}' is not a quality of this story`);
    else if (progress.has(key)) addError(errors, `carry_from.replay_map.${index}`, `'${key}' is read by a transition, quest or milestone gate, so a replay cannot carry into it`);
  });
  carry.map.forEach((entry, index) => {
    checkMapEntry(entry, `carry_from.map.${index}`, carry, context, errors);
    if (carry.map.findIndex((other) => other.to === entry.to) !== index) addError(errors, `carry_from.map.${index}.to`, `'${entry.to}' already receives a carried value`);
  });
};

const typeFits = (from: Quality, to: Quality): string | null => {
  if (from.type === to.type || (from.type === "int" && to.type === "float")) {
    if (from.type !== "enum") return null;
    const missing = (from.values ?? []).filter((value) => !to.values?.includes(value));
    return missing.length ? `'${to.key}' does not declare ${missing.map((value) => `'${value}'`).join(", ")}` : null;
  }
  return `'${from.key}' is ${from.type} but '${to.key}' is ${to.type}`;
};

export const checkCarryPair = (source: NormalizedStory, target: Pick<NormalizedStory, "carry_from" | "qualityByKey">, timing: "import" | "pick"): ValidationError[] => {
  const carry = target.carry_from;
  if (!carry) return [];
  const errors: ValidationError[] = [];
  const consequence = timing === "import" ? "this story cannot carry from it until that is fixed" : "this run is not offered";
  if (source.id !== carry.story) return [{ path: "carry_from.story", message: `the earlier story is '${source.id ?? "untitled"}', not '${carry.story}'; ${consequence}` }];
  const declared = new Set((source.outcome ?? []).map((entry) => entry.key));
  carry.map.forEach((entry, index) => {
    const path = `carry_from.map.${index}.from`;
    const from = source.qualityByKey[entry.from];
    const to = target.qualityByKey[entry.to];
    if (!from) return addError(errors, path, `'${entry.from}' is not a quality of '${carry.story}'; ${consequence}`);
    if (!declared.has(entry.from)) return addError(errors, path, `'${entry.from}' is not in the outcome of '${carry.story}'; ${consequence}`);
    const mismatch = to ? typeFits(from, to) : null;
    if (mismatch) addError(errors, path, `${mismatch}; ${consequence}`);
  });
  return errors;
};
