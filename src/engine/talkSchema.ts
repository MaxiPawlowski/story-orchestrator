export interface TalkControlSpeaker {
  member: string;
  weight?: number;
}

export interface TalkControlDirector {
  instruction?: string;
}

// How a scene answers a single player message with more than one voice. `director` asks the judge
// for each next speaker and stops when it hands back to the player; `scripted` walks `sequence` in
// order. Absent means the system defaults apply (chaining on, max 3), so a declared talk_control
// opts in unless it turns this off.
export const TALK_CHAIN_MAX_DEFAULT = 3;
export const TALK_CHAIN_MAX_CAP = 8;

export interface TalkControlChain {
  mode?: "director" | "scripted";
  max?: number;
  sequence?: string[];
  stop_on_transition?: boolean;
  hold_extraction?: boolean;
  stop_on_player?: boolean;
  yield_on_question?: boolean;
}

export const TALK_PROFILES = ["opening", "conversation", "decision", "action", "aftermath"] as const;
export type TalkProfileName = (typeof TALK_PROFILES)[number];

export const TALK_BUDGET_CAP = 8;
export const TALK_ATTEMPTS_CAP = 12;
export const TALK_TURNS_CAP = 20;
export const TALK_LEAD_WORDS_MIN = 30;
export const TALK_LEAD_WORDS_MAX = 600;

export interface TalkBudget {
  voices?: number;
  attempts?: number;
}

export interface TalkSpotlight {
  quiet_after?: number;
  members?: string[];
}

export interface TalkAddressPlayer {
  after_player_turns: number;
  by?: "relevant_member" | string[];
  cooldown_player_turns?: number;
}

export interface TalkReaction {
  members?: string[];
}

export interface TalkControl {
  speakers?: TalkControlSpeaker[];
  lead?: string;
  no_repeat?: boolean;
  allow_silence?: boolean;
  director?: boolean | TalkControlDirector;
  chain?: TalkControlChain | false;
  profile?: TalkProfileName;
  budget?: TalkBudget;
  lead_words?: number;
  spotlight?: TalkSpotlight | false;
  address_player?: TalkAddressPlayer | false;
  reaction?: TalkReaction | false;
}

export interface StoryTalkDefaults {
  profile?: TalkProfileName;
  budget?: TalkBudget;
}

export const NPC_REPLY_SCOPES = ["story", "entry", "player_turn"] as const;
export type NpcReplyScope = (typeof NPC_REPLY_SCOPES)[number];
