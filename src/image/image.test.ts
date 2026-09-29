import { CHECKPOINTS, FAMILIES, FLUX, JANKU, WAI } from "./catalog";
import { buildGraph } from "./graph";
import { imageMessages, sceneForImage } from "./prompt";
import { resolveImageRoute } from "./routing";
import { automationAllowsCues, defaultImageSettings, sanitizeImageChatState, sanitizeImageOverride, sanitizeImageSettings } from "./settings";
import { visualLore } from "./lore";

const graph = (file: string, hires = false) => {
  const checkpoint = CHECKPOINTS.find((entry) => entry.file === file)!;
  return buildGraph({ checkpoint, family: FAMILIES[checkpoint.family], loras: [], positive: "a forest path", negative: "blurry", size: { width: 832, height: 1216 }, seed: 3, hires, upscaler: FAMILIES[checkpoint.family].upscaler });
};

describe("Image Director merge", () => {
  it("preserves the proven SDXL and FLUX graph routes and the hi-res pass", () => {
    const sdxl = Object.values(graph(WAI));
    expect(sdxl.some((node) => node.class_type === "CLIPTextEncode" && node.inputs.text === "blurry")).toBe(true);
    const flux = Object.values(graph(FLUX));
    expect(flux.some((node) => node.class_type === "FluxGuidance")).toBe(true);
    expect(flux.some((node) => node.class_type === "ConditioningZeroOut")).toBe(true);
    expect(Object.values(graph(JANKU, true)).filter((node) => node.class_type === "KSampler")).toHaveLength(2);
    expect(Object.values(graph(WAI)).at(-1)?.class_type).toBe("PreviewImage");
  });

  it("keeps a pinned chat checkpoint and drops an incompatible LoRA rather than changing the user's choice", () => {
    const settings = defaultImageSettings();
    settings.loras = [{ file: "flux-style.safetensors", label: "Style", base: "flux", kind: "style", triggerWords: ["watercolor"], weight: { default: 0.8, min: 0, max: 1 } }];
    const route = resolveImageRoute(settings, "scene", {}, { ...sanitizeImageOverride(null), checkpoint: JANKU, loras: [{ file: "flux-style.safetensors", weight: 0.8 }] }, null);
    expect(route.checkpoint.file).toBe(JANKU);
    expect(route.loras).toHaveLength(0);
    expect(route.warnings).toEqual(expect.arrayContaining([expect.stringContaining("dropped")]));
  });

  it("migrates a legacy image route while leaving automatic images off until validated", () => {
    const legacy = { ...defaultImageSettings(), enabled: true, purposes: { ...defaultImageSettings().purposes, scene: { ...defaultImageSettings().purposes.scene, checkpoint: JANKU } } };
    const settings = { ...sanitizeImageSettings(legacy), enabled: false };
    expect(settings.purposes.scene.checkpoint).toBe(JANKU);
    expect(settings.enabled).toBe(false);
  });

  it("targets the reply, not the previous generated-image post or a muted future group member", () => {
    const scene = sceneForImage({
      id: "chat-1", groupId: "g", folder: "g", userName: "Player",
      messages: [
        { name: "Player", mes: "Where are we?", is_user: true, is_system: false },
        { name: "Tobias", mes: "At the gates of Wendhope.", is_user: false, is_system: false, original_avatar: "t.png" },
        { name: "Image Director", mes: "Some image", is_user: false, is_system: true },
      ],
      characters: [
        { key: "t.png", name: "Tobias", appearance: "short brown hair", description: "", enabled: true },
        { key: "future.png", name: "Future", appearance: "secret", description: "", enabled: false },
      ],
    }, { purpose: "scene", text: "", messageId: null }, 6, "At the walls", "Wendhope");
    expect(scene.target).toBe(1);
    expect(scene.subjects.map((subject) => subject.name)).toEqual(["Tobias"]);
    expect(scene.location).toBe("Wendhope");
  });

  it("uses only visible appearance lines and the current path's gated entry in scan mode", () => {
    const lines = visualLore([
      { world: "Adolion World", comment: "Wendhope", key: ["Wendhope"], content: "Secret plot: the king is a spy.\nAppearance: misty stone walls." },
      { world: "Adolion CP", comment: "Wendhope Gate", key: ["Wendhope Gate"], content: "Appearance: iron gate with ivy.", disable: true },
      { world: "Adolion CP", comment: "Locked Future", key: ["Wendhope Gate"], content: "Appearance: a future castle.", disable: true },
    ], ["Adolion World", "Adolion CP"], [{ lorebook: "Adolion CP", enable: ["Wendhope Gate"] }], "The party arrives at Wendhope Gate.");
    expect(lines).toEqual(["Wendhope: misty stone walls.", "Wendhope Gate: iron gate with ivy."]);
    expect(lines.join(" ")).not.toMatch(/king|future castle/i);
  });
  it("passes authored visual style to the image director and keeps chat pause off by default", () => {
    const scene = sceneForImage({ id: "one", groupId: null, folder: "one", userName: "Player", messages: [], characters: [] },
      { purpose: "scene", text: "", messageId: null }, 6);
    scene.visualStyle = "Soft watercolor and candlelight";
    const route = resolveImageRoute(defaultImageSettings(), "scene", {}, sanitizeImageOverride(null), null);
    expect(imageMessages({ purpose: "scene", text: "", messageId: null }, scene, route)[1].content).toContain("Soft watercolor and candlelight");
    expect(sanitizeImageOverride(null).paused).toBe(false);
    expect(sanitizeImageOverride({ paused: true }).paused).toBe(true);
  });
  it("lets a story's checkpoint and scene cues ride the every-N cadence, not only the story mode", () => {
    expect(automationAllowsCues("story")).toBe(true);
    expect(automationAllowsCues("everyN")).toBe(true);
    expect(automationAllowsCues("manual")).toBe(false);
    expect(automationAllowsCues("tool")).toBe(false);
  });
  it("keeps image counters and cue keys with their own chat", () => {
    const state = { chatId: "chat-a", override: { paused: true }, emitted: ["chat-a:story:checkpoint:0", "chat-b:story:checkpoint:0"], automationCount: 4 };
    expect(sanitizeImageChatState(state, "chat-a", "story")).toMatchObject({ override: { paused: true }, emitted: ["chat-a:story:checkpoint:0"], automationCount: 4 });
    expect(sanitizeImageChatState(state, "chat-b")).toMatchObject({ override: { paused: false }, emitted: [], automationCount: 0 });
    expect(sanitizeImageChatState({ ...state, chatId: undefined }, "chat-a").emitted).toEqual(["chat-a:story:checkpoint:0"]);
    expect(sanitizeImageChatState({ ...state, emitted: ["chat-a:story:checkpoint:0", "chat-a:other:checkpoint:0"] }, "chat-a", "story").emitted)
      .toEqual(["chat-a:story:checkpoint:0"]);
  });
});
