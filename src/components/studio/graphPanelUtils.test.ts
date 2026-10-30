import type { Core } from "cytoscape";
import { buildGraphElements, capFitZoom, CHAPTER_LANE_PREFIX, holdTapGate } from "./graphPanelUtils";

describe("graph readability (v3.0 29 WP-S2)", () => {
  const draft = { start: "a", checkpoints: [{ id: "a", name: "A", transitions: [{ id: "t0", to: "b", label: "Trust ≥ 2 and a very long readable condition text", raw: "trust >= 2" }] }, { id: "b", name: "B" }] };

  it("badges the start node and keeps the raw gate for the edge hover", () => {
    const elements = buildGraphElements(draft, null);
    expect(elements.find((element) => element.data.id === "a")?.data.label).toBe("▶ Start\nA");
    const edge = elements.find((element) => element.group === "edges");
    expect(edge?.data.fullLabel).toBe("trust >= 2");
    expect(String(edge?.data.label).length).toBeLessThanOrEqual(39);
  });

  it("never fits a small graph above 1x", () => {
    let zoom = 3;
    let centered = false;
    const cy = { zoom: (value?: number) => { if (value !== undefined) zoom = value; return zoom; }, center: () => { centered = true; }, elements: () => ({ length: 2 }) } as unknown as Core;
    capFitZoom(cy);
    expect(zoom).toBe(1);
    expect(centered).toBe(true);
  });
});

describe("graph chapter lanes (v2.6 plan 07 D13)", () => {
  const draft = {
    start: "a",
    chapters: [{ id: "one", label: "Chapter One" }, { id: "unused", label: "Nobody" }],
    checkpoints: [
      { id: "a", name: "A", chapter: "one", transitions: [{ id: "t0", to: "b" }] },
      { id: "b", name: "B", chapter: "missing" },
    ],
  };

  it("adds one lane per used chapter as the parent of its checkpoints, before them", () => {
    const elements = buildGraphElements(draft, null);
    expect(elements[0]).toEqual({ group: "nodes", data: { id: `${CHAPTER_LANE_PREFIX}one`, label: "Chapter One", type: "chapter" }, selectable: false });
    expect(elements.filter((element) => element.data.type === "chapter")).toHaveLength(1);
    expect(elements.find((element) => element.data.id === "a")?.data.parent).toBe(`${CHAPTER_LANE_PREFIX}one`);
    expect(elements.find((element) => element.data.id === "b")?.data.parent).toBeUndefined();
    expect(elements.filter((element) => element.group === "edges").map((element) => element.data.target)).toEqual(["b"]);
  });

  it("draws no lane when no chapter is declared", () => {
    expect(buildGraphElements({ checkpoints: draft.checkpoints }, null).some((element) => element.data.type === "chapter")).toBe(false);
  });
});

describe("hold then release on a touch screen", () => {
  it("swallows the tap Cytoscape emits on the release that ends a long-press, and only that one", () => {
    const gate = holdTapGate();
    gate.start();
    expect(gate.tapAllowed()).toBe(true);
    gate.start();
    gate.hold();
    expect(gate.tapAllowed()).toBe(false);
    gate.start();
    expect(gate.tapAllowed()).toBe(true);
  });

  it("a new press clears a hold whose release emitted no tap", () => {
    const gate = holdTapGate();
    gate.start();
    gate.hold();
    gate.start();
    expect(gate.tapAllowed()).toBe(true);
  });
});
