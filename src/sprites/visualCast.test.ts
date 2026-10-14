import { loadCast } from "./castLoad";
import { visualFixture } from "./visualFixtures";
import { bodyStamp } from "./poses/layers";
import { actorHeadRef } from "./liveHeadStage";
import { liveHeadKey } from "./liveHeadRefs";

test("wizard card without a legacy sprite profile loads its explicitly accepted base after reload", async () => {
  const source = visualFixture();
  const cast = await loadCast([{ name: "Synthetic", avatar: "Synthetic.png", folder: "Synthetic", muted: false, profile: null }], {
    builders: {}, sources: { Synthetic: source }, keysFor: () => ["synthetic"], verifySource: async () => {},
    list: async (folder) => folder === "Synthetic/base" ? [{ label: "neutral", path: source.base.path }] : [],
  });
  expect(cast.gaps).toEqual([]); expect(cast.actors[0].path).toBe(source.base.path);
  const ref = { member: "synthetic", look: "default", artHash: source.bust.sha256, source: source.bust.path, manifest: "/rigs/synthetic.json" };
  expect(actorHeadRef(cast.actors[0], [{ id: "synthetic", name: "Synthetic" }], { [liveHeadKey(ref)]: ref }, { Synthetic: source })).toEqual(ref);
  expect(actorHeadRef(cast.actors[0], [{ id: "synthetic", name: "Synthetic" }], { old: { ...ref, artHash: "e".repeat(64) } }, { Synthetic: source })).toBeUndefined();
});

test("missing or modified accepted artwork refuses reloaded stage assets instead of silently using stale defaults", async () => {
  const source = visualFixture(); const list = jest.fn(async () => [{ label: "neutral", path: source.base.path }]);
  const loaded = await loadCast([{ name: "Synthetic", avatar: "Synthetic.png", folder: "Synthetic", muted: false, profile: null }], {
    builders: {}, sources: { Synthetic: source }, keysFor: () => ["synthetic"], list,
    verifySource: async () => { throw new Error("source bytes changed"); },
  });
  expect(loaded.actors).toEqual([]); expect(loaded.gaps[0].reason).toBe("stale-source"); expect(list).not.toHaveBeenCalled();
});

test("same pose and same pixels from another accepted root do not reuse the stage body stamp", () => {
  const pose = { id: "lie_side" }, layers = { base: {} }, config = { baseSet: "base" };
  expect(bodyStamp(pose, layers, config, "root:1")).not.toBe(bodyStamp(pose, layers, config, "root:2"));
  expect(bodyStamp(pose, layers, config)).not.toBe(bodyStamp(pose, layers, config, "root:1"));
});
