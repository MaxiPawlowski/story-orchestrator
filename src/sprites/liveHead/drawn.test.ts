import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../builder/pixels";
import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";
import { restHead, type HeadParameters } from "./drivers";
import { DrawnDirector, classifyVowel, cutDrawn, drawnLineage, prepareDrawn, type DrawnDeps, type DrawnName, type DrawnSource } from "./drawn";
import { attachHead, type HeadSurface } from "./mount";
import { HeadRenderer } from "./renderer";
import { syntheticHead, syntheticRef } from "./synthetic";
import { syntheticFrames } from "./syntheticFrames";
import type { HeadAssetDeps } from "./load";

const rig = syntheticHead.rig;
function syntheticArt(): PixelImage {
  const { width, height } = rig.image, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4, eye = rig.eyes.some((entry) => x >= entry.x0 && x <= entry.x1 && Math.abs(y - 55) < 4);
    const lip = Math.abs(y - rig.mouth.cy) < 1 && Math.abs(x - rig.mouth.cx) < rig.mouth.halfLen;
    const colour = eye ? [60, 96, 170] : lip ? [168, 70, 78] : [236, 200, 90 + ((x * 7 + y * 3) % 11) * 12];
    data.set([...colour, 255], offset);
  }
  return { width, height, data };
}
const shift = (image: PixelImage, dx: number): PixelImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const from = (y * image.width + Math.min(image.width - 1, Math.max(0, x - dx))) * 4;
    data.set(image.data.subarray(from, from + 4), (y * image.width + x) * 4);
  }
  return { ...image, data };
};
const pad = (image: PixelImage, box: { x: number; y: number }, width: number, height: number): PixelImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < image.height; y++) data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((box.y + y) * width + box.x) * 4);
  return { width, height, data };
};
const guard = (check = () => true): RunGuard => ({ signal: new AbortController().signal, stillOwns: check, release: () => undefined, lapsed: () => null, lapsedDetail: () => null });

