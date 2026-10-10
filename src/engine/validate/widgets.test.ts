import { isValidationErrorList, parseStoryV2, type StoryV2, type StoryWidget } from "@engine/index";

const base = (widgets: unknown[]): StoryV2 => ({
  format: 2, id: "w", title: "Widgets", description: "Synthetic.", roster: [{ id: "keeper", name: "Keeper" }],
  qualities: [
    { key: "found_ledger", type: "bool", source: "extractor", rubric: "Found the ledger?" },
    { key: "searched", type: "bool", source: "extractor", rubric: "Searched the dock?" },
    { key: "count", type: "int", source: "extractor", rubric: "A count.", display: { public: true, label: "Count", as: "meter", min: 0, max: 5 } },
    { key: "mood", type: "enum", values: ["calm", "tense"], source: "extractor", rubric: "Mood." },
  ],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }, { id: "dock", name: "Dock", type: "anchor", objective: "Dock." }],
  transitions: [{ from: "start", to: "dock", priority: 0, gate: { q: "searched", op: "==", v: true } }],
  widgets,
} as unknown as StoryV2);

const clues = (extra: Record<string, unknown> = {}) => ({
  id: "wall", kind: "clues", title: "Clue wall",
  clues: [{ id: "ledger", text: "A torn page.", quality: "found_ledger", action: "I show the page." }, { id: "boots", text: "Wet prints.", when: { q: "searched", op: "==", v: true } }],
  links: [{ from: "ledger", to: "boots", label: "same night" }],
  ...extra,
});

const map = (extra: Record<string, unknown> = {}) => ({
  id: "river", kind: "map", title: "River", image: "river-map.jpg",
  pins: [{ id: "landing", label: "Landing", x: 10, y: 90, checkpoint: "start" }, { id: "dock", label: "Dock", x: 55.5, y: 20, when: { q: "searched", op: "==", v: true }, action: "I go to the dock." }],
  ...extra,
});

const html = (extra: Record<string, unknown> = {}) => ({
  id: "page", kind: "html", title: "Case board", source: "wall", template: "<div id=b></div>", actions: [{ id: "ask", text: "I ask about the page." }], ...extra,
});

const widgetsOf = (widgets: unknown[]): StoryWidget[] => {
  const parsed = parseStoryV2(base(widgets));
  if (isValidationErrorList(parsed)) throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed.widgets ?? [];
};

const errorsOf = (widgets: unknown[]): string[] => {
  const parsed = parseStoryV2(base(widgets));
  return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

describe("clue, map and HTML widgets (v2.8 23)", () => {
  test("a clue's bool quality becomes a found gate; links, pins and actions are kept", () => {
    const [wall, river, page] = widgetsOf([clues(), map(), html()]);
    expect(wall.clues?.[0]).toEqual({ id: "ledger", text: "A torn page.", when: { q: "found_ledger", op: "==", v: true }, action: "I show the page." });
    expect(wall.links).toEqual([{ from: "ledger", to: "boots", label: "same night" }]);
    expect(river.image).toBe("river-map.jpg");
    expect(river.pins?.map((pin) => pin.checkpoint ?? "when")).toEqual(["start", "when"]);
    expect(page).toMatchObject({ kind: "html", source: "wall", actions: [{ id: "ask", text: "I ask about the page." }] });
  });

  test.each([
    ["a link to an unknown clue", [clues({ links: [{ from: "ledger", to: "ghost" }] })], "'ghost' is not a clue of this widget"],
    ["a clue with both quality and when", [clues({ clues: [{ id: "a", text: "A", quality: "found_ledger", when: { q: "searched", op: "==", v: true } }] })], "exactly one of quality or when"],
    ["a clue on a quality that is not a bool", [clues({ clues: [{ id: "a", text: "A", quality: "mood" }], links: undefined })], "is not a bool"],
    ["a clue with an undeclared quality", [clues({ clues: [{ id: "a", text: "A", quality: "nope" }], links: undefined })], "unknown quality 'nope'"],
    ["a duplicate clue id", [clues({ clues: [{ id: "a", text: "A", quality: "found_ledger" }, { id: "a", text: "B", quality: "searched" }], links: undefined })], "duplicate clue 'a'"],
    ["a link twice", [clues({ links: [{ from: "ledger", to: "boots" }, { from: "boots", to: "ledger" }] })], "linked twice"],
    ["a clues widget without clues", [{ id: "wall", kind: "clues", title: "Wall" }], "clues are a non-empty list"],
    ["a map image that is a link", [map({ image: "https://example.com/x.png" })], "never a path or a link"],
    ["a map image that is a path", [map({ image: "../secrets/x.png" })], "never a path or a link"],
    ["a pin outside the picture", [map({ pins: [{ id: "p", label: "P", x: 120, y: 5, checkpoint: "start" }] })], "x is a percentage"],
    ["a pin on an unknown checkpoint", [map({ pins: [{ id: "p", label: "P", x: 1, y: 5, checkpoint: "nowhere" }] })], "unknown checkpoint 'nowhere'"],
    ["a pin with neither checkpoint nor when", [map({ pins: [{ id: "p", label: "P", x: 1, y: 5 }] })], "exactly one of checkpoint or when"],
    ["clues on a map", [map({ clues: [] })], "a map widget has no clues"],
    ["pins on a meters widget", [{ id: "m", kind: "meters", title: "M", bind: "quality:count", pins: [] }], "a meters widget has no pins"],
    ["an action that is too long", [clues({ clues: [{ id: "a", text: "A", quality: "found_ledger", action: "x".repeat(201) }], links: undefined })], "an action is the player's own line"],
    ["an HTML panel without a source widget", [html({ source: "missing" })], "'missing' is not a widget of this story"],
    ["an HTML panel over another HTML panel", [clues(), html(), html({ id: "page2", source: "page" })], "never another HTML panel"],
    ["an HTML panel shown to players over an author widget", [clues({ audience: "author" }), html()], "cannot show its view to players"],
    ["two HTML panels over one widget", [clues(), html(), html({ id: "page2" })], "already backs another HTML panel"],
    ["an empty template", [clues(), html({ template: "  " })], "template is the panel's HTML"],
    ["a template over the size cap", [clues(), html({ template: "x".repeat(32001) })], "template is the panel's HTML"],
    ["a duplicate action id", [clues(), html({ actions: [{ id: "a", text: "A" }, { id: "a", text: "B" }] })], "duplicate action 'a'"],
    ["an unknown widget key", [clues({ script: "alert(1)" })], "script"],
  ])("refuses %s", (_label, widgets, needle) => {
    expect(errorsOf(widgets).join(" | ")).toContain(needle);
  });

  test("control: the valid set parses with no error", () => {
    expect(errorsOf([clues(), map(), html()])).toEqual([]);
  });
});
