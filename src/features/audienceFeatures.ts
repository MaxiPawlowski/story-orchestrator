import type { Feature } from "./registry";
import { drawerAt } from "./where";

export const AUDIENCE_FEATURES: readonly Feature[] = [
  {
    id: "witness-record", name: "Who heard what", area: "memory", audience: "author",
    oneLine: "Each story read also notes which characters heard each message.",
    what: "Every story read writes one line per message naming the characters who heard or saw it, part by part when a message mixes an aside with open speech, "
      + "and says unknown when it cannot tell. Nothing reads this record yet: it is measured first, before recall or rumors may use it. A swipe or edit takes the "
      + "affected lines back. Adds a few lines to each story read. Not measured yet.",
    where: drawerAt("#so-feature-witness-enabled", "Features › Who heard what"),
    settings: ["memory.witness"], doc: "player/memory.md", status: "shipped", needs: ["story", "group-chat", "memory-profile"],
    isOn: (settings) => settings.memory.witness !== false,
  },
];