describe("cutting plan 19 frames into drawn sprites", () => {
  const art = syntheticArt(), frames = syntheticFrames(art, rig);
  test("blink and the four mouth frames become per-eye closed sprites and four mouths, premultiplied", () => {
    const { sprites, refused } = cutDrawn(rig, art, frames);
    expect(refused).toEqual([]);
    expect(sprites.map((sprite) => sprite.name)).toEqual(["eyes_closed_0", "eyes_closed_1", "mouth_talk", "mouth_talk2", "mouth_o", "mouth_wide"]);
    for (const sprite of sprites) {
      expect(sprite.pixels.length).toBe(sprite.rect[2] * sprite.rect[3] * 4);
      for (let i = 0; i < sprite.pixels.length; i += 4) expect(Math.max(sprite.pixels[i], sprite.pixels[i + 1], sprite.pixels[i + 2])).toBeLessThanOrEqual(sprite.pixels[i + 3]);
    }
    const eye = sprites[0], center = ((55 - eye.rect[1]) * eye.rect[2] + (46 - eye.rect[0])) * 4;
    expect(eye.pixels[center + 3]).toBe(255);
    expect(eye.pixels[center + 2]).toBeLessThan(170);
  });
  test("a head box crops full-size frames to the bust; a mismatched size or box is refused", () => {
    const box = { x: 30, y: 12, width: rig.image.width, height: rig.image.height };
    const full = Object.fromEntries(Object.entries(frames).map(([key, image]) => [key, pad(image, box, 200, 240)]));
    expect(cutDrawn(rig, art, full, box).sprites.map((sprite) => sprite.pixels)).toEqual(cutDrawn(rig, art, frames).sprites.map((sprite) => sprite.pixels));
    expect(cutDrawn(rig, art, full).refused).toEqual(["blink", "talk", "talk2", "mouth_o", "mouth_wide"].map((key) => `${key}: frame size differs from the rig artwork`));
    expect(cutDrawn(rig, art, full, { ...box, width: 100 }).sprites).toEqual([]);
    expect(cutDrawn(rig, art, full, { ...box, x: 150 }).refused[0]).toBe("blink: head box falls outside the frame");
  });
  test("the rounded and wide mouth frames pass the same guard: a drifting or empty shape is refused, the rest kept", () => {
    const empty: PixelImage = { ...art, data: new Uint8ClampedArray(art.data.length) };
    const tinted: PixelImage = { ...frames.mouth_o, data: frames.mouth_o.data.map((value, at) => at % 4 === 3 ? (value ? 255 : 0) : Math.min(255, value + 80)) };
    const result = cutDrawn(rig, art, { talk: frames.talk, mouth_o: tinted, mouth_wide: empty });
    expect(result.sprites.map((sprite) => sprite.name)).toEqual(["mouth_talk"]);
    expect(result.refused[0]).toMatch(/^mouth_o: mouth edge drifts/);
    expect(result.refused[1]).toBe("mouth_wide: frame has no mouth near the rig's mouth");
  });
  test("a frame whose edge drifts from the artwork is refused; a missing eye or mouth is refused, the rest kept", () => {
    const moved = cutDrawn(rig, art, { blink: shift(frames.blink, 3), talk: frames.talk });
    expect(moved.sprites.map((sprite) => sprite.name)).toEqual(["mouth_talk"]);
    expect(moved.refused.join(" ")).toMatch(/blink: (eye 0 edge drifts|frame does not cover eye 0)/);
    const empty = { width: art.width, height: art.height, data: new Uint8ClampedArray(art.data.length) };
    expect(cutDrawn(rig, art, { talk2: empty }).refused).toEqual(["talk2: frame has no mouth near the rig's mouth"]);
  });
  test("the lineage key changes with every frame source, the box and the artwork", () => {
    const source: DrawnSource = { frames: { blink: "/a/neutral.blink.png", talk: "/a/neutral.talk.png" } };
    const base = drawnLineage("a".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" } });
    const variants = [
      drawnLineage("b".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" } }),
      drawnLineage("a".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "9" }, talk: { path: "/a/neutral.talk.png", sha256: "2" } }),
      drawnLineage("a".repeat(64), source, { blink: { path: "/b/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" } }),
      drawnLineage("a".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "1" } }),
      drawnLineage("a".repeat(64), { ...source, box: { x: 1, y: 0, width: 128, height: 192 } }, { blink: { path: "/a/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" } }),
      drawnLineage("a".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" }, mouth_o: { path: "/a/neutral.mouth_o.png", sha256: "3" } }),
      drawnLineage("a".repeat(64), source, { blink: { path: "/a/neutral.blink.png", sha256: "1" }, talk: { path: "/a/neutral.talk.png", sha256: "2" }, mouth_wide: { path: "/a/neutral.mouth_wide.png", sha256: "3" } }),
    ];
    expect(new Set([base, ...variants]).size).toBe(8);
    expect(JSON.parse(base).recipe).toEqual({ id: "live-head-drawn-frames", version: 2 });
  });
});

