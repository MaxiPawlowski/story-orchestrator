import type { Feature, FeatureWhere } from "./registry";

const settingsAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Settings › ${label}`, surface: "settings" });

export const START_FEATURES: readonly Feature[] = [
  {
    id: "story-briefing", name: "Story briefing", area: "play", audience: "player",
    oneLine: "A short \"Before you start\" page the first time a story starts in a chat.",
    what: "The first time a story starts in a group chat, a page says who you are, where you are, who is with you and how to play, in the author's words. "
      + "The opening scene still posts behind it. Each chat shows it once; Restart shows it again. Re-open it from Story briefing in the drawer or with /story intro. "
      + "The first one also explains the status strip, the notes under messages and the drawer.",
    where: settingsAt("#so-briefing-enabled", "Playing › Show the story briefing"),
    settings: ["display.briefing", "help.onboardingSeen"], guideTopic: "briefing", doc: "player/playing.md", status: "shipped", needs: ["group-chat", "story"],
    isOn: (settings) => settings.display.briefing,
  },
  {
    id: "player-setup", name: "Who you are in this story", area: "play", audience: "player",
    oneLine: "A story that says who you play asks you once, at the start: keep your persona, choose another, or create one.",
    what: "The chat keeps the persona you choose for the whole story, and the characters are told your role. A mid-story switch offers \"Switch back\". /story who shows it.",
    where: settingsAt("#so-player-setup-enabled", "Playing › Ask who you are when a story starts"),
    settings: ["display.playerSetup"], guideTopic: "player", doc: "player/playing.md", status: "shipped", needs: ["group-chat", "story"],
    isOn: (settings) => settings.display.playerSetup,
  },
];
