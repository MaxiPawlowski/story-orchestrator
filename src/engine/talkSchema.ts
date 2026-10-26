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

export interface TalkControl {
  speakers?: TalkControlSpeaker[];
  lead?: string;
  no_repeat?: boolean;
  allow_silence?: boolean;
  director?: boolean | TalkControlDirector;
  chain?: TalkControlChain | false;
}
