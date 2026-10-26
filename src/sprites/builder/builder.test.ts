import { webcrypto } from "node:crypto";
import type { EyeRead } from "./eyeOpen";
import { renderedBox, RETRY_REFUSAL, RETRY_SEED_STEP, SpriteBuilder, type BuilderDeps, type SpriteBuildRequest } from "./builder";
import { checkPixels, pasteEdit, type PixelImage } from "./pixels";
import { cropPixels } from "./maskImport";
import { editKey } from "./recipes";
import { referenceProblems } from "./referencePack";
import { sanitizeSpriteSettings } from "../settings";
import { HeadBoxRefusal } from "./headBox";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const image = (width: number, height: number, shift = 0): PixelImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < width * height; at += 1) {
    data[at * 4] = (at * 7 + shift) % 256; data[at * 4 + 1] = (at * 11 + shift) % 256;
    data[at * 4 + 2] = (at * 13 + shift) % 256; data[at * 4 + 3] = at ? 255 : 0;
  }
  return { width, height, data };
};
const base = image(32, 32), box = { x: 8, y: 8, width: 16, height: 16 };
const edit = cropPixels(base, box);
for (let y = 9; y < 12; y += 1) for (let x = 5; x < 11; x += 1) edit.data.set([x * 9, y * 5, (x + y) * 3, 255], (y * 16 + x) * 4);
const models = { diffusion: { name: "edit", sha256: "a".repeat(64), size: 1 }, encoder: { name: "encoder", sha256: "b".repeat(64), size: 1 }, vae: { name: "vae", sha256: "c".repeat(64), size: 1 } };
const request: SpriteBuildRequest = { character: "Test", set: "pilot", label: "happy", kind: "expression", value: "happy", reference: "base", box, models, seed: 1, steps: 25 };

const fixture = () => {
  let owns = true;
  const deps: BuilderDeps = {
    ownership: { mint: () => ({ chatId: "chat", storyId: "story", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, window: null }),
      check: () => owns ? { ok: true } : { ok: false, reason: "epoch", detail: "changed" } },
    decode: async (src) => src === "base" ? base : edit,
    encode: () => "encoded", crop: async () => "cropped", resize: (input) => input,
    uploadReference: jest.fn(async () => "ref.png"), render: jest.fn(async () => ({ data: "result", format: "png" })),
    lease: async () => ({ release: jest.fn(async () => {}) }), save: jest.fn(async () => ({ path: "saved", sha256: "hash" })),
  };
  return { deps, builder: new SpriteBuilder(deps), lapse: () => { owns = false; } };
};

test("a preview built for an old draft cannot be uploaded", async () => {
  const { builder, deps, lapse } = fixture();
  const candidate = await builder.build(request);
  lapse();
  await expect(builder.save(candidate)).rejects.toThrow("old story or draft");
  expect(deps.save).not.toHaveBeenCalled();
});

test("replacing accepted source refuses old candidates and makes identical-pixel renders distinct cache entries", async () => {
  const f = fixture(); let root = "root:1";
  f.deps.lineage = async () => { const captured = root; return { root: captured, current: () => root === captured }; };
  const one = await f.builder.build(request);
  root = "root:2";
  await expect(f.builder.save(one)).rejects.toThrow("old accepted visual source");
  expect(f.deps.save).not.toHaveBeenCalled();
  const two = await f.builder.build(request);
  expect(two.key).not.toBe(one.key); expect(two.inputs.visualRoot).toBe("root:2");
});

test("a draft switch while the render answers produces no retained preview or upload", async () => {
  const { builder, deps, lapse } = fixture();
  deps.render = async () => { lapse(); return { data: "result", format: "png" }; };
  await expect(builder.build(request)).rejects.toThrow("draft changed");
  expect(deps.save).not.toHaveBeenCalled();
});

test("cancel after the lease is granted prevents reference upload and releases the lease", async () => {
  const { builder, deps } = fixture();
  const release = jest.fn(async () => {});
  deps.lease = async () => { builder.cancel(); return { release }; };
  await expect(builder.build(request)).rejects.toThrow();
  expect(deps.uploadReference).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});

