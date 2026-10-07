import type { Feature } from "./registry";

export const LIFE_FEATURES: readonly Feature[] = [
  {
    id: "character-life", name: "Character life", area: "characters", audience: "author",
    oneLine: "Feelings that move, a mood per scene, plans that go on off stage and places to be, for the characters a story declares.",
    what: "Feelings and moods are ordinary story values read from the chat, a little at a time; plans move in code at a turn, and a member who is elsewhere does not speak. "
      + "Each character sees only its own, the player never does, and a swipe takes all of it back.",
    where: { selector: "#so-studio-modal", label: "Studio › Roster", surface: "studio" },
    settings: [], guideTopic: "character-life", doc: "author/topics/character-life.md", status: "experimental", since: "2.7.0", needs: ["story"],
  },
];
