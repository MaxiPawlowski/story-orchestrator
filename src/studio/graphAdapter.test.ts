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

describe("toMermaid", () => {
  it("renders a flowchart with anchors and gate labels", () => {
    const mermaid = toMermaid(story);
    expect(mermaid.startsWith("flowchart TD")).toBe(true);
    expect(mermaid).toContain('cache(["The Cache"])');
    expect(mermaid).toContain('start -->|"trust >= 2"| cache');
  });
});
