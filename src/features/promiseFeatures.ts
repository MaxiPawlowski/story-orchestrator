import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt } from "./where";

export const PROMISE_FEATURES: readonly Feature[] = [
  {
    id: "promises-remembered", name: "Promises remembered", area: "characters", audience: "player",
    oneLine: "A promise you make to a character is remembered in your own words.",
    what: "When you promise a character something, the story keeps your exact words. Only that character is reminded, and only when the scene touches it; "
      + "it never decides for you whether you keep it. Your open promises show in the Overview as your own quoted words. A swipe or edit takes a promise back.",
    where: drawerAt("#so-player-promises", "Overview › Your promises"),
    settings: ["memory.promises"], guideTopic: "quests", doc: authorGuideDoc("quests"), status: "shipped", needs: ["story", "group-chat", "memory-profile"],
    isOn: (settings) => settings.memory.promises !== false,
  },
];
