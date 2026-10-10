import type { Feature, FeatureWhere } from "./registry";

const drawerAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Story drawer › ${label}`, surface: "drawer" });

export const GAME_FEATURES: readonly Feature[] = [
  {
    id: "journal", name: "Journal", area: "play", audience: "player",
    oneLine: "A movable panel with your quests and a log of what happened, for stories that keep quests.",
    what: "The main line lists the places you have reached and what you are doing now. Side quests show once you find them, with their steps and progress, "
      + "and a quest you leave behind stays in the list. The log names what you did, where the story moved and the public checks. A swipe takes all of it back.",
    where: drawerAt("#so-open-journal", "Journal"),
    settings: ["display.presence.journal"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.journal,
  },
  {
    id: "stat-sheet", name: "Stat sheet", area: "play", audience: "player",
    oneLine: "A movable panel with what you carry and the meters the story shows in the open.",
    what: "Only what the author made public shows: items once you have them, counts, meters and words such as \"Hurt\". Nothing hidden is ever sent to the panel.",
    where: drawerAt("#so-open-stat-sheet", "Stat sheet"),
    settings: ["display.presence.statSheet"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.statSheet,
  },
  {
    id: "story-panels", name: "Story panels", area: "play", audience: "player",
    oneLine: "Extra panels a story adds, such as a clock that fills, a board of quests, a wall of clues or a map.",
    what: "Each panel shows one thing the author chose, from what you have already seen: a clue or a place appears once you have found it. "
      + "A button on a clue or a place puts a line in the box where you type; nothing is sent until you send it. You can move each panel and close it; a story can switch them off.",
    where: drawerAt("#so-open-widgets", "Story panels"),
    settings: ["display.presence.widgets"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.widgets,
  },
  {
    id: "story-made-panels", name: "Story-made panels", area: "play", audience: "player",
    oneLine: "A panel page a story brings, run shut off from SillyTavern.",
    what: "The page sees only what its plain panel shows, cannot read your chats or settings or fetch anything, and can only put one of the story's own lines in the box where you type. "
      + "One that tries to open another page is closed. Off, you see the plain panel.",
    where: drawerAt("#so-open-widgets", "Story panels"),
    settings: ["display.presence.htmlWidgets"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.htmlWidgets,
  },
  {
    id: "quests", name: "Quests, checks and panels", area: "authoring", audience: "author",
    oneLine: "Side quests, visible stats, dice checks and milestones a story declares.",
    what: "A quest's status comes from the story's own state, never from a stored list, so a swipe or a reopened chat shows the same quests. "
      + "A check rolls a seeded die once per visit; a reward switches lore or cast once and is taken back when the reply that earned it is.",
    where: { selector: "#so-studio-modal", label: "Studio › Game", surface: "studio" },
    settings: [], guideTopic: "quests", doc: "author/topics/quests.md", status: "experimental", needs: ["story"],
  },
];
