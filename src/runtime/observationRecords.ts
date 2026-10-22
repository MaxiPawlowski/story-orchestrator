import type { BoundaryLogEntry, NormalizedStory } from "@engine/index";
import { isRecord } from "@utils/guards";
import type { ChanceIds } from "./chance";
import type { RollRecord } from "./rolls";

export const OBSERVATION_RECORD_LIMIT = 200;
export const OBSERVATION_RETIRED_LIMIT = 60;

export type ObservationOutcome = "noticed" | "missed";

export interface ObservationRoll {
  sides: number;
  faces: number[];
  total: number;
  target: number;
}

export interface ObservationRecord {
  id: string;
  identity: string;
  boundary: number;
  messageId: number;
  outcome: ObservationOutcome;
  roll?: ObservationRoll;
}

export interface RetiredObservation {
  id: string;
  text: string;
  boundary: number;
  messageId: number;
}

export interface ObservationsRuntimeState {
  records: ObservationRecord[];
  retired: RetiredObservation[];
}

export const createObservations = (): ObservationsRuntimeState => ({ records: [], retired: [] });

export const orderedRows = <T extends { messageId: number; boundary: number }>(rows: T[], limit: number): T[] =>
  [...rows].sort((left, right) => left.messageId - right.messageId || left.boundary - right.boundary).slice(-limit);

export const rollbackObservations = (state: ObservationsRuntimeState, messageId: number): ObservationsRuntimeState =>
  (Number.isFinite(messageId)
    ? { records: state.records.filter((record) => record.messageId < messageId), retired: state.retired.filter((row) => row.messageId < messageId) }
    : state);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const readRoll = (value: unknown): ObservationRoll | undefined =>
  (isRecord(value) && finite(value.sides) && Array.isArray(value.faces) && value.faces.every(finite) && finite(value.total) && finite(value.target)
    ? { sides: value.sides, faces: [...value.faces], total: value.total, target: value.target } : undefined);

const readRecord = (value: unknown): ObservationRecord[] => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.identity !== "string" || !finite(value.boundary) || !finite(value.messageId)) return [];
  if (value.outcome !== "noticed" && value.outcome !== "missed") return [];
  const roll = readRoll(value.roll);
  return [{ id: value.id, identity: value.identity, boundary: value.boundary, messageId: value.messageId, outcome: value.outcome, ...(roll ? { roll } : {}) }];
};

const readRetired = (value: unknown): RetiredObservation[] =>
  (isRecord(value) && typeof value.id === "string" && typeof value.text === "string" && finite(value.boundary) && finite(value.messageId)
    ? [{ id: value.id, text: value.text, boundary: value.boundary, messageId: value.messageId }] : []);

export const sanitizeObservations = (value: unknown): ObservationsRuntimeState => ({
  records: orderedRows(isRecord(value) && Array.isArray(value.records) ? value.records.flatMap(readRecord) : [], OBSERVATION_RECORD_LIMIT),
  retired: orderedRows(isRecord(value) && Array.isArray(value.retired) ? value.retired.flatMap(readRetired) : [], OBSERVATION_RETIRED_LIMIT),
});

export interface ObservationKit {
  recordsAt: (story: NormalizedStory | null, ids: ChanceIds | null, entry: BoundaryLogEntry) => ObservationRecord[];
  record: (state: ObservationsRuntimeState, records: readonly ObservationRecord[]) => ObservationsRuntimeState;
  reconcile: (state: ObservationsRuntimeState | undefined, previous: NormalizedStory, next: NormalizedStory) => ObservationsRuntimeState | undefined;
  rolls: (story: NormalizedStory | null, state: ObservationsRuntimeState | undefined) => RollRecord[];
}

let kit: ObservationKit | null = null;

export const installObservationKit = (next: ObservationKit): void => {
  kit = next;
};

export const observationKit = (): ObservationKit | null => kit;
