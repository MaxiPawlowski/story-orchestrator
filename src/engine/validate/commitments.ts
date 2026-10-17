import {
  COMMITMENTS_MAX, COMMITMENT_START, COMMITMENT_TEXT_MAX, COMMITMENT_TO_PLAYER, commitKey,
  type AgendaStepEffect, type Commitment, type CommitmentDue, type GateNode, type LifeMember, type PrimitiveValue, type Quality, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { evaluateGate } from "../gates";
import { addError, asString, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { inactionProblem } from "./factions";

const COMMITMENT_KEYS = ["id", "to", "what", "made_when", "kept_when", "broken_when", "due", "heard", "effect"] as const;
const COMMITMENT_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
const MACRO = /\{\{|\}\}/;
const DUE_MAX_BOUNDARIES = 200;
export const COMMITMENT_BROKEN_ON_INACTION = "commitment-broken-on-inaction";

type ReadEffect = (value: unknown, path: string, errors: ValidationError[]) => AgendaStepEffect | undefined;

const isWhole = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

const readDue = (value: unknown, path: string, errors: ValidationError[]): CommitmentDue | undefined => {
  if (value === undefined) return undefined;
  if (isRecord(value) && Object.keys(value).length === 1 && isWhole(value.story_day, 1)) return { story_day: value.story_day };
  if (isRecord(value) && Object.keys(value).length === 1 && isWhole(value.boundaries, 1, DUE_MAX_BOUNDARIES)) return { boundaries: value.boundaries };
  return refuse(errors, path, `due is {story_day: a day of at least 1} or {boundaries: 1 to ${DUE_MAX_BOUNDARIES}}`, undefined);
};

const readWhat = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > COMMITMENT_TEXT_MAX) return refuse(errors, path, `what is plain text of at most ${COMMITMENT_TEXT_MAX} characters`, null);
  return MACRO.test(text) ? refuse(errors, path, "plain text only: macros are not expanded", null) : text.replace(/[.!?]+$/, "");
};

const readCommitment = (value: unknown, path: string, errors: ValidationError[], readEffect: ReadEffect): Commitment | null => {
  if (!isRecord(value)) return refuse(errors, path, "a commitment is {id, what, made_when, kept_when}", null);
  rejectUnknownKeys(value, COMMITMENT_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!COMMITMENT_ID.test(id)) addError(errors, `${path}.id`, "a commitment id is lowercase letters, digits and -");
  if (value.to !== undefined && value.to !== COMMITMENT_TO_PLAYER) addError(errors, `${path}.to`, "a commitment is to the player; between characters use an agenda");
  const what = readWhat(value.what, `${path}.what`, errors);
  const made = value.made_when === COMMITMENT_START ? COMMITMENT_START
    : value.made_when === undefined ? refuse(errors, `${path}.made_when`, "a commitment needs made_when: a gate, or \"start\" when it was made before the story", null)
      : readGate(value.made_when, `${path}.made_when`, errors);
  const kept = value.kept_when === undefined ? refuse(errors, `${path}.kept_when`, "a commitment needs kept_when: the event that keeps it", null)
    : readGate(value.kept_when, `${path}.kept_when`, errors);
  const broken = value.broken_when === undefined ? undefined : readGate(value.broken_when, `${path}.broken_when`, errors) ?? undefined;
  const due = readDue(value.due, `${path}.due`, errors);
  if (value.heard !== undefined && typeof value.heard !== "boolean") addError(errors, `${path}.heard`, "heard is true or false");
  const effect = readEffect(value.effect, `${path}.effect`, errors);
  if (!COMMITMENT_ID.test(id) || !what || !made || !kept) return null;
  return {
    id, to: COMMITMENT_TO_PLAYER, what, made_when: made, kept_when: kept, ...(broken ? { broken_when: broken } : {}), ...(due ? { due } : {}),
    ...(value.heard === false ? { heard: false } : {}), ...(effect ? { effect } : {}),
  };
};

export const readCommitments = (value: unknown, path: string, errors: ValidationError[], readEffect: ReadEffect): Commitment[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, path, "commitments are a list", undefined);
  if (value.length > COMMITMENTS_MAX) addError(errors, path, `a member holds at most ${COMMITMENTS_MAX} commitments`);
  const list = value.map((entry, index) => readCommitment(entry, `${path}.${index}`, errors, readEffect)).filter((entry): entry is Commitment => entry !== null);
  list.forEach((entry, index) => { if (list.findIndex((other) => other.id === entry.id) !== index) addError(errors, `${path}.${index}.id`, `duplicate commitment '${entry.id}'`); });
  return list.length ? list : undefined;
};

const latch = (key: string, rubric: string): Quality => ({ key, type: "int", source: "code", latching: true, monotonic: true, rubric });

export const commitmentQualities = (member: LifeMember): Quality[] => (member.commitments ?? []).flatMap((commitment) => [
  ...(commitment.made_when === COMMITMENT_START ? [] : [latch(commitKey(member.id, commitment.id, "made"), `The boundary at which ${member.id} made commitment ${commitment.id} to the player`)]),
  latch(commitKey(member.id, commitment.id, "kept"), `The boundary at which ${member.id} kept commitment ${commitment.id}`),
  latch(commitKey(member.id, commitment.id, "broken"), `The boundary at which ${member.id} broke commitment ${commitment.id}`),
]);

export const checkCommitments = (
  member: LifeMember, path: string, qualityByKey: Record<string, Quality>, start: Readonly<Record<string, PrimitiveValue>>, hasClock: boolean, errors: ValidationError[],
) => (member.commitments ?? []).forEach((commitment, index) => {
  const base = `${path}.commitments.${index}`;
  const gates: Array<[string, GateNode | undefined]> = [
    ["made_when", commitment.made_when === COMMITMENT_START ? undefined : commitment.made_when], ["kept_when", commitment.kept_when], ["broken_when", commitment.broken_when],
  ];
  gates.forEach(([field, gate]) => { if (gate) validateGate(gate, qualityByKey, `${base}.${field}`, errors); });
  if (evaluateGate(commitment.kept_when, { get: (key) => start[key] })) {
    addError(errors, `${base}.kept_when`, "this gate holds before anything happens, so the commitment would be kept at once");
  }
  const problem = commitment.broken_when ? inactionProblem(commitment.broken_when, start) : null;
  const why = problem?.replace("the move fires", "it breaks");
  if (why) addError(errors, `${base}.broken_when`, `${COMMITMENT_BROKEN_ON_INACTION}: a commitment is broken only by an event, never by time or absence; ${why}`);
  if (commitment.due && "story_day" in commitment.due && !hasClock) addError(errors, `${base}.due`, "due.story_day needs a clock: add clock {times}, or use due.boundaries");
});
