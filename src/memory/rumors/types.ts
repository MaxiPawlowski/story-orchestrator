import type { HearsayStance } from "@engine/rumorSchema";
import type { SourceRevision } from "../audience";

export const RUMOR_EVENTS_CAP = 200;
export const HEARSAY_CAP = 48;
export const HEARSAY_SHOWN_PER_RECEIVER = 6;
export const RUMOR_LANDINGS_PER_BOUNDARY = 3;

export interface RumorAt {
  boundary: number;
  messageId: number;
}

export type RumorDue = { boundary: number } | { day: number };

export interface RumorEvent {
  occurrenceId: string;
  rumorId: string;
  from: string;
  to: string;
  hop: number;
  parent: string | null;
  scheduledAt: RumorAt;
  due: RumorDue;
  version: number;
  landedAt?: RumorAt;
  leak?: true;
}

export interface HearsayRow {
  occurrenceId: string;
  receiver: string;
  teller: string;
  rumorId: string;
  claim: string;
  stance: HearsayStance;
  told: { messageId: number; revision: SourceRevision | null };
}

export interface RumorDisclosure {
  entryId: string;
  member: string;
  occurrenceId: string;
  at: RumorAt;
}

export interface RumorsState {
  events: RumorEvent[];
  hearsay: HearsayRow[];
  disclosures: RumorDisclosure[];
  settled: string[];
}
