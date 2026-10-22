import {
  isPatternVar, patternTexts, PATTERN_ATTRS, PATTERN_CHECK_OUTCOMES, PATTERN_KINDS, PATTERN_QUEST_STATUSES, PATTERN_REPEATS, PATTERN_STEPS_MAX, PATTERN_TEXT_MAX,
  PATTERN_UNLESS_MAX, PATTERN_VARS_MAX, PATTERN_WITHIN_MAX, PATTERNS_MAX, patternVars, stepConditions,
  type PatternKind, type PatternStep, type PatternUnless, type StoryPattern,
} from "../patternSchema";
import type { Chapter, Checkpoint, Milestone, Quality, Quest, Transition, ValidationError } from "../schema";
import { checksById } from "../storyChecks";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { GAME_ID_PATTERN } from "./checks";

const PATTERN_KEYS = ["id", "steps", "unless", "within", "repeat", "label", "hint", "pending"] as const;
const STEP_KEYS = ["kind", "id", "to", "where"] as const;
const UNLESS_KEYS = [...STEP_KEYS, "between"] as const;

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const readText = (value: unknown, path: string, errors: ValidationError[]): string | undefined => {
  if (value === undefined) return undefined;
  const text = asString(value)?.trim() ?? "";
  return text && text.length <= PATTERN_TEXT_MAX ? text : refuse(errors, path, `a line of 1 to ${PATTERN_TEXT_MAX} characters`, undefined);
};

const readValue = (value: unknown, path: string, errors: ValidationError[]): string | undefined => {
  const text = asString(value)?.trim();
  return text ?? refuse(errors, path, "a value is a non-empty string, or a variable such as \"?giver\"", undefined);
};

const readStep = (value: unknown, path: string, errors: ValidationError[], keys: readonly string[]): PatternStep | null => {
  if (!isRecord(value)) return refuse(errors, path, "a step is {kind, id?, to?, where?}", null);
  rejectUnknownKeys(value, keys, path, errors);
  if (!isOneOf(value.kind, PATTERN_KINDS)) return refuse(errors, `${path}.kind`, `kind is one of ${PATTERN_KINDS.join(", ")}`, null);
  const kind: PatternKind = value.kind;
  const attrs: readonly string[] = PATTERN_ATTRS[kind];
  const id = value.id === undefined ? undefined : readValue(value.id, `${path}.id`, errors);
  if (id !== undefined && !attrs.includes("id")) addError(errors, `${path}.id`, `a ${kind} step names its target with ${attrs.join(", ")}`);
  const to = value.to === undefined ? undefined : readValue(value.to, `${path}.to`, errors);
  if (to !== undefined && kind === "milestone") addError(errors, `${path}.to`, "a milestone step has no to");
  let where: Record<string, string> | undefined;
  if (value.where !== undefined) {
    if (!isRecord(value.where)) addError(errors, `${path}.where`, `where is {${attrs.join(", ")}}`);
    else {
      rejectUnknownKeys(value.where, attrs, `${path}.where`, errors);
      where = Object.fromEntries(Object.entries(value.where).flatMap(([key, entry]) => {
        const read = readValue(entry, `${path}.where.${key}`, errors);
        return read !== undefined && attrs.includes(key) ? [[key, read]] : [];
      }));
    }
  }
  return { kind, ...(id !== undefined ? { id } : {}), ...(to !== undefined ? { to } : {}), ...(where && Object.keys(where).length ? { where } : {}) };
};

const readUnless = (value: unknown, path: string, steps: number, errors: ValidationError[]): PatternUnless | null => {
  const step = readStep(value, path, errors, UNLESS_KEYS);
  if (!step || !isRecord(value)) return null;
  const between = value.between;
  if (!Array.isArray(between) || between.length !== 2 || !isInt(between[0]) || !isInt(between[1]) || between[0] < 1 || between[0] >= between[1] || between[1] > steps) {
    return refuse(errors, `${path}.between`, `between is [i, j], step numbers counted from 1 with i < j <= ${steps}`, null);
  }
  return { ...step, between: [between[0], between[1]] };
};

