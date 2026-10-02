import * as recorded from "../../test/fixtures/t2-5-exclusion.memory.json";
import type { DerivedRecord } from "./derived";
import { excludedTexts, withoutExcludedThreads } from "./excludedThreads";
import type { ArcEntry } from "./types";

const arcs = recorded.arcs as unknown as ArcEntry[];
const derived = recorded.derived as unknown as DerivedRecord[];
const dropped = (kept: ArcEntry[]) => arcs.filter((arc) => !kept.includes(arc)).map((arc) => arc.id.slice(0, 8)).sort();

describe("T2-5: an excluded fact does not come back through [Open threads] (flag msg 151)", () => {
  it("reads the two exclusions the author made at msg 149", () => {
    expect(excludedTexts(derived).map((text) => text.slice(0, 24))).toEqual(["Javon sets three conditio", "Javon demands Max explain"].map((text) => text.slice(0, 24)));
  });

  it("withholds the threads that restate them, the one Natalia used (2e01be93) included, and keeps every other thread", () => {
    const kept = withoutExcludedThreads(arcs, derived);
    expect(dropped(kept)).toEqual(["2e01be93", "3399dfd5", "e6c1e074"]);
    expect(kept.map((arc) => arc.id.slice(0, 8))).toEqual(expect.arrayContaining(["31e56d7c", "746649f5", "54e7f92a", "8b50abf9"]));
  });

  it("controls: no exclusion keeps every thread, and a pinned thread stays", () => {
    expect(withoutExcludedThreads(arcs, [])).toBe(arcs);
    const pinned = arcs.map((arc) => (arc.id.startsWith("2e01be93") ? { ...arc, pinned: true } : arc));
    expect(withoutExcludedThreads(pinned, derived).some((arc) => arc.id.startsWith("2e01be93"))).toBe(true);
  });
});