describe("owned frame loading", () => {
  const art = syntheticArt(), frames = syntheticFrames(art, rig);
  const deps = (): DrawnDeps & { calls: string[] } => {
    const calls: string[] = [];
    const images: Record<string, PixelImage> = { blink: frames.blink, talk: frames.talk, art };
    return { calls, bytes: jest.fn(async (url: string) => { calls.push(url); return new TextEncoder().encode(url).buffer as ArrayBuffer; }),
      hash: jest.fn(async (bytes: ArrayBuffer) => `h${bytes.byteLength}`),
      pixels: jest.fn(async (bytes: ArrayBuffer) => images[new TextDecoder().decode(bytes).match(/(blink|talk|art)/)?.[1] ?? "art"]) };
  };
  const source: DrawnSource = { frames: { blink: "/s/neutral.blink.png", talk: "/s/neutral.talk.png" } };
  const artBytes = new TextEncoder().encode("art").buffer as ArrayBuffer;
  test("hashes every frame it decodes and keys the set by artwork, box and frame hashes", async () => {
    const host = deps(), set = await prepareDrawn(rig, syntheticHead.artHash, artBytes, source, guard(), host);
    expect(host.calls).toEqual(["/s/neutral.blink.png", "/s/neutral.talk.png"]);
    expect(set?.sprites.map((sprite) => sprite.name)).toEqual(["eyes_closed_0", "eyes_closed_1", "mouth_talk"]);
    const lineage = drawnLineage(syntheticHead.artHash, source, { blink: { path: "/s/neutral.blink.png", sha256: "h20" }, talk: { path: "/s/neutral.talk.png", sha256: "h19" } });
    expect(set?.key).toBe(`h${new TextEncoder().encode(lineage).byteLength}`);
  });
  test.each([1, 2, 3, 4, 5, 6, 7, 8])("a stale run at check %s publishes nothing", async (lapseAt) => {
    let checks = 0;
    expect(await prepareDrawn(rig, syntheticHead.artHash, artBytes, source, guard(() => ++checks < lapseAt), deps())).toBeNull();
  });
  test("no frames means no work", async () => {
    const host = deps();
    expect(await prepareDrawn(rig, syntheticHead.artHash, artBytes, { frames: {} }, guard(), host)).toBeNull();
    expect(host.calls).toEqual([]);
  });
});

