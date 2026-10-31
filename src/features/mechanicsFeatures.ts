import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { settingsAt } from "./where";

export const MECHANICS_FEATURES: readonly Feature[] = [
  {
    id: "seeded-lore-chance", name: "Same lore on a swipe", area: "world", audience: "author",
    oneLine: "A story lorebook entry with a trigger chance gives the same answer for every swipe and replay of one turn.",
    what: "SillyTavern rolls an entry's trigger chance afresh on every generation, so a swipe could get different lore than the reply it replaces. For the "
      + "lorebooks of the story this chat plays, the extension decides that chance once per turn from a seed, on the scan copy only; the lorebook file is not "
      + "changed. Sticky entries keep SillyTavern's own roll. Inclusion groups that pick at random are named in Repair. No model call.",
    where: settingsAt("#so-wi-seeded-chance", "World & lore › Same lore on a swipe"),
    settings: ["worldInfo.seededChance"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "cross-voice-trim", name: "Cut lines written for someone else", area: "characters", audience: "player",
    oneLine: "A reply that goes on to write another character's lines, or yours, is cut where those lines begin.",
    what: "Characters in a group sometimes keep writing after their own part, adding a line headed with another character's name or yours. "
      + "Right after the reply arrives, before the story reads it, the reply is cut at the first such line. A reply that would be left nearly empty "
      + "is kept as written and noted in the story log. Thinking is never changed. No model call.",
    where: settingsAt("#so-cross-voice-trim", "Speaker direction › Cut lines written for someone else"),
    settings: ["talk.crossVoiceTrim"], doc: "setup/settings-reference.md", status: "shipped", needs: ["group-chat", "story"],
  },
  {
    id: "dry-names", name: "Protect names from the repetition penalty", area: "characters", audience: "player",
    oneLine: "The DRY repetition penalty no longer bends the cast's names into misspellings.",
    what: "DRY penalises repeating a stretch of text it has seen before, and a name the story uses often can come out misspelled. For each reply in "
      + "the story's chat, the cast's names, their given names and aliases and your name are added to the request's own DRY sequence breakers. "
      + "Only when the request already uses DRY (Text Completion); your preset is not changed.",
    where: settingsAt("#so-dry-names", "Speaker direction › Protect names from the repetition penalty"),
    settings: ["talk.dryNames"], doc: "setup/settings-reference.md", status: "shipped", needs: ["group-chat", "story"],
  },
  {
    id: "path-arc", name: "Pace by the road ahead", area: "authoring", audience: "author",
    oneLine: "The dramatic shape follows the turning points left on the way to an ending, and eases off after a climax.",
    what: "Where a beat has no tension target of its own, the story's dramatic shape is read at how far along the road the chat is: the turning points already "
      + "passed against those left on the shortest way to an ending, plus how long the current scene has run against its target length. It never goes back. "
      + "After the tension stayed critical for two readings and then fell, the pacing note does not push for more for three replies, unless the beat is "
      + "written as the peak. No model call. Not rated yet.",
    where: settingsAt("#so-authoring-path-arc", "Authoring › Prompt trials"),
    settings: ["pacing.pathArc"], guideTopic: "tension", doc: authorGuideDoc("tension"), status: "shipped", needs: ["story"],
  },
];
