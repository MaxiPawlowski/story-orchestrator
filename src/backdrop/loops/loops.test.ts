import { buildLoopGraph, centerCrop, fitShape, LOOP_ANCHOR_FRAMES, LOOP_NODES, LOOP_SHAPE, LOOP_SHAPES, loopFrames, loopPrefix, loopSeconds } from "./workflow";
import { backgroundWords, loopPrompt } from "./prompt";
import { currentTarget, loopModeOf, nextTarget, preTargets, type LoopStory } from "./plan";
import { loopKey, loopKeyText, loopSeed } from "./key";
import { cinemagraphAuto, CINEMAGRAPH_FLOW, CINEMAGRAPH_FRAGMENT, CINEMAGRAPH_PERIOD_S } from "./cinemagraph";
import { webcrypto } from "node:crypto";

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("loop workflow", () => {
  const graph = buildLoopGraph({ image: "story-orchestrator/so_x.png", prompt: "lake scene", key: "abc123", seed: 7 }) as Graph;
  const latentFrames = (LOOP_SHAPE.frames - 1) / 4 + 1;

  it("uses only the allowlisted core nodes and saves one owned, colour-tagged MP4", () => {
    const classes = new Set(Object.values(graph).map((node) => node.class_type));
    expect([...classes].every((name) => LOOP_NODES.includes(name))).toBe(true);
    const saves = Object.values(graph).filter((node) => node.class_type === "SaveVideo");
    expect(saves).toHaveLength(1);
    expect(saves[0].inputs).toMatchObject({ filename_prefix: loopPrefix("abc123"), format: "mp4", "format.codec": "h264", "format.codec.encoding": "re-encode" });
    expect(graph.video.inputs).toMatchObject({ color_space: "sRGB", bit_depth: 8, fps: LOOP_SHAPE.fps });
    expect(graph.latent.inputs).toMatchObject({ width: LOOP_SHAPE.width, height: LOOP_SHAPE.height, length: LOOP_SHAPE.frames, start_image: ["still", 0] });
  });

  it("pins the still as both the first and the last latent frame, so the clip starts and ends on the still", () => {
    expect(graph.held.inputs).toMatchObject({ image: ["still", 0], amount: LOOP_ANCHOR_FRAMES + 1 });
    expect(graph.end_latent.inputs).toMatchObject({ samples: ["held_latent", 0], dim: "t", index: 1, amount: 1 });
    expect(graph.anchored.inputs).toMatchObject({ destination: ["latent", 0], source: ["end_latent", 0], index: latentFrames - 1 });
    expect([graph.keep_first.inputs.batch_size, graph.free.inputs.batch_size, graph.keep_last.inputs.batch_size]).toEqual([1, latentFrames - 2, 1]);
    expect([graph.keep_first.inputs.color, graph.free.inputs.color, graph.keep_last.inputs.color]).toEqual([0, 0xffffff, 0]);
    expect(graph.sample.inputs.latent_image).toEqual(["masked", 0]);
    expect(graph.masked.inputs).toEqual({ samples: ["anchored", 0], mask: ["mask", 0] });
  });

  it("drops only the held tail chunk, so the loop wraps from motion back onto the still with no crossfade", () => {
    expect(graph.loop.inputs).toEqual({ image: ["frames", 0], batch_index: 0, length: LOOP_SHAPE.frames - LOOP_ANCHOR_FRAMES });
    expect(Object.values(graph).some((node) => node.class_type === "ImageBlend")).toBe(false);
    expect(graph.graded.inputs).toMatchObject({ image_target: ["loop", 0], image_ref: ["still", 0], source_stats: "uniform" });
    expect(graph.video.inputs.images).toEqual(["graded", 0]);
    expect(loopSeconds()).toBeGreaterThanOrEqual(4);
    expect(loopSeconds()).toBeLessThanOrEqual(5);
  });

  it("the lite tier is a short low-cost loop that also saves an animated WebP", () => {
    const lite = buildLoopGraph({ image: "x", prompt: "p", key: "k1", seed: 1, shape: LOOP_SHAPES.lite }) as Graph;
    expect(lite.still_loop).toMatchObject({ class_type: "SaveAnimatedWEBP", inputs: { images: ["graded", 0], filename_prefix: loopPrefix("k1"), fps: LOOP_SHAPES.lite.fps } });
    expect(lite.still_loop.inputs.quality).toBeGreaterThanOrEqual(85);
    expect(lite.save.class_type).toBe("SaveVideo");
    expect(loopFrames(LOOP_SHAPES.lite)).toBe(LOOP_SHAPES.lite.frames - LOOP_ANCHOR_FRAMES);
    expect(loopSeconds(LOOP_SHAPES.lite)).toBeGreaterThanOrEqual(1.5);
    expect(loopSeconds(LOOP_SHAPES.lite)).toBeLessThanOrEqual(2.5);
    expect(LOOP_SHAPES.lite.fps).toBeGreaterThanOrEqual(8);
    expect(LOOP_SHAPES.lite.fps).toBeLessThanOrEqual(12);
    expect(graph.still_loop).toBeUndefined();
  });

  it("fits the loop to the still's exact aspect when a 32-pixel grid allows it", () => {
    for (const [width, height] of [[1344, 768], [1920, 1080], [1536, 1024], [1024, 768]]) {
      for (const tier of [LOOP_SHAPES.full, LOOP_SHAPES.lite]) {
        const fit = fitShape(tier, width, height);
        expect(fit.width % 32).toBe(0);
        expect(fit.height % 32).toBe(0);
        expect(Math.abs(fit.width / fit.height - width / height) / (width / height)).toBeLessThan(0.006);
        expect((fit.width * fit.height) / (tier.width * tier.height)).toBeGreaterThanOrEqual(0.7);
      }
    }
    expect(fitShape(LOOP_SHAPE, 1344, 768)).toMatchObject({ width: 896, height: 512 });
    const tall = fitShape(LOOP_SHAPE, 1000, 1500);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(fitShape(LOOP_SHAPE, 0, 0)).toEqual(LOOP_SHAPE);
  });

  it("crops the still the way the stage covers it, centred", () => {
    expect(centerCrop(1344, 768, 896, 512)).toEqual({ x: 0, y: 0, width: 1344, height: 768 });
    const wide = centerCrop(2000, 768, 896, 512);
    expect(wide.height).toBe(768);
    expect(wide.x).toBeCloseTo((2000 - 1344) / 2, 6);
  });

  it("refuses frame counts Wan cannot use", () => {
    expect(() => buildLoopGraph({ image: "x", prompt: "p", key: "k", seed: 1, shape: { ...LOOP_SHAPE, frames: 100 } })).toThrow(/4n\+1/);
    expect(() => buildLoopGraph({ image: "x", prompt: "p", key: "k", seed: 1, shape: { ...LOOP_SHAPE, frames: 13 } })).toThrow(/17/);
  });
});

