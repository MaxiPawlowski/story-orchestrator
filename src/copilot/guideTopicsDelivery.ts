import type { GuideTopic } from "./guideTopics";

export const DELIVERY_TOPICS = {
  "roster-polish": {
    title: "Voice and delivery",
    fields: "roster[].polish, notes, prefer, avoid, tics, rhythm, by_mood, dialogue, enabled",
    text: "polish {notes (300), prefer (12x40), avoid (20x40), tics (12x40), rhythm clipped|plain|flowing|ornate, by_mood {mood: text (160)}, dialogue keep|voice, enabled}: "
      + "wording only, told to that member alone before they speak, never facts or plans. tics are habits named back when seen in 2 of their last 6 replies; "
      + "repeated phrases are named too. No names in avoid/tics, no word in both prefer and avoid, by_mood needs mood. About 120 tokens: prefer, avoid, repeats, "
      + "rhythm, then note sentences are cut. Record only what the card shows; never invent a trait.",
  },
  "story-polish": {
    title: "Reply polish",
    fields: "polish, mode, narration",
    text: "polish {mode shadow|off, narration {notes, prefer, avoid, tics, rhythm}}: edits wording, never what happens. Code finds an avoid word, a tic seen in 2 of "
      + "the last 6 replies or a repeated phrase; one Reply polish call rewrites only those sentences, quotes frozen; guards keep names, numbers, negations, modals, "
      + "player acts, length; any doubt keeps the original. This build runs shadow only: records for the author, never changes the chat. narration is the voice of "
      + "an omniscient narrator without its own polish and needs one. No plot facts or names in it.",
  },
} as const satisfies Record<string, GuideTopic>;

export const DELIVERY_DIAGNOSTIC_TOPICS = {
  "delivery-names-unknown-entity": "roster-polish", "delivery-directs-player": "roster-polish", "delivery-over-budget": "roster-polish",
} as const;
