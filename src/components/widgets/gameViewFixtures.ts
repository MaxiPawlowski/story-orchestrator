import type { GameAuthorView, GameView, WidgetView } from "@runtime/gameTypes";

const track: WidgetView = {
  id: "journal-track", title: "Journal", audience: "player", synthesized: true,
  body: {
    kind: "track",
    main: { done: ["Approach"], current: "Infiltrate", objective: "Get inside unseen." },
    quests: [
      {
        title: "The ferryman's debt", status: "active", statusLabel: "Active", closed: false, giver: "The Ferryman", reward: "Free passage",
        steps: [{ text: "Find the ledger", status: "done" }, { text: "Bring three coins", status: "open", progress: { value: 1, of: 3 } }],
      },
      { title: "A lantern in the fog", status: "offered", statusLabel: "Offered", closed: false, giver: null, reward: null, steps: [] },
      { title: "The drowned bell", status: "done", statusLabel: "Done", closed: true, giver: null, reward: null, steps: [] },
    ],
  },
};

const log: WidgetView = {
  id: "journal-log", title: "Log", audience: "player", synthesized: true,
  body: {
    kind: "log",
    rows: [
      { at: { boundary: 3, messageId: 6 }, kind: "quest", text: "Quest started: The ferryman's debt" },
      { at: { boundary: 4, messageId: 8 }, kind: "check", text: "Climb", outcome: "success" },
    ],
  },
};

const sheet: WidgetView = {
  id: "stat-sheet", title: "Stat sheet", audience: "player", synthesized: true,
  body: {
    kind: "meters",
    groups: [
      { label: "Status", items: [{ label: "Resolve", as: "meter", text: "3 / 5", value: 3, min: 0, max: 5, trend: "up" }, { label: "Mood", as: "word", text: "Wary" }] },
      { label: "Inventory", items: [{ label: "Coins", as: "count", text: "1" }, { label: "Lantern", as: "item", text: "Lantern" }] },
    ],
  },
};

export const clockWidget: WidgetView = {
  id: "alarm-clock", title: "The alarm", audience: "player", synthesized: false, accent: "red", icon: "hourglass",
  body: { kind: "clock", label: "Alarm", filled: 4, segments: 6, full: false },
};

export const boardWidget: WidgetView = {
  id: "quest-board", title: "Quest board", audience: "player", synthesized: false, accent: "gold", icon: "scroll",
  body: { kind: "board", lanes: [{ label: "Offered", cards: ["A lantern in the fog"] }, { label: "Active", cards: ["The ferryman's debt"] }, { label: "Done", cards: ["The drowned bell"] }] },
};

export const cluesWidget: WidgetView = {
  id: "clue-wall", title: "Clue wall", audience: "player", synthesized: false, accent: "violet", icon: "key",
  body: {
    kind: "clues",
    clues: [
      { text: "A torn ledger page, signed with a single initial.", fresh: false, action: "I show the ledger page to the ferryman." },
      { text: "Wet boot prints leading to the boathouse.", fresh: true },
      { text: "The ferryman lied about the night of the storm.", fresh: false },
    ],
    links: [{ from: 0, to: 2, label: "same night" }],
  },
};

export const mapWidget: WidgetView = {
  id: "river-map", title: "The river", audience: "player", synthesized: false, accent: "blue", icon: "compass",
  body: {
    kind: "map", image: "river-map.jpg",
    pins: [
      { label: "The landing", x: 18, y: 70, here: false, fresh: false },
      { label: "The boathouse", x: 62, y: 40, here: true, fresh: true, action: "I head for the boathouse." },
    ],
  },
};

export const sampleGame = (): GameView => ({
  quests: track.body.kind === "track" ? track.body.quests : [],
  mainLine: { done: ["Approach"], current: "Infiltrate", objective: "Get inside unseen." },
  sheet: sheet.body.kind === "meters" ? sheet.body.groups : [],
  milestones: [{ title: "First crossing", earned: true }, { title: "Keeper of the bell", earned: false }],
  log: log.body.kind === "log" ? log.body.rows : [],
  journal: [track, log],
  statSheet: sheet,
  widgets: [clockWidget, boardWidget, cluesWidget, mapWidget],
});

export const emptyGame = (): GameView => ({
  quests: [], mainLine: { done: [], current: null, objective: null }, sheet: [], milestones: [], log: [], journal: [], statSheet: null, widgets: [],
});

export const sampleAuthor = (): GameAuthorView => ({
  quests: [{ id: "smuggler", title: "The smuggler's map", status: "hidden" }],
  scopeOverflow: ["quest_smuggler_found"],
  widgets: [],
});
