import { StoryEngine, parseStoryV2OrThrow, type PrimitiveValue, type StoryV2 } from "@engine/index";
import { composeGame, type GameSources } from "./widgets";
import type { WidgetView } from "./gameTypes";

const QUALITIES = [
  { key: "found_ledger", type: "bool", source: "extractor", rubric: "Found the ledger?" },
  { key: "searched", type: "bool", source: "extractor", rubric: "Searched the dock?" },
  { key: "secret_clue", type: "bool", source: "extractor", rubric: "SECRET-QUALITY-KEY" },
  { key: "secret_place", type: "bool", source: "extractor", rubric: "Hidden place." },
];

const shownWidgets = () => [
  { id: "wall", kind: "clues", title: "Clue wall", clues: [
    { id: "ledger", text: "A torn page.", quality: "found_ledger", action: "I show the page." },
    { id: "boots", text: "Wet prints.", quality: "searched" },
  ], links: [{ from: "ledger", to: "boots", label: "same night" }] },
  { id: "river", kind: "map", title: "River", image: "river.jpg", pins: [
    { id: "landing", label: "Landing", x: 10, y: 90, checkpoint: "start" },
    { id: "dock-pin", label: "Dock", x: 50, y: 20, checkpoint: "dock" },
  ] },
];

const hiddenWidgets = () => [
  { id: "wall", kind: "clues", title: "Clue wall", clues: [
    { id: "ledger", text: "A torn page.", quality: "found_ledger", action: "I show the page." },
    { id: "secret-id", text: "SECRET-CLUE-TEXT", quality: "secret_clue", action: "SECRET-ACTION" },
    { id: "boots", text: "Wet prints.", quality: "searched" },
  ], links: [{ from: "ledger", to: "boots", label: "same night" }, { from: "boots", to: "secret-id", label: "SECRET-LINK" }] },
  { id: "river", kind: "map", title: "River", image: "river.jpg", pins: [
    { id: "landing", label: "Landing", x: 10, y: 90, checkpoint: "start" },
    { id: "vault", label: "SECRET-PIN", x: 70, y: 70, when: { q: "secret_place", op: "==", v: true } },
    { id: "dock-pin", label: "Dock", x: 50, y: 20, checkpoint: "dock" },
    { id: "far", label: "SECRET-FAR", x: 5, y: 5, checkpoint: "far" },
  ] },
];

const raw = (widgets: unknown[]): StoryV2 => ({
  format: 2, id: "kinds", title: "Kinds", description: "Synthetic.", roster: [],
  qualities: QUALITIES,
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." },
    { id: "dock", name: "Dock", type: "anchor", objective: "Dock." },
    { id: "far", name: "Far", type: "anchor", objective: "Far." },
  ],
  transitions: [
    { from: "start", to: "dock", priority: 0, gate: { q: "searched", op: "==", v: true } },
    { from: "dock", to: "far", priority: 0, gate: { q: "secret_place", op: "==", v: true } },
  ],
  widgets,
} as unknown as StoryV2);

const play = (story: StoryV2, turns: Array<Record<string, PrimitiveValue>>) => {
  const normalized = parseStoryV2OrThrow(story);
  const engine = new StoryEngine();
  engine.loadStory(normalized);
  turns.forEach((values, index) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(values).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: index * 2 + 2, chatLength: index * 2 + 3 });
  });
  return { normalized, engine };
};

const sources = (story: StoryV2, turns: Array<Record<string, PrimitiveValue>>): GameSources => {
  const { normalized, engine } = play(story, turns);
  return { story: normalized, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: {} };
};

const widget = (view: { widgets: WidgetView[] }, id: string) => view.widgets.find((entry) => entry.id === id);

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

