import type { Feature } from "./registry";
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
];
