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
