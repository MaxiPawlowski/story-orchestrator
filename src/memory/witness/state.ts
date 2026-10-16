import { isRecord } from "@utils/guards";
import type { WitnessRecordState } from "./types";

export const createWitness = (): WitnessRecordState => ({ reads: [], folded: [], invalidated: [] });

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const ranged = (value: unknown): boolean => isRecord(value) && Number.isSafeInteger(value.from) && Number.isSafeInteger(value.to);

export const sanitizeWitness = (value: unknown): WitnessRecordState => (isRecord(value) ? {
  reads: list(value.reads).filter((read) => isRecord(read) && typeof read.readId === "string" && ranged(read.inputRange) && Array.isArray(read.claims)) as WitnessRecordState["reads"],
  folded: list(value.folded).filter((row) => isRecord(row) && ranged(row.inputRange) && isRecord(row.claim)) as WitnessRecordState["folded"],
  invalidated: list(value.invalidated).filter(ranged) as WitnessRecordState["invalidated"],
} : createWitness());

export const rollbackWitness = (state: WitnessRecordState, messageId: number): WitnessRecordState => {
  const dropped = state.reads.filter((read) => read.inputRange.to >= messageId);
  const folded = state.folded.filter((row) => row.inputRange.to < messageId);
  if (!dropped.length && folded.length === state.folded.length) return state;
  const tombstones = [...state.folded.filter((row) => row.inputRange.to >= messageId).map((row) => ({ readId: row.readId, from: row.inputRange.from, to: row.inputRange.to })),
    ...dropped.filter((read) => read.status === "accepted").map((read) => ({ readId: read.readId, from: read.inputRange.from, to: read.inputRange.to }))]
    .map((row) => ({ ...row, to: Math.min(row.to, messageId - 1) })).filter((row) => row.to >= row.from);
  return {
    reads: state.reads.filter((read) => !dropped.includes(read)),
    folded,
    invalidated: [...state.invalidated.map((row) => ({ ...row, to: Math.min(row.to, messageId - 1) })).filter((row) => row.to >= row.from), ...tombstones].slice(-50),
  };
};