test("expression edits keep the body and reference alpha byte-identical", () => {
  const output = pasteEdit(base, edit, box, "expression");
  expect(checkPixels(base, output, box).ok).toBe(true);
  for (let y = 0; y < base.height; y += 1) for (let x = 0; x < base.width; x += 1) {
    const offset = (y * base.width + x) * 4;
    expect(output.data[offset + 3]).toBe(base.data[offset + 3]);
    if (x < box.x || x >= box.x + box.width || y < box.y || y >= box.y + box.height) expect(output.data.slice(offset, offset + 4)).toEqual(base.data.slice(offset, offset + 4));
  }
});

test("blink and mouth edits are transparent outside separate non-overlapping bands", () => {
  const eyes = { ...edit, data: new Uint8ClampedArray(edit.data) };
  for (let y = 3; y < 7; y += 1) for (let x = 3; x < 13; x += 1) eyes.data.set([x * 9, y * 5, (x + y) * 3, 255], (y * 16 + x) * 4);
  const blink = pasteEdit(base, eyes, box, "blink"), talk = pasteEdit(base, edit, box, "talk");
  expect(checkPixels(base, blink, box, true).ok).toBe(true);
  for (let offset = 3; offset < blink.data.length; offset += 4) expect(blink.data[offset] > 0 && talk.data[offset] > 0).toBe(false);
});

test("changing weights under the same filename changes the cache key", async () => {
  const input = { base: "base", models, kind: "expression" as const, value: "happy", seed: 1, steps: 25, box };
  const first = await editKey(input);
  const second = await editKey({ ...input, models: { ...models, diffusion: { ...models.diffusion, sha256: "d".repeat(64) } } });
  expect(second).not.toBe(first);
});

test("a mask adjustment recomposes the owned raw edit without another lease, upload or render", async () => {
  const { builder, deps } = fixture();
  const first = await builder.build({ ...request, kind: "talk", value: "happy" });
  const second = await builder.build({ ...request, kind: "talk", value: "happy", frameRegion: { x: 3, y: 9, width: 10, height: 4, feather: 1 } });
  expect(first.key).not.toBe(second.key);
  expect(deps.render).toHaveBeenCalledTimes(1);
  expect(deps.uploadReference).toHaveBeenCalledTimes(1);
  expect(second.timings?.cacheHit).toBe(true);
  expect(second.timings?.renderMs).toBe(0);
  await builder.build({ ...request, kind: "talk", value: "happy", resolution: 512 });
  expect(deps.render).toHaveBeenCalledTimes(2);
  builder.close();
  await builder.build({ ...request, kind: "talk", value: "happy" });
  expect(deps.render).toHaveBeenCalledTimes(3);
});

test("returned wall time includes lease cleanup rather than reporting the earlier render completion", async () => {
  const { builder, deps } = fixture();
  deps.lease = async () => ({ release: async () => { await new Promise((resolve) => setTimeout(resolve, 15)); } });
  const candidate = await builder.build(request);
  expect(candidate.timings?.leaseReleaseMs).toBeGreaterThanOrEqual(10);
  expect(candidate.timings?.totalMs).toBeGreaterThanOrEqual(candidate.timings?.leaseReleaseMs ?? 0);
  expect(candidate.seconds * 1000).toBeCloseTo(candidate.timings?.totalMs ?? NaN, 6);
});

test("a reference changed since inventory is refused before any GPU work", async () => {
  const { builder, deps } = fixture();
  await expect(builder.build({ ...request, referenceHash: "a".repeat(64) })).rejects.toThrow("changed before the render");
  expect(deps.uploadReference).not.toHaveBeenCalled();
  expect(deps.render).not.toHaveBeenCalled();
});

