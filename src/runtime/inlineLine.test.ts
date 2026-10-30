import type { InlineItem } from "./inlineTimeline";
import { inlineGroups, inlineLineParts, inlineLineText } from "./inlineLine";

const item = (id: string, category: InlineItem["category"], level: InlineItem["level"] = 1): InlineItem =>
  ({ id, category, level, persona: level <= 2 ? "player" : "author", state: "applied", text: id });

describe("v3.0 29 IC4: the inline note is one line of words", () => {
  it("names each category once, in category order, with counts in the words", () => {
    const parts = inlineLineParts([item("m1", "memory"), item("p1", "progress"), item("m2", "memory")]);
    expect(parts).toEqual([
      { category: "progress", label: "Progress", text: "The story moved on", count: 1 },
      { category: "memory", label: "Memory", text: "Remembered 2 things", count: 2 },
    ]);
    expect(inlineLineText(parts)).toBe("The story moved on · Remembered 2 things");
  });

  it("uses the singular for one and words for every category", () => {
    const categories = ["progress", "memory", "threads", "lore", "cast", "pacing", "calls", "health"] as const;
    const one = inlineLineParts(categories.map((category) => item(category, category)));
    expect(one.map((part) => part.text)).toEqual([
      "The story moved on", "Remembered 1 thing", "A thread changed", "Lore used", "The cast changed", "The mood shifted", "1 background call", "Something did not work",
    ]);
    expect(inlineLineParts([item("t1", "threads"), item("t2", "threads"), item("t3", "threads")])[0].text).toBe("3 threads changed");
  });

  it("is empty with no items and groups keep their items", () => {
    expect(inlineLineParts([])).toEqual([]);
    expect(inlineGroups([item("l1", "lore", 3), item("l2", "lore", 3)])).toEqual([{ category: "lore", items: [item("l1", "lore", 3), item("l2", "lore", 3)] }]);
  });
});
