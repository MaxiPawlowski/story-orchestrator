import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";
import { PREVIEW_HIDDEN, PREVIEW_INVALID, previewCheckpoints, previewKeys, previewWidget } from "./widgetPreview";

const story = (widgets: unknown[]): StoryV2 => ({
  format: 2, id: "d", title: "D", description: "Synthetic.", roster: [],
  qualities: [
    { key: "searched", type: "bool", source: "extractor", rubric: "Searched?" },
    { key: "orphan", type: "bool", source: "extractor", rubric: "Read by nothing but a clue." },
    { key: "mood", type: "enum", source: "extractor", rubric: "Read by nothing but a roster.", values: ["calm", "tense"], player_labels: { calm: "Calm", tense: "Tense" },
      display: { public: true, label: "Mood", as: "word" } },
    { key: "count", type: "int", source: "extractor", rubric: "Count.", display: { public: true, label: "Count", as: "meter", min: 0, max: 4 } },
  ],
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." },
    { id: "dock", name: "Dock", type: "anchor", objective: "Dock." },
    { id: "island", name: "Island", type: "anchor", objective: "Nowhere leads here." },
  ],
  transitions: [{ from: "start", to: "dock", priority: 0, gate: { q: "searched", op: "==", v: true } }, { from: "dock", to: "start", priority: 0, gate: { q: "count", op: ">=", v: 4 } }],
  widgets,
} as unknown as StoryV2);

const wall = { id: "wall", kind: "clues", title: "Wall", audience: "player", clues: [
  { id: "a", text: "Prints.", when: { q: "searched", op: "==", v: true }, action: "I follow the prints." },
  { id: "b", text: "Orphan.", when: { q: "orphan", op: "==", v: true } },
] };
const river = { id: "river", kind: "map", title: "River", audience: "player", image: "river.jpg", pins: [
  { id: "start", label: "Start", x: 1, y: 1, checkpoint: "start" }, { id: "island", label: "Island", x: 2, y: 2, checkpoint: "island" },
] };
const page = { id: "page", kind: "html", title: "Board", audience: "player", source: "wall", template: "<p>x</p>", actions: [{ id: "go", text: "I go." }] };

const codes = (widgets: unknown[], context = {}) => runDiagnostics(story(widgets), context).filter((entry) => ["widget-item-never-read", "map-pin-unreachable", "map-image-missing", "html-widget-declared"].includes(entry.code));

describe("widget diagnostics (v2.8 23)", () => {
  test("every new code states its consequence", () => {
    for (const code of ["widget-item-never-read", "map-pin-unreachable", "map-image-missing", "html-widget-declared"] as const) expect(DIAGNOSTIC_CONSEQUENCES[code]).toMatch(/\w/);
  });

  test("a clue on a quality nothing reads, and a pin on an unreachable checkpoint, are named", () => {
    const found = codes([wall, river]);
    expect(found.map((entry) => [entry.code, entry.path])).toEqual([["widget-item-never-read", "widgets.0.clues.1"], ["map-pin-unreachable", "widgets.1.pins.1.checkpoint"]]);
  });

  test("a map picture the install lacks is named only when the install lists its backgrounds", () => {
    expect(codes([river], { backgroundNames: () => ["other.png"] }).map((entry) => entry.code)).toContain("map-image-missing");
    expect(codes([river], { backgroundNames: () => ["River.png"] }).map((entry) => entry.code)).not.toContain("map-image-missing");
    expect(codes([river]).map((entry) => entry.code)).not.toContain("map-image-missing");
  });

  test("every HTML panel is listed for review, with what it may put in the box", () => {
    const listed = codes([wall, page]).filter((entry) => entry.code === "html-widget-declared");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ severity: "info", path: "widgets.1.template" });
    expect(listed[0].message).toContain("go");
  });
});

describe("the Studio's widget preview over a sample state", () => {
  test("names the keys and checkpoints a sample can set", () => {
    const draft = story([wall, river]);
    expect(previewKeys(draft.widgets![0], draft)).toEqual(["searched", "orphan"]);
    expect(previewCheckpoints(draft.widgets![1])).toEqual(["start", "island"]);
  });

  test("shows what the player would see for the sample, and only that", () => {
    const draft = story([wall, river]);
    expect(previewWidget(draft, "wall", { values: {}, reached: [] })).toEqual({ status: "hidden", reason: PREVIEW_HIDDEN });
    const shown = previewWidget(draft, "wall", { values: { searched: true }, reached: [] });
    expect(shown.status === "shown" && shown.lines).toEqual(["Clue: Prints. [button: I follow the prints.]"]);
    const map = previewWidget(draft, "river", { values: {}, reached: ["island"] });
    expect(map.status === "shown" && map.lines).toEqual(["Image: river.jpg", "Pin: Start at 1%, 1%", "Pin: Island at 2%, 2% (you are here)"]);
  });

  test("an HTML panel previews its template size, actions and plain version", () => {
    const shown = previewWidget(story([wall, page]), "page", { values: { searched: true }, reached: [] });
    expect(shown.status === "shown" && shown.lines).toEqual([
      "HTML panel: 8 characters, sandboxed, shown the view of 'wall'", "Action go: I go.", "Plain version: Clue: Prints. [button: I follow the prints.]",
    ]);
  });

  test("an invalid story says so instead of guessing", () => {
    expect(previewWidget(story([{ id: "bad", kind: "clues", title: "Bad" }]), "bad", { values: {}, reached: [] })).toEqual({ status: "invalid", reason: PREVIEW_INVALID });
  });

  test("a roster row on a quality nothing reads is named, and the preview lists rows, stops and buttons", () => {
    const party = { id: "party", kind: "roster", title: "Party", rows: [{ id: "x", label: "Someone", quality: "mood" }], actions: [{ id: "n", text: "My notes", open: "memory" }] };
    const road = { id: "road", kind: "timeline", title: "Road", dates: { dock: "Day 2" } };
    expect(codes([party]).map((entry) => [entry.code, entry.path])).toEqual([["widget-item-never-read", "widgets.0.rows.0"]]);
    expect(previewKeys(party as never, story([party]))).toEqual(["mood"]);
    expect(previewCheckpoints(road as never)).toEqual(["dock"]);
    const shown = previewWidget(story([party, road]), "party", { values: { mood: "tense" }, reached: [] });
    expect(shown.status === "shown" && shown.lines).toEqual(["Someone: Tense", "Button: My notes [opens the memory tab]"]);
    const stops = previewWidget(story([party, road]), "road", { values: {}, reached: ["dock"] });
    expect(stops).toEqual({ status: "hidden", reason: PREVIEW_HIDDEN });
  });
});
