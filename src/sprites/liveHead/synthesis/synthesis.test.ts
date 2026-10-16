import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../../builder/pixels";
import { syntheticBust } from "./syntheticBust";
import { landmarkProblems, parseLandmarks, type FaceLandmarks } from "./landmarks";
import { synthesizeRig, eyeCurves, fitCell, layerVertices, MAX_LAYER_VERTICES, LOWER_LID_OUTSET } from "./rigGeometry";
import { cutHeadLayers } from "./layers";
import { encodePngStored, base64 } from "./png";
import { synthesizeHead, rehomeHead, type RigSynthesisDeps } from "./synthesize";
import { readLandmarkAnswer, visionLandmarkProvider, visionTarget } from "./visionLandmarks";
import { visionRigRequest, VISION_RIG_MODEL } from "../visionRequest";
import type { HarnessModel } from "@services/stHost/harness";
import { loadHeadManifest, manifestRef, HEAD_LAYERS } from "../manifest";
import { prepareHead } from "../load";
import { validateRig } from "../validate";

const GOLDEN = join(__dirname, "../../../../test/goldens/liveHead/synthetic-rig.json");
const sha = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const guard = (check: () => boolean = () => true, signal = new AbortController().signal): RunGuard =>
  ({ stillOwns: check, lapsed: () => null, lapsedDetail: () => null, signal, release: () => undefined });
