import type { StoryV2 } from "@engine/index";
import { toGraphDraft, toMermaid } from "./graphAdapter";

const story: StoryV2 = {
  format: 2,
  title: "Graph",
  description: "",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }],
  checkpoints: [
    { id: "start", name: "Approach", objective: "", type: "intermediate", start: true },
    { id: "cache", name: "The Cache", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }] } }],
  roster: [],
};

describe("toGraphDraft", () => {
  it("maps checkpoints and gate-labelled edges", () => {
    const graph = toGraphDraft(story);
    expect(graph.start).toBe("start");
    expect(graph.checkpoints.find((entry) => entry.id === "cache")?.type).toBe("anchor");
    const edge = graph.checkpoints.find((entry) => entry.id === "start")?.transitions?.[0];
    expect(edge?.to).toBe("cache");
    expect(edge?.label).toBe("trust >= 2");
  });
});

describe("chapter lanes (v2.6 plan 07 D13)", () => {
  const chaptered: StoryV2 = {
    ...story,
    chapters: [{ id: "act-1", title: "The \"Road\"" }, { id: "act2", title: "Empty" }],
    checkpoints: [{ ...story.checkpoints[0], chapter: "act-1" }, { ...story.checkpoints[1], chapter: "gone" }],
  };

  it("hands the panel each declared chapter and each checkpoint's known chapter", () => {
    const graph = toGraphDraft(chaptered);
    expect(graph.chapters).toEqual([{ id: "act-1", label: "The \"Road\"" }, { id: "act2", label: "Empty" }]);
    expect(graph.checkpoints.map((entry) => entry.chapter)).toEqual(["act-1", undefined]);
    expect(toGraphDraft(story).chapters).toBeUndefined();
  });

  it("draws a subgraph per chapter with members, and leaves the rest outside", () => {
    const mermaid = toMermaid(chaptered);
    expect(mermaid).toContain('  subgraph chapter_act_1["The \'Road\'"]\n    start["Approach"]\n  end');
    expect(mermaid).not.toContain("chapter_act2");
    expect(mermaid).toContain('\n  cache(["The Cache"])');
  });
});

describe("toMermaid", () => {
  it("renders a flowchart with anchors and gate labels", () => {
    const mermaid = toMermaid(story);
    expect(mermaid.startsWith("flowchart TD")).toBe(true);
    expect(mermaid).toContain('cache(["The Cache"])');
    expect(mermaid).toContain('start -->|"trust >= 2"| cache');
  });
});
