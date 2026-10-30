import { parseStoryOrThrow, type BlackboardSnapshot } from "@engine/index";
import { deriveScopeWithSources } from "./scope";
import { DISPLAY_SCOPE_CAP } from "./scopeSources";

const stat = (key: string, extra: Record<string, unknown> = {}) => ({ key, type: "int", source: "extractor", rubric: `How much ${key}.`, display: { public: true, label: key, as: "meter", min: 0, max: 10 }, ...extra });

const story = parseStoryOrThrow({
  title: "Sheet",
  description: "",
  qualities: [
    stat("courage"), stat("grit"), stat("hope"), stat("wits"), stat("luck"), stat("trust"),
    stat("fixed"),
    { key: "secret_count", type: "int", source: "extractor", rubric: "r" },
    { key: "coins", type: "int", source: "code", rubric: "r", display: { public: true, label: "Coins", as: "meter", min: 0, max: 5 } },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true },
    { id: "end", name: "End", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 3 }] } }],
  roster: [],
});

const board = (values: Record<string, number> = {}, latched: Record<string, boolean> = {}): BlackboardSnapshot => ({ values, versions: {}, latched });
const read = (blackboard: BlackboardSnapshot, rotation = 0) => deriveScopeWithSources(story, "start", blackboard, [], { rotation });
const displayKeys = (blackboard: BlackboardSnapshot, rotation = 0) =>
  read(blackboard, rotation).scope.filter((entry) => entry.pulledBy.some((pull) => pull.kind === "display")).map((entry) => entry.key);

describe("stat-tab P1: a public display stat no gate reads still gets read", () => {
  it("reads up to the cap of public extractor stats, never a gated, latched, code or hidden one through the display source", () => {
    const keys = displayKeys(board({}, { fixed: true }));
    expect(keys).toHaveLength(DISPLAY_SCOPE_CAP);
    expect(keys.every((key) => ["courage", "grit", "hope", "wits", "luck"].includes(key))).toBe(true);
    const scope = read(board({}, { fixed: true })).scope.map((entry) => entry.key);
    expect(scope).toContain("trust");
    expect(scope).not.toContain("fixed");
    expect(scope).not.toContain("coins");
    expect(scope).not.toContain("secret_count");
  });

  it("unset stats come first, and the rest rotate so every stat is read in turn", () => {
    expect(displayKeys(board({ courage: 2, grit: 2, hope: 2 }, { fixed: true }))).toEqual(expect.arrayContaining(["wits", "luck"]));
    const seen = new Set<string>();
    for (let rotation = 0; rotation < 5; rotation += 1) displayKeys(board({ courage: 1, grit: 1, hope: 1, wits: 1, luck: 1 }, { fixed: true }), rotation).forEach((key) => seen.add(key));
    expect([...seen].sort()).toEqual(["courage", "grit", "hope", "luck", "wits"]);
  });
});
