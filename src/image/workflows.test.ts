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