const fixture = (scale = 1, wide = 1) => {
  const bust = syntheticBust(scale, wide), png = encodePngStored(bust.image), source = `data:image/png;base64,${base64(png)}`;
  const deps: RigSynthesisDeps = {
    landmarks: jest.fn(async () => JSON.parse(JSON.stringify(bust.landmarks)) as unknown),
    read: jest.fn(async () => png), hash: jest.fn(async (bytes: Uint8Array) => sha(bytes)),
    decode: jest.fn(async () => bust.image), encode: jest.fn(async (image: PixelImage) => base64(encodePngStored(image))),
  };
  return { bust, png, source, deps, input: { member: "shape", look: "look_blue", source: "/characters/Synthetic/visual_x/bust.png", sha256: sha(png) } };
};
const at = (image: PixelImage, x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

describe("landmark rig synthesis", () => {
  test("synthetic bust golden: rig geometry and layer bytes are deterministic", async () => {
    const f = fixture(), manifest = await synthesizeHead(f.input, guard(), f.deps);
    expect(manifest).not.toBeNull();
    const summary = { rig: manifest!.rig, layers: manifest!.layers.map((layer) => ({ name: layer.name, rect: layer.rect, sha256: sha(layer.image) })) };
    if (process.env.SO_UPDATE_GOLDEN === "1") { mkdirSync(dirname(GOLDEN), { recursive: true }); writeFileSync(GOLDEN, `${JSON.stringify(summary, null, 2)}\n`); }
    expect(summary).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
    const again = await synthesizeHead(f.input, guard(), fixture().deps);
    expect(JSON.stringify(again)).toBe(JSON.stringify(manifest));
  });

  test("passes the shipped manifest validation: local assets, identity, art hash, layer order and vertex limit", async () => {
    const f = fixture(), manifest = (await synthesizeHead(f.input, guard(), f.deps))!;
    expect(manifest.layers.map((layer) => layer.name)).toEqual(HEAD_LAYERS);
    expect(validateRig(manifest.rig)).toEqual([]);
    const ref = manifestRef(manifest);
    expect(loadHeadManifest(JSON.parse(decodeURIComponent(ref.manifest.slice("data:application/json,".length))), ref).artHash).toBe(f.input.sha256);
    expect(() => loadHeadManifest(manifest, { ...ref, member: "other" })).toThrow("another member");
    expect(() => loadHeadManifest({ ...manifest, source: "https://example.com/bust.png" })).toThrow("identity");
    const prepared = await prepareHead({ ...ref, source: f.source }, guard(), { bytes: async (url) => url === f.source ? f.png.buffer as ArrayBuffer
      : new TextEncoder().encode(JSON.stringify({ ...manifest, source: f.source })).buffer as ArrayBuffer, hash: async (bytes) => sha(new Uint8Array(bytes)),
    image: async () => ({}) as HTMLImageElement }).catch((error: unknown) => error);
    expect(prepared).toMatchObject({ manifest: { artHash: f.input.sha256 } });
  });

  test("geometry scales with the bust: a 2x bust gives a 2x rig within rounding", () => {
    const one = synthesizeRig(syntheticBust(1).landmarks), two = synthesizeRig(syntheticBust(2).landmarks);
    for (const key of ["cx", "cy", "rx", "ry", "pivotX", "pivotY", "shiftX", "shiftY"] as const) expect(two.head[key]).toBeCloseTo(one.head[key] * 2, 1);
    for (const key of ["nose", "mouth", "eyeA", "eyeB", "earL", "earR"] as const) {
      expect(two.face[key].cx).toBeCloseTo(one.face[key].cx * 2, 1); expect(two.face[key].rx).toBeCloseTo(one.face[key].rx * 2, 1);
    }
    two.eyes.forEach((eye, i) => {
      expect(eye.x0).toBeCloseTo(one.eyes[i].x0 * 2, 1);
      eye.top.forEach((y, k) => expect(Math.abs(y - one.eyes[i].top[k] * 2)).toBeLessThanOrEqual(0.03));
      eye.bot.forEach((y, k) => expect(Math.abs(y - one.eyes[i].bot[k] * 2)).toBeLessThanOrEqual(0.03 + LOWER_LID_OUTSET));
    });
    expect(two.mouth.halfLen).toBeCloseTo(one.mouth.halfLen * 2, 1); expect(two.mouth.angle).toBe(one.mouth.angle);
  });

  test("an eye contour gives the same curves whatever point it starts on or which way it winds", () => {
    const eye = syntheticBust(1).landmarks.eyes[0], base = eyeCurves(eye);
    expect(eyeCurves([...eye.slice(3), ...eye.slice(0, 3)])).toEqual(base);
    expect(eyeCurves([...eye].reverse())).toEqual(base);
    expect(base.top.every((y, k) => y <= base.bot[k])).toBe(true);
  });

  test("layer cut removes the iris from the base and keeps it in the eyeball; lashes land on the lash layer", () => {
    const { image, landmarks } = syntheticBust(1), rig = synthesizeRig(landmarks), layers = cutHeadLayers(image, rig);
    const base = layers[0].image, ball = layers.find((layer) => layer.name === "eye0_ball")!, lash = layers.find((layer) => layer.name === "eye0_lash")!;
    expect(at(image, 62, 78)).toEqual([20, 22, 30, 255]);
    const filled = at(base, 62, 78);
    expect(Math.max(...filled.slice(0, 3).map((v, c) => Math.abs(v - [236, 200, 172][c])))).toBeLessThan(30);
    expect(at(ball.image, 62 - ball.rect[0], 78 - ball.rect[1])).toEqual([20, 22, 30, 255]);
    expect(at(lash.image, 62 - lash.rect[0], 73 - lash.rect[1])[3]).toBe(255);
    expect(at(lash.image, 62 - lash.rect[0], 78 - lash.rect[1])[3]).toBe(0);
  });

  test("a strand crossing the eye region keeps its own pixels in the base on the region border, so no rectangle shows around the eye", () => {
    const { image, landmarks } = syntheticBust(2), rig = synthesizeRig(landmarks);
    const hair = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    for (let y = 0; y < hair.height; y++) for (let x = 0; x < hair.width; x++) if (Math.abs(x - (y - 40)) <= 2) hair.data.set([150, 40, 30, 255], (y * hair.width + x) * 4);
    const layers = cutHeadLayers(hair, rig), base = layers[0].image;
    let border = 0;
    for (const layer of layers.slice(1)) {
      const [rx, ry, rw, rh] = layer.rect;
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        if (x > 0 && y > 0 && x < rw - 1 && y < rh - 1) continue;
        const k = (y * rw + x) * 4;
        if (layer.image.data[k + 3] === 0) continue;
        border++;
        expect(at(base, rx + x, ry + y)).toEqual(Array.from(layer.image.data.subarray(k, k + 4)));
      }
    }
    expect(border).toBeGreaterThan(0);
  });

  test("mesh cells keep every layer under the vertex limit, also for a 2048 px bust", () => {
    for (const [w, h] of [[160, 224], [1024, 1280], [2048, 2048]]) expect(layerVertices(w, h, fitCell(w, h, 2))).toBeLessThanOrEqual(MAX_LAYER_VERTICES);
    const small = syntheticBust(1).landmarks, k = 9, scale = (p: [number, number]): [number, number] => [p[0] * k, p[1] * k];
    const big: FaceLandmarks = { ...small, image: { width: 1440, height: 2016 }, face: { cx: small.face.cx * k, cy: small.face.cy * k, rx: small.face.rx * k, ry: small.face.ry * k },
      eyes: [small.eyes[0].map(scale), small.eyes[1].map(scale)], brows: [scale(small.brows[0]), scale(small.brows[1])], nose: scale(small.nose),
      mouth: { left: scale(small.mouth.left), right: scale(small.mouth.right), top: scale(small.mouth.top), bottom: scale(small.mouth.bottom) },
      chin: scale(small.chin), neck: scale(small.neck), shoulders: [scale(small.shoulders[0]), scale(small.shoulders[1])] };
    const rig = synthesizeRig(parseLandmarks(big, big.image));
    const cell = Math.min(rig.mesh.baseCell, rig.mesh.fine.cell);
    expect(layerVertices(rig.image.width, rig.image.height, cell)).toBeLessThanOrEqual(MAX_LAYER_VERTICES);
  });

  test("refuses oversize busts and packages, without calling the landmark provider for an oversize bust", async () => {
    const f = fixture();
    f.deps.decode = jest.fn(async () => ({ width: 2100, height: 100, data: new Uint8ClampedArray(2100 * 100 * 4) }));
    await expect(synthesizeHead(f.input, guard(), f.deps)).rejects.toThrow("2048");
    expect(f.deps.landmarks).not.toHaveBeenCalled();
    const g = fixture();
    g.deps.encode = jest.fn(async () => "A".repeat(3_000_000));
    await expect(synthesizeHead(g.input, guard(), g.deps)).rejects.toThrow("import limit");
  });

  test("refuses a bust whose bytes changed since review", async () => {
    const f = fixture();
    await expect(synthesizeHead({ ...f.input, sha256: "0".repeat(64) }, guard(), f.deps)).rejects.toThrow("changed after review");
    expect(f.deps.landmarks).not.toHaveBeenCalled();
  });

  test.each(["read", "hash", "decode", "landmarks", "encode"] as const)("a lapse during %s publishes nothing and stops the pipeline", async (step) => {
    const f = fixture();
    let owns = true;
    const original = f.deps[step] as (...args: unknown[]) => Promise<unknown>;
    (f.deps as unknown as Record<string, unknown>)[step] = jest.fn(async (...args: unknown[]) => { const value = await original(...args); owns = false; return value; });
    expect(await synthesizeHead(f.input, guard(() => owns), f.deps)).toBeNull();
    const order = ["read", "hash", "decode", "landmarks", "encode"] as const;
    for (const later of order.slice(order.indexOf(step) + 1)) expect(f.deps[later]).not.toHaveBeenCalled();
    if (step === "encode") expect(f.deps.encode).toHaveBeenCalledTimes(1);
  });

  test("landmark validation names every problem", () => {
    const { landmarks } = syntheticBust(1), bad = JSON.parse(JSON.stringify(landmarks)) as FaceLandmarks;
    bad.nose = [999, 1]; bad.chin = [-1, 5];
    expect(landmarkProblems(bad, landmarks.image)).toEqual([expect.stringContaining("landmarks.nose"), expect.stringContaining("landmarks.chin")]);
    const swapped = JSON.parse(JSON.stringify(landmarks)) as FaceLandmarks;
    swapped.eyes.reverse(); swapped.mouth.left = [95, 110];
    expect(landmarkProblems(swapped, landmarks.image)).toEqual(expect.arrayContaining([expect.stringContaining("left first"), expect.stringContaining("left corner")]));
    const order = JSON.parse(JSON.stringify(landmarks)) as FaceLandmarks;
    order.chin = [80, 100];
    expect(() => parseLandmarks(order, landmarks.image)).toThrow("top to bottom");
    expect(() => parseLandmarks({ ...landmarks, image: { width: 1, height: 1 } }, landmarks.image)).toThrow("bust size");
    expect(landmarkProblems(landmarks, landmarks.image)).toEqual([]);
  });

  test("rehoming to the saved bust keeps identity and refuses other bytes", async () => {
    const f = fixture(), manifest = (await synthesizeHead({ ...f.input, source: f.source }, guard(), f.deps))!;
    expect(rehomeHead(manifest, "/characters/Synthetic/visual_y/bust.png", f.input.sha256).source).toBe("/characters/Synthetic/visual_y/bust.png");
    expect(() => rehomeHead(manifest, "/characters/Synthetic/visual_y/bust.png", "1".repeat(64))).toThrow("differs");
  });
});

