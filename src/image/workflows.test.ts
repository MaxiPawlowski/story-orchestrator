import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ILLUSTRATION_PURPOSES, isValidationErrorList, type StoryV2 } from "@engine/schema";
import { parseStoryV2, parseStoryV2OrThrow } from "@engine/validate";
import type { Purpose } from "./catalog";
import { checkWorkflowGraph, decideWorkflow, isDeniedNode, planBundleInstall, requiredWorkflows, workflowFor, workflowsFor } from "./workflows";

const story = {
  illustrations: { workflows: { portrait: "SO-Portrait.json", background: "Wide.json" } },
  checkpointById: {
    cp1: { effects: {} },
    cp2: { effects: { illustrations: { workflows: { portrait: "SO-Finale.json" } } } },
    cp3: { effects: { illustrations: { workflows: { scene: "Painted.json" } } } },
  },
  checkpoints: [{ effects: { illustrations: { workflows: { portrait: "SO-Finale.json" } } } }],
};

describe("v2.8 29 A: purpose → workflow, last on the path wins", () => {
  it("the purposes match the image catalog's picture types", () => {
    const purposes: Purpose[] = [...ILLUSTRATION_PURPOSES];
    expect(purposes).toHaveLength(6);
  });

  it("starts from the story map and replays checkpoint overrides in path order", () => {
    expect(workflowsFor(story, [])).toEqual({ portrait: "SO-Portrait.json", background: "Wide.json" });
    expect(workflowFor(story, ["cp1", "cp2"], "portrait")).toBe("SO-Finale.json");
    expect(workflowsFor(story, ["cp2", "cp3"])).toEqual({ portrait: "SO-Finale.json", background: "Wide.json", scene: "Painted.json" });
    expect(workflowFor(story, ["cp1"], "free")).toBeNull();
    expect(requiredWorkflows(story)).toEqual(["SO-Finale.json", "SO-Portrait.json", "Wide.json"]);
  });
});

describe("v2.8 29 B: the refusal matrix falls back to the player's own workflow", () => {
  const text = "{\"6\":{\"inputs\":{\"text\":\"%prompt%\"}}}";
  it("uses the mapped workflow only on the comfy source, listed, with a prompt placeholder", () => {
    expect(decideWorkflow({ mapped: "SO-Portrait.json", source: "comfy", listed: ["SO-Portrait.json"], text })).toEqual({ use: "SO-Portrait.json" });
    expect(decideWorkflow({ mapped: "SO-Portrait.json", source: "pollinations", listed: null, text: null })).toMatchObject({ fallback: expect.stringMatching(/ComfyUI source/) });
    expect(decideWorkflow({ mapped: "SO-Portrait.json", source: "comfy", listed: ["Mine.json"], text: null })).toMatchObject({ fallback: expect.stringMatching(/not installed/) });
    expect(decideWorkflow({ mapped: "SO-Portrait.json", source: "comfy", listed: ["SO-Portrait.json"], text: "{\"6\":{}}" })).toMatchObject({ fallback: expect.stringMatching(/%prompt%/) });
    expect(decideWorkflow({ mapped: null, source: "comfy", listed: [], text: null })).toEqual({ fallback: "", mapped: null });
  });
});

