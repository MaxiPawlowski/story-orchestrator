import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
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
  {
    id: "rumors", name: "Rumors and gossip", area: "characters", audience: "author",
    oneLine: "News a story declares travels between characters along the channels it authors, and may change on the way.",
    what: "A story can declare rumors and who passes news to whom. After a delay a character hears another's version as hearsay: the character is told who said it and "
      + "whether they believe it, never whether it is true. You meet a rumor only when a character repeats it. A rumor never carries a secret kept from someone, "
      + "except to the one person a story's leak names. A swipe or edit takes a landed rumor back to pending.",
    where: drawerAt("#so-rumors", "Memory › Rumors"),
    settings: ["memory.rumors"], guideTopic: "rumors", doc: authorGuideDoc("rumors"), status: "shipped", needs: ["story", "group-chat"],
    isOn: (settings) => settings.memory.rumors !== false,
  },
];
