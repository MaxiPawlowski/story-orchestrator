import { checkpointFor, FAMILIES } from "./catalog";
import { buildGraph } from "./graph";
import { assembleImagePrompt, imageMessages, sceneForImage } from "./prompt";
import { resolveImageRoute } from "./routing";
import { automationAllowsCues, defaultImageSettings, messageAlreadyDrawn, sanitizeImageChatState, sanitizeImageOverride, sanitizeImageSettings } from "./settings";
import { firedLoreKeys, visualLore } from "./lore";

const WAI = "waiIllustriousSDXL_v170.safetensors";
const JANKU = "JANKUTrainedChenkinNoobai_v777.safetensors";
const graph = (file: string, family: string, hires = false) => {
  const checkpoint = checkpointFor(file, family);
  return buildGraph({ checkpoint, family: FAMILIES[checkpoint.family], loras: [], positive: "a forest path", negative: "blurry", size: { width: 832, height: 1216 }, seed: 3, hires, upscaler: "4x_anime.pth" });
};

describe("Image Director automatic triggers (plan 16/18 repair)", () => {
  const chat = (media: unknown[]) => ({ messages: [{ extra: { media } }] }) as never;

  it("collapses a cadence trigger and a cue on the same reply to one illustration", () => {
    // The first automatic trigger draws the reply; the second sees the media and stays out.
    expect(messageAlreadyDrawn(chat([]), 0)).toBe(false);
    expect(messageAlreadyDrawn(chat([{ url: "/a.png" }]), 0)).toBe(true);
    // Control: a chat with no media, and the opening cue with no target, are never skipped by this guard.
    expect(messageAlreadyDrawn(chat([]), 0)).toBe(false);
    expect(messageAlreadyDrawn(chat([{ url: "/a.png" }]), null)).toBe(false);
  });
});

