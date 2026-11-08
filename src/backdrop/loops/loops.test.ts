import { buildLoopGraph, fitShape, LOOP_NODES, LOOP_SHAPE, LOOP_SHAPES, loopPrefix, loopSeconds } from "./workflow";
import { backgroundWords, loopPrompt } from "./prompt";
import { currentTarget, loopModeOf, nextTarget, preTargets, type LoopStory } from "./plan";
import { loopKey, loopKeyText, loopSeed } from "./key";
import { webcrypto } from "node:crypto";

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("loop workflow", () => {
  const graph = buildLoopGraph({ image: "story-orchestrator/so_x.png", prompt: "lake scene", key: "abc123", seed: 7 }) as Graph;

  it("uses only the allowlisted core nodes and saves one owned WebM", () => {
    const classes = new Set(Object.values(graph).map((node) => node.class_type));
    expect([...classes].every((name) => LOOP_NODES.includes(name))).toBe(true);
    const saves = Object.values(graph).filter((node) => node.class_type === "SaveWEBM");
    expect(saves).toHaveLength(1);
    expect(saves[0].inputs.filename_prefix).toBe(loopPrefix("abc123"));
    expect(graph.latent.inputs).toMatchObject({ width: LOOP_SHAPE.width, height: LOOP_SHAPE.height, length: LOOP_SHAPE.frames, start_image: ["still", 0] });
  });

  it("crossfades the clip's tail into its head so the last frame flows into the first", () => {
    const { frames, blend } = LOOP_SHAPE;
    expect(graph.middle.inputs).toMatchObject({ batch_index: blend, length: frames - 2 * blend });
    const factors = Array.from({ length: blend }, (_, index) => graph[`blend${index}`].inputs.blend_factor as number);
    expect(factors[0]).toBeGreaterThan(0);
    expect(factors[blend - 1]).toBeLessThan(1);
    expect([...factors].sort((a, b) => a - b)).toEqual(factors);
    expect(graph.tail0.inputs.batch_index).toBe(frames - blend);
    expect(graph.head0.inputs.batch_index).toBe(0);
    expect(graph.save.inputs.images).toEqual([`join${blend - 1}`, 0]);
    expect(loopSeconds()).toBeGreaterThanOrEqual(4);
    expect(loopSeconds()).toBeLessThanOrEqual(5);
  });

  it("the lite tier is a short low-cost loop that also saves an animated WebP", () => {
    const lite = buildLoopGraph({ image: "x", prompt: "p", key: "k1", seed: 1, shape: LOOP_SHAPES.lite }) as Graph;
    expect(lite.still_loop).toMatchObject({ class_type: "SaveAnimatedWEBP", inputs: { filename_prefix: loopPrefix("k1"), fps: LOOP_SHAPES.lite.fps } });
    expect(lite.save.class_type).toBe("SaveWEBM");
    expect(loopSeconds(LOOP_SHAPES.lite)).toBeGreaterThanOrEqual(1.5);
    expect(loopSeconds(LOOP_SHAPES.lite)).toBeLessThanOrEqual(2.5);
    expect(LOOP_SHAPES.lite.fps).toBeGreaterThanOrEqual(8);
    expect(LOOP_SHAPES.lite.fps).toBeLessThanOrEqual(12);
    expect(graph.still_loop).toBeUndefined();
  });

  it("fits the loop to the still's own aspect so its framing matches the still", () => {
    const wide = fitShape(LOOP_SHAPE, 1920, 1080);
    expect(wide.width % 32).toBe(0);
    expect(wide.height % 32).toBe(0);
    expect(Math.abs(wide.width / wide.height - 16 / 9)).toBeLessThan(0.06);
    const tall = fitShape(LOOP_SHAPE, 1000, 1500);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(Math.abs(tall.width * tall.height - LOOP_SHAPE.width * LOOP_SHAPE.height) / (LOOP_SHAPE.width * LOOP_SHAPE.height)).toBeLessThan(0.1);
    expect(fitShape(LOOP_SHAPE, 0, 0)).toEqual(LOOP_SHAPE);
  });

  it("refuses shapes Wan or the blend cannot use", () => {
    expect(() => buildLoopGraph({ image: "x", prompt: "p", key: "k", seed: 1, shape: { ...LOOP_SHAPE, frames: 100 } })).toThrow(/4n\+1/);
    expect(() => buildLoopGraph({ image: "x", prompt: "p", key: "k", seed: 1, shape: { ...LOOP_SHAPE, blend: 60 } })).toThrow(/half/);
  });
});