describe("drawn frame selection", () => {
  const all = new Set<DrawnName>(["eyes_closed_0", "eyes_closed_1", "mouth_talk", "mouth_talk2"]);
  const p = (patch: Partial<HeadParameters>): HeadParameters => ({ ...restHead(), ...patch });
  test("a blink fades the closed drawing in over 60 ms and covers the layered eye only once solid", () => {
    const director = new DrawnDirector(all);
    expect(director.update(p({}), 16).eyes).toEqual([0, 0]);
    const first = director.update(p({ eyeOpen: 0.1 }), 16);
    expect(first.eyes[0]).toBeGreaterThan(0); expect(first.eyes[0]).toBeLessThan(1); expect(first.covered).toEqual([false, false]);
    for (let i = 0; i < 4; i++) director.update(p({ eyeOpen: 0.1 }), 16);
    expect(director.state.eyes).toEqual([1, 1]); expect(director.state.covered).toEqual([true, true]);
    const opening = director.update(p({ eyeOpen: 0.9 }), 16);
    expect(opening.covered).toEqual([false, false]); expect(opening.eyes[0]).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) director.update(p({ eyeOpen: 0.9 }), 16);
    expect(director.state.eyes).toEqual([0, 0]);
    expect(new DrawnDirector(all).update(p({ eyeOpen: 0 }), 0).covered).toEqual([true, true]);
  });
  test("the mouth drawing replaces the shader mouth, picks open or half by openness and squashes to it", () => {
    const director = new DrawnDirector(all);
    expect(director.update(p({ mouthOpen: 0.1 }), 16)).toMatchObject({ mouth: null, shaderMouth: 0 });
    expect(director.update(p({ mouthOpen: 0.4 }), 16)).toMatchObject({ mouth: "mouth_talk2", mouthAlpha: 1 });
    expect(director.state.squash).toBeCloseTo(0.4 / 0.55);
    expect(director.update(p({ mouthOpen: 0.8 }), 16)).toMatchObject({ mouth: "mouth_talk", squash: 0.8 / 0.9 });
    expect(director.update(p({ mouthOpen: 0.8, mouthForm: 0.9 }), 16)).toMatchObject({ mouth: "mouth_talk2", width: 0.78 });
    expect(new DrawnDirector(new Set<DrawnName>(["mouth_talk"])).update(p({ mouthOpen: 0.3 }), 16)).toMatchObject({ mouth: "mouth_talk", squash: 0.5 });
    expect(new DrawnDirector(new Set<DrawnName>(["eyes_closed_0"])).update(p({ mouthOpen: 0.3 }), 16)).toMatchObject({ mouth: null, shaderMouth: 0.3 });
  });
  test("with all four mouth drawings each vowel takes its own shape: ee wide, oh and oo rounded, eh and half open on the half frame", () => {
    const names = new Set<DrawnName>(["eyes_closed_0", "eyes_closed_1", "mouth_talk", "mouth_talk2", "mouth_o", "mouth_wide"]);
    const pick = (open: number, form: number) => new DrawnDirector(names).update(p({ mouthOpen: open, mouthForm: form }), 16);
    expect(pick(0.5, -0.85)).toMatchObject({ mouth: "mouth_wide", squash: 0.5 / 0.55 });
    expect(pick(0.75, 0.6)).toMatchObject({ mouth: "mouth_o", squash: 1, width: 1 });
    expect(pick(0.4, 0.9)).toMatchObject({ mouth: "mouth_o", width: 0.78 });
    expect(pick(0.62, -0.4)).toMatchObject({ mouth: "mouth_talk2", width: 1.06 });
    expect(pick(0.9, 0)).toMatchObject({ mouth: "mouth_talk", shaderMouth: 0 });
    expect(pick(0.4, 0)).toMatchObject({ mouth: "mouth_talk2" });
  });
  test("a missing shape falls back to the nearest drawing, then to the mesh", () => {
    const only = (...list: DrawnName[]) => new DrawnDirector(new Set<DrawnName>(list));
    expect(only("mouth_talk", "mouth_talk2").update(p({ mouthOpen: 0.75, mouthForm: 0.6 }), 16).mouth).toBe("mouth_talk");
    expect(only("mouth_talk", "mouth_talk2").update(p({ mouthOpen: 0.5, mouthForm: -0.85 }), 16).mouth).toBe("mouth_talk2");
    expect(only("mouth_o").update(p({ mouthOpen: 0.9 }), 16)).toMatchObject({ mouth: "mouth_o", shaderMouth: 0 });
    expect(only("mouth_wide", "mouth_o").update(p({ mouthOpen: 0.9 }), 16).mouth).toBe("mouth_o");
    expect(only("mouth_wide", "mouth_o").update(p({ mouthOpen: 0.4, mouthForm: -0.1 }), 16).mouth).toBe("mouth_wide");
    expect(only("eyes_closed_0", "eyes_closed_1").update(p({ mouthOpen: 0.5, mouthForm: -0.85 }), 16)).toMatchObject({ mouth: null, shaderMouth: 0.5 });
  });
  test("vowel regions hold across a boundary by the upstream hysteresis", () => {
    expect(classifyVowel(-0.21, null)).toBe("e");
    expect(classifyVowel(-0.15, "e")).toBe("e");
    expect(classifyVowel(-0.1, "e")).toBe("a");
    expect(classifyVowel(0.8, null)).toBe("u");
  });
});