test("reference adoption accepts existing transparent art and refuses opaque or blank images", () => {
  expect(referenceProblems(base)).toEqual([]);
  const opaque = image(32, 32);
  opaque.data[3] = 255;
  expect(referenceProblems(opaque)).toContain("The reference needs a visible subject and a transparent background.");
  expect(referenceProblems({ ...base, data: new Uint8ClampedArray(base.data.length) })).toHaveLength(2);
  const builders = { Test: { baseSet: "", box, models: { diffusion: "edit", encoder: "encoder", vae: "vae" }, steps: 25 } };
  expect(sanitizeSpriteSettings({ builders }).builders).toEqual(builders);
  expect(sanitizeSpriteSettings({ builders: { Test: { ...builders.Test, baseSet: "../escape" } } }).builders).toEqual({});
});

test("base creation accepts opaque card art only with a fingerprinted alpha step and validates the resulting cutout", async () => {
  const { builder, deps } = fixture();
  const card = image(32, 32);
  card.data[3] = 255;
  deps.decode = async (src) => src === "card" ? card : image(32, 32, 80);
  const cutout = { id: "installed_alpha", node: "BiRefNetRMBG" as const, model: "BiRefNet_toonout", files: [models.diffusion] };
  const baseRequest = { ...request, kind: "base" as const, reference: "card", label: "neutral", cutout };
  const candidate = await builder.build(baseRequest);
  expect(candidate.qa.ok).toBe(true);
  expect(candidate.inputs.cutout).toEqual(cutout);
  expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({
    "9": { class_type: "SplitImageWithAlpha", inputs: { image: ["8", 0] } },
    "10": { class_type: "BiRefNetRMBG", inputs: expect.objectContaining({ image: ["9", 0], model: "BiRefNet_toonout", background: "Alpha" }) },
    "11": { class_type: "SaveImage", inputs: { filename_prefix: "so-sprite-base", images: ["10", 0] } },
  }), expect.any(AbortSignal));
  await expect(builder.build({ ...baseRequest, cutout: undefined })).rejects.toThrow("background-removal setup");
  deps.decode = async () => card;
  await expect(builder.build({ ...baseRequest, seed: 2 })).rejects.toThrow("transparent background");
});

test("a base keeps the rendered pixel count in the card's shape instead of shrinking to the card; a smaller render is not shrunk below it", async () => {
  expect(renderedBox({ x: 0, y: 0, width: 400, height: 600 }, { width: 832, height: 1248 })).toEqual({ x: 0, y: 0, width: 832, height: 1248 });
  expect(renderedBox({ x: 0, y: 0, width: 400, height: 600 }, { width: 1024, height: 1024 })).toEqual({ x: 0, y: 0, width: 683, height: 1024 });
  expect(renderedBox({ x: 0, y: 0, width: 400, height: 600 }, { width: 256, height: 384 })).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  const { builder, deps } = fixture();
  const card = image(32, 48);
  card.data[3] = 255;
  const sizes: Array<[number, number]> = [];
  deps.decode = async (src) => src === "card" ? card : image(64, 96, 80);
  deps.resize = (input, box) => { sizes.push([box.width, box.height]); return { width: box.width, height: box.height, data: new Uint8ClampedArray(box.width * box.height * 4).map((_, at) => at % 4 === 3 ? (at % 8 === 3 ? 0 : 255) : (at * 7) % 251) }; };
  const cutout = { id: "installed_alpha", node: "BiRefNetRMBG" as const, model: "BiRefNet_toonout", files: [models.diffusion] };
  await builder.build({ ...request, kind: "base", reference: "card", label: "neutral", cutout });
  expect(sizes).toEqual([[64, 96]]);
});

