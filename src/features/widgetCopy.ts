import type { ProvenanceView, RollHint } from "@runtime/gameTypes";

const WRITERS: Record<NonNullable<ProvenanceView["writer"]>, string> = { reader: "the reader", story: "the story", author: "you" };

export const changedAgoText = (replies: number): string => (replies === 0 ? "just changed" : `changed ${replies} ${replies === 1 ? "reply" : "replies"} ago`);

export const rollHintText = (roll: RollHint): string => `${roll.label}: ${roll.dice} vs ${roll.target}`;

export const provenanceText = (row: ProvenanceView): string => (row.writer && row.messageId !== undefined
  ? `${row.label} (${row.key}): set by ${WRITERS[row.writer]} at message #${row.messageId}, boundary ${row.boundary ?? 0}`
  : `${row.label} (${row.key}): unchanged in the turns this chat keeps`);

export const WIDGET_TEXT = {
  fresh: "new",
  clueLinks: "Connections",
  linkedTo: "linked to",
  mapPlaces: "Places on the map",
  mapHere: "you are here",
  actionHint: "Puts this line in the box where you type. You can change it before you send it.",
  htmlUnsupported: "This panel needs a browser that shows embedded pages.",
  htmlNavigated: "This panel tried to leave its own page, so it was closed. Its plain version shows instead.",
  htmlNoActions: "This panel cannot put text in the box here.",
  openHint: "Opens the story drawer at this tab.",
  openRefused: "The story drawer cannot open here.",
  rollHint: "Puts your attempt in the box where you type. The story rolls when you send it.",
  provenance: "Where these values came from",
  timelineHere: "you are here",
};
