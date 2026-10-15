import type { GuideTopic } from "./guideTopics";

export const LABEL_TOPICS = {
  "relationship-labels": {
    title: "Relationship labels",
    fields: "roster[].relationships[].public, roster[].relationships[].secret, follows_feeling, hold, revealed_when",
    text: "On a relationship: public [{label (40 chars, plain), when?, follows_feeling?, hold? 1-5}] (the last row whose gate holds is shown, present tense; a gate reading rel_* "
      + "needs follows_feeling) and secret [{id, label, revealed_when}] (at most 4; latched life_reveal_<holder>_<toward>_<id> the first turn the gate holds, never un-revealed, "
      + "shown as \"Learned: ...\"). Shown on the holder's People page while holder and target are known; numbers never. The holder's private line names them; no other member "
      + "learns a reveal. A secret's gate true at start, or equal to a public label, is refused; a public label must not name the secret.",
  },
} as const satisfies Record<string, GuideTopic>;

export const LABEL_DIAGNOSTIC_TOPICS = {
  "relationship-label-reads-axis": "relationship-labels", "relationship-secret-in-public": "relationship-labels",
} as const;
