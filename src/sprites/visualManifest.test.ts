import { lookOverlap, lookSignature, nearestLook, visualRoot } from "./visualManifest";
import { visualFixture } from "./visualFixtures";

test("a reworded outfit stands in with the closest published look, never a distant or stale one", () => {
  const fixture = visualFixture(), root = visualRoot(fixture);
  const base = (set: string) => ({ path: `/characters/Arin/${set}/neutral.png`, sha256: "e".repeat(64), key: set, recipe: { id: "qwen21-card-base", version: 2 } });
  const source = { ...fixture, looks: { ...fixture.looks,
    look_coat: { root, signature: lookSignature({ outfit: "a long navy wool coat over the jacket" }), base: base("look_coat") },
    look_jacket: { root, signature: lookSignature({ outfit: "mustard jacket" }), base: base("look_jacket") },
    look_old: { root: "older-root", signature: lookSignature({ outfit: "navy wool coat over a mustard jacket" }), base: base("look_old") } } };
  expect(lookOverlap({ outfit: "navy wool coat over a mustard jacket" }, { outfit: "a long navy wool coat over the jacket" })).toBeCloseTo(4 / 6);
  expect(nearestLook(source, { outfit: "navy wool coat over a mustard jacket" })).toEqual({ set: "look_coat", path: "/characters/Arin/look_coat/neutral.png" });
  expect(nearestLook(source, { outfit: "white shirt with sleeves rolled up" })).toBeNull();
  expect(nearestLook(source, { outfit: "navy wool coat", hair: "short" })).toBeNull();
});
