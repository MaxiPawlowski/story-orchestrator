import { currentVisual, lookOverlap, lookSignature, nearestLook, publishedLook, publishVisualLook, visualChoice, visualRoot } from "./visualManifest";
import { visualFixture } from "./visualFixtures";
import { actorLook } from "./liveHeadStage";

test("two published looks for one signature resolve to the newest, the same choice for every reader, and a stale root never wins", () => {
  const fixture = visualFixture(), root = visualRoot(fixture), fields = { outfit: "navy coat" }, signature = lookSignature(fields);
  const art = (set: string, hash: string) => ({ path: `/characters/Synthetic/${set}/neutral.png`, sha256: hash.repeat(64), key: set, recipe: { id: "qwen21-look-edit", version: 1 } });
  const first = publishVisualLook(fixture, root, "look_old", signature, art("look_old", "e"));
  const both = publishVisualLook(first, root, "look_new", signature, art("look_new", "f"));
  const stale = { ...both, looks: { ...both.looks, look_gone: { root: "older-root", signature, base: art("look_gone", "1") } } };
  expect(visualChoice(stale, signature)).toEqual({ set: "look_new", look: both.looks.look_new, shadowed: ["look_old"] });
  expect(currentVisual(stale, signature)?.base.sha256).toBe("f".repeat(64));
  expect(publishedLook(stale, fields)).toEqual({ set: "look_new", path: "/characters/Synthetic/look_new/neutral.png", sha256: "f".repeat(64) });
  expect(actorLook({ set: "body_x", bodies: [{ set: "body_x", look: JSON.stringify(fields) }] } as never, stale)).toBe("look_new");
  const again = publishVisualLook(stale, root, "look_old", signature, art("look_old", "e"));
  expect(visualChoice(again, signature)?.set).toBe("look_new");
});

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