describe("vision landmark provider (wired, never called for real here)", () => {
  const request = { source: "/characters/S/bust.png", sha256: "b".repeat(64), width: 160, height: 224, png: "cG5n" };
  test("builds the existing Sol request with size and schema, and reads its JSON answer", async () => {
    const { landmarks } = syntheticBust(1);
    const send = jest.fn(async () => ({ ok: true as const, text: `\`\`\`json\n${JSON.stringify({ refused: false, landmarks })}\n\`\`\``, finish: "stop" as const,
      meter: { effort: "high" as const, applied: true, collapsed: false, unsupported: null, budget: 0, chars: 0, tokens: null } }));
    const provider = visionLandmarkProvider({ target: async () => ({ id: "openai/gpt-6.1-sol", context: 32768, image: true }), send });
    expect(await provider(request, new AbortController().signal)).toEqual(JSON.parse(JSON.stringify(landmarks)));
    const sent = (send.mock.calls[0] as unknown as [ReturnType<typeof visionRigRequest>])[0];
    expect(sent.prompt).toContain("160 x 224"); expect(sent.prompt).toContain("\"landmarks\""); expect(sent.images?.[0].data).toBe("cG5n");
  });
  test("refusals, missing models and failed calls become author messages", async () => {
    expect(() => readLandmarkAnswer(JSON.stringify({ refused: true, reason: "hands cover the face" }))).toThrow("hands cover the face");
    expect(() => readLandmarkAnswer("no json")).toThrow("did not return");
    const none = visionLandmarkProvider({ target: async () => undefined, send: jest.fn() });
    await expect(none(request, new AbortController().signal)).rejects.toThrow("not offered");
    const failing = visionLandmarkProvider({ target: async () => ({ id: "openai/gpt-6.1-sol", context: 1, image: true }),
      send: async () => ({ ok: false as const, kind: "auth" as const, message: "sign in" }) });
    await expect(failing(request, new AbortController().signal)).rejects.toThrow("sign in");
  });
  test("the Sol offer holds while OpenCode's service is stopped and its image capability is not yet listed", () => {
    const row = (models: HarnessModel[], offered = true) => ({ pluginVersion: "1", harnesses: { opencode: { installed: true, version: "2", problem: null, loggedIn: null, fresh: false,
      loginProblem: null, blocked: null, offered, isolation: "", models, quotaUntil: null, spawns: 0, service: "stopped" } } });
    const sol = { id: VISION_RIG_MODEL, context: 200000 };
    expect(visionTarget(row([sol]))).toEqual(sol);
    expect(visionTarget(row([{ ...sol, image: true, available: true }]))).toEqual({ ...sol, image: true, available: true });
    expect(visionTarget(row([{ ...sol, image: false }]))).toBeUndefined();
    expect(visionTarget(row([{ ...sol, available: false }]))).toBeUndefined();
    expect(visionTarget(row([sol], false))).toBeUndefined();
    expect(visionTarget(null)).toBeUndefined();
    expect(visionRigRequest({ sha256: "b".repeat(64) }, "cG5n", sol, new AbortController().signal).model).toBe(VISION_RIG_MODEL);
    expect(() => visionRigRequest({ sha256: "b".repeat(64) }, "cG5n", { ...sol, image: false }, new AbortController().signal)).toThrow("Choose the offered Sol");
  });
});
