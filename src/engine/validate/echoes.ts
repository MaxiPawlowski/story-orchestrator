import {
  ECHO_CHECK_OUTCOMES, ECHO_CUE_MAX, ECHO_DELAY_MAX, ECHO_EXPIRES_MAX, ECHO_HOLD_MAX, ECHO_NARRATOR, ECHO_QUEST_ENDS, ECHOES_MAX, echoUnit,
  type EchoAfter, type EchoDelay, type EchoWindow, type StoryEcho,
} from "../echoSchema";
import type { Milestone, Quality, Quest, RosterMember, Transition, ValidationError } from "../schema";
import { checksById } from "../storyChecks";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { GAME_ID_PATTERN } from "./checks";

const ECHO_KEYS = ["id", "after", "delay", "when", "cancel_when", "expires", "to", "cue", "hold"] as const;
const AFTER_SHAPES = "after is {transition: \"from->to\"}, {quest, to: done|failed}, {milestone} or {check, outcome}";

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const TRANSITION_ID = /^(.+?)->(.+?)(?:#(\d+))?$/;

export const normalTransitionId = (value: string): string | null => {
  const match = TRANSITION_ID.exec(value.trim());
  return match ? `${match[1].trim()}->${match[2].trim()}#${match[3] ?? 0}` : null;
};

const readAfter = (value: unknown, path: string, errors: ValidationError[]): EchoAfter | null => {
  if (!isRecord(value)) return refuse(errors, path, AFTER_SHAPES, null);
  const text = (key: string) => asString(value[key])?.trim() ?? null;
  if (value.transition !== undefined) {
    rejectUnknownKeys(value, ["transition"], path, errors);
    const id = text("transition") ? normalTransitionId(text("transition") as string) : null;
    return id ? { transition: id } : refuse(errors, `${path}.transition`, "a transition is named \"from->to\" (add #1, #2 for a second one between the same checkpoints)", null);
  }
  if (value.quest !== undefined) {
    rejectUnknownKeys(value, ["quest", "to"], path, errors);
    const to = isOneOf(value.to, ECHO_QUEST_ENDS) ? value.to : refuse(errors, `${path}.to`, "a quest echo follows the quest ending: to is done or failed", null);
    return text("quest") && to ? { quest: text("quest") as string, to } : null;
  }
  if (value.milestone !== undefined) {
    rejectUnknownKeys(value, ["milestone"], path, errors);
    return text("milestone") ? { milestone: text("milestone") as string } : refuse(errors, `${path}.milestone`, "milestone names a milestone id", null);
  }
  if (value.check !== undefined) {
    rejectUnknownKeys(value, ["check", "outcome"], path, errors);
    const outcome = isOneOf(value.outcome, ECHO_CHECK_OUTCOMES) ? value.outcome : refuse(errors, `${path}.outcome`, `outcome is one of ${ECHO_CHECK_OUTCOMES.join(", ")}`, null);
    return text("check") && outcome ? { check: text("check") as string, outcome } : null;
  }
  return refuse(errors, path, AFTER_SHAPES, null);
};

const readRange = (value: unknown): [number, number] | null =>
  (Array.isArray(value) && value.length === 2 && isInt(value[0]) && isInt(value[1]) && value[0] >= 0 && value[0] <= value[1] && value[1] <= ECHO_DELAY_MAX
    ? [value[0], value[1]] : null);

const readDelay = (value: unknown, path: string, errors: ValidationError[]): EchoDelay | null => {
  if (!isRecord(value) || Object.keys(value).length !== 1) return refuse(errors, path, "delay is {parts: [min, max]} (story time) or {boundaries: [min, max]} (turns)", null);
  const parts = value.parts === undefined ? null : readRange(value.parts);
  const boundaries = value.boundaries === undefined ? null : readRange(value.boundaries);
  if (parts) return { parts };
  if (boundaries) return { boundaries };
  return refuse(errors, path, `delay [min, max] is whole numbers from 0 to ${ECHO_DELAY_MAX}, min first`, null);
};

const readWindow = (value: unknown, path: string, errors: ValidationError[]): EchoWindow | undefined => {
  if (value === undefined) return undefined;
  const ok = (entry: unknown) => isInt(entry) && entry >= 0 && entry <= ECHO_EXPIRES_MAX;
  if (isRecord(value) && Object.keys(value).length === 1 && ok(value.parts)) return { parts: value.parts as number };
  if (isRecord(value) && Object.keys(value).length === 1 && ok(value.boundaries)) return { boundaries: value.boundaries as number };
  return refuse(errors, path, `expires is {parts: n} or {boundaries: n}, a whole number from 0 to ${ECHO_EXPIRES_MAX}`, undefined);
};

const readEcho = (value: unknown, path: string, errors: ValidationError[]): StoryEcho | null => {
  if (!isRecord(value)) return refuse(errors, path, "an echo is {id, after, delay, to, cue, when?, cancel_when?, expires?, hold?}", null);
  rejectUnknownKeys(value, ECHO_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "an echo id is a lowercase slug");
  const after = readAfter(value.after, `${path}.after`, errors);
  const delay = readDelay(value.delay, `${path}.delay`, errors);
  const when = value.when === undefined ? null : readGate(value.when, `${path}.when`, errors);
  const cancel = value.cancel_when === undefined ? null : readGate(value.cancel_when, `${path}.cancel_when`, errors);
  const expires = readWindow(value.expires, `${path}.expires`, errors);
  const to = asString(value.to)?.trim() ?? refuse(errors, `${path}.to`, `to names the cast id that hears the echo, or "${ECHO_NARRATOR}"`, "");
  const cue = asString(value.cue)?.trim() ?? "";
  if (!cue || cue.length > ECHO_CUE_MAX) addError(errors, `${path}.cue`, `a cue of 1 to ${ECHO_CUE_MAX} characters`);
  const hold = value.hold === undefined ? undefined : isInt(value.hold) && value.hold >= 1 && value.hold <= ECHO_HOLD_MAX
    ? value.hold : refuse(errors, `${path}.hold`, `hold is a whole number of turns from 1 to ${ECHO_HOLD_MAX}`, undefined);
  if (!GAME_ID_PATTERN.test(id) || !after || !delay || !to || !cue || cue.length > ECHO_CUE_MAX) return null;
  return {
    id, after, delay, ...(when ? { when } : {}), ...(cancel ? { cancel_when: cancel } : {}), ...(expires ? { expires } : {}), to, cue, ...(hold !== undefined ? { hold } : {}),
  };
};

export const readEchoList = (value: unknown, errors: ValidationError[]): StoryEcho[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > ECHOES_MAX) return refuse(errors, "echoes", `echoes is a list of at most ${ECHOES_MAX}`, undefined);
  const echoes = value.map((entry, index) => readEcho(entry, `echoes.${index}`, errors)).filter((entry): entry is StoryEcho => entry !== null);
  return echoes.length ? echoes : undefined;
};