describe("v2.8 29 C: bundled workflows are checked and installed create-only", () => {
  const graph = { 1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "illustrious.safetensors" } }, 2: { class_type: "CLIPTextEncode", inputs: { text: "%prompt%" } }, 3: { class_type: "FaceDetailer", inputs: {} } };
  it("lists node classes, the ones this ComfyUI lacks, code/file nodes and the models it loads", () => {
    const check = checkWorkflowGraph(graph, ["CheckpointLoaderSimple", "CLIPTextEncode"]);
    expect(check).toEqual({ nodes: ["CLIPTextEncode", "CheckpointLoaderSimple", "FaceDetailer"], missingNodes: ["FaceDetailer"], deniedNodes: [], hasPrompt: true, models: ["illustrious.safetensors"] });
    expect(checkWorkflowGraph({ 1: { class_type: "ExecutePythonCode", inputs: {} }, 2: { class_type: "LoadTextFile", inputs: {} } }, null).deniedNodes).toEqual(["ExecutePythonCode", "LoadTextFile"]);
    for (const core of ["LoadImage", "SaveImage", "KSampler", "VAEDecode", "UpscaleModelLoader", "ImageScaleBy", "CLIPTextEncode", "LoraLoader", "EmptyLatentImage"]) expect(isDeniedNode(core)).toBe(false);
  });

  it("refuses a node that takes a path, directory, URL or file name, whatever its class is called", () => {
    const refused = [
      { class_type: "Image Save", inputs: { images: ["1", 0], output_path: "C:/Users/x/Startup", filename_prefix: "ComfyUI" } },
      { class_type: "Load Image Batch", inputs: { mode: "single_image", path: "C:/Users/x/Pictures", pattern: "*" } },
      { class_type: "Image Load", inputs: { image_path: "/etc/passwd" } },
      { class_type: "SaveTo", inputs: { saveDir: "/tmp" } },
      { class_type: "Fetch", inputs: { imageUrl: "http://10.0.0.1/" } },
      { class_type: "AudioIn", inputs: { audio_file: "x.wav" } },
    ];
    for (const node of refused) expect(checkWorkflowGraph({ 1: node }, null).deniedNodes).toEqual([node.class_type]);
    const allowed = { 1: { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "SO" } }, 2: { class_type: "LoadImage", inputs: { image: "%char_avatar%" } },
      3: { class_type: "ImageStitch", inputs: { direction: "right", profile: "x" } }, 4: { class_type: "Linked", inputs: { output_path: ["1", 0] } } };
    expect(checkWorkflowGraph(allowed, null).deniedNodes).toEqual([]);
  });

  it("every workflow shipped in the repo still passes the denylist", () => {
    const graphs: Array<[string, Record<string, unknown>]> = [];
    const collect = (value: unknown, where: string): void => {
      if (!value || typeof value !== "object") return;
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.some(([, node]) => node && typeof node === "object" && typeof (node as { class_type?: unknown }).class_type === "string")) graphs.push([where, value as Record<string, unknown>]);
      else for (const [key, child] of entries) collect(child, `${where}.${key}`);
    };
    for (const file of readdirSync(join(process.cwd(), "assets/workflows/poses")).filter((name) => name.endsWith(".json"))) collect(JSON.parse(readFileSync(join(process.cwd(), "assets/workflows/poses", file), "utf8")), file);
    expect(graphs.length).toBeGreaterThanOrEqual(3);
    for (const [where, shipped] of graphs) expect([where, checkWorkflowGraph(shipped, null).deniedNodes]).toEqual([where, []]);
  });

  it("never overwrites: an existing name with other bytes gets a suffixed name, the same bytes are already present", () => {
    const text = JSON.stringify(graph);
    expect(planBundleInstall("SO-P.json", text, [], () => null)).toEqual({ action: "install", name: "SO-P.json" });
    expect(planBundleInstall("SO-P.json", text, ["SO-P.json"], () => JSON.stringify(graph, null, 2))).toEqual({ action: "present", name: "SO-P.json" });
    expect(planBundleInstall("SO-P.json", text, ["SO-P.json", "SO-P-2.json"], (name) => (name === "SO-P.json" ? "{\"x\":1}" : "{\"y\":1}")))
      .toEqual({ action: "install", name: "SO-P-3.json", renamedFrom: "SO-P.json" });
  });
});

describe("v2.8 29 A: validation", () => {
  const base = (illustrations: unknown, checkpointEffects: Record<string, unknown> = { illustrations: { workflows: { portrait: "Finale.json" } } }): StoryV2 => ({
    format: 2, id: "wf", title: "WF", description: "d", roster: [], transitions: [],
    qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
    checkpoints: [{ id: "cp1", name: "One", objective: "o", type: "anchor", start: true, effects: checkpointEffects as never }],
    illustrations: illustrations as never,
  });
  const errors = (json: unknown) => { const parsed = parseStoryV2(json); return isValidationErrorList(parsed) ? parsed : []; };
  it("keeps valid maps and bundles", () => {
    const parsed = parseStoryV2OrThrow(base({ workflows: { scene: "Scene.json" }, bundle: { "Scene.json": { graph: { 1: {} }, sha256: "a".repeat(64) } } }));
    expect(parsed.illustrations?.workflows).toEqual({ scene: "Scene.json" });
    expect(parsed.checkpointById.cp1.effects?.illustrations).toEqual({ workflows: { portrait: "Finale.json" } });
  });
  it("names every bad field by path (a bundle entry is checked, by hash and nodes, only when it is installed)", () => {
    const found = errors(base({ workflows: { scene: "../x.json", hero: "A.json", portrait: "noext" }, bundle: { "B.json": { graph: {}, sha256: "nope" } } },
      { illustrations: { workflows: { scene: 3 }, look: 1 } }));
    expect(found.map((error) => error.path).sort()).toEqual(["checkpoints.0.effects.illustrations.workflows.scene",
      "illustrations.workflows.hero", "illustrations.workflows.portrait", "illustrations.workflows.scene"]);
    expect(errors(base({ bundle: [] })).map((error) => error.path)).toEqual(["illustrations.bundle"]);
  });
});
