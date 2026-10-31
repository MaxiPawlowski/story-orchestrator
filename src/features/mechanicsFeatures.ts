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