describe("Image Director merge", () => {
  it("builds the SDXL graph with its negative prompt and the hi-res pass", () => {
    const sdxl = Object.values(graph(WAI, "sdxl-illustrious"));
    expect(sdxl.some((node) => node.class_type === "CLIPTextEncode" && node.inputs.text === "blurry")).toBe(true);
    expect(sdxl.some((node) => node.class_type === "EmptyLatentImage")).toBe(true);
    expect(Object.values(graph(JANKU, "sdxl-noobai", true)).filter((node) => node.class_type === "KSampler")).toHaveLength(2);
    expect(Object.values(graph(WAI, "sdxl-illustrious")).at(-1)?.class_type).toBe("PreviewImage");
  });

  it("keeps a pinned chat checkpoint and drops a LoRA the install does not list", () => {
    const route = resolveImageRoute(defaultImageSettings(), "scene", {}, { ...sanitizeImageOverride(null), checkpoint: JANKU, loras: [{ file: "gone.safetensors", weight: 0.8 }] }, null);
    expect(route.checkpoint.file).toBe(JANKU);
    expect(route.loras).toHaveLength(0);
    expect(route.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Missing LoRA")]));
  });

  it("draws backgrounds with the SDXL wide row: default checkpoint, no people, tag prompt", () => {
    const settings = defaultImageSettings();
    expect(settings.purposes.background).toMatchObject({ checkpoint: "", family: "sdxl-illustrious", aspect: "wide", shot: "wide", placement: "background", extraPositive: "no humans, scenery" });
    expect(settings.backend).toBe("st");
    const route = resolveImageRoute(settings, "background", {}, sanitizeImageOverride(null), null);
    expect(route.family.id).toBe("sdxl-illustrious");
    const { positive, negative } = assembleImagePrompt(route, null, "a ruined temple at dusk");
    expect(positive).toContain("no humans, scenery");
    expect(positive.split(", ").length).toBeGreaterThan(3);
    expect(negative).toContain("worst quality");
    expect(Object.values(FAMILIES).map((family) => family.id)).toEqual(["sdxl-illustrious", "sdxl-noobai"]);
    expect(Object.values(settings.purposes).every((row) => row.checkpoint === "" && row.family in FAMILIES)).toBe(true);
  });

  it("falls a stored FLUX choice back to the default and records it for the Repair row", () => {
    const stored = {
      ...defaultImageSettings(),
      purposes: { ...defaultImageSettings().purposes, background: { ...defaultImageSettings().purposes.background, checkpoint: "flux1-dev-fp8.safetensors", family: "flux-dev" } },
      characters: { "belle.png": { checkpoint: "flux1-dev-fp8.safetensors" } },
      loras: [{ file: "flux-style.safetensors", label: "Style", base: "flux", kind: "style", triggerWords: [], weight: { default: 0.8, min: 0, max: 1 } }],
    };
    const settings = sanitizeImageSettings(stored);
    expect(settings.purposes.background).toEqual(defaultImageSettings().purposes.background);
    expect(settings.characters["belle.png"].checkpoint).toBe("");
    expect(settings.loras).toEqual([]);
    expect(settings.retired).toEqual([
      { where: "background", was: "flux1-dev-fp8.safetensors" },
      { where: "character belle.png", was: "flux1-dev-fp8.safetensors" },
      { where: "LoRA", was: "flux-style.safetensors" },
    ]);
    expect(sanitizeImageSettings(settings).retired).toEqual(settings.retired);
    expect(sanitizeImageSettings({ ...defaultImageSettings(), purposes: { background: { family: "flux-dev" } } }).retired).toEqual([{ where: "background", was: "flux-dev" }]);
    expect(sanitizeImageOverride({ checkpoint: "flux1-dev-fp8.safetensors" }).checkpoint).toBe("");
  });

  it("control: an ordinary SDXL install records nothing retired", () => {
    const legacy = { ...defaultImageSettings(), purposes: { ...defaultImageSettings().purposes, scene: { ...defaultImageSettings().purposes.scene, checkpoint: JANKU, family: "sdxl-noobai" } } };
    expect(sanitizeImageSettings(legacy).retired).toEqual([]);
    expect(sanitizeImageSettings(legacy).purposes.scene).toMatchObject({ checkpoint: JANKU, family: "sdxl-noobai" });
  });

  it("migrates a legacy image route and keeps the stored on/off choice", () => {
    const legacy = { ...defaultImageSettings(), purposes: { ...defaultImageSettings().purposes, scene: { ...defaultImageSettings().purposes.scene, checkpoint: JANKU } } };
    expect(sanitizeImageSettings({ ...legacy, enabled: true })).toMatchObject({ enabled: true, purposes: { scene: { checkpoint: JANKU } } });
    expect(sanitizeImageSettings({ ...legacy, enabled: false })).toMatchObject({ enabled: false, purposes: { scene: { checkpoint: JANKU } } });
    const unset: Record<string, unknown> = { ...legacy };
    delete unset.enabled;
    expect(sanitizeImageSettings(unset).enabled).toBe(defaultImageSettings().enabled);
    expect(sanitizeImageSettings({ ...legacy, enabled: "no" }).enabled).toBe(defaultImageSettings().enabled);
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
      { world: "Adolion World", uid: 1, comment: "Wendhope", key: ["Wendhope"], content: "Secret plot: the king is a spy.\nAppearance: misty stone walls." },
      { world: "Adolion CP", uid: 2, comment: "Wendhope Gate", key: ["Wendhope Gate"], content: "Appearance: iron gate with ivy.", disable: true },
      { world: "Adolion CP", uid: 3, comment: "Locked Future", key: ["Wendhope Gate"], content: "Appearance: a future castle.", disable: true },
    ], ["Adolion World", "Adolion CP"], [{ lorebook: "Adolion CP", enable: ["Wendhope Gate"] }], "The party arrives at Wendhope Gate.",
    firedLoreKeys([{ entries: [{ book: "Adolion World", uid: 1 }, { book: "Adolion CP", uid: 2 }, { book: "Adolion CP", uid: 3 }] }]));
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
