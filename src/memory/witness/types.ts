import type { SourceRevision } from "../audience";

export const WITNESS_READ_CAP = 200;
export const WITNESS_TOMBSTONE_CAP = 50;
export const WITNESS_ANCHOR_WORDS: [number, number] = [4, 8];

export type HeardList =
  | { kind: "members"; members: string[] }
  | { kind: "all-present"; members: string[] }
  | { kind: "unknown" };

export interface WitnessSpanClaim {
  span: [number, number];
  heard: HeardList;
}

export interface WitnessClaim {
  messageId: number;
  revision: SourceRevision;
  mixed: boolean;
  heard: HeardList;
  spans: WitnessSpanClaim[];
}

export type WitnessReadStatus = "accepted" | "no-read" | "outage";

export interface WitnessInputRange {
  from: number;
  to: number;
  revisions: Array<{ messageId: number; revision: SourceRevision }>;
}

export interface WitnessRead {
  readId: string;
  status: WitnessReadStatus;
  inputRange: WitnessInputRange;
  claims: WitnessClaim[];
}

export interface WitnessFolded {
  readId: string;
  inputRange: { from: number; to: number };
  claim: WitnessClaim;
}

export interface WitnessTombstone {
  readId: string;
  from: number;
  to: number;
}

export interface WitnessRecordState {
  reads: WitnessRead[];
  folded: WitnessFolded[];
  invalidated: WitnessTombstone[];
}

export interface WitnessAudit {
  status: WitnessReadStatus;
  inputRange: WitnessInputRange;
  claims: WitnessClaim[];
}
