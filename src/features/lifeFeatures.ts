import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt, featureAt } from "./where";

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
    id: "story-calendar", name: "Story time", area: "characters", audience: "author",
    oneLine: "A time of day, a day count and an optional calendar, moved by the story, never by the wall clock.",
    what: "The story keeps one count of the parts of a day that have passed. The reader moves it a part at a time, a checkpoint can jump it on (the next morning, three days on) "
      + "and the author can set it; the day, the time of day, night and the calendar date follow from it. A swipe takes it back; the player sees it only on a timeline.",
    where: drawerAt("#so-character-life", "Character life"),
    settings: [], guideTopic: "story-time", doc: authorGuideDoc("story-time"), status: "experimental", needs: ["story"],
  },
  {
    id: "factions", name: "Standing with groups", area: "characters", audience: "player",
    oneLine: "How the groups in a story regard you, shown as a word such as \"Wary\" or \"Trusted\".",
    what: "A story can name groups, such as a guild or a village. What you do in the story can raise or lower how each regards you, once per event and never for doing nothing. "
      + "You see a word, never a number; a member of the group opens toward you accordingly, as far as they have heard, and a swipe takes it back.",
    where: drawerAt("#so-open-stat-sheet", "Stat sheet › Standing"),
    settings: [], guideTopic: "factions", doc: authorGuideDoc("factions"), status: "experimental", needs: ["story"],
  },
  {
    id: "relationship-labels", name: "Relationship labels", area: "characters", audience: "player",
    oneLine: "Words for how a character treats you, and secrets about them you can learn, on their People page.",
    what: "A story can say in words how a character visibly treats you or someone else, such as \"wary\" or \"rivals\", never as a number. "
      + "It can also hide a secret about a character until something in the story reveals it; once learned it stays learned, and a swipe takes it back.",
    where: drawerAt("#so-open-journal", "Journal › People"),
    settings: [], guideTopic: "relationship-labels", doc: authorGuideDoc("relationship-labels"), status: "experimental", needs: ["story"],
  },
  {
    id: "npc-commitments", name: "Promises to you", area: "characters", audience: "player",
    oneLine: "Things a character has promised you, which the character remembers and may keep, raise or break.",
    what: "A story can let a character promise you something, such as getting you past a gate. The character remembers it and can bring it up; it is kept or broken only "
      + "by what happens, never because time passed. You see \"Promised you\" on the character's People page if you heard it said, and you owe nothing back. A swipe takes it back.",
    where: drawerAt("#so-open-journal", "Journal › People"),
    settings: [], guideTopic: "commitments", doc: authorGuideDoc("commitments"), status: "experimental", needs: ["story"],
  },
  {
    id: "reactive-cues", name: "Reactive cues", area: "characters", audience: "author",
    oneLine: "Characters notice what a story says they would, deepen a topic you ask them about again, and react when a social rule is broken.",
    what: "A story can give a character remarks and reactions, topics with up to three tiers, and norms its witnesses notice. When one applies, that character alone is handed "
      + "one short cue in its private notes, which it may use in its own words; it is never a posted message, never your actions or feelings, and never a secret kept from it. "
      + "A topic goes one tier deeper only when you ask that character directly. A swipe takes it back. No model call.",
    where: featureAt("cues", "enabled", "Reactive cues"),
    settings: ["characters.cues"], guideTopic: "cues", doc: authorGuideDoc("cues"), status: "experimental", needs: ["story", "group-chat"],
  },
  {
    id: "delayed-echoes", name: "Delayed echoes", area: "characters", audience: "author",
    oneLine: "Something that happened comes back later: after a delay, if the story still fits, one character or the narrator is handed a cue about it.",
    what: "A story can say: when this transition, quest ending, milestone or check result happens, then after a few turns or day parts, tell this character (or the narrator) this. "
      + "When it is due the echo checks again that it still fits, that the character is in the scene and that it gives nothing away; then it is handed over as one private cue, "
      + "the same way reactive cues are, used at most once in a chat. If it never fits before it expires, it is dropped. A swipe or delete takes it back. No model call.",
    where: featureAt("echoes", "enabled", "Delayed echoes"),
    settings: ["characters.echoes"], guideTopic: "echoes", doc: authorGuideDoc("echoes"), status: "experimental", needs: ["story", "group-chat"],
  },
  {
    id: "meanwhile-proposals", name: "Off-stage events", area: "world", audience: "author",
    oneLine: "Adds what a character did off stage toward their plan; it applies on its own by default.",
    what: "When the story moves on or a scene ends, the memory model suggests one short off-stage event per character, kept inside that character's plan. "
      + "Each event applies on its own by default; set it to Review and each one waits for you in Author view, set it to Off and none are proposed. "
      + "An applied event reaches only that character, at the next reply, and a swipe takes it back.",
    where: featureAt("meanwhile", "acceptMode", "Off-stage events"),
    settings: ["stagecraft.meanwhileAcceptMode"], guideTopic: "character-life", doc: authorGuideDoc("character-life"), status: "experimental",
    needs: ["story", "memory-profile"],
  },
];
