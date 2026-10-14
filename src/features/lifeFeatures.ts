import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";

export const LIFE_FEATURES: readonly Feature[] = [
  {
    id: "character-life", name: "Character life", area: "characters", audience: "author",
    oneLine: "Feelings that move, a mood per scene, plans that go on off stage and places to be, for the characters a story declares.",
    what: "Feelings and moods are ordinary story values read from the chat, a little at a time; plans move in code at a turn, and a member who is elsewhere does not speak. "
      + "Each character sees only its own, the player never does, and a swipe takes all of it back.",
    where: { selector: "#so-studio-modal", label: "Studio › Roster", surface: "studio" },
    settings: [], guideTopic: "character-life", doc: authorGuideDoc("character-life"), status: "experimental", needs: ["story"],
  },
  {
    id: "factions", name: "Standing with groups", area: "characters", audience: "player",
    oneLine: "How the groups in a story regard you, shown as a word such as \"Wary\" or \"Trusted\".",
    what: "A story can name groups, such as a guild or a village. What you do in the story can raise or lower how each regards you, once per event and never for doing nothing. "
      + "You see a word, never a number; a member of the group opens toward you accordingly, as far as they have heard, and a swipe takes it back.",
    where: { selector: "#so-open-stat-sheet", label: "Story drawer › Stat sheet › Standing", surface: "drawer" },
    settings: [], guideTopic: "factions", doc: authorGuideDoc("factions"), status: "experimental", needs: ["story"],
  },
  {
    id: "meanwhile-proposals", name: "Off-stage events", area: "world", audience: "author",
    oneLine: "Proposes what a character did off stage toward their plan, for you to accept.",
    what: "When the story moves on or a scene ends, the memory model suggests one short off-stage event per character, kept inside that character's plan. "
      + "Nothing lands until you accept it in Author view; an accepted event reaches only that character, at the next reply, and a swipe takes it back.",
    where: { selector: "#so-meanwhile-accept-mode", label: "Settings › World › Background helpers", surface: "settings" },
    settings: ["stagecraft.meanwhileAcceptMode"], guideTopic: "character-life", doc: authorGuideDoc("character-life"), status: "experimental",
    needs: ["story", "memory-profile"],
    isOn: (settings) => settings.stagecraft.meanwhileAcceptMode !== "off",
  },
];