describe("rendering drawn sprites", () => {
  beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });
  const art = syntheticArt(), set = cutDrawn(rig, art, syntheticFrames(art, rig));
  const head = (drawn: boolean) => {
    const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), syntheticHead);
    syntheticHead.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    if (drawn) renderer.addDrawn(set.sprites);
    return { gl, renderer };
  };
  test("closed eyes hide the eight layered eye draws behind the drawn eyes; open eyes draw no sprite", () => {
    const plain = head(false), drawn = head(true);
    plain.renderer.draw({ ...restHead(), eyeOpen: 0 }, 0); drawn.renderer.draw({ ...restHead(), eyeOpen: 0 }, 0);
    expect(plain.gl.counts.draws).toBe(9);
    expect(drawn.gl.counts.draws).toBe(1 + 2);
    drawn.renderer.draw({ ...restHead() }, 100);
    expect(drawn.gl.counts.draws - 3).toBe(9);
    expect(drawn.renderer.drawnNames()).toEqual(["eyes_closed_0", "eyes_closed_1", "mouth_talk", "mouth_talk2", "mouth_o", "mouth_wide"]);
  });
  test("a streaming mouth draws one mouth sprite, re-uploads it only when its squash changes, and the shader mouth stays shut", () => {
    const { gl, renderer } = head(true), p = { ...restHead(), mouthOpen: 0.4 };
    renderer.draw(p, 0); const uploads = gl.counts.bufferSubData;
    expect(gl.counts.draws).toBe(9 + 1);
    renderer.draw(p, 16); expect(gl.counts.bufferSubData).toBe(uploads);
    renderer.draw({ ...p, mouthOpen: 0.45 }, 32); expect(gl.counts.bufferSubData).toBeGreaterThan(uploads);
  });
  test("without drawn frames the renderer output is the mesh-only golden path", () => {
    const plain = head(false), drawn = head(true), p = { ...restHead(), gazeX: 0.5, breath: 0.2 };
    plain.renderer.draw(p, 0); drawn.renderer.draw(p, 0);
    expect(drawn.gl.finish()).toEqual(plain.gl.finish());
  });
});

describe("mounting with frames", () => {
  class Page extends EventTarget { hidden = true }
  const original = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  beforeEach(() => { Object.assign(globalThis, { document: new Page(), requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined }); });
  afterEach(() => Object.assign(globalThis, original));
  const bytes = new TextEncoder().encode(JSON.stringify(syntheticHead)).buffer as ArrayBuffer;
  const assets = (): HeadAssetDeps => ({ bytes: async () => bytes, hash: async () => syntheticHead.artHash, image: async () => ({} as HTMLImageElement) });
  const art = syntheticArt(), frames = syntheticFrames(art, rig);
  const drawnDeps = (fail = false): DrawnDeps => ({ bytes: async (url) => new TextEncoder().encode(url).buffer as ArrayBuffer, hash: async () => "f".repeat(64),
    pixels: async (data) => { if (fail) throw new Error("decode"); const url = new TextDecoder().decode(data); return url.includes("blink") ? frames.blink : url.includes("talk") ? frames.talk : art; } });
  const surface = () => ({ add: jest.fn(), draw: jest.fn(), destroy: jest.fn(), addDrawn: jest.fn() }) satisfies HeadSurface;
  test("prepared sprites reach the surface; a decode failure keeps the mesh-only head", async () => {
    const renderer = surface(), report = jest.fn();
    const stop = await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, guard(), assets(), restHead, jest.fn(), () => renderer,
      { source: { frames: { blink: "/s/neutral.blink.png", talk: "/s/neutral.talk.png" } }, deps: drawnDeps(), report });
    expect(renderer.addDrawn).toHaveBeenCalledTimes(1);
    expect((renderer.addDrawn.mock.calls[0][0] as Array<{ name: string }>).map((sprite) => sprite.name)).toEqual(["eyes_closed_0", "eyes_closed_1", "mouth_talk"]);
    stop?.();
    const plain = surface(), failed = jest.fn();
    expect(await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, guard(), assets(), restHead, jest.fn(), () => plain,
      { source: { frames: { blink: "/s/neutral.blink.png" } }, deps: drawnDeps(true), report: failed })).not.toBeNull();
    expect(plain.addDrawn).not.toHaveBeenCalled(); expect(plain.add).toHaveBeenCalledTimes(9);
    expect(failed).toHaveBeenCalledWith(null, expect.any(Error));
  });
  test("a run that lapses while frames load allocates no renderer", async () => {
    let live = true;
    const factory = jest.fn(surface), deps = drawnDeps();
    const pixels = deps.pixels;
    deps.pixels = async (data, signal) => { live = false; return pixels(data, signal); };
    expect(await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, guard(() => live), assets(), restHead, jest.fn(), factory,
      { source: { frames: { blink: "/s/neutral.blink.png" } }, deps })).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });
});
