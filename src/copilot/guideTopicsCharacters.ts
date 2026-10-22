import type { GuideTopic } from "./guideTopics";
import { LABEL_DIAGNOSTIC_TOPICS, LABEL_TOPICS } from "./guideTopicsLabels";
import { RUMOR_TOPICS } from "./guideTopicsRumors";
import { COMMITMENT_DIAGNOSTIC_TOPICS, COMMITMENT_TOPICS } from "./guideTopicsCommitments";

export const CHARACTER_TOPICS = {
  "character-life": {
    title: "Character life",
    fields: "roster[].relationships, roster[].mood, roster[].agenda, roster[].schedule",
    text: "relationships [{toward: id|player, axes, range, step, start, label}] compile to rel_<holder>_<toward>_<axis> ratings: start until read, read as up or down (never a level) while "
      + "both are present, at most step a turn, seen only by the holder and Author view. mood {baseline, values, lasts}: re-read after a scene change, else "
      + "baseline. agenda [{id, goal, steps [{text, when, effect: world_info|npc_replies, public, repeat}], pace per_n_boundaries|per_chapter (needs chapters), "
      + "every}] moves in code, never on OOC. schedule [{when, at}]: away drops a member from speakers; addressed, the narrator says they are not here. "
      + "Off-stage events: auto by default. "
      + "Time of day and day count: see story-time.",
  },
  factions: {
    title: "Factions and standing",
    fields: "factions[], range, start, bands, visible_when, introduce, moves[], heard_by, roster[].factions",
    text: "factions [{id (no underscores), name, range, start, bands, visible_when, introduce, moves [{id, when, add, heard_by present|faction}]}] compile to rep_<id> ints. "
      + "A move fires once ever when its gate first holds; a reward {add} moves it too; every write is clamped to range; state_snapshot never writes it. "
      + "A lowering move needs an event the player caused (never not, time or == false). roster[].factions: members hear moves when present and get a private band line. "
      + "Players see band words of visible factions; the director gets visible bands, hidden ones only with introduce, by name.",
  },
  ...RUMOR_TOPICS,
  ...LABEL_TOPICS,
  ...COMMITMENT_TOPICS,
} as const satisfies Record<string, GuideTopic>;

export const FACTION_DIAGNOSTIC_TOPICS = {
  "faction-move-on-inaction": "factions", "faction-never-moves": "factions", "faction-no-visible-band": "factions", "faction-snapshot-key": "factions",
  ...LABEL_DIAGNOSTIC_TOPICS,
  ...COMMITMENT_DIAGNOSTIC_TOPICS,
} as const;
