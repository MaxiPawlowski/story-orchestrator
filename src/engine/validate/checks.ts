import {
  CHECK_DICE_MAX, CHECK_NARRATE, type CheckModifier, type StoryCheck, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, isPrimitive, refuse, rejectUnknownKeys } from "./common";
import { DISPLAY_LABEL_MAX } from "./display";

const CHECK_KEYS = ["id", "label", "quality", "roll", "modifiers", "narrate", "outcome", "twist"] as const;
const ROLL_KEYS = ["sides", "target", "dice"] as const;
const MODIFIER_KEYS = ["q", "v", "add", "label"] as const;
const OUTCOME_KEYS = ["quality", "bands", "partial_margin"] as const;
export const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const wholeAtLeast = (value: unknown, floor: number): value is number => Number.isInteger(value) && (value as number) >= floor;

export const readLabel = (value: unknown, path: string, errors: ValidationError[]): string | undefined => {
  if (value === undefined) return undefined;
  const label = asString(value)?.trim();
  if (label && label.length <= DISPLAY_LABEL_MAX) return label;
  return refuse(errors, path, `a label is text of at most ${DISPLAY_LABEL_MAX} characters`, undefined);
};

const readModifier = (entry: unknown, at: string, errors: ValidationError[]): CheckModifier[] => {
  if (!isRecord(entry)) return refuse(errors, at, "a modifier is {q, v, add}", []);
  rejectUnknownKeys(entry, MODIFIER_KEYS, at, errors);
  const q = asString(entry.q);
  const add = Number.isInteger(entry.add) && entry.add !== 0 ? entry.add as number : null;
  if (!q) addError(errors, `${at}.q`, "a modifier names the quality it reads");
  if (!isPrimitive(entry.v)) addError(errors, `${at}.v`, "a modifier's value is a literal");
  if (add === null) addError(errors, `${at}.add`, "add is a whole number other than 0");
  const label = readLabel(entry.label, `${at}.label`, errors);
  if (!q || !isPrimitive(entry.v) || add === null) return [];
  return [{ q, v: entry.v, add, ...(label ? { label } : {}) }];
};

const readModifiers = (value: unknown, path: string, errors: ValidationError[]): CheckModifier[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(errors, path, "modifiers are a list of {q, v, add}", []);
  return value.flatMap((entry, index) => readModifier(entry, `${path}.${index}`, errors));
};

const readCheckRoll = (value: unknown, path: string, errors: ValidationError[]): StoryCheck["roll"] | null => {
  if (!isRecord(value)) return refuse(errors, path, "a check rolls {sides, target, dice?}", null);
  rejectUnknownKeys(value, ROLL_KEYS, path, errors);
  const dice = value.dice === undefined ? 1 : value.dice;
  const diceOk = wholeAtLeast(dice, 1) && dice <= CHECK_DICE_MAX;
  if (!wholeAtLeast(value.sides, 2)) addError(errors, `${path}.sides`, "sides is a whole number, at least 2");
  if (!wholeAtLeast(value.target, 1)) addError(errors, `${path}.target`, "target is a whole number, at least 1");
  if (!diceOk) addError(errors, `${path}.dice`, `dice is 1 to ${CHECK_DICE_MAX}`);
  if (!wholeAtLeast(value.sides, 2) || !wholeAtLeast(value.target, 1) || !diceOk) return null;
  return { sides: value.sides, target: value.target, ...(dice > 1 ? { dice } : {}) };
};

const readOutcome = (value: unknown, path: string, errors: ValidationError[]): StoryCheck["outcome"] | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "outcome is {quality, bands: margin, partial_margin}", undefined);
  rejectUnknownKeys(value, OUTCOME_KEYS, path, errors);
  const quality = asString(value.quality);
  if (!quality) addError(errors, `${path}.quality`, "outcome names the enum it writes");
  if (value.bands !== "margin") addError(errors, `${path}.bands`, "bands must be margin");
  if (!wholeAtLeast(value.partial_margin, 1)) addError(errors, `${path}.partial_margin`, "partial_margin is a whole number, at least 1");
  if (!quality || value.bands !== "margin" || !wholeAtLeast(value.partial_margin, 1)) return undefined;
  return { quality, bands: "margin", partial_margin: value.partial_margin };
};

const readTwist = (value: unknown, roll: StoryCheck["roll"] | null, path: string, errors: ValidationError[]): StoryCheck["twist"] | undefined => {
  if (value === undefined) return undefined;
  const quality = isRecord(value) ? asString(value.quality) : null;
  if (!quality) return refuse(errors, path, "twist is {quality}: the bool a match of the dice writes", undefined);
  if (roll && (roll.dice ?? 1) < 2) addError(errors, path, "a twist needs at least two dice to match");
  return { quality };
};

export const readCheck = (value: unknown, path: string, errors: ValidationError[]): StoryCheck | null => {
  if (!isRecord(value)) return refuse(errors, path, "a check is an object", null);
  rejectUnknownKeys(value, CHECK_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  const quality = asString(value.quality);
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a check id is a lowercase slug");
  if (!quality) addError(errors, `${path}.quality`, "a check names the bool quality it writes");
  if (value.narrate !== undefined && !isOneOf(value.narrate, CHECK_NARRATE)) addError(errors, `${path}.narrate`, "narrate is public or hidden");
  const roll = readCheckRoll(value.roll, `${path}.roll`, errors);
  const twist = readTwist(value.twist, roll, `${path}.twist`, errors);
  const outcome = readOutcome(value.outcome, `${path}.outcome`, errors);
  const modifiers = readModifiers(value.modifiers, `${path}.modifiers`, errors);
  const label = readLabel(value.label, `${path}.label`, errors);
  if (!GAME_ID_PATTERN.test(id) || !quality || !roll) return null;
  return {
    id, quality, roll, narrate: isOneOf(value.narrate, CHECK_NARRATE) ? value.narrate : "hidden",
    ...(label ? { label } : {}), ...(modifiers.length ? { modifiers } : {}), ...(outcome ? { outcome } : {}), ...(twist ? { twist } : {}),
  };
};

export const readChecks = (value: unknown, path: string, errors: ValidationError[]): StoryCheck[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(errors, path, "checks are a list", []);
  return value.map((entry, index) => readCheck(entry, `${path}.${index}`, errors)).filter((check): check is StoryCheck => check !== null);
};
