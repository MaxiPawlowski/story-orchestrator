import { syntheticHead, syntheticRef } from "./synthetic";
import { loadHeadManifest, manifestRef } from "./manifest";
import { parseRig, validateRig } from "./validate";
import { liveHeadKey, liveHeadRefs, findLiveHead, localHeadAsset } from "../liveHeadRefs";
import { driveHead, idleHead, mouthHead, expressionHead, restHead } from "./drivers";
import { deformVertex, eyeVertexY, headGrid } from "./geometry";
import { blinkGap } from "../animation";
import { defaultSpriteSettings, sanitizeSpriteSettings } from "../settings";
import { prepareHead, type HeadAssetDeps } from "./load";
import type { RunGuard } from "@runtime/runToken";

const fresh = () => JSON.parse(JSON.stringify(syntheticHead)) as typeof syntheticHead;
const guard = (check = () => true): RunGuard => ({ stillOwns: check, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
const bytes = new TextEncoder().encode(JSON.stringify(syntheticHead)).buffer as ArrayBuffer;
const deps = (): HeadAssetDeps => ({ bytes: jest.fn(async () => bytes), hash: jest.fn(async () => syntheticHead.artHash), image: jest.fn(async () => ({} as HTMLImageElement)) });

describe("live head data contract", () => {
  test("typed loader clones rig and orders layers without mutating input", () => {
    const value = fresh(); value.layers.reverse();
    const loaded = loadHeadManifest(value, syntheticRef);
    expect(loaded.layers[0].name).toBe("base");
    loaded.rig.head.cx = 12;
    expect(value.rig.head.cx).toBe(64);
    expect(validateRig(value.rig)).toEqual([]);
    expect(parseRig(value.rig).image.width).toBe(128);
  });
  test("browser-floor loading uses JSON data, and local sprite paths allow card-name spaces", () => {
    const clone = globalThis.structuredClone;
    Object.assign(globalThis, { structuredClone: undefined });
    try { expect(loadHeadManifest(fresh()).rig.head.cx).toBe(64); }
    finally { Object.assign(globalThis, { structuredClone: clone }); }
    expect(localHeadAsset("/characters/Synthetic Shapes/neutral.png")).toBe(true);
    expect(localHeadAsset("//external/neutral.png")).toBe(false);
    expect(localHeadAsset("/bad\npath.png")).toBe(false);
    expect(localHeadAsset("/bad\\path.png")).toBe(false);
  });
  test.each([NaN, Infinity, -Infinity])("rejects non-finite geometry %s", (number) => {
    const value = fresh(); value.rig.head.cx = number;
    expect(() => loadHeadManifest(value)).toThrow("finite number");
  });
  test("rejects missing eye curves, reversed bands and zero radii", () => {
    const value = fresh(); value.rig.eyes[0].top = [];
    expect(() => loadHeadManifest(value)).toThrow("24..24");
    value.rig = fresh().rig; value.rig.body.breathBand = [4, 2];
    expect(() => loadHeadManifest(value)).toThrow("start must be less");
    value.rig = fresh().rig; value.rig.head.rx = 0;
    expect(() => loadHeadManifest(value)).toThrow("positive");
  });
  test("rejects duplicate layers, out-of-bounds rectangles, external assets and excessive mesh", () => {
    const value = fresh(); value.layers[1] = value.layers[0];
    expect(() => loadHeadManifest(value)).toThrow("Duplicate");
    value.layers = fresh().layers; value.layers[0].rect[2] = 129;
    expect(() => loadHeadManifest(value)).toThrow("fit inside");
    value.layers = fresh().layers; value.layers[0].image = "https://example.com/image.png";
    expect(() => loadHeadManifest(value)).toThrow("Invalid live head layer");
    value.layers = fresh().layers; value.rig.mesh.fine.cell = 1; value.rig.image.width = 2048; value.rig.image.height = 2048; value.layers[0].rect = [0, 0, 2048, 2048];
    expect(() => loadHeadManifest(value)).toThrow("vertex limit");
  });
  test("member, look and art hash independently invalidate the cache", () => {
    for (const patch of [{ member: "other" }, { look: "travel" }, { artHash: "a".repeat(64) }]) {
      expect(liveHeadKey({ ...syntheticRef, ...patch })).not.toBe(liveHeadKey(syntheticRef));
      expect(() => loadHeadManifest(syntheticHead, { ...syntheticRef, ...patch })).toThrow("another member, look or artwork");
    }
    expect(() => loadHeadManifest(syntheticHead, { ...syntheticRef, source: "/other.png" })).toThrow("another member");
  });
  test("F15-compatible refs reject a corrupt tuple and ambiguous art", () => {
    const key = liveHeadKey(syntheticRef);
    expect(liveHeadRefs({ [key]: syntheticRef, wrong: syntheticRef })).toEqual({ [key]: syntheticRef });
    expect(findLiveHead({ [key]: syntheticRef }, "shape", "default", syntheticRef.source)).toEqual(syntheticRef);
    const other = { ...syntheticRef, artHash: "b".repeat(64) };
    expect(findLiveHead({ [key]: syntheticRef, [liveHeadKey(other)]: other }, "shape", "default", syntheticRef.source)).toBeUndefined();
    expect(sanitizeSpriteSettings({}).liveHead).toBe(true);
    expect(defaultSpriteSettings().liveHeadRigs).toEqual({});
    expect(sanitizeSpriteSettings({ liveHead: false }).liveHead).toBe(false);
    expect(manifestRef(syntheticHead)).toEqual(syntheticRef);
  });
});

describe("pure micro-motion", () => {
  test("seeded motion is replayable, bounded and desynchronised", () => {
    for (let time = 0; time < 80_000; time += 25) {
      expect(idleHead("a", time)).toEqual(idleHead("a", time));
      const p = driveHead("a", time, "neutral", true, true);
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(p.eyeOpen).toBeGreaterThanOrEqual(0); expect(p.eyeOpen).toBeLessThanOrEqual(1);
      expect(p.breath).toBeGreaterThanOrEqual(0); expect(p.breath).toBeLessThanOrEqual(0.4);
    }
    expect(idleHead("a", 1000)).not.toEqual(idleHead("b", 1000));
    expect(idleHead("a", blinkGap("a", 0) + 80).eyeOpen).toBe(0);
    expect(idleHead("a", blinkGap("a", 0) + 160).eyeOpen).toBe(1);
  });
  test("reduced/story motion freezes idle and stream mouth while retaining expression", () => {
    expect(driveHead("a", 1000, "joy", true, false)).toEqual(driveHead("a", 9900, "joy", true, false));
    expect(driveHead("a", 1000, "joy", true, false)).toMatchObject({ breath: 0, angleX: 0, gazeX: 0, mouthOpen: 0, eyeSmile: 0.7 });
    expect(mouthHead(1000, false)).toBe(0);
    expect(mouthHead(1000, true)).toBeGreaterThan(0);
    expect(driveHead("a", 1000, "joy", true, true, { mouth: false, breathing: false, blink: false })).toMatchObject({ mouthOpen: 0, breath: 0, eyeOpen: 1 });
  });
  test("known labels drive expressions; unknown labels rest", () => {
    expect(expressionHead("anger").browAngle).toBeGreaterThan(0);
    expect(expressionHead("sadness").browAngle).toBeLessThan(0);
    expect(expressionHead("surprise").browY).toBeGreaterThan(0);
    expect(expressionHead("unknown")).toEqual({});
  });
  test("rest vertices stay identical; the base remains anchored; lids close", () => {
    const rig = syntheticHead.rig;
    expect(deformVertex(rig, 64, 60, restHead())).toEqual([64, 60]);
    expect(deformVertex(rig, 64, 192, { ...restHead(), breath: 1 })).toEqual([64, 192]);
    const eye = rig.eyes[0];
    expect(eyeVertexY(eye, "lash", 46, 50, 0, 0)).toBeGreaterThan(eyeVertexY(eye, "lash", 46, 50, 1, 0));
    const mesh = headGrid([0, 0, 32, 24], 8);
    expect(mesh.triangles.length).toBe(4 * 3 * 6);
    expect(mesh.pos).toEqual(mesh.rest);
  });
});

describe("owned asynchronous loading", () => {
  test("checks source bytes and loads each eye layer", async () => {
    const host = deps(), result = await prepareHead(syntheticRef, guard(), host);
    expect(host.bytes).toHaveBeenCalledWith(syntheticRef.source, expect.any(AbortSignal));
    expect(host.hash).toHaveBeenCalledWith(bytes);
    expect(result?.images).toHaveLength(9);
  });
  test("changed bytes at the same path refuse the old rig before image decode", async () => {
    const host = deps(); host.hash = jest.fn(async () => "a".repeat(64));
    await expect(prepareHead(syntheticRef, guard(), host)).rejects.toThrow("Artwork changed");
    expect(host.image).not.toHaveBeenCalled();
  });
  test.each([1, 2, 3, 4])("a stale run at await %s never publishes a rig", async (lapseAt) => {
    let check = 0;
    const host = deps();
    expect(await prepareHead(syntheticRef, guard(() => ++check <= lapseAt), host)).toBeNull();
    if (lapseAt < 4) expect(host.image).not.toHaveBeenCalled();
  });
});