describe("cinemagraph", () => {
  it("keeps the ripple periodic with the loop", () => {
    expect(CINEMAGRAPH_FRAGMENT).toContain("TAU * 2.0 * u_time / u_period");
    expect(Number.isInteger(CINEMAGRAPH_FLOW.rippleCycles)).toBe(true);
    expect(CINEMAGRAPH_PERIOD_S).toBeGreaterThan(0);
  });

  it("samples only inside its own region, follows the stage camera, tint and vignette, and outputs premultiplied colour", () => {
    expect(CINEMAGRAPH_FRAGMENT).toMatch(/so_cg_take\(vec2 from/);
    expect(CINEMAGRAPH_FRAGMENT).toContain("u_cam");
    expect(CINEMAGRAPH_FRAGMENT).toContain("u_tint");
    expect(CINEMAGRAPH_FRAGMENT).toContain("outColor = vec4(color * alpha, alpha)");
  });

  it("keys the layer by its mask so a new scene gets a new layer instead of the old mask", () => {
    const input = (maskUrl: string) => ({ state: {} as never, base: { kind: "image" as const, url: "/bg.jpg", key: "k" }, assets: { maskUrl },
      settings: { enabled: true, effects: true, parallax: true, loops: "full" as const, intensity: 0.5, dimBehindChat: true } });
    const a = cinemagraphAuto(input("/a.png"));
    const b = cinemagraphAuto(input("/b.png"));
    expect(a?.params.mask).toBe("/a.png");
    expect(a?.id).not.toBe(b?.id);
    expect(cinemagraphAuto({ ...input("/a.png"), assets: { maskUrl: "/a.png", loopUrl: "/l.mp4" } })).toBeNull();
  });
});

describe("loop prompt", () => {
  it("reads only the background's name, asks for a still camera and invents nothing the name does not mention", () => {
    expect(backgroundWords("forest treehouse fireworks air baloons (by kallmeflocc).jpg")).toBe("forest treehouse fireworks air baloons");
    const prompt = loopPrompt("landscape mountain lake.jpg");
    expect(prompt).toMatch(/^landscape mountain lake scene/);
    expect(prompt).toMatch(/ripples/);
    expect(prompt).not.toMatch(/rain|snow|stars|smoke|banners|candle/);
    expect(prompt).toMatch(/static locked-off/);
    expect(loopPrompt("castle hall night.jpg")).not.toMatch(/flame|stars|moon/);
    expect(loopPrompt("_black.jpg")).toMatch(/almost still/);
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
