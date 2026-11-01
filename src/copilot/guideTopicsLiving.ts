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
  branching: {
    title: "Branches that follow the player",
    fields: "features.branching, features.prefetch, stagecraft.branchingEnabled, stagecraft.prefetchEnabled, judge.uses.divergence",
    text: "Authored turning points with exits and an anchor after them; never where the living director writes. Exits' extraction_hint says what fits. "
      + "Once per player turn that moved nowhere, the judge reads whether it fits an exit; only a turn that commits to an action counts (questions, talk, OOC "
      + "never do). 2 counted 'none' in a row at p>=0.8, or one at p>=0.97, is divergence: the director writes liv_b<n>_way, rejoining the next anchor. "
      + "Refusals alone never branch. Prefetch writes one way out ahead. One branch per turning point; a swipe takes it back. "
      + "features.branching or features.prefetch off declines it for the story.",
  },
} as const satisfies Record<string, GuideTopic>;
