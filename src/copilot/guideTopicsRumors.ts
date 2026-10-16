import type { GuideTopic } from "./guideTopics";

export const RUMOR_TOPICS = {
  rumors: {
    title: "Rumors and gossip",
    fields: "rumors[], from, claim, versions, truth, weight, starts_when, leaks_to, roster[].gossip, talks_to, contact, delay, hops",
    text: "rumors [{id, from, claim, versions [{text, truth true|false|unknown, weight}], starts_when, leaks_to [{member, when}]}] start with from once starts_when holds and "
      + "travel along roster[].gossip {talks_to, contact together|any|gate, when, delay {boundaries|days: [min, max]}, hops (1-3, default 2)} as hearsay: the receiver's "
      + "private block says who told them and whether they believe it, never the truth flag. Code only, seeded, no model call; at most 3 hops land a turn. A claim that "
      + "restates a secret kept from someone never reaches them, except the one member a leaks_to names, whose reveal is theirs alone.",
  },
} as const satisfies Record<string, GuideTopic>;
