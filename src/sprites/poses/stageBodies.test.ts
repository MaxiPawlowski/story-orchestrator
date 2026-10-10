import { StagePoses } from "./stageBodies";
import { shippedPoses } from "./library";
import { stableStringify } from "@runtime/hash";
import { lookLayers } from "./layers";
import { defaultSpriteSettings } from "../settings";
import { readSpriteProfile } from "../profile";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { Actor } from "../castLoad";

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
  controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  outfit = "armor"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_armor", "/armor.png"]);
  outfit = "coat"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  actor.set = "default"; actor.path = "/default.png"; controller.choose(actor);
  expect([actor.set, actor.path]).toEqual(["lp_coat", "/coat.png"]);
  controller.close();
});
