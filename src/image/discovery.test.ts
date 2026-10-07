import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { familyOf, FAMILIES, resolveCheckpointFile, resolutionProblem, resolveUpscaler } from "./catalog";
import { imageMessages, type ImageScene } from "./prompt";
import { resolveImageRoute } from "./routing";
import { defaultImageSettings, sanitizeImageOverride, sanitizeImageSettings, type ImageSettings } from "./settings";

const WAI = "waiIllustriousSDXL_v170.safetensors";
const JANKU = "JANKUTrainedChenkinNoobai_v777.safetensors";
const ROOT = join(__dirname, "..", "..");

describe("plan 32 W2: route B resolves its model from discovery", () => {
  it("recognises a checkpoint's recipe family from its file name, NoobAI before Illustrious", () => {
    expect(familyOf(WAI)).toBe("sdxl-illustrious");
    expect(familyOf("hassakuIllustrious_v2.safetensors")).toBe("sdxl-illustrious");
    expect(familyOf(JANKU)).toBe("sdxl-noobai");
    expect(familyOf("noobaiXLIllustrious_vPred10.safetensors")).toBe("sdxl-noobai");
    expect(familyOf("dreamshaper_8.safetensors")).toBeNull();
  });

  it("refuses with none, picks the one, and asks with several unmapped SDXL checkpoints", () => {
    expect(resolveCheckpointFile("", "sdxl-illustrious", [])).toMatchObject({ ok: false, problem: "none" });
    expect(resolveCheckpointFile("", "sdxl-illustrious", ["dreamshaper_8.safetensors", JANKU])).toMatchObject({ ok: false, problem: "none" });
    expect(resolveCheckpointFile("", "sdxl-illustrious", [JANKU, WAI])).toEqual({ ok: true, file: WAI, source: "discovered" });
    const several = resolveCheckpointFile("", "sdxl-illustrious", [WAI, "hassakuIllustrious_v2.safetensors", "novaAnimeIllustrious.safetensors"]);
    expect(several).toMatchObject({ ok: false, problem: "several", found: [WAI, "hassakuIllustrious_v2.safetensors", "novaAnimeIllustrious.safetensors"] });
    if (!several.ok) expect(resolutionProblem("scene", several)).toBe(`scene: several SDXL · Illustrious models are installed (${WAI}, hassakuIllustrious_v2.safetensors, novaAnimeIllustrious.safetensors), choose one`);
  });

  it("uses a mapping only when it is installed, and never substitutes another file for it", () => {
    expect(resolveCheckpointFile("custom.safetensors", "sdxl-illustrious", ["custom.safetensors", WAI])).toEqual({ ok: true, file: "custom.safetensors", source: "mapped" });
    const missing = resolveCheckpointFile("gone.safetensors", "sdxl-illustrious", [WAI]);
    expect(missing).toMatchObject({ ok: false, problem: "missing" });
    if (!missing.ok) expect(resolutionProblem("portrait", missing)).toBe("portrait: gone.safetensors is not installed on this ComfyUI");
  });

  it("takes an upscaler only when discovered", () => {
    const family = FAMILIES["sdxl-illustrious"];
    expect(resolveUpscaler("", family, [])).toBeNull();
    expect(resolveUpscaler("", family, ["4x-UltraSharp.pth"])).toBe("4x-UltraSharp.pth");
    expect(resolveUpscaler("", family, ["4x-UltraSharp.pth", "RealESRGAN_x4plus_anime_6B.pth"])).toBe("RealESRGAN_x4plus_anime_6B.pth");
    expect(resolveUpscaler("mine.pth", family, ["4x-UltraSharp.pth"])).toBeNull();
  });

  it("ships rows with a family and no file, and keeps a user's own mapping", () => {
    const defaults = defaultImageSettings();
    expect(Object.values(defaults.purposes).map((row) => row.checkpoint)).toEqual(["", "", "", "", "", ""]);
    expect(defaults.purposes.background).toMatchObject({ family: "sdxl-illustrious", aspect: "wide", extraPositive: "no humans, scenery" });
    const mapped = sanitizeImageSettings({ ...defaults, purposes: { ...defaults.purposes, portrait: { ...defaults.purposes.portrait, checkpoint: JANKU, family: "sdxl-noobai" } } });
    expect(mapped.purposes.portrait).toMatchObject({ checkpoint: JANKU, family: "sdxl-noobai" });
    expect(sanitizeImageSettings({ purposes: { background: { family: "flux-dev", checkpoint: "flux1-dev.safetensors" } } }).purposes.background)
      .toEqual(defaults.purposes.background);
  });
});

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
});
const MODEL_FILE = /["'`][^"'`\n]*\.(?:safetensors|ckpt|gguf|pth)["'`]/;

describe("plan 32 W2 guard: no model file names in shipped image code", () => {
  it("finds no model file literal in src/image outside tests", () => {
    const hits = sourceFiles(join(ROOT, "src", "image")).filter((file) => MODEL_FILE.test(readFileSync(file, "utf-8")));
    expect(hits).toEqual([]);
  });

  it("control: the matcher sees a planted model file name", () => {
    expect(MODEL_FILE.test(`export const WAI = "${WAI}";`)).toBe(true);
    expect(MODEL_FILE.test("const label = file.replace(/\\.[a-z0-9]+$/i, \"\");")).toBe(false);
  });
});

describe("plan 32 W2 payload invariance: the image director prompt", () => {
  const golden = JSON.parse(readFileSync(join(ROOT, "test", "goldens", "image", "director-prompt-before-v27-32.json"), "utf-8")) as Record<string, Array<{ role: string; content: string }>>;
  const scene: ImageScene = {
    target: 1, focus: "t.png", location: "Wendhope", checkpoint: "At the walls", visualStyle: "Soft watercolor",
    messages: [{ name: "Player", text: "Where are we?", target: false }, { name: "Tobias", text: "At the gates of Wendhope.", target: true }],
    subjects: [{ key: "t.png", name: "Tobias", appearance: "short brown hair", focus: true }],
    visualDetails: ["Wendhope: misty stone walls."],
  };
  const purposes = ["scene", "portrait", "background"] as const;
  const messages = (settings: ImageSettings, purpose: typeof purposes[number]) => imageMessages(
    { purpose, text: purpose === "background" ? "a ruined temple" : "", messageId: 1 }, scene,
    resolveImageRoute(settings, purpose, {}, sanitizeImageOverride(null), null));
  const declared = (content: string) => content
    .replace(/^The checkpoint must be one of: .*$/m, "<MODEL CHOICE>")
    .replace(/AVAILABLE IMAGE MODELS:\n[\s\S]*?\n\n/, "<MODEL MENU>\n\n");

  it("is byte-identical outside the declared model lines on the default install", () => {
    for (const purpose of purposes) {
      const now = messages(defaultImageSettings(), purpose);
      expect(now.map((message) => message.role)).toEqual(golden[purpose].map((message) => message.role));
      expect(now.map((message) => declared(message.content))).toEqual(golden[purpose].map((message) => declared(message.content)));
    }
  });

  it("names the row's recipe family in the declared lines when no model is mapped", () => {
    const [system, user] = messages(defaultImageSettings(), "scene");
    expect(system.content).toContain("The checkpoint must be one of: sdxl-illustrious. Use the default sdxl-illustrious unless");
    expect(user.content).toContain("AVAILABLE IMAGE MODELS:\nsdxl-illustrious (SDXL · Illustrious; Anime, characters, action and scenery.)\n\n");
  });

  it("keeps the old system prompt byte for byte once the same models are mapped", () => {
    const defaults = defaultImageSettings();
    const mapped: ImageSettings = { ...defaults, purposes: { ...defaults.purposes,
      scene: { ...defaults.purposes.scene, checkpoint: WAI },
      portrait: { ...defaults.purposes.portrait, checkpoint: JANKU, family: "sdxl-noobai" },
      background: { ...defaults.purposes.background, checkpoint: WAI } } };
    expect(messages(mapped, "portrait")[0].content).toBe(golden.portrait[0].content);
    expect(messages(mapped, "background")[0].content).toBe(golden.background[0].content);
    expect(messages(mapped, "scene")[0].content).toBe(golden.scene[0].content);
    expect(messages(mapped, "scene")[1].content).toContain(`${JANKU} (JANKUTrainedChenkinNoobai_v777; Detailed portraits and faces.)`);
  });
});
