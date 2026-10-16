import { isRecord } from "@utils/guards";
import type { RumorsState } from "./types";

export const createRumors = (): RumorsState => ({ events: [], hearsay: [], disclosures: [], settled: [] });

const at = (value: unknown): boolean => isRecord(value) && Number.isSafeInteger(value.boundary) && Number.isSafeInteger(value.messageId);

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const sanitizeRumors = (value: unknown): RumorsState => (isRecord(value) ? {
  events: list(value.events).filter((event) => isRecord(event) && typeof event.occurrenceId === "string" && typeof event.to === "string" && at(event.scheduledAt)
    && (event.landedAt === undefined || at(event.landedAt))) as RumorsState["events"],
  hearsay: list(value.hearsay).filter((row) => isRecord(row) && typeof row.occurrenceId === "string" && typeof row.receiver === "string" && typeof row.claim === "string"
    && isRecord(row.told) && Number.isSafeInteger(row.told.messageId)) as RumorsState["hearsay"],
  disclosures: list(value.disclosures).filter((row) => isRecord(row) && typeof row.entryId === "string" && typeof row.member === "string" && at(row.at)) as RumorsState["disclosures"],
  settled: list(value.settled).filter((entry): entry is string => typeof entry === "string"),
} : createRumors());

export const rollbackRumors = (state: RumorsState, messageId: number): RumorsState => {
  const events = state.events.filter((event) => event.scheduledAt.messageId < messageId);
  const reopened = new Set(events.filter((event) => event.landedAt && event.landedAt.messageId >= messageId).map((event) => event.occurrenceId));
  if (events.length === state.events.length && !reopened.size && state.disclosures.every((row) => row.at.messageId < messageId)
    && state.hearsay.every((row) => row.told.messageId < messageId)) return state;
  return {
    events: events.map((event) => {
      if (!reopened.has(event.occurrenceId)) return event;
      const { landedAt: _landed, ...pending } = event;
      return pending;
    }),
    hearsay: state.hearsay.filter((row) => row.told.messageId < messageId),
    disclosures: state.disclosures.filter((row) => row.at.messageId < messageId),
    settled: state.settled,
  };
};
