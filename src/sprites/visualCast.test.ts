import { loadCast } from "./castLoad";
import { visualFixture } from "./visualFixtures";
import { bodyStamp } from "./poses/layers";
import { actorHeadRef, castHeadStatus } from "./liveHeadStage";
import { lookSignature } from "./visualManifest";
import { stableStringify } from "@runtime/hash";
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

test("a posed body of a changed look resolves the live head of that look's published bust", async () => {
  const source = visualFixture(), root = source.looks.default.root;
  const bust = { path: "/characters/Synthetic/look_abcd1234/bust.png", sha256: "f".repeat(64), key: "look-bust", recipe: { id: "visual-bust-crop", version: 1 } };
  const base = { ...bust, path: "/characters/Synthetic/look_abcd1234/neutral.png", sha256: "e".repeat(64), key: "look-base" };
  source.looks.look_abcd1234 = { root, signature: lookSignature({ outfit: "storm cloak" }), base, bust };
  const cast = await loadCast([{ name: "Synthetic", avatar: "Synthetic.png", folder: "Synthetic", muted: false, profile: null }], {
    builders: {}, sources: { Synthetic: source }, keysFor: () => ["synthetic"], verifySource: async () => {},
    list: async (folder) => folder === "Synthetic/base" ? [{ label: "neutral", path: source.base.path }] : [],
  });
  const actor = cast.actors[0], roster = [{ id: "synthetic", name: "Synthetic" }];
  const look = { member: "synthetic", look: "look_abcd1234", artHash: bust.sha256, source: bust.path, manifest: "/rigs/look.json" };
  const plain = { member: "synthetic", look: "default", artHash: source.bust.sha256, source: source.bust.path, manifest: "/rigs/default.json" };
  const refs = { [liveHeadKey(look)]: look, [liveHeadKey(plain)]: plain };
  const body = (set: string, fields: Record<string, string>) => ({ set, look: stableStringify(fields), pose: "sit_chair", tags: [], visualRoot: root });
  actor.bodies = [body("lp_11111111", { outfit: "storm cloak" }), body("lp_22222222", {}), body("lp_33333333", { outfit: "unpublished" })];
  actor.set = "lp_11111111";
  expect(actorHeadRef(actor, roster, refs, { Synthetic: source })).toEqual(look);
  expect(castHeadStatus([actor], [actor], roster, refs, { Synthetic: source })[0]).toMatchObject({ look: "look_abcd1234", present: true, state: "ready" });
  actor.set = "lp_22222222";
  expect(actorHeadRef(actor, roster, refs, { Synthetic: source })).toEqual(plain);
  actor.set = "lp_33333333";
  expect(actorHeadRef(actor, roster, refs, { Synthetic: source })).toBeUndefined();
});

test("visual bridge: a pack-bound member with no installed sprites and no builder stands on stage from the pack, with its looks as sets", async () => {
  const files = { defaultFiles: new Map([["neutral", "/characters/Wanderer/pack/default_neutral.png"]]),
    looks: { [lookSignature({ outfit: "grey rain cloak" })]: { set: "pk_rain_cloak", files: new Map([["neutral", "/characters/Wanderer/pack/rain_cloak_neutral.png"]]) } } };
  const member = { name: "Wanderer", avatar: "Wanderer.png", folder: "Wanderer", muted: false, profile: null };
  const without = await loadCast([member], { builders: {}, keysFor: () => ["wanderer"], list: async () => [] });
  expect(without.gaps[0].reason).toBe("no-profile");
  const cast = await loadCast([member], { builders: {}, keysFor: () => ["wanderer"], list: async () => [], identity: async () => ({ pack: "fixture-wanderer@d", ...files }) });
  expect(cast.gaps).toEqual([]);
  expect(cast.actors[0].path).toBe("/characters/Wanderer/pack/default_neutral.png");
  expect(cast.actors[0].packs.get("pk_rain_cloak")?.get("neutral")).toBe("/characters/Wanderer/pack/rain_cloak_neutral.png");
  expect(cast.actors[0].identity).toEqual({ pack: "fixture-wanderer@d", looks: { [lookSignature({ outfit: "grey rain cloak" })]: { set: "pk_rain_cloak" } } });
  const installed = await loadCast([member], { builders: {}, keysFor: () => ["wanderer"], identity: async () => ({ pack: "p", ...files }),
    list: async (folder) => folder === "Wanderer" ? [{ label: "neutral", path: "/characters/Wanderer/neutral.png" }] : [] });
  expect(installed.actors[0].path).toBe("/characters/Wanderer/neutral.png");
  const failing = await loadCast([member], { builders: {}, keysFor: () => ["wanderer"], list: async () => [], identity: async () => { throw new Error("plugin down"); } });
  expect(failing.gaps[0].reason).toBe("no-profile");
});