export interface EchoCheckContext {
  roster: readonly RosterMember[];
  transitions: readonly Transition[];
  checkpoints: Parameters<typeof checksById>[0]["checkpoints"];
  quests?: readonly Quest[];
  milestones?: readonly Milestone[];
  qualityByKey: Record<string, Quality>;
  hasClock: boolean;
}

export const transitionIds = (transitions: readonly Pick<Transition, "from" | "to">[]): string[] => transitions.map((transition, index) =>
  `${transition.from}->${transition.to}#${transitions.slice(0, index).filter((other) => other.from === transition.from && other.to === transition.to).length}`);

const sourceProblem = (after: EchoAfter, context: EchoCheckContext, transitions: ReadonlySet<string>): [string, string] | null => {
  if ("transition" in after) return transitions.has(after.transition) ? null : ["transition", `'${after.transition}' is not a transition of this story`];
  if ("quest" in after) return (context.quests ?? []).some((quest) => quest.id === after.quest) ? null : ["quest", `'${after.quest}' is not a quest`];
  if ("milestone" in after) return (context.milestones ?? []).some((milestone) => milestone.id === after.milestone) ? null : ["milestone", `'${after.milestone}' is not a milestone`];
  return checksById({ checkpoints: [...context.checkpoints], transitions: [...context.transitions] }).has(after.check) ? null : ["check", `'${after.check}' is not a check`];
};

const checkEcho = (echo: StoryEcho, path: string, context: EchoCheckContext, transitions: ReadonlySet<string>, errors: ValidationError[]) => {
  const problem = sourceProblem(echo.after, context, transitions);
  if (problem) addError(errors, `${path}.after.${problem[0]}`, problem[1]);
  const unit = echoUnit(echo.delay);
  if (unit === "parts" && !context.hasClock) addError(errors, `${path}.delay`, "a delay in story time needs a story clock: add clock {times}, or use boundaries");
  if (echo.expires && !(unit in echo.expires)) addError(errors, `${path}.expires`, `expires counts in the same unit as the delay (${unit})`);
  if (echo.to === ECHO_NARRATOR) {
    if (!context.roster.some((member) => member.view === "omniscient")) addError(errors, `${path}.to`, "a narrator echo needs a cast member with view omniscient");
  } else if (!context.roster.some((member) => member.id === echo.to)) addError(errors, `${path}.to`, `'${echo.to}' is not in the cast`);
  if (echo.when) validateGate(echo.when, context.qualityByKey, `${path}.when`, errors);
  if (echo.cancel_when) validateGate(echo.cancel_when, context.qualityByKey, `${path}.cancel_when`, errors);
};

export const readEchoes = (value: unknown, context: EchoCheckContext, errors: ValidationError[]): StoryEcho[] | undefined => {
  const echoes = readEchoList(value, errors);
  if (!echoes) return undefined;
  const transitions = new Set(transitionIds(context.transitions));
  const seen = new Set<string>();
  echoes.forEach((echo, index) => {
    if (seen.has(echo.id)) addError(errors, `echoes.${index}.id`, `a second echo '${echo.id}'`);
    seen.add(echo.id);
    checkEcho(echo, `echoes.${index}`, context, transitions, errors);
  });
  return echoes;
};
