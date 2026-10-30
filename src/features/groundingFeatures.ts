import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { settingsAt } from "./where";

export const GROUNDING_FEATURES: readonly Feature[] = [
  {
    id: "lore-pins", name: "Lore for where you are", area: "world", audience: "author",
    oneLine: "The lore entry for the current place, and for whoever was just met, is in the next reply.",
    what: "A story can bind a lorebook entry to each place and to the people on its People page. The entry for where the party is now, and for a place or person met "
      + "in the latest exchange, joins the next replies even when no keyword names it. An entry the story keeps switched off, or one that would give away a secret, is left out.",
    where: settingsAt("#so-wi-lore-pins", "World & lore › Lore for where you are"),
    settings: ["worldInfo.lorePins"], guideTopic: "requirements", doc: authorGuideDoc("requirements"), status: "shipped", needs: ["story"],
  },
  {
    id: "history-notes", name: "Time and place notes in the history", area: "characters", audience: "author",
    oneLine: "Messages where the scene or the time changed carry a short note of the day and place.",
    what: "A trial, off until it is rated. The first message after the place or the time of day changed carries a note such as [Day 2, evening, the docks] in the prompt; "
      + "the chat itself is not changed. A place the player has not learned is left out, and a note written once stays as it was. A reply that repeats a note has it taken out.",
    where: settingsAt("#so-history-notes", "Authoring › Prompt trials"),
    settings: ["memory.historyNotes"], guideTopic: "story-time", doc: authorGuideDoc("story-time"), status: "off-by-default", needs: ["story"],
  },
  {
    id: "outward-narration", name: "Narrate only what can be seen", area: "characters", audience: "author",
    oneLine: "The narrator shows other characters' feelings through what they say and do.",
    what: "A trial, off until it is rated. A narrator that sees the cast's private aims is also asked to narrate only what the player could see or hear: "
      + "no reported thoughts, explained motives or feelings stated as fact. What the narrator is told is unchanged.",
    where: settingsAt("#so-outward-narration", "Authoring › Prompt trials"),
    settings: ["memory.outwardNarration"], guideTopic: "roster", doc: authorGuideDoc("roster"), status: "off-by-default", needs: ["story"],
  },
  {
    id: "swipe-contrast", name: "A swipe sees the reply it replaces", area: "characters", audience: "author",
    oneLine: "A new swipe is told which reply you threw away, so it writes something else.",
    what: "A trial, off until it is rated. When you swipe for a new reply in a story chat, the swiped-away reply is shown to the model once, marked as rejected, "
      + "so the new one does not repeat it. Only the visible reply is shown, never its thinking, and only for that one reply.",
    where: settingsAt("#so-swipe-contrast", "Authoring › Prompt trials"),
    settings: ["talk.swipeContrast"], doc: "player/playing.md", status: "off-by-default", needs: ["story", "group-chat"],
  },
];