describe("clue and map projections (v2.8 23)", () => {
  test("a clue shows once found; a link once both ends show; no id, key or count reaches the view", () => {
    const view = composeGame(sources(raw(hiddenWidgets()), [{ found_ledger: true }])).player;
    const wall = widget(view, "wall");
    expect(wall?.body).toEqual({ kind: "clues", clues: [{ text: "A torn page.", fresh: true, action: "I show the page." }], links: [] });
    const json = JSON.stringify(view);
    for (const leak of ["secret_clue", "secret-id", "SECRET", "ledger\"", "found_ledger"]) expect(json).not.toContain(leak);
  });

  test("a wall with nothing found is not drawn, a map always is", () => {
    const view = composeGame(sources(raw(shownWidgets()), [{}])).player;
    expect(widget(view, "wall")).toBeUndefined();
    expect(widget(view, "river")?.body).toMatchObject({ kind: "map", image: "river.jpg", pins: [{ label: "Landing", here: true }] });
  });

  test("a reached checkpoint pin stays; the active one is marked here; the newly shown one is fresh", () => {
    const view = composeGame(sources(raw(shownWidgets()), [{}, { searched: true }])).player;
    const river = widget(view, "river");
    expect(river?.body.kind === "map" && river.body.pins.map((pin) => [pin.label, pin.here, pin.fresh])).toEqual([["Landing", false, false], ["Dock", true, true]]);
    const wall = widget(view, "wall");
    expect(wall?.body.kind === "clues" && wall.body.clues.map((clue) => [clue.text, clue.fresh])).toEqual([["Wet prints.", true]]);
  });

  test.each([1, 2, 3, 4])("hidden clues and pins leave the player view byte-identical (seed %i)", (seed) => {
    const random = seeded(seed);
    for (let run = 0; run < 25; run += 1) {
      const turns = Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({ found_ledger: random() < 0.5, searched: random() < 0.4 }));
      const plain = composeGame(sources(raw(shownWidgets()), turns)).player;
      const hidden = composeGame(sources(raw(hiddenWidgets()), turns)).player;
      expect(JSON.stringify(hidden)).toBe(JSON.stringify(plain));
    }
  });

  test("control: once the hidden items hold, they show", () => {
    const json = JSON.stringify(composeGame(sources(raw(hiddenWidgets()), [{ searched: true }, { secret_clue: true, secret_place: true }])).player);
    for (const shown of ["SECRET-CLUE-TEXT", "SECRET-PIN", "SECRET-LINK", "SECRET-FAR"]) expect(json).toContain(shown);
  });

  test.each([1, 2, 3, 4])("rollback ≡ replay: the panels after a swipe show the restored state (seed %i)", (seed) => {
    const random = seeded(seed + 10);
    for (let run = 0; run < 25; run += 1) {
      const turns = Array.from({ length: 2 + Math.floor(random() * 4) }, () => ({ found_ledger: random() < 0.5, searched: random() < 0.5, secret_clue: random() < 0.3 }));
      const cut = 1 + Math.floor(random() * (turns.length - 1));
      const { normalized, engine } = play(raw(hiddenWidgets()), turns);
      engine.rollbackTo(cut);
      const rolled = composeGame({ story: normalized, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: {} }).player;
      const replayed = composeGame(sources(raw(hiddenWidgets()), turns.slice(0, cut))).player;
      expect(JSON.stringify(rolled.widgets)).toBe(JSON.stringify(replayed.widgets));
    }
  });

  test("negative control: without the rollback the later turns still show", () => {
    const turns = [{ found_ledger: false }, { found_ledger: true }];
    const later = composeGame(sources(raw(hiddenWidgets()), turns)).player;
    const replayed = composeGame(sources(raw(hiddenWidgets()), turns.slice(0, 1))).player;
    expect(JSON.stringify(later.widgets)).not.toBe(JSON.stringify(replayed.widgets));
  });
});

describe("HTML panels project their source widget's view", () => {
  const withHtml = (source = "wall") => raw([...shownWidgets(), {
    id: "page", kind: "html", title: "Case board", source, template: "<p>board</p>", actions: [{ id: "ask", text: "I ask about it." }],
  }]);

  test("the HTML view carries the source view, and the source is not listed again", () => {
    const view = composeGame(sources(withHtml(), [{ found_ledger: true }])).player;
    expect(view.widgets.map((entry) => entry.id)).toEqual(["river", "page"]);
    const page = widget(view, "page");
    expect(page?.body.kind === "html" && page.body.source.id).toBe("wall");
    expect(page?.body.kind === "html" && page.body.actions).toEqual([{ id: "ask", text: "I ask about it." }]);
  });

  test("an HTML panel whose source has nothing to show is not shown either", () => {
    const view = composeGame(sources(withHtml(), [{}])).player;
    expect(widget(view, "page")).toBeUndefined();
  });
});
