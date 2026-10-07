import { StoryEngine, parseStoryV2OrThrow, type PrimitiveValue, type StoryV2 } from "@engine/index";
import { composeGame, type GameSources } from "./widgets";

const base = (): StoryV2 => ({
  format: 2, id: "proj", version: 1, title: "Projection", description: "Synthetic.", roster: [{ id: "keeper", name: "Keeper" }],
  qualities: [
    { key: "resolve", type: "int", source: "extractor", rubric: "Resolve, 0-5.", display: { public: true, label: "Resolve", as: "meter", min: 0, max: 5 } },
    { key: "secret_plan", type: "bool", source: "extractor", rubric: "The keeper's secret plan." },
    { key: "found", type: "bool", source: "extractor", rubric: "Found the map?" },
    { key: "done", type: "bool", source: "extractor", rubric: "Finished?" },
  ],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests: [{ id: "open", title: "The open road", kind: "side", steps: [], done_when: { all: [{ q: "done", op: "==", v: true }] } }],
  milestones: [{ id: "first", title: "First step", when: { all: [{ q: "resolve", op: ">=", v: 1 }] } }],
} as StoryV2);

const withHidden = (): StoryV2 => {
  const story = base();
  return {
    ...story,
    quests: [...story.quests!, {
      id: "smuggler", title: "The smuggler's map", kind: "side", steps: [{ text: "Ask the keeper", done_when: { all: [{ q: "secret_plan", op: "==", v: true }] } }],
      visible_when: { all: [{ q: "found", op: "==", v: true }] }, done_when: { all: [] }, author_note: "AUTHOR-ONLY-NOTE",
    }],
    milestones: [...story.milestones!, { id: "deep", title: "Deep secret", secret: true, when: { all: [{ q: "secret_plan", op: "==", v: true }] } }],
    widgets: [{ id: "author-board", kind: "board", title: "Author board", audience: "author", bind: { quests: true } }],
  };
};

const sources = (raw: StoryV2, values: Record<string, PrimitiveValue>): GameSources => {
  const story = parseStoryV2OrThrow(raw);
  const engine = new StoryEngine();
  engine.loadStory(story);
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(values).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  return { story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: { keeper: "Keeper" } };
};

describe("the player projection shows only what the player has reached", () => {
  const cases: Array<Record<string, PrimitiveValue>> = [{}, { resolve: 2 }, { resolve: 4, done: true }, { resolve: 0, done: false }];

  test.each(cases)("hidden quests and secret milestones leave the player view byte-identical (%o)", (values) => {
    const plain = composeGame(sources(base(), values)).player;
    const hidden = composeGame(sources(withHidden(), values)).player;
    expect(JSON.stringify(hidden)).toBe(JSON.stringify(plain));
  });

  test("no non-public quality key, author note or author panel reaches the player view", () => {
    const view = JSON.stringify(composeGame(sources(withHidden(), { resolve: 3 })).player);
    for (const leak of ["secret_plan", "found", "AUTHOR-ONLY-NOTE", "Author board", "smuggler", "Deep secret"]) expect(view).not.toContain(leak);
    expect(view).toContain("Resolve");
  });

  test("control: once found, the quest shows to the player", () => {
    const view = JSON.stringify(composeGame(sources(withHidden(), { found: true })).player);
    expect(view).toContain("The smuggler's map");
    expect(view).not.toContain("AUTHOR-ONLY-NOTE");
  });

  test("author panels are composed for the author only", () => {
    const composed = composeGame(sources(withHidden(), { found: true }));
    expect(composed.authorWidgets.map((widget) => widget.id)).toEqual(["author-board"]);
    expect(composed.player.widgets.map((widget) => widget.id)).not.toContain("author-board");
  });
});