describe("loop prompt", () => {
  it("reads only the background's name and always asks for a still camera; weather is left to the effect layers", () => {
    expect(backgroundWords("forest treehouse fireworks air baloons (by kallmeflocc).jpg")).toBe("forest treehouse fireworks air baloons");
    const prompt = loopPrompt("landscape mountain lake.jpg");
    expect(prompt).toMatch(/^landscape mountain lake scene/);
    expect(prompt).toMatch(/ripples/);
    expect(prompt).not.toMatch(/rain/);
    expect(prompt).toMatch(/static locked-off camera/);
    expect(loopPrompt("_black.jpg")).toMatch(/subtle ambient motion/);
  });
});

describe("loop plan", () => {
  const story: LoopStory = {
    checkpoints: [
      { id: "a", effects: { background: { name: "tavern day.jpg" }, backdrop: { loop: "pre" } } },
      { id: "b", effects: { background: { name: "tavern day.jpg" }, backdrop: { loop: "pre" } } },
      { id: "c", effects: { background: { name: "landscape beach day.png" }, backdrop: { loop: "pre" } } },
      { id: "d", effects: { background: { name: "royal.jpg" }, backdrop: { loop: false } } },
      { id: "e", effects: { background: { name: "japan classroom.jpg" } } },
      { id: "f", effects: { backdrop: { loop: "pre" } } },
    ],
  };

  it("pre-renders each marked background once and skips marks without their own background", () => {
    expect(preTargets(story).map((target) => [target.checkpoint, target.background, target.still])).toEqual([
      ["a", "tavern day.jpg", "/backgrounds/tavern%20day.jpg"], ["c", "landscape beach day.png", "/backgrounds/landscape%20beach%20day.png"]]);
    expect(preTargets(null)).toEqual([]);
  });

  it("animates the current background unless its checkpoint says false; the default is auto", () => {
    expect(currentTarget(story, "d", "/backgrounds/royal.jpg")).toBeNull();
    expect(currentTarget(story, "e", "/backgrounds/japan%20classroom.jpg?t=1")).toMatchObject({ mode: "auto", checkpoint: "e", background: "japan classroom.jpg" });
    expect(currentTarget(story, null, "/backgrounds/bedroom%20red.jpg")).toMatchObject({ mode: "auto", checkpoint: "" });
    expect(currentTarget(story, "e", "")).toBeNull();
    expect(loopModeOf({ backdrop_defaults: { loop: false } }, { id: "x" })).toBe(false);
    expect(loopModeOf({ backdrop_defaults: { loop: false } }, { id: "x", effects: { backdrop: { loop: "auto" } } })).toBe("auto");
  });

  it("serves the current location before the pre-render queue and skips settled ones", () => {
    const pre = preTargets(story);
    const current = currentTarget(story, "e", "/backgrounds/japan%20classroom.jpg");
    expect(nextTarget(current, pre, new Set())?.background).toBe("japan classroom.jpg");
    expect(nextTarget(current, pre, new Set(["/backgrounds/japan%20classroom.jpg"]))?.background).toBe("tavern day.jpg");
    expect(nextTarget(null, pre, new Set(pre.map((target) => target.still)))).toBeNull();
  });
});

describe("loop key", () => {
  beforeAll(() => { if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }); });

  it("changes with the still's content, the prompt and the shape, and is stable otherwise", async () => {
    const key = await loopKey("h1", "p");
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(await loopKey("h1", "p")).toBe(key);
    expect(await loopKey("h2", "p")).not.toBe(key);
    expect(await loopKey("h1", "q")).not.toBe(key);
    expect(await loopKey("h1", "p", { ...LOOP_SHAPE, steps: 10 })).not.toBe(key);
    expect(loopKeyText("h1", "p")).toContain("wan2.2-ti2v-5b");
    expect(loopSeed(key)).toBeGreaterThanOrEqual(0);
  });
});