const readPattern = (value: unknown, path: string, errors: ValidationError[]): StoryPattern | null => {
  if (!isRecord(value)) return refuse(errors, path, "a pattern is {id, steps, unless?, within?, repeat?, label?, hint?, pending?}", null);
  rejectUnknownKeys(value, PATTERN_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a pattern id is a lowercase slug");
  const rawSteps = Array.isArray(value.steps) && value.steps.length >= 1 && value.steps.length <= PATTERN_STEPS_MAX
    ? value.steps : refuse(errors, `${path}.steps`, `steps is a list of 1 to ${PATTERN_STEPS_MAX} steps`, [] as unknown[]);
  const steps = rawSteps.map((entry, index) => readStep(entry, `${path}.steps.${index}`, errors, STEP_KEYS));
  const rawUnless = value.unless === undefined ? [] : Array.isArray(value.unless) && value.unless.length <= PATTERN_UNLESS_MAX
    ? value.unless : refuse(errors, `${path}.unless`, `unless is a list of at most ${PATTERN_UNLESS_MAX}`, [] as unknown[]);
  const unless = rawUnless.map((entry, index) => readUnless(entry, `${path}.unless.${index}`, steps.length, errors));
  const within = value.within === undefined ? undefined : isInt(value.within) && value.within >= 1 && value.within <= PATTERN_WITHIN_MAX
    ? value.within : refuse(errors, `${path}.within`, `within is a whole number of turns from 1 to ${PATTERN_WITHIN_MAX}`, undefined);
  const repeat = value.repeat === undefined ? undefined : isOneOf(value.repeat, PATTERN_REPEATS) ? value.repeat : refuse(errors, `${path}.repeat`, "repeat is once or each", undefined);
  const labelText = value.label === undefined ? undefined : isRecord(value.label)
    ? readText(value.label.text, `${path}.label.text`, errors) : refuse(errors, `${path}.label`, "label is {text}", undefined);
  if (isRecord(value.label)) rejectUnknownKeys(value.label, ["text"], `${path}.label`, errors);
  const hint = readText(value.hint, `${path}.hint`, errors);
  const pending = readText(value.pending, `${path}.pending`, errors);
  if (!GAME_ID_PATTERN.test(id) || !steps.length || steps.some((step) => !step) || unless.some((entry) => !entry)) return null;
  const pattern: StoryPattern = {
    id, steps: steps as PatternStep[], ...(unless.length ? { unless: unless as PatternUnless[] } : {}), ...(within !== undefined ? { within } : {}),
    ...(repeat ? { repeat } : {}), ...(labelText ? { label: { text: labelText } } : {}), ...(hint ? { hint } : {}), ...(pending ? { pending } : {}),
  };
  const vars = patternVars(pattern);
  if (vars.length > PATTERN_VARS_MAX) addError(errors, path, `a pattern binds at most ${PATTERN_VARS_MAX} variables (found ${vars.join(", ")})`);
  (pattern.unless ?? []).forEach((entry, index) => {
    const bound = new Set(pattern.steps.slice(0, entry.between[0]).flatMap((step) => Object.values(stepConditions(step)).filter(isPatternVar)));
    Object.values(stepConditions(entry)).filter(isPatternVar).filter((name) => !bound.has(name))
      .forEach((name) => addError(errors, `${path}.unless.${index}`, `${name} is not bound by step ${entry.between[0]} or before`));
  });
  return pattern;
};

export const readPatterns = (value: unknown, errors: ValidationError[]): StoryPattern[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > PATTERNS_MAX) return refuse(errors, "patterns", `patterns is a list of at most ${PATTERNS_MAX}`, undefined);
  const patterns = value.map((entry, index) => readPattern(entry, `patterns.${index}`, errors)).filter((entry): entry is StoryPattern => entry !== null);
  const seen = new Set<string>();
  patterns.forEach((pattern, index) => {
    if (seen.has(pattern.id)) addError(errors, `patterns.${index}.id`, `duplicate pattern '${pattern.id}'`);
    seen.add(pattern.id);
  });
  return patterns.length ? patterns : undefined;
};

