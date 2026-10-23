import type { GuideTopic } from "./guideTopics";

export const CUE_TOPICS = {
  cues: {
    title: "Remarks and reactions",
    fields: "roster[].cues[], id, kind, when, cue, lane, priority, window, repeat, landed_when, max_offers",
    text: "cues [{id, kind remark|reaction, when (reaction: an event), cue (160 chars, what it noticed), lane may|must, priority 0, window 3, repeat {cooldown}, "
      + "landed_when + max_offers 3 (must)}] (12). One private line per reply to the drafted member. Order: must, priority, topic>echo>norm>cue, declaration. "
      + "may: once, 2 turns apart; must: again until landed_when holds after an offer. Broad cue at 0, overrides above.",
  },
  topics: {
    title: "Topics a character deepens",
    fields: "roster[].topics[], id, keys, tiers, cue, when, priority",
    text: "topics [{id, keys (1-8 terms, never a cast name), tiers 1-3 [{cue, when?}], priority 30}] (6). Offered only when the player's latest in-character line "
      + "addresses the member by name (\"Mara, ...\") and names a key; each answered raise steps topic_<member>_<id>. A failing tier when holds it back.",
  },
  norms: {
    title: "Social norms",
    fields: "norms[], id, label, broken_when, noticed_by, cue, priority, checkpoints",
    text: "norms [{id, label (yours), broken_when (an event), noticed_by, cue, priority 15, checkpoints?}] (8). First break latches cue_norm_<id>_at and "
      + "cue_norm_<id>_<member>_at per witness not away; each gets a reaction cue for 3 turns. No score.",
  },
} as const satisfies Record<string, GuideTopic>;

export const CUE_DIAGNOSTIC_TOPICS = {
  "cue-needs-event": "cues", "cue-tie": "cues", "cue-narrates-player": "cues", "topic-ungated-depth": "topics",
} as const;
