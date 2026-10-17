import { CHECKS, runCheck, type Check } from "./checks";
import { emptyIndex, findLost, mergeIndex, parseIndex, seedDelta, type LibraryHeld } from "./libraryIndexCore";
import { jargonIn } from "@features/jargon";
import type { RuntimeSnapshot } from "./types";

const AT = "2026-10-17T00:00:00.000Z";
const held = (stories: Array<[string, string]>, sessions: string[] = []): LibraryHeld => ({ stories: stories.map(([id, hash]) => ({ id, hash })), sessions });
const check = CHECKS.find((entry) => entry.id === "library-lost-to-tab") as Check;
const snapshot = (libraryLost: RuntimeSnapshot["libraryLost"]) => ({ storyId: null, ui: { authorView: false }, libraryLost }) as unknown as RuntimeSnapshot;

describe("plan 69 K3 step 2: the library index finds what another tab overwrote", () => {
  it("a planted revert (A saved a story, a stale tab saved settings without it) raises the check", () => {
    const index = mergeIndex(emptyIndex(), { stories: { "old-road": "h1", ruins: "h2" } }, AT);
    const lost = findLost(index, held([["old-road", "h1"]]));
    expect(lost).toEqual({ stories: ["ruins"], sessions: [], changed: [] });
    const fired = runCheck(check, snapshot(lost));
    expect(fired).toMatchObject({ check: "library-lost-to-tab", severity: "degrades", area: "save" });
    expect(fired?.detail).toContain("Missing from the library: ruins.");
    expect(jargonIn(fired?.player ?? "")).toEqual([]);
  });

  it("a deliberate deletion writes a tombstone and does not raise it", () => {
    const index = mergeIndex(mergeIndex(emptyIndex(), { stories: { ruins: "h2" }, sessions: { "wizard-a": true } }, AT), { stories: { ruins: null }, sessions: { "wizard-a": null } }, AT);
    expect(findLost(index, held([]))).toEqual({ stories: [], sessions: [], changed: [] });
    expect(runCheck(check, snapshot(null))).toBeNull();
  });

  it("a stale page's index write (its own story only) keeps the id another page saved", () => {
    const fromA = mergeIndex(emptyIndex(), { stories: { ruins: "h2" } }, AT);
    const fromStaleB = mergeIndex(parseIndex(JSON.parse(JSON.stringify(fromA))), { stories: { "old-road": "h9" } }, AT);
    expect(Object.keys(fromStaleB.stories).sort()).toEqual(["old-road", "ruins"]);
    expect(findLost(fromStaleB, held([["old-road", "h9"]])).stories).toEqual(["ruins"]);
  });

  it("a story the stale tab put back at an older version is reported as older, not repaired", () => {
    const index = mergeIndex(emptyIndex(), { stories: { ruins: "h3" } }, AT);
    expect(findLost(index, held([["ruins", "h2"]]))).toEqual({ stories: [], sessions: [], changed: ["ruins"] });
  });

  it("a lost wizard session is counted; sessions carry no content", () => {
    const index = mergeIndex(emptyIndex(), { sessions: { "wizard-a": true, "wizard-b": true } }, AT);
    const lost = findLost(index, held([], ["wizard-a"]));
    expect(lost.sessions).toEqual(["wizard-b"]);
    expect(runCheck(check, snapshot(lost))?.detail).toContain("Missing wizard sessions: 1.");
  });

  it("the first start seeds only ids the index has never seen, never over a tombstone or a newer hash", () => {
    const index = mergeIndex(emptyIndex(), { stories: { ruins: "h3", gone: null } }, AT);
    expect(seedDelta(index, held([["ruins", "h2"], ["gone", "h1"], ["new", "h4"]], ["w"]))).toEqual({ stories: { new: "h4" }, sessions: { w: true } });
    expect(seedDelta(index, held([["ruins", "h2"]]))).toBeNull();
  });

  it("an unreadable or foreign index reads as empty", () => {
    expect(parseIndex(null)).toEqual(emptyIndex());
    expect(parseIndex({ v: 2, stories: { a: { at: AT } } })).toEqual(emptyIndex());
    expect(parseIndex({ v: 1, stories: { a: { at: AT, hash: "h" }, b: "junk" }, sessions: [] })).toEqual({ v: 1, stories: { a: { at: AT, hash: "h" } }, sessions: {} });
  });
});
