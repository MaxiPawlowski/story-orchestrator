import type { GuideTopic } from "./guideTopics";

export const OFFER_TOPICS = {
  offers: {
    title: "Offers",
    fields: "checkpoints[].offers[], id, text, visible_when, needs, reason",
    text: "offers [{id, text (the player's line, 200), visible_when?, needs?: {when, reason (120)}}], at most 8 a beat: What could I do? may build a suggestion on one while the beat "
      + "is active and visible_when holds, and lists it as written when the model drops it; needs failing shows it greyed with your reason in Author view only, never fillable. Never generated from "
      + "transitions. needs reading a check result or a latch is refused. Text naming a place, quest or person the player may not know warns (offer-names-unknown) and is held back.",
  },
} as const satisfies Record<string, GuideTopic>;

export const OFFER_DIAGNOSTIC_TOPICS = { "offer-names-unknown": "offers", "check-hint-names-unknown": "checks" } as const;
