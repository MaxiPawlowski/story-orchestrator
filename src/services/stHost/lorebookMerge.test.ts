import { mergeLorebookEntries } from "./lorebookMerge";

const entry = (uid: number, content: string, comment = `e${uid}`) => ({ uid, comment, content, key: [comment] });

describe("lorebook three-way merge (v3.0 43 T, ST editor save)", () => {
  it("keeps a story write to one entry and the editor's edit to another", () => {
    const base = { 0: entry(0, "a"), 1: entry(1, "b") };
    const editor = { 0: entry(0, "a edited by hand"), 1: entry(1, "b") };
    const server = { 0: entry(0, "a"), 1: entry(1, "b written by the story") };
    const merged = mergeLorebookEntries(base, editor, server);
    expect(merged.entries).toEqual({ 0: entry(0, "a edited by hand"), 1: entry(1, "b written by the story") });
    expect(merged.conflicts).toEqual([]);
  });

  it("keeps entries the story created and deletions from either side", () => {
    const base = { 0: entry(0, "a"), 1: entry(1, "b") };
    const editor = { 0: entry(0, "a") };
    const server = { 0: entry(0, "a"), 1: entry(1, "b"), 2: entry(2, "story created") };
    expect(mergeLorebookEntries(base, editor, server).entries).toEqual({ 0: entry(0, "a"), 2: entry(2, "story created") });
    expect(mergeLorebookEntries(base, { ...base }, { 1: entry(1, "b") }).entries).toEqual({ 1: entry(1, "b") });
  });

  it("an entry both changed keeps the editor's version and names it; one the editor deleted but the story changed survives", () => {
    const base = { 0: entry(0, "a", "Harbor"), 1: entry(1, "b") };
    const merged = mergeLorebookEntries(base, { 0: entry(0, "hand", "Harbor") }, { 0: entry(0, "story", "Harbor"), 1: entry(1, "b changed") });
    expect(merged.entries).toEqual({ 0: entry(0, "hand", "Harbor"), 1: entry(1, "b changed") });
    expect(merged.conflicts).toEqual(['"Harbor"', '"e1"']);
  });

  it("two new entries on the same uid both survive: the story's moves to a free uid", () => {
    const merged = mergeLorebookEntries({ 0: entry(0, "a") }, { 0: entry(0, "a"), 1: entry(1, "hand new") }, { 0: entry(0, "a"), 1: entry(1, "story new") });
    expect(merged.entries).toEqual({ 0: entry(0, "a"), 1: entry(1, "hand new"), 2: { ...entry(1, "story new"), uid: 2 } });
    expect(merged.moved).toEqual([{ from: "1", to: "2" }]);
    expect(merged.conflicts).toEqual([]);
  });

  it("key order inside an entry is not a change", () => {
    const base = { 0: { uid: 0, content: "a", comment: "x" } };
    const merged = mergeLorebookEntries(base, { 0: { comment: "x", uid: 0, content: "a" } }, { 0: { uid: 0, content: "story", comment: "x" } });
    expect(merged.entries).toEqual({ 0: { uid: 0, content: "story", comment: "x" } });
  });
});
