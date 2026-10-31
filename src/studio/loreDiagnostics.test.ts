import type { Story } from "@engine/index";
import { runDiagnostics } from "./diagnostics";
import { lorePathPeak, type LoreTokenEntry } from "./loreDiagnostics";
import { createLoreTokenSource } from "@runtime/loreTokenSource";

const big = (comment: string, tokens: number, constant = true): LoreTokenEntry => ({ comment, tokens, disabled: false, constant });

const draft: Story = {
  title: "lifetimes",
  description: "",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }],
  chapters: [{ id: "c1", title: "One" }, { id: "c2", title: "Two", final: true }],
  checkpoints: [
    { id: "a", name: "A", objective: "", type: "anchor", start: true, chapter: "c1", effects: { world_info: { enable: [{ lorebook: "Book", comments: ["Scene A"] }] } } },
    { id: "b", name: "B", objective: "", type: "anchor", chapter: "c2", effects: { world_info: { enable: [{ lorebook: "Book", comments: ["Scene B"] }] } } },
  ],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 1 }] } }],
  roster: [],
};
const book = [big("Scene A", 1200), big("Scene B", 1200), big("World", 200), big("Rare", 900, false)];
const entries = (name: string) => (name === "Book" ? book : null);
const codes = (story: Story, lifetime?: boolean) => runDiagnostics(story, { loreEntries: entries, ...(lifetime === undefined ? {} : { loreLifetime: lifetime }) })
  .filter((entry) => entry.code === "lore-path-over-budget" || entry.code === "world-info-until-unknown");

describe("lore path budget (v3.0 43 L1)", () => {
  it("counts constants switched on plus the largest keyword entries, per path", () => {
    expect(lorePathPeak(draft, entries, false)).toEqual({ tokens: 3500, path: ["a", "b"] });
    expect(lorePathPeak(draft, entries, true)).toEqual({ tokens: 2300, path: ["a"] });
    expect(lorePathPeak({ ...draft, lore_select: { lorebooks: ["Book"], top_k: 1 } }, entries, false, "all")?.tokens).toBe(3500);
    const keyword = (name: string) => (name === "Book" ? [big("K1", 2000, false), big("K2", 2000, false)] : null);
    expect(lorePathPeak({ ...draft, lore_select: { lorebooks: ["Book"], top_k: 1 } }, keyword, true)?.tokens).toBe(2000);
  });

  it("warns when lore along a path passes the budget, and stays quiet once lore ends with its chapter", () => {
    const over = codes(draft, false);
    expect(over.map((entry) => [entry.code, entry.path, entry.severity])).toEqual([["lore-path-over-budget", "checkpoints.1.effects.world_info", "warning"]]);
    expect(over[0].message).toContain("A → B");
    expect(codes(draft, true)).toEqual([]);
    expect(codes(draft)).toEqual([]);
  });

  it("control: says nothing while a book is not loaded yet, or with no lore source", () => {
    expect(runDiagnostics(draft, { loreEntries: () => null, loreLifetime: false }).some((entry) => entry.code === "lore-path-over-budget")).toBe(false);
    expect(runDiagnostics(draft).some((entry) => entry.code === "lore-path-over-budget")).toBe(false);
  });

  it("names an until that is no checkpoint, and accepts a real one or the chapter keyword", () => {
    const until = (value: string): Story => ({ ...draft, checkpoints: [{ ...draft.checkpoints[0], effects: { world_info: { enable: [{ lorebook: "Book", comments: ["Scene A"], until: value }] } } }, draft.checkpoints[1]] });
    expect(codes(until("ghost")).filter((entry) => entry.code === "world-info-until-unknown").map((entry) => [entry.code, entry.path])).toEqual([["world-info-until-unknown", "checkpoints.0.effects.world_info.enable.0"]]);
    expect(codes(until("b"))).toEqual([]);
    expect(codes(until("chapter"))).toEqual([]);
  });
});

describe("lore token source", () => {
  it("loads a book once, answers null until it lands, then calls back; clear drops a load in flight", async () => {
    let release: (rows: LoreTokenEntry[]) => void = () => undefined;
    const loads: string[] = [];
    let loaded = 0;
    const source = createLoreTokenSource((name) => { loads.push(name); return new Promise((resolve) => { release = resolve; }); }, () => { loaded += 1; });
    expect(source.entries("Book")).toBeNull();
    expect(source.entries("book")).toBeNull();
    release([big("X", 5)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(loads).toEqual(["Book"]);
    expect(loaded).toBe(1);
    expect(source.entries("BOOK")).toEqual([big("X", 5)]);
    source.entries("Other");
    source.clear();
    release([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(loaded).toBe(1);
    expect(source.entries("Book")).toBeNull();
  });
});
