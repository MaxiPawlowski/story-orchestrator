import { buildGraphElements, CHAPTER_LANE_PREFIX } from "./graphPanelUtils";

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
