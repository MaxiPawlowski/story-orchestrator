import type { GuideTopic } from "./guideTopics";

export const LIVING_TOPICS = {
  "scene-test": {
    title: "Scene test",
    fields: "living.scene_test, chaos, min_gap",
    text: "living.scene_test {chaos: {from: \"tension\"}, min_gap 0-5 (default 2)}: before the director writes a turning point, one seeded draw (chat, story, turning point, "
      + "the turn it was first planned) gives expected, altered or interrupt; odds (chaos+1)/7 with chaos = smoothed tension 0-4, interrupt 40% of the unexpected. "
      + "Altered: exactly one of place, cast, timing or an obstacle changes. Interrupt: a world event advances an open thread first; within min_gap turning points of "
      + "the last interrupt it becomes altered. Frozen once, never re-rolled; author-only; never the player's act; not on liv_open.",
  },
} as const satisfies Record<string, GuideTopic>;