test("a base render's fringe is cleaned before QA and save: background-coloured edge pixels take the subject's colour", async () => {
  const { builder, deps } = fixture();
  const card = image(16, 16);
  card.data[3] = 255;
  deps.decode = async (src) => src === "card" ? card : image(16, 16, 80);
  deps.resize = (_input, box) => {
    const data = new Uint8ClampedArray(box.width * box.height * 4);
    for (let y = 2; y < 14; y++) for (let x = 4; x < 12; x++) data.set([180 + (x % 3) * 20, 40 + y, 30, 255], (y * box.width + x) * 4);
    for (let y = 2; y < 14; y++) data.set([250, 250, 250, 128], (y * box.width + 3) * 4);
    return { width: box.width, height: box.height, data };
  };
  let saved: PixelImage | null = null;
  deps.encode = (output) => { saved = output; return "encoded"; };
  const cutout = { id: "installed_alpha", node: "BiRefNetRMBG" as const, model: "BiRefNet_toonout", files: [models.diffusion] };
  await builder.build({ ...request, kind: "base", reference: "card", label: "neutral", cutout });
  const fringe = Array.from(saved!.data.subarray((8 * saved!.width + 3) * 4, (8 * saved!.width + 3) * 4 + 3));
  expect(fringe.every((channel, i) => channel !== 250 || i > 0)).toBe(true);
  expect(fringe[0]).toBeGreaterThanOrEqual(180);
  expect(fringe[2]).toBe(30);
});

test("a blink frame is checked eye by eye when the face detector answers; expressions read the face once, before rendering", async () => {
  const { builder, deps } = fixture();
  const white = image(32, 32);
  for (let y = 11; y < 14; y++) for (let x = 10; x < 22; x++) white.data.set([246, 246, 248, 255], (y * 32 + x) * 4);
  const kept = cropPixels(white, box);
  for (let y = 4; y < 6; y++) for (let x = 3; x < 6; x++) kept.data.set([30, 30, 30, 255], (y * 16 + x) * 4);
  deps.decode = async (src) => src === "base" ? white : kept;
  const open = { boxes: [{ x: 10, y: 10, width: 5, height: 5 }, { x: 17, y: 10, width: 5, height: 5 }], openness: [0.8, 0.8] };
  const eyes = jest.fn(async (): Promise<EyeRead> => open);
  deps.eyes = eyes;
  await expect(builder.build({ ...request, kind: "blink", label: "neutral", value: "neutral" })).rejects.toThrow(/eye open/);
  expect(eyes).toHaveBeenCalledTimes(4);
  eyes.mockResolvedValueOnce(open).mockResolvedValueOnce({ boxes: null, openness: [0.15, 0.1] });
  await expect(builder.build({ ...request, kind: "blink", label: "neutral", value: "neutral" })).resolves.toBeDefined();
  eyes.mockClear();
  deps.decode = async (src) => src === "base" ? base : edit;
  await builder.build(request).catch(() => undefined);
  expect(eyes).toHaveBeenCalledTimes(1);
});

test("a head box that misses the eyes is refused before any lease or render, and is not retried", async () => {
  const { builder, deps } = fixture();
  const lease = jest.fn(deps.lease);
  deps.lease = lease;
  deps.eyes = async () => ({ boxes: [{ x: 10, y: 21, width: 4, height: 2 }, { x: 17, y: 21, width: 4, height: 2 }], openness: [0.8, 0.8] });
  for (const kind of ["blink", "talk", "expression"] as const) {
    const refusal = builder.build({ ...request, kind, label: "neutral", value: "neutral" });
    await expect(refusal).rejects.toThrow(/head box misses the face: an eye sits at 88% of its height/);
    await expect(refusal).rejects.not.toThrow(RETRY_REFUSAL);
    await expect(refusal).rejects.toBeInstanceOf(HeadBoxRefusal);
    await expect(refusal).rejects.toMatchObject({ eyes: [{ x: 10, y: 21, width: 4, height: 2 }, { x: 17, y: 21, width: 4, height: 2 }] });
  }
  expect(lease).not.toHaveBeenCalled();
  expect(deps.render).not.toHaveBeenCalled();
  deps.eyes = async () => ({ boxes: null, openness: null, faces: 0 });
  await expect(builder.build(request)).resolves.toBeDefined();
});

