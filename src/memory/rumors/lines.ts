import { rumorVersions, type HearsayStance, type StoryRumors } from "@engine/rumorSchema";
import { HEARSAY_SHOWN_PER_RECEIVER, type RumorsState } from "./types";

const STANCE_WORDS: Record<HearsayStance, string> = { believes: "you believe it", doubts: "you doubt it", unsure: "you are not sure of it" };

export const hearsayLines = (state: RumorsState | undefined, rosterId: string, nameOf: (id: string) => string): string[] =>
  (state?.hearsay ?? []).filter((row) => row.receiver === rosterId).slice(-HEARSAY_SHOWN_PER_RECEIVER)
    .map((row) => `- ${nameOf(row.teller)} told you: ${row.claim} (${STANCE_WORDS[row.stance]}; hearsay, it may be wrong)`);

export type RumorStatus = "origin" | "pending" | "landed";

export interface RumorAuthorRow {
  rumorId: string;
  from: string;
  to: string;
  hop: number;
  version: string;
  status: RumorStatus;
  stance?: HearsayStance;
  leak: boolean;
  due: string;
}

export const rumorAuthorRows = (state: RumorsState | undefined, net: StoryRumors | undefined, nameOf: (id: string) => string): RumorAuthorRow[] =>
  (state?.events ?? []).map((event) => {
    const rumor = net?.rumors.find((entry) => entry.id === event.rumorId);
    const row = state?.hearsay.find((entry) => entry.occurrenceId === event.occurrenceId);
    return {
      rumorId: event.rumorId, from: nameOf(event.from), to: nameOf(event.to), hop: event.hop,
      version: rumor ? rumorVersions(rumor)[event.version]?.text ?? rumor.claim : row?.claim ?? "",
      status: event.hop === 0 ? "origin" : event.landedAt ? "landed" : "pending",
      ...(row ? { stance: row.stance } : {}), leak: Boolean(event.leak),
      due: "boundary" in event.due ? `turn ${event.due.boundary}` : `day ${event.due.day}`,
    };
  });
