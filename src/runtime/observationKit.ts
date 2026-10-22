import { observationIdentity, observationKey, observationMissedKey, type BoundaryLogEntry, type NormalizedStory, type Observation } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import type { ChanceIds } from "./chance";
import type { RollRecord } from "./rolls";
import {
  OBSERVATION_RECORD_LIMIT, OBSERVATION_RETIRED_LIMIT, orderedRows, type ObservationKit, type ObservationOutcome, type ObservationRecord, type ObservationRoll,
  type ObservationsRuntimeState, type RetiredObservation,
} from "./observationRecords";

type Values = Readonly<Record<string, unknown>>;

const latchedNow = (key: string, entry: BoundaryLogEntry): boolean =>
  entry.before.blackboard.values[key] === undefined && entry.after.blackboard.values[key] !== undefined;

const rollOf = (observation: Observation, ids: ChanceIds | null, entry: BoundaryLogEntry, key: string): ObservationRoll | undefined => {
  if (!observation.passive || !ids) return undefined;
  const values: Values = entry.evaluated && entry.evaluated[key] !== undefined ? entry.evaluated : entry.after.blackboard.values;
  const result = gameLayer()?.observations.observationRoll(observation, ids, entry.boundary, values);
  return result ? { sides: observation.passive.roll.sides, faces: result.faces, total: result.total, target: observation.passive.roll.target } : undefined;
};

function observationRecordsAt(story: NormalizedStory | null, ids: ChanceIds | null, entry: BoundaryLogEntry): ObservationRecord[] {
  if (!story?.observations?.length) return [];
  return story.observations.flatMap((observation): ObservationRecord[] => {
    const outcome: ObservationOutcome | null = latchedNow(observationKey(observation.id), entry) ? "noticed"
      : latchedNow(observationMissedKey(observation.id), entry) ? "missed" : null;
    if (!outcome) return [];
    const key = outcome === "noticed" ? observationKey(observation.id) : observationMissedKey(observation.id);
    const roll = rollOf(observation, ids, entry, key);
    return [{ id: observation.id, identity: observationIdentity(observation), boundary: entry.boundary, messageId: entry.context.lastMessageId, outcome, ...(roll ? { roll } : {}) }];
  });
}

const recordObservations = (state: ObservationsRuntimeState, records: readonly ObservationRecord[]): ObservationsRuntimeState => {
  const fresh = records.filter((record, index) => !state.records.some((kept) => kept.id === record.id && kept.identity === record.identity)
    && records.findIndex((other) => other.id === record.id) === index);
  return fresh.length ? { ...state, records: orderedRows([...state.records, ...fresh], OBSERVATION_RECORD_LIMIT) } : state;
};

const reconcileObservations = (state: ObservationsRuntimeState | undefined, previous: NormalizedStory, next: NormalizedStory): ObservationsRuntimeState | undefined => {
  if (!state) return state;
  const before = new Map((previous.observations ?? []).map((observation) => [observation.id, observation]));
  const after = new Map((next.observations ?? []).map((observation) => [observation.id, observation]));
  const retired: RetiredObservation[] = [];
  const records = state.records.filter((record) => {
    const kept = after.get(record.id);
    if (kept) return observationIdentity(kept) === record.identity;
    const old = before.get(record.id);
    if (old && record.outcome === "noticed") retired.push({ id: record.id, text: old.text, boundary: record.boundary, messageId: record.messageId });
    return false;
  });
  return { records, retired: orderedRows([...state.retired, ...retired], OBSERVATION_RETIRED_LIMIT) };
};

const observationRolls = (story: NormalizedStory | null, state: ObservationsRuntimeState | undefined): RollRecord[] => {
  if (!story?.observations?.length || !state?.records.length) return [];
  return state.records.flatMap((record): RollRecord[] => {
    if (!record.roll) return [];
    const draw = record.roll.faces.reduce((sum, face) => sum + face, 0);
    return [{
      source: "observation", key: `Notice: ${record.id}`, messageId: record.messageId, boundary: record.boundary, sides: record.roll.sides, draw, target: record.roll.target,
      modifiers: record.roll.total - draw, total: record.roll.total, outcome: record.outcome === "noticed" ? "success" : "failure", narrate: false,
      detail: `${record.roll.faces.length > 1 ? record.roll.faces.length : ""}d${record.roll.sides}: ${record.roll.faces.join(" + ")}`,
    }];
  });
};

export const OBSERVATION_KIT: ObservationKit = {
  recordsAt: observationRecordsAt, record: recordObservations, reconcile: reconcileObservations, rolls: observationRolls,
};
