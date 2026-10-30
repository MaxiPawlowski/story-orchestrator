import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt } from "./where";

export const AUDIENCE_FEATURES: readonly Feature[] = [
  {
    id: "witness-record", name: "Who heard what", area: "memory", audience: "author",
    oneLine: "After each story read, notes in code which characters heard each message.",
    what: "After every story read, the extension works out which characters heard each message of that read: the speaker, the group's enabled members seen on stage "
      + "(speaking or named), and for a whispered or aside part only the speaker and the listener it names. A narrator who sees everything counts for its own lines only. "
      + "Nothing reads this record yet: it is measured first, before recall or rumors may use it. A swipe or edit takes the affected notes back. Adds nothing to the "
      + "story read's prompt. Measured offline, below its floor.",
    where: drawerAt("#so-feature-witness-enabled", "Who heard what"),
    settings: ["memory.witness"], doc: "player/memory.md", status: "shipped", needs: ["story", "group-chat", "memory-profile"],
  },
  {
    id: "rumors", name: "Rumors and gossip", area: "characters", audience: "author",
    oneLine: "News a story declares travels between characters along the channels it authors, and may change on the way.",
    what: "A story can declare rumors and who passes news to whom. After a delay a character hears another's version as hearsay: the character is told who said it and "
      + "whether they believe it, never whether it is true. You meet a rumor only when a character repeats it. A rumor never carries a secret kept from someone, "
      + "except to the one person a story's leak names. A swipe or edit takes a landed rumor back to pending.",
    where: drawerAt("#so-rumors", "Memory › Rumors"),
    settings: ["memory.rumors"], guideTopic: "rumors", doc: authorGuideDoc("rumors"), status: "shipped", needs: ["story", "group-chat"],
  },
];
