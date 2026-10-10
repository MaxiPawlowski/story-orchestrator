import type { Feature } from "./registry";

export const LIFE_FEATURES: readonly Feature[] = [
  {
    id: "character-life", name: "Character life", area: "characters", audience: "author",
    oneLine: "Feelings that move, a mood per scene, plans that go on off stage and places to be, for the characters a story declares.",
    what: "Feelings and moods are ordinary story values read from the chat, a little at a time; plans move in code at a turn, and a member who is elsewhere does not speak. "
      + "Each character sees only its own, the player never does, and a swipe takes all of it back.",
    where: { selector: "#so-studio-modal", label: "Studio › Roster", surface: "studio" },
    settings: [], guideTopic: "character-life", doc: "author/topics/character-life.md", status: "experimental", needs: ["story"],
  },
  {
    id: "meanwhile-proposals", name: "Off-stage events", area: "world", audience: "author",
    oneLine: "Proposes what a character did off stage toward their plan, for you to accept.",
    what: "When the story moves on or a scene ends, the memory model suggests one short off-stage event per character, kept inside that character's plan. "
      + "Nothing lands until you accept it in Author view; an accepted event reaches only that character, at the next reply, and a swipe takes it back.",
    where: { selector: "#so-meanwhile-accept-mode", label: "Settings › World › Background helpers", surface: "settings" },
    settings: ["stagecraft.meanwhileAcceptMode"], guideTopic: "character-life", doc: "author/topics/character-life.md", status: "experimental",
    needs: ["story", "memory-profile"],
    isOn: (settings) => settings.stagecraft.meanwhileAcceptMode !== "off",
  },
];
