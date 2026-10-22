import { StagePoses } from "./stageBodies";
import { shippedPoses } from "./library";
import { stableStringify } from "@runtime/hash";
import { lookLayers } from "./layers";
import { defaultSpriteSettings } from "../settings";
import { readSpriteProfile } from "../profile";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { Actor } from "../castLoad";
import { actorHeadRef } from "../liveHeadStage";
import { liveHeadKey } from "../liveHeadRefs";
import { visualFixture } from "../visualFixtures";
import { lookSignature, visualRoot } from "../visualManifest";

jest.mock("@services/stHost/sprites", () => ({ spriteBuilderMembers: () => [] }));
jest.mock("../expressionCalls", () => ({ expressionDeps: () => ({ judge: null, llm: null }) }));

test("rollback and replay choose the same cached look, pose and actual image path", () => {
  const pose = shippedPoses().find((pose) => pose.id === "sit_chair")!;
  const card = { fields: { outfit: { quality: "outfit", visual: true } } };
  let outfit = "coat";
  const story = { id: "s", roster: [{ id: "arin", name: "Arin", sprites: { pose: pose.id }, card }],
    cardFieldByQuality: { outfit: { owner: "arin", field: "outfit", visual: true } } };
  const manager = { getStory: () => story, getCachedSnapshot: () => ({ storyId: "s", activeCheckpointId: "a", blackboard: { outfit } }), getBoundaryLog: () => [] } as unknown as RuntimeManager;
  const profile = readSpriteProfile({ default: "neutral", labels: { neutral: { what: "calm" } } }, "Arin")!;
  const actor: Actor = { name: "Arin", avatar: "arin.png", keys: ["arin"], muted: false, profile, rules: [],
    packs: new Map([
      ["default", new Map([["neutral", "/default.png"]])],
      ["lp_coat", new Map([["neutral", "/coat.png"]])],
      ["lp_armor", new Map([["neutral", "/armor.png"]])],
    ]),
    frames: new Map(), set: "default", keyword: null, label: "neutral", desiredLabel: "neutral", path: "/default.png",
    bodies: ["coat", "armor"].map((outfit) => { const layers = lookLayers(card, { outfit }); return { set: `lp_${outfit}`, look: stableStringify(layers.base), pose: pose.id, tags: pose.tags, stamp: stableStringify([pose, layers, undefined]) }; }) };
  const controller = new StagePoses({ manager, actors: () => [actor], settings: defaultSpriteSettings, direction: () => null, notify: () => {} });
  const ref = { member: "arin", look: "lp_coat", artHash: "a".repeat(64), source: "/coat.png", manifest: "/head.json" };
  const refs = { [liveHeadKey(ref)]: ref };
  controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  expect(actorHeadRef(actor, story.roster, refs)).toEqual(ref);
  outfit = "armor"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_armor", "/armor.png"]);
  expect(actorHeadRef(actor, story.roster, refs)).toBeUndefined();
  outfit = "coat"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  expect(actorHeadRef(actor, story.roster, refs)).toEqual(ref);
  actor.set = "default"; actor.path = "/default.png"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  controller.close();
});

test("a changed look with its base published stands in on stage and its close shot rig follows while the body renders", () => {
  const card = { fields: { outfit: { quality: "outfit", visual: true } } };
  let outfit = "";
  const story = { id: "s", roster: [{ id: "arin", name: "Arin", card, sprites: { pose: "sit_chair" } }], cardFieldByQuality: { outfit: { owner: "arin", field: "outfit", visual: true } } };
  const manager = { getStory: () => story, getCachedSnapshot: () => ({ storyId: "s", activeCheckpointId: "a", blackboard: { outfit } }), getBoundaryLog: () => [] } as unknown as RuntimeManager;
  const profile = readSpriteProfile({ default: "neutral", labels: { neutral: { what: "calm" }, worried: { what: "uneasy", fallback: ["neutral"] } } }, "Arin")!;
  const fixture = visualFixture(), root = visualRoot(fixture);
  const lookBase = { path: "/characters/Arin/look_39e5bf69/neutral.png", sha256: "e".repeat(64), key: "look-key", recipe: { id: "qwen21-card-base", version: 2 } };
  const lookBust = { path: "/characters/Arin/visual_look/bust.png", sha256: "f".repeat(64), key: "look-bust", recipe: { id: "visual-look-bust-crop", version: 1 } };
  const source = { ...fixture, character: "Arin", looks: { ...fixture.looks, look_39e5bf69: { root, signature: lookSignature({ outfit: "navy coat" }), base: lookBase, bust: lookBust } } };
  const settings = () => ({ ...defaultSpriteSettings(), poses: true, onDemand: true, visualSources: { Arin: source } });
  const actor: Actor = { name: "Arin", avatar: "arin.png", keys: ["arin"], muted: false, profile, rules: [],
    packs: new Map([["default", new Map([["neutral", "/default.png"]])]]),
    frames: new Map(), set: "default", keyword: null, label: "neutral", desiredLabel: "worried", path: "/default.png", bodies: [] };
  const controller = new StagePoses({ manager, actors: () => [actor], settings, direction: () => null, notify: () => {} });
  const ref = { member: "arin", look: "look_39e5bf69", artHash: lookBust.sha256, source: lookBust.path, manifest: "/head.json" };
  const refs = { [liveHeadKey(ref)]: ref };
  outfit = "navy coat"; controller.choose(actor);
  expect([actor.pose, actor.set, actor.path]).toEqual(["sit_chair", "look_39e5bf69", lookBase.path]);
  expect(actorHeadRef(actor, story.roster, refs, { Arin: source })).toEqual(ref);
  outfit = "plain shirt"; controller.choose(actor);
  expect(actor.set).toBe("default");
  delete (story.roster[0] as { sprites?: unknown }).sprites;
  outfit = "navy coat";
  expect(controller.choose(actor)).toBe(false);
  expect(actor.pose).toBe("stand_relaxed");
  controller.close();
});
