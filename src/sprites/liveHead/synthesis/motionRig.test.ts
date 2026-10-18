import { createHash } from "node:crypto";
import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../../builder/pixels";
import type { Point } from "../types";
import { syntheticBust } from "./syntheticBust";
import { optionalLandmarkNotes, parseLandmarks } from "./landmarks";
import { resampleStrand, synthesizeRig } from "./rigGeometry";
import { cutHeadLayers } from "./layers";
import { encodePngStored, base64 } from "./png";
import { synthesizeHead, type RigSynthesisDeps } from "./synthesize";
import { validateRig } from "../validate";
import { HEAD_LAYERS } from "../manifest";
import { visionRigRequest, VISION_RIG_MODEL } from "../visionRequest";

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const guard = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
const HAIR: Point[][] = [[[50, 30], [46, 45], [42, 58]], [[110, 30], [114, 45], [118, 58]], [[36, 60], [33, 90], [34, 118], [38, 140]]];
const HAND = { outline: [[118, 222], [140, 222], [142, 180], [132, 168], [118, 176]] as Point[], wrist: [130, 212] as Point, knuckle: [131, 182] as Point, elbow: [150, 290] as Point };
const at = (image: PixelImage, x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

describe("motion fields in landmark synthesis", () => {
  test("hair polylines become four-node strands scaled to the bust; chest moves the chest ellipse", () => {
    const bust = syntheticBust(1), marks = parseLandmarks({ ...bust.landmarks, hair: HAIR, chest: [80, 190] }, bust.image), rig = synthesizeRig(marks);
    expect(validateRig(rig)).toEqual([]);
    expect(rig.strands?.map((strand) => strand.nodes.length)).toEqual([4, 4, 4]);
    expect(rig.strands?.[0].nodes[0]).toEqual([50, 30]);
    expect(rig.strands?.[2].nodes[3]).toEqual([38, 140]);
    expect(rig.strands?.[2]).toMatchObject({ k: 0.6 });
    expect(rig.strands?.[0].max).toBeLessThan(rig.strands?.[2].max ?? 0);
    expect([rig.body.chest.cx, rig.body.chest.cy]).toEqual([80, 190]);
    expect(resampleStrand([[0, 0], [9, 0]])).toEqual([[0, 0], [3, 0], [6, 0], [9, 0]]);
  });

  test("bad optional groups are dropped with notes, never refusing the face", () => {
    const bust = syntheticBust(1), raw = { ...bust.landmarks, hair: [HAIR[0], [[10, 10]], [[5, 5], [5, 5], [9, 9]], [[-5, 0], [10, 10]]], chest: [999, 0], hand: { outline: [[1, 1]] } };
    const notes = optionalLandmarkNotes(raw, bust.image);
    expect(notes).toHaveLength(5);
    const marks = parseLandmarks(raw, bust.image);
    expect(marks.hair).toHaveLength(1);
    expect(marks.chest).toBeUndefined();
    expect(marks.hand).toBeUndefined();
    expect(parseLandmarks({ ...bust.landmarks, hair: new Array(11).fill(HAIR[0]) }, bust.image).hair).toBeUndefined();
    expect(synthesizeRig(parseLandmarks(bust.landmarks, bust.image))).toEqual(synthesizeRig(bust.landmarks));
  });

  test("a hand cuts its own layer and fills its hole in the base; a downward hand is left still", async () => {
    const bust = syntheticBust(1), marks = parseLandmarks({ ...bust.landmarks, hand: HAND }, bust.image), rig = synthesizeRig(marks);
    expect(rig.hand).toMatchObject({ wrist: [130, 212], knuckle: [131, 182], forearmShare: 0.3 });
    expect(validateRig(rig)).toEqual([]);
    const layers = cutHeadLayers(bust.image, rig), hand = layers.find((layer) => layer.name === "hand"), base = layers[0];
    expect(layers.map((layer) => layer.name)).toEqual([...HEAD_LAYERS, "hand"]);
    if (!hand) throw new Error("no hand layer");
    expect(at(hand.image, 130 - hand.rect[0], 200 - hand.rect[1])[3]).toBe(255);
    expect(at(bust.image, 122, 216)[3]).toBe(255);
    expect(at(base.image, 122, 216)[3]).toBeGreaterThan(200);
    expect(at(bust.image, 140, 182)[3]).toBe(0);
    expect(at(base.image, 140, 182)[3]).toBeLessThan(128);
    expect(synthesizeRig(parseLandmarks({ ...bust.landmarks, hand: { ...HAND, knuckle: [131, 220], wrist: [130, 190] } }, bust.image)).hand).toBeUndefined();
    const png = encodePngStored(bust.image);
    const deps: RigSynthesisDeps = { landmarks: async () => ({ ...bust.landmarks, hand: HAND, hair: HAIR }), read: async () => png, hash: async (bytes) => sha(bytes),
      decode: async () => bust.image, encode: async (image) => base64(encodePngStored(image)) };
    const manifest = await synthesizeHead({ member: "shape", look: "look_blue", source: "/characters/Synthetic/visual_x/bust.png", sha256: sha(png) }, guard(), deps);
    expect(manifest?.layers.map((layer) => layer.name)).toEqual([...HEAD_LAYERS, "hand"]);
    expect(manifest?.rig.strands).toHaveLength(3);
  });

  test("the vision prompt asks for hair, chest and an upward hand and keeps the old keys", () => {
    const request = visionRigRequest({ sha256: "a".repeat(64) }, "data", { id: VISION_RIG_MODEL, label: "Sol" } as never, new AbortController().signal, { width: 400, height: 380 });
    expect(request.prompt).toContain("\"hair\":");
    expect(request.prompt).toContain("never on skin, eyes or clothing");
    expect(request.prompt).toContain("pointing up");
    expect(request.prompt).toContain("\"ears\":");
  });
});