test("a retryable refusal re-renders once with a new seed; any other refusal is not retried", async () => {
  const { builder, deps } = fixture();
  const seeds: number[] = [];
  const render = jest.fn(async (graph: Record<string, unknown>) => { seeds.push(Number(JSON.stringify(graph).match(/"seed":(\d+)/)?.[1])); return { data: "result", format: "png" }; });
  deps.render = render;
  let calls = 0;
  deps.eyes = async () => (calls++ ? null : { boxes: [{ x: 10, y: 10, width: 5, height: 5 }], openness: [0.8] });
  const white = image(32, 32);
  for (let y = 11; y < 14; y++) for (let x = 10; x < 22; x++) white.data.set([246, 246, 248, 255], (y * 32 + x) * 4);
  const kept = cropPixels(white, box);
  for (let y = 4; y < 6; y++) for (let x = 3; x < 6; x++) kept.data.set([30, 30, 30, 255], (y * 16 + x) * 4);
  deps.decode = async (src) => src === "base" ? white : kept;
  await builder.build({ ...request, kind: "blink", label: "neutral", value: "neutral" });
  expect(seeds).toEqual([1, 1 + RETRY_SEED_STEP]);
  seeds.length = 0;
  deps.releaseReference = async () => { throw new Error("cleanup unavailable"); };
  await expect(builder.build(request)).rejects.toThrow("cleanup unavailable");
  expect(seeds).toEqual([1]);
});

test("a new look rendered from a cut-out base must keep a face: a headless render is refused once and re-rendered; card art is never face-checked", async () => {
  const { builder, deps } = fixture();
  const cutout = { id: "installed_alpha", node: "BiRefNetRMBG" as const, model: "BiRefNet_toonout", files: [models.diffusion] };
  const look = { ...request, kind: "base" as const, reference: "neutral", label: "neutral", cutout };
  const neutral = image(32, 32);
  for (let at = 0; at < 32 * 8; at++) neutral.data[at * 4 + 3] = 0;
  deps.decode = async (src) => src === "neutral" ? neutral : image(32, 32, 80);
  const faces = [0, 1];
  const eyes = jest.fn(async (): Promise<EyeRead> => ({ boxes: null, openness: null, faces: faces.shift() ?? 1 }));
  deps.eyes = eyes;
  await builder.build(look);
  expect(eyes).toHaveBeenCalledTimes(2);
  expect(deps.render).toHaveBeenCalledTimes(2);
  eyes.mockClear();
  eyes.mockImplementation(async () => ({ boxes: null, openness: null, faces: 0 }));
  await expect(builder.build(look)).rejects.toThrow("lost the head");
  eyes.mockClear();
  const card = image(32, 32);
  for (let at = 3; at < card.data.length; at += 4) card.data[at] = 255;
  deps.decode = async (src) => src === "card" ? card : image(32, 32, 80);
  await builder.build({ ...look, reference: "card" });
  expect(eyes).not.toHaveBeenCalled();
});

test("a failed reference cleanup still releases the GPU lease", async () => {
  const { builder, deps } = fixture();
  const release = jest.fn(async () => {});
  deps.lease = async () => ({ release });
  deps.releaseReference = async () => { throw new Error("cleanup unavailable"); };
  await expect(builder.build(request)).rejects.toThrow("cleanup unavailable");
  expect(release).toHaveBeenCalledTimes(1);
});

test("a raw edit is imported through its mask: a small shift is corrected and reported, a redrawn picture is refused before save", async () => {
  const { builder, deps } = fixture();
  const shifted = { ...edit, data: new Uint8ClampedArray(edit.data.length) };
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    const from = (Math.min(15, Math.max(0, y + 1)) * 16 + Math.min(15, Math.max(0, x - 1))) * 4;
    shifted.data.set(edit.data.subarray(from, from + 4), (y * 16 + x) * 4);
  }
  deps.decode = async (src) => src === "base" ? base : shifted;
  const candidate = await builder.build({ ...request, kind: "talk", value: "happy" });
  expect(candidate.qa.maskImport).toMatchObject({ shift: { x: 1, y: -1 }, corrected: { x: 1, y: -1 }, compared: true });
  const redrawn = { ...edit, data: edit.data.map((value, at) => at % 4 === 3 ? value : Math.min(255, value + 60)) };
  deps.decode = async (src) => src === "base" ? base : redrawn;
  await expect(builder.build({ ...request, kind: "talk", value: "happy", seed: 2 })).rejects.toThrow("redrew the picture outside its mask");
  expect(deps.save).not.toHaveBeenCalled();
});