export interface PatternCheckContext {
  checkpointById: Record<string, Checkpoint>;
  quests?: readonly Quest[];
  milestones?: readonly Milestone[];
  checkpoints: readonly Checkpoint[];
  transitions: readonly Transition[];
  chapters?: readonly Chapter[];
  roster: ReadonlyArray<{ id: string }>;
  qualityByKey: Record<string, Quality>;
}

const PUBLIC_ONLY = "patterns read only what the player can see";

type Context = PatternCheckContext & { checks: ReturnType<typeof checksById> };

const checkValue = (kind: PatternKind, attr: string, value: string, path: string, context: Context, errors: ValidationError[]) => {
  if (isPatternVar(value)) return;
  if (kind === "transition" && (attr === "to" || attr === "from")) {
    if (value.startsWith("liv_")) addError(errors, path, `a living checkpoint is generated, so a pattern cannot name '${value}'`);
    else if (!context.checkpointById[value]) addError(errors, path, `'${value}' is not a checkpoint`);
  }
  if (kind === "transition" && attr === "chapter" && !(context.chapters ?? []).some((chapter) => chapter.id === value)) addError(errors, path, `'${value}' is not a chapter`);
  if (kind === "quest" && attr === "id" && !(context.quests ?? []).some((quest) => quest.id === value)) addError(errors, path, `'${value}' is not a quest`);
  if (kind === "quest" && attr === "to" && !isOneOf(value, PATTERN_QUEST_STATUSES)) addError(errors, path, `a quest step moves to ${PATTERN_QUEST_STATUSES.join(", ")} (hidden is not seen)`);
  if (kind === "quest" && attr === "giver" && !context.roster.some((member) => member.id === value)) addError(errors, path, `'${value}' is not in the cast`);
  if (kind === "milestone" && attr === "id") {
    const milestone = (context.milestones ?? []).find((entry) => entry.id === value);
    if (!milestone) addError(errors, path, `'${value}' is not a milestone`);
    else if (milestone.secret) addError(errors, path, `milestone '${value}' is secret; ${PUBLIC_ONLY}`);
  }
  if (kind === "check" && attr === "id") {
    const check = context.checks.get(value);
    if (!check) addError(errors, path, `'${value}' is not a check`);
    else if (check.narrate !== "public") addError(errors, path, `check '${value}' is not narrated public; ${PUBLIC_ONLY}`);
  }
  if (kind === "check" && attr === "outcome" && !isOneOf(value, PATTERN_CHECK_OUTCOMES)) addError(errors, path, `a check outcome is one of ${PATTERN_CHECK_OUTCOMES.join(", ")}`);
  if (kind === "check" && attr === "quality" && !context.qualityByKey[value]) addError(errors, path, `'${value}' is not a quality`);
};

const checkStep = (step: PatternStep, path: string, context: Context, errors: ValidationError[]) =>
  Object.entries(stepConditions(step)).forEach(([attr, value]) => checkValue(step.kind, attr, value, `${path}.${attr}`, context, errors));

export const checkPatterns = (patterns: readonly StoryPattern[] | undefined, base: PatternCheckContext, errors: ValidationError[]) => {
  if (!patterns?.length) return;
  const context: Context = { ...base, checks: checksById({ checkpoints: [...base.checkpoints], transitions: [...base.transitions] }) };
  patterns.forEach((pattern, index) => {
    pattern.steps.forEach((step, at) => checkStep(step, `patterns.${index}.steps.${at}`, context, errors));
    (pattern.unless ?? []).forEach((entry, at) => checkStep(entry, `patterns.${index}.unless.${at}`, context, errors));
    if (!patternTexts(pattern).length) addError(errors, `patterns.${index}`, "a pattern shows something: a label, a hint or a pending line");
  });
};
