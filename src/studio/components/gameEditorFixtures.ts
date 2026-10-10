import type { StoryDraft } from "../draft";
import { sampleStory } from "../stories/fixtures";

export const gameStory = (): StoryDraft => ({
  ...sampleStory(),
  quests: [{
    id: "debt", title: "The ferryman's debt", kind: "side", giver: "guide", done_when: { all: [] },
    visible_when: { all: [{ q: "trust", op: ">=", v: 1 }] },
    steps: [{ text: "Find the ledger", done_when: { all: [{ q: "alarm", op: "==", v: false }] } }],
  }],
  milestones: [{ id: "crossing", title: "First crossing", when: { all: [{ q: "trust", op: ">=", v: 2 }] } }],
  widgets: [{ id: "alarm-clock", kind: "clock", title: "The alarm", audience: "player", bind: { quality: "trust" } }],
});

export const widgetStory = (): StoryDraft => ({
  ...sampleStory(),
  widgets: [
    {
      id: "clue-wall", kind: "clues", title: "Clue wall", audience: "player",
      clues: [
        { id: "bell", text: "Someone rang the ruin bell.", when: { q: "alarm", op: "==", v: true }, action: "I ask who rang the bell." },
        { id: "door", text: "The guide knows a side door.", when: { q: "trust", op: ">=", v: 3 } },
      ],
      links: [{ from: "bell", to: "door", label: "a way in" }],
    },
    {
      id: "ruins-map", kind: "map", title: "The ruins", audience: "player", image: "ruins.jpg",
      pins: [{ id: "gate", label: "The gate", x: 20, y: 60, checkpoint: "start" }, { id: "cache", label: "The cache", x: 70, y: 30, checkpoint: "cache" }],
    },
    { id: "case-board", kind: "html", title: "Case board", audience: "player", source: "clue-wall", template: "<p>board</p>", actions: [{ id: "ask", text: "I ask who rang the bell." }] },
  ],
});
