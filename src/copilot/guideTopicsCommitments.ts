import type { GuideTopic } from "./guideTopics";

export const COMMITMENT_TOPICS = {
  commitments: {
    title: "Promises to the player",
    fields: "roster[].commitments[], id, what, made_when, kept_when, broken_when, due, heard, effect",
    text: "roster[].commitments [{id, what (160 chars, a verb phrase with no you/I), made_when: gate | \"start\", kept_when, broken_when? (an event; never time, == false or not), "
      + "due? {boundaries}|{story_day}, heard? (default true), effect? {world_info, npc_replies onEnter}}] (6 a member). Latched life_commit_<member>_<id>_made|kept|broken. "
      + "The holder alone is reminded while open (\"overdue\" after due or 12 turns), once when kept. Heard ones show \"Promised you: ...\" on its People page; "
      + "the director gets open ones of present members. The player owes nothing.",
  },
} as const satisfies Record<string, GuideTopic>;

export const COMMITMENT_DIAGNOSTIC_TOPICS = {
  "commitment-broken-on-inaction": "commitments", "commitment-what-names-a-side": "commitments",
} as const;
