import type { Feature, FeatureWhere } from "./registry";

const settingsAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Settings › ${label}`, surface: "settings" });
const drawerAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Story drawer › ${label}`, surface: "drawer" });

export const PRESENCE_FEATURES: readonly Feature[] = [
  {
    id: "story-badges", name: "Story marks in the lists", area: "play", audience: "player",
    oneLine: "Groups and chats that play a story carry a small icon in SillyTavern's lists.",
    what: "The group list, the welcome screen's recent chats and a group's past chats mark every chat that plays a story. A saga, a story its author marks as one, "
      + "has its own icon. The marks come from a list of the chats you played, which fills in by itself as you open chats.",
    where: settingsAt("#so-presence-list-badges", "Display › Mark story groups in the lists"),
    settings: ["display.presence.listBadges"], doc: "player/playing.md", status: "shipped", since: "2.7.0", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.listBadges,
  },
  {
    id: "story-card", name: "Story card", area: "play", audience: "player",
    oneLine: "Hover a group's story icon to see the story, its chapter and when you last played.",
    what: "The card shows only names you have already reached. A story can switch its card off; switching it off here hides it for every story.",
    where: settingsAt("#so-presence-group-card", "Display › Story card on hover"),
    settings: ["display.presence.groupCard"], doc: "player/playing.md", status: "shipped", since: "2.7.0", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.groupCard,
  },
  {
    id: "continue-list", name: "Your stories", area: "play", audience: "player",
    oneLine: "Under Continue: every chat that plays a story, newest first, one click to open it.",
    what: "Each row names the story, the chapter and place you reached and when you last played. A chat keeps its row while it still plays the story, even after the story leaves your library.",
    where: settingsAt("#so-continue-list", "Continue › Your stories"),
    settings: ["display.presence.continueList"], doc: "player/playing.md", status: "shipped", since: "2.7.0", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.continueList,
  },
  {
    id: "chapter-cards", name: "Chapter title cards", area: "play", audience: "player",
    oneLine: "A full-width card under the message where a new chapter opens.",
    what: "When the story enters a new chapter, a title card appears under that message with the chapter's name. Swiping that reply away takes the card with it.",
    where: settingsAt("#so-presence-chapter-card", "Display › Chapter title cards"),
    settings: ["display.presence.chapterCard"], doc: "player/drawer-and-hud.md", status: "shipped", since: "2.7.0", needs: ["story"],
    isOn: (settings) => settings.display.presence.chapterCard,
  },
  {
    id: "story-wand", name: "Story in the wand menu", area: "play", audience: "player",
    oneLine: "Story recap, the story briefing, flag this moment and the story drawer, from the extensions wand.",
    what: "While a story plays, the wand beside where you type lists a recap of the story so far, a flag for this moment and a shortcut to the story drawer.",
    where: settingsAt("#so-presence-wand", "Display › Story entries in the wand menu"),
    settings: ["display.presence.wand"], doc: "player/drawer-and-hud.md", status: "shipped", since: "2.7.0", needs: ["story"],
    isOn: (settings) => settings.display.presence.wand,
  },
  {
    id: "roll-chips", name: "Roll chips", area: "play", audience: "author",
    oneLine: "Author view shows every dice roll and background draw under its message.",
    what: "Rolled qualities, chance replies and speaker picks each show the die, the face drawn and, for a pass or fail roll, the result. "
      + "They are rebuilt from the chat, so a swipe or a reopened chat shows the same rolls.",
    where: settingsAt("#so-presence-roll-chips", "Display › Roll chips in Author view"),
    settings: ["display.presence.rollChips"], doc: "player/drawer-and-hud.md", status: "shipped", since: "2.7.0", needs: ["story", "author-view"],
    isOn: (settings) => settings.display.presence.rollChips,
  },
  {
    id: "activity-panel", name: "Activity panel", area: "play", audience: "author",
    oneLine: "A movable panel listing what the machine did behind each recent message.",
    what: "Story moves, memory notes, lore, speaker picks, model calls and rolls in one list, newest first, each linked to its message. Drag it anywhere; it remembers where you left it.",
    where: drawerAt("#so-open-activity", "Activity"),
    settings: [], doc: "player/drawer-and-hud.md", status: "shipped", since: "2.7.0", needs: ["story", "author-view"],
  },
];
