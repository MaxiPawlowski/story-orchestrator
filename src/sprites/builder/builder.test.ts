import { webcrypto } from "node:crypto";
import { SpriteBuilder, type BuilderDeps, type SpriteBuildRequest } from "./builder";
import { checkPixels, pasteEdit, type PixelImage } from "./pixels";
import { editKey } from "./recipes";
import { referenceProblems } from "./referencePack";
import { sanitizeSpriteSettings } from "../settings";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const image = (width: number, height: number, shift = 0): PixelImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < width * height; at += 1) {
    data[at * 4] = (at * 7 + shift) % 256; data[at * 4 + 1] = (at * 11 + shift) % 256;
    data[at * 4 + 2] = (at * 13 + shift) % 256; data[at * 4 + 3] = at ? 255 : 0;
  }
  return { width, height, data };
};
const base = image(32, 32), edit = image(16, 16, 80), box = { x: 8, y: 8, width: 16, height: 16 };
const models = { diffusion: { name: "edit", sha256: "a".repeat(64), size: 1 }, encoder: { name: "encoder", sha256: "b".repeat(64), size: 1 }, vae: { name: "vae", sha256: "c".repeat(64), size: 1 } };
const request: SpriteBuildRequest = { character: "Test", set: "pilot", label: "happy", kind: "expression", value: "happy", reference: "base", box, models, seed: 1, steps: 25 };

const fixture = () => {
  let owns = true;
  const deps: BuilderDeps = {
    ownership: { mint: () => ({ chatId: "chat", storyId: "story", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, window: null }),
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
  const blink = pasteEdit(base, edit, box, "blink"), talk = pasteEdit(base, edit, box, "talk");
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

test("a failed reference cleanup still releases the GPU lease", async () => {
  const { builder, deps } = fixture();
  const release = jest.fn(async () => {});
  deps.lease = async () => ({ release });
  deps.releaseReference = async () => { throw new Error("cleanup unavailable"); };
  await expect(builder.build(request)).rejects.toThrow("cleanup unavailable");
  expect(release).toHaveBeenCalledTimes(1);
});
