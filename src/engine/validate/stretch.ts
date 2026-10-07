import { STRETCH_MODES, STRETCH_PACES, type Checkpoint, type CheckpointStretch, type Quality, type Transition, type ValidationError } from "../schema";
import { DEFAULT_STRETCH_PACE, PACE_PULL_AFTER, PLAYER_TURNS_KEY } from "../stretch";
import { gateKeys } from "../gates";
import { isRecord } from "@utils/guards";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";

const STRETCH_KEYS = ["mode", "pace", "pull_after", "max_turns", "arrive_when"] as const;

const NOT_BUILT = ["pressure", "offer", "trigger"];

const isTurnCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;

export const readStretch = (value: unknown, path: string, errors: ValidationError[]): CheckpointStretch | null => {
  if (!isRecord(value)) {
    addError(errors, path, "stretch must be an object");
    return null;
  }
  NOT_BUILT.filter((key) => key in value).forEach((key) => addError(errors, `${path}.${key}`, `${key} is not built yet: a stretch has no complications or encounters`));
  rejectUnknownKeys(Object.fromEntries(Object.entries(value).filter(([key]) => !NOT_BUILT.includes(key))), STRETCH_KEYS, path, errors);
  if (!isOneOf(value.mode, STRETCH_MODES)) addError(errors, `${path}.mode`, "mode must be open");
  if (value.pace !== undefined && !isOneOf(value.pace, STRETCH_PACES)) addError(errors, `${path}.pace`, "pace must be brief, unhurried or long");
  if (value.pull_after !== undefined && !isTurnCount(value.pull_after)) addError(errors, `${path}.pull_after`, "pull_after is a player turn count, at least 1");
  const pace = isOneOf(value.pace, STRETCH_PACES) ? value.pace : DEFAULT_STRETCH_PACE;
  const pullAfter = isTurnCount(value.pull_after) ? value.pull_after : PACE_PULL_AFTER[pace];
  const maxTurns = isTurnCount(value.max_turns) && value.max_turns > pullAfter ? value.max_turns : undefined;
  if (value.max_turns !== undefined && maxTurns === undefined) addError(errors, `${path}.max_turns`, `max_turns is a player turn count above pull_after (${pullAfter})`);
  if (value.arrive_when === undefined) addError(errors, `${path}.arrive_when`, "an open stretch needs arrive_when, the arrival that lets the player leave");
  const arrive = value.arrive_when === undefined ? null : readGate(value.arrive_when, `${path}.arrive_when`, errors);
  if (!isOneOf(value.mode, STRETCH_MODES) || !arrive) return null;
  return { mode: value.mode, pace, pull_after: pullAfter, ...(maxTurns ? { max_turns: maxTurns } : {}), arrive_when: arrive };
};

export const checkStretches = (checkpoints: Checkpoint[], transitions: Transition[], qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  const turns = qualityByKey[PLAYER_TURNS_KEY];
  if (turns && (turns.type !== "int" || turns.source !== "code")) addError(errors, "qualities", `${PLAYER_TURNS_KEY} must be an int with source code`);
  checkpoints.forEach((checkpoint, index) => {
    const stretch = checkpoint.stretch;
    if (!stretch) return;
    const path = `checkpoints.${index}`;
    if (checkpoint.type !== "intermediate") addError(errors, `${path}.stretch`, "only an intermediate can be an open stretch");
    if (checkpoint.player_text) addError(errors, `${path}.player_text`, "an open stretch shows its name, never a task: leave player_text out");
    validateGate(stretch.arrive_when, qualityByKey, `${path}.stretch.arrive_when`, errors);
    const arrive = JSON.stringify(stretch.arrive_when);
    let arrives = false;
    transitions.forEach((transition, at) => {
      if (transition.from !== checkpoint.id) return;
      arrives ||= JSON.stringify(transition.gate) === arrive;
      if (transition.effects?.progress || gateKeys(transition.gate).some((key) => key.startsWith("progress_toward_"))) {
        addError(errors, `transitions.${at}`, "an open stretch ends by the player's move, never a progress counter");
      }
    });
    if (!arrives) addError(errors, `${path}.stretch.arrive_when`, "arrive_when must be the gate of one of the stretch's exits");
  });
};
