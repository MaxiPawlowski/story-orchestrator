import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { parseStoryOrThrow } from "@engine/index";
import { createVisualBridge } from "../sprites/packs/bridge";
import type { VisualScene } from "../sprites/packs/scene";
import { packKey } from "../sprites/packs/pack";
import { visualFixture } from "../sprites/visualFixtures";
import { lookSignature, publishVisualLook, visualRoot } from "../sprites/visualManifest";
import { EDIT_NODES } from "../sprites/builder/recipes";
import type { ComfyDiscovery } from "@services/stHost/media";
import { chooseRoute, illustratedReply, qwenOutputSize, qwenPrompt, qwenReadiness, QWEN_POSE_CLAUSE, visibleNames, type QwenSubject } from "./autoScene";
import { withVisualScene } from "./visualPlan";
import type { ImageScene } from "./prompt";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const ROOT = join(__dirname, "../..");
const autogrow = JSON.parse(readFileSync(join(ROOT, "test/fixtures/comfy-qwen21-autogrow.object_info.json"), "utf8")).TextEncodeQwenImage21;
const discovery = (extra: Partial<ComfyDiscovery> = {}, nodes: ComfyDiscovery["nodes"] = {}): ComfyDiscovery => ({
  nodes: { ...Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), ...nodes }, checkpoints: [], embeddings: [], loras: [], upscalers: [],
  diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors"], textEncoders: ["qwen3vl_8b_int8.safetensors"], vaes: ["qwen_image_2.1_vae.safetensors"], ...extra });
const sprites = { builders: {}, sceneRecipe: null };
const prepared = (character = "Synthetic"): QwenSubject => ({ name: character, member: { character, fields: {}, source: { ...visualFixture(), character } } });

describe("automatic picture route: Qwen readiness reasons", () => {
  const reason = (subjects: QwenSubject[], found: ComfyDiscovery | null = discovery(), visual: VisualScene | null = null) => {
    const result = qwenReadiness({ subjects, discovery: found, sprites, visual });
    return result.ok ? "ready" : result.reason;
  };

  it("names why each scene cannot use references, and is ready when every visible character is prepared", () => {
    expect(reason([])).toBe("no-one-visible");
    expect(reason([prepared("A"), prepared("B"), prepared("C")])).toBe("too-many-visible");
    expect(reason([prepared(), { name: "Visitor", member: null, missing: "visible-not-in-cast" }])).toBe("visible-not-in-cast");
    expect(reason([{ name: "Synthetic", member: null, missing: "no-reference" }])).toBe("no-reference");
    expect(reason([{ name: "Synthetic", member: { character: "Synthetic", fields: { outfit: "blue coat" }, source: visualFixture() } }])).toBe("look-pending");
    expect(reason([prepared()], null)).toBe("media-unavailable");
    expect(reason([prepared()], discovery({ diffusionModels: [], textEncoders: [], vaes: [] }))).toBe("recipe-missing");
    expect(reason([prepared()], discovery({}, { TextEncodeQwenImage21: undefined as never, UNETLoader: undefined as never }))).toBe("models-missing");
    expect(reason([prepared("A"), prepared("B")])).toBe("second-input-missing");
    expect(reason([prepared("A"), prepared("B")], discovery({}, { TextEncodeQwenImage21: autogrow }))).toBe("ready");
    const fields = { outfit: "blue coat" }, source = visualFixture();
    const changed = publishVisualLook(source, visualRoot(source), "look_blue", lookSignature(fields), { ...source.base, sha256: "e".repeat(64) });
    expect(reason([{ name: "Synthetic", member: { character: "Synthetic", fields, source: changed } }])).toBe("ready");
  });

  it("adds the place plate as the next image input only when this ComfyUI offers it", () => {
    const plate = { path: "/backgrounds/plate.png", sha256: "9".repeat(64) };
    const visual = { place: { source: "pack", plate, checkpoint: "quay", name: "Quay", tags: [] } } as unknown as VisualScene;
    const without = qwenReadiness({ subjects: [prepared()], discovery: discovery(), sprites, visual });
    const offered = qwenReadiness({ subjects: [prepared()], discovery: discovery({}, { TextEncodeQwenImage21: autogrow }), sprites, visual });
    expect(without.ok && without.ready.plate).toBeNull();
    expect(offered.ok && offered.ready.plate).toEqual(plate);
  });
});

describe("automatic picture route: choice and fallback", () => {
  const ready = qwenReadiness({ subjects: [prepared()], discovery: discovery(), sprites, visual: null });
  const pending = qwenReadiness({ subjects: [{ name: "Synthetic", member: null, missing: "no-reference" }], discovery: discovery(), sprites, visual: null });

  it("auto uses references when ready and records why it fell back to SDXL otherwise", () => {
    expect(chooseRoute({ setting: "auto", readiness: ready })).toMatchObject({ route: "qwen", reason: "references-ready", setting: "auto" });
    expect(chooseRoute({ setting: "auto", readiness: pending })).toMatchObject({ route: "sdxl", reason: "no-reference", ready: null });
    expect(chooseRoute({ setting: "auto", readiness: null })).toMatchObject({ route: "sdxl", reason: "no-story" });
    expect(chooseRoute({ setting: "sdxl", readiness: ready })).toMatchObject({ route: "sdxl", reason: "setting-sdxl" });
    expect(chooseRoute({ setting: null, readiness: ready })).toMatchObject({ route: "sdxl", reason: "not-automatic" });
    expect(chooseRoute({ setting: "auto", blocked: "background", readiness: ready })).toMatchObject({ route: "sdxl", reason: "background" });
  });

  it("references-only refuses instead of silently drawing SDXL", () => {
    expect(chooseRoute({ setting: "qwen", readiness: ready }).route).toBe("qwen");
    expect(() => chooseRoute({ setting: "qwen", readiness: pending })).toThrow(/references only, and a visible character has no visual pack/);
  });

  it("the director's visible list decides who must be prepared", () => {
    const subjects = [{ name: "Ash" }, { name: "Bram" }];
    expect(visibleNames(subjects, undefined)).toEqual(["Ash", "Bram"]);
    expect(visibleNames(subjects, ["ash"])).toEqual(["Ash"]);
    expect(visibleNames(subjects, ["Ash", "the visitor"])).toEqual(["Ash", "the visitor"]);
  });
});

describe("automatic picture route: the Qwen instruction", () => {
  const raw = (name: string) => JSON.parse(readFileSync(join(ROOT, `test/fixtures/visual-packs/${name}.pack.json`), "utf8")) as { assets: Array<{ path: string; sha256: string }> };
  const NAMES = ["style-ink", "identity-wanderer", "place-harbor", "place-observatory"];
  const textHash = async (text: string) => createHash("sha256").update(text).digest("hex");
  const files = new Map(NAMES.flatMap((name) => raw(name).assets.map((asset) => [asset.path, asset.sha256] as const)));
  const bridge = createVisualBridge({ textHash, list: async () => NAMES.map((name) => ({ file: name, pack: raw(name) })), fileHash: async (path) => files.get(path) ?? Promise.reject(new Error("404")) });
  const story = parseStoryOrThrow(JSON.parse(readFileSync(join(ROOT, "test/fixtures/visual-bridge.story.json"), "utf8")));
  const scene: ImageScene = { target: 1, focus: null, location: null, checkpoint: "On the quay", subjects: [{ key: "w", name: "Wanderer", appearance: "card text", focus: true }],
    messages: [{ name: "Player", text: "Show me the map.", target: false }, { name: "Wanderer", text: "She unrolls a map in her grey rain cloak.", target: true }] };

  it("is built from the director's plain words, the current look, the current place and a pose clause, and names no future look or place", async () => {
    const values = { wanderer_outfit: "grey rain cloak" };
    const visual = await bridge.scene({ story, members: ["wanderer"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
    const subject = visual.subjects[0];
    const root = `pack:${packKey(subject.pack!)}`;
    const member = { character: "Wanderer", fields: subject.intended.fields, pack: { root, substituted: false, look: { root, signature: subject.intended.signature,
      base: { ...subject.displayed!.base, key: root, recipe: { id: "visual-pack", version: 1 } } } } };
    const ready = qwenReadiness({ subjects: [{ name: "Wanderer", member }], discovery: discovery({}, { TextEncodeQwenImage21: autogrow }), sprites, visual });
    if (!ready.ok) throw new Error(ready.detail);
    const reply = { caption: "The map", checkpoint: "x", reason: "", visible: ["Wanderer"], aspect: null, shot: null, prompt: "1girl, map, harbor tags", negative: "",
      instruction: "Wanderer kneels on the quay and spreads a map across a crate, pointing at a route." };
    const text = qwenPrompt(ready.ready, withVisualScene(scene, visual), reply, { text: "" });
    expect(text).toContain("Wanderer kneels on the quay");
    expect(text).toContain("Character 1 is Wanderer, current look: outfit: grey rain cloak.");
    expect(text).toContain("Setting: Lantern harbor, A small stone harbor");
    expect(text).toContain("Use the place reference as the background");
    expect(text).toContain(QWEN_POSE_CLAUSE);
    expect(text).not.toMatch(/festival|observatory|telescope|card text|1girl/i);
    expect(ready.ready.plate?.path).toBe("/backgrounds/fixture_harbor_day.png");
  });

  it("falls back to the caption, then the cue and the illustrated reply, when the director wrote no instruction", () => {
    const ready = qwenReadiness({ subjects: [prepared()], discovery: discovery(), sprites, visual: null });
    if (!ready.ok) throw new Error(ready.detail);
    const reply = { caption: "A quiet map reading", checkpoint: "x", reason: "", visible: [], aspect: null, shot: null, prompt: "tags only here", negative: "" };
    expect(qwenPrompt(ready.ready, scene, reply, { text: "" })).toMatch(/^A quiet map reading\./);
    const templated = qwenPrompt(ready.ready, scene, null, { text: "Establishing shot of On the quay." });
    expect(templated).toContain("Establishing shot of On the quay. Moment: She unrolls a map");
    expect(templated).not.toContain("Setting:");
    expect(templated).not.toContain("place reference");
  });
});

test("the Qwen output follows the first reference's shape at the recipe's area, and the reply a picture illustrates is the last character reply", () => {
  expect(qwenOutputSize(600, 1200, 1024)).toEqual({ width: 736, height: 1440 });
  expect(qwenOutputSize(1200, 600, 1024)).toEqual({ width: 1440, height: 736 });
  expect(qwenOutputSize(0, 0, 1024)).toEqual({ width: 1024, height: 1024 });
  const messages = [{ mes: "Hi", is_user: true }, { mes: "Reply", is_user: false }, { mes: "Next", is_user: true }, { mes: "pic", is_system: true }];
  expect(illustratedReply(messages)).toBe(1);
  expect(illustratedReply([{ mes: "Only the player", is_user: true }])).toBe(0);
  expect(illustratedReply([])).toBeNull();
});
