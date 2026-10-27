import type { GuideTopic } from "./guideTopics";

export const TALK_TOPICS = {
  "talk-control": {
    title: "Speaker direction",
    fields: "checkpoints[].talk_control",
    text: "Who speaks next in a group: speakers [{member, weight}], lead (picked first), no_repeat, allow_silence (needs the director), director (an AI picks the speaker), "
      + "chain (several voices answer one message: mode director or scripted with a sequence, max, stop_on_transition, stop_on_player, hold_extraction, "
      + "yield_on_question: default on, a voice asking the player ends it). List the lead in speakers. no_repeat defaults on: no member repeats within a chain; "
      + "false permits repeats up to max. A player line or STOP ends the old chain. "
      + "An unlisted lead joins at weight 1. A name nobody has is skipped.",
  },
  "talk-pacing": {
    title: "Pacing profiles and speech budget",
    fields: "talk_control.profile, budget, lead_words, spotlight, address_player, reaction, talk_defaults",
    text: "profile (opening, conversation, decision, action, aftermath) fills in policy; set fields win; never switches a feature off. budget {voices, attempts} per "
      + "player message, shared by chain voices and afterSpeak/sceneBreak lines (default chain max, +1 with such lines). lead_words: soft lead length, no token cap. "
      + "spotlight {quiet_after, members}: a quiet member replaces the next voice, or the first one if quieter than the pick "
      + "(not a named member, not a lead-first lead). address_player {after_player_turns, by, cooldown_player_turns}: a planned "
      + "non-lead voice asks the player one thing. reaction: one line after a transition, quest or check. talk_defaults: story default.",
  },
} as const satisfies Record<string, GuideTopic>;

export const TALK_DIAGNOSTIC_TOPICS = {
  "talk-budget-below-chain": "talk-pacing", "talk-pacing-no-room": "talk-pacing", "npc-reply-scope-unused": "npc-replies",
} as const;
