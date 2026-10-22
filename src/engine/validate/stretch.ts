import { STRETCH_MODES, STRETCH_OFFERS, STRETCH_PACES, type Checkpoint, type CheckpointStretch, type Quality, type StretchOffer, type Transition, type ValidationError } from "../schema";
import { DEFAULT_STRETCH_PACE, OPENING_MAX_TURNS, PACE_PULL_AFTER } from "../stretch";
import { gateKeys } from "../gates";
import { isRecord } from "@utils/guards";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";

const STRETCH_KEYS = ["mode", "pace", "pull_after", "max_turns", "offer", "arrive_when"] as const;

const NOT_BUILT = ["pressure", "trigger"];

const isTurnCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;

const readOffer = (value: unknown, path: string, errors: ValidationError[]): StretchOffer[] | undefined => {
  if (value === undefined) return undefined;
  const offers = Array.isArray(value) ? value : [];
  if (!Array.isArray(value) || offers.some((entry) => !isOneOf(entry, STRETCH_OFFERS))) {
    addError(errors, path, `offer lists what the stretch may hold, from: ${STRETCH_OFFERS.join(", ")}`);
    return undefined;
  }
  return offers.length ? [...new Set(offers as StretchOffer[])] : undefined;
};

export const readStretch = (value: unknown, path: string, errors: ValidationError[], type?: Checkpoint["type"]): CheckpointStretch | null => {
  if (!isRecord(value)) {
    addError(errors, path, "stretch must be an object");
    return null;
  }
  const opening = type === "anchor";
  const before = errors.length;
  NOT_BUILT.filter((key) => key in value).forEach((key) => addError(errors, `${path}.${key}`, `${key} is not built yet: it needs the production complication pool`));
  rejectUnknownKeys(Object.fromEntries(Object.entries(value).filter(([key]) => !NOT_BUILT.includes(key))), STRETCH_KEYS, path, errors);
  if (!isOneOf(value.mode, STRETCH_MODES)) addError(errors, `${path}.mode`, "mode must be open");
  if (value.pace !== undefined && !isOneOf(value.pace, STRETCH_PACES)) addError(errors, `${path}.pace`, "pace must be brief, unhurried or long");
  if (value.pull_after !== undefined && !isTurnCount(value.pull_after)) addError(errors, `${path}.pull_after`, "pull_after is a player turn count, at least 1");
  const pace = isOneOf(value.pace, STRETCH_PACES) ? value.pace : DEFAULT_STRETCH_PACE;
  const pullAfter = isTurnCount(value.pull_after) ? value.pull_after : PACE_PULL_AFTER[pace];
  if (opening && pullAfter > OPENING_MAX_TURNS) addError(errors, `${path}.pull_after`, `on an anchor pull_after is the open opening in player turns, at most ${OPENING_MAX_TURNS}`);
  const maxTurns = isTurnCount(value.max_turns) && value.max_turns > pullAfter ? value.max_turns : undefined;
  if (value.max_turns !== undefined && maxTurns === undefined) addError(errors, `${path}.max_turns`, `max_turns is a player turn count above pull_after (${pullAfter})`);
  const offer = readOffer(value.offer, `${path}.offer`, errors);
  if (opening) {
    (["max_turns", "offer", "arrive_when"] as const).filter((key) => value[key] !== undefined)
      .forEach((key) => addError(errors, `${path}.${key}`, `an anchor's open opening has no ${key}: the anchor's own exits end it`));
  } else if (value.arrive_when === undefined && type === "intermediate") {
    addError(errors, `${path}.arrive_when`, "an open stretch needs arrive_when, the arrival that lets the player leave");
  }
  const arrive = value.arrive_when === undefined ? null : readGate(value.arrive_when, `${path}.arrive_when`, errors);
  if (!isOneOf(value.mode, STRETCH_MODES) || (!opening && !arrive && (type !== undefined || value.arrive_when !== undefined)) || (opening && errors.length > before)) return null;
  return {
    mode: value.mode, pace, pull_after: pullAfter,
    ...(maxTurns && !opening ? { max_turns: maxTurns } : {}),
    ...(offer && !opening ? { offer } : {}),
    ...(arrive && !opening ? { arrive_when: arrive } : {}),
  };
};

export const checkStretches = (checkpoints: Checkpoint[], transitions: Transition[], qualityByKey: Record<string, Quality>, errors: ValidationError[]) => {
  checkpoints.forEach((checkpoint, index) => {
    const stretch = checkpoint.stretch;
    if (!stretch) return;
    const path = `checkpoints.${index}`;
    if (checkpoint.type === "anchor") return;
    if (checkpoint.player_text) addError(errors, `${path}.player_text`, "an open stretch shows its name, never a task: leave player_text out");
    if (!stretch.arrive_when) {
      addError(errors, `${path}.stretch.arrive_when`, "an open stretch needs arrive_when, the arrival that lets the player leave");
      return;
    }
    validateGate(stretch.arrive_when, qualityByKey, `${path}.stretch.arrive_when`, errors);
    const arrive = JSON.stringify(stretch.arrive_when);
    let arrives = false;
    transitions.forEach((transition, at) => {
      if (transition.from !== checkpoint.id) return;
      const arrival = JSON.stringify(transition.gate) === arrive;
      arrives ||= arrival;
      if (transition.effects?.progress || gateKeys(transition.gate).some((key) => key.startsWith("progress_toward_"))) {
        addError(errors, `transitions.${at}`, "an open stretch ends by the player's move, never a progress counter");
      } else if (!arrival) {
        addError(errors, `transitions.${at}`, "an open stretch ends only through arrive_when: every exit from it uses that gate");
      }
    });
    if (!arrives) addError(errors, `${path}.stretch.arrive_when`, "arrive_when must be the gate of one of the stretch's exits");
  });
};
