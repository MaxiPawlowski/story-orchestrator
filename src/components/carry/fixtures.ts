import type { CarryState } from "@engine/carrySchema";
import type { CarryView } from "@runtime/carryPort";

export const carryState = (patch: Partial<CarryState> = {}): CarryState => ({
  fromChat: "chat-a", fromStory: "ngp-source", sourceStoryHash: "h", mode: "sequel", createdAt: "2026-10-14T00:00:00.000Z",
  projection: { storyTitle: "The Lantern Coast", endingTitle: "The Last Lantern", outcome: [], lines: [] },
  values: [
    { from: "coast_fate", key: "heritage_coast", as: "heritage", value: "lit", label: "You relit the Lantern Coast.", knownBy: ["mara"] },
    { from: "coins", key: "heritage_coins", as: "heritage", value: 7, label: "Coins: 7", knownBy: [] },
    { from: "rep_guild", key: "guild_trust", as: "state", value: 3, label: "The Lamplighters: Trusted", knownBy: [] },
  ],
  previously: "\"The Lantern Coast\" ended with \"The Last Lantern\". You relit the Lantern Coast. The last lantern burned over the water.",
  block: "Previously: The Lantern Coast ended.",
  ...patch,
});

export const carryView = (patch: Partial<CarryView> = {}): CarryView => ({
  story: "ngp-source", mode: "sequel", required: false, pending: false, canPick: true, state: carryState(), active: true, block: "Previously: The Lantern Coast ended.", ...patch,
});
