import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";
import { restHead, type HeadParameters } from "./drivers";
import { HeadDriver } from "./headDriver";
import { MotionDriver } from "./motionDriver";
import { HairPhysics, strandField, usableStrands } from "./hair";
import { HandBones, handWeights } from "./hand";
import { headGrid } from "./geometry";
import { HeadRenderer } from "./renderer";
import { loadHeadManifest } from "./manifest";
import { syntheticHead, syntheticMotionHead } from "./synthetic";
import type { Hand, Rig } from "./types";

beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });

const rig = syntheticMotionHead.rig;
const moving = (patch: Partial<HeadParameters> = {}): HeadParameters => ({ ...restHead(), hair: 1, ...patch });
const maxOffset = (offsets: Float64Array) => offsets.reduce((best, value) => Math.max(best, Math.abs(value)), 0);

describe("hair strands", () => {
  test("a rig without strands has no hair field and no physics work", () => {
    expect(strandField(syntheticHead.rig, headGrid([0, 0, 128, 192], 4).rest)).toBeNull();
    const physics = new HairPhysics(syntheticHead.rig);
    expect(physics.strands).toEqual([]);
    expect(physics.step(moving({ angleX: 20 }), 0.016)).toHaveLength(0);
  });

  test("weights are zero at the roots and inside the eyes, positive along the locks", () => {
    const mesh = headGrid([0, 0, 128, 192], 2), field = strandField(rig, mesh.rest);
    if (!field) throw new Error("expected a field");
    const weightAt = (x: number, y: number) => {
      const v = (Math.round(y / 2) * 65 + Math.round(x / 2));
      let sum = 0;
      for (let h = field.start[v]; h < field.start[v + 1]; h++) sum += field.weight[h];
      return sum;
    };
    expect(weightAt(44, 22)).toBeLessThan(0.01);
    expect(weightAt(46, 55)).toBeLessThan(0.05);
    expect(weightAt(24, 86)).toBeGreaterThan(0.3);
  });

  test("hair off resets to zero offsets; on, offsets stay inside each strand's soft limit", () => {
    const physics = new HairPhysics(rig);
    for (let i = 0; i < 300; i++) physics.step(moving({ angleX: 25 * Math.sin(i / 8), angleZ: 20 * Math.cos(i / 6), bodyAngleZ: 8 * Math.sin(i / 10) }), 1 / 60);
    expect(maxOffset(physics.offsets)).toBeGreaterThan(0.2);
    const limit = Math.max(...usableStrands(rig).map((strand) => strand.max));
    expect(maxOffset(physics.offsets)).toBeLessThanOrEqual(limit);
    physics.step({ ...restHead() }, 1 / 60);
    expect(maxOffset(physics.offsets)).toBe(0);
    expect(physics.active).toBe(false);
  });

  test("a long pause is clamped: one 10 s step equals one 50 ms step", () => {
    const one = new HairPhysics(rig), two = new HairPhysics(rig);
    for (const physics of [one, two]) for (let i = 0; i < 60; i++) physics.step(moving({ angleX: i % 20 }), 1 / 60);
    one.step(moving({ angleX: 25 }), 10); two.step(moving({ angleX: 25 }), 0.05);
    expect(Array.from(one.offsets)).toEqual(Array.from(two.offsets));
  });

  test("reduced motion keeps every strand still over 10 s of driven frames (LM3)", () => {
    const head = new HeadDriver("shape-motion"), motion = new MotionDriver("shape-motion"), physics = new HairPhysics(rig);
    for (let i = 0; i < 600; i++) {
      const p = head.drive(i * 16.7, "joy", false, false);
      motion.apply(p, i * 16.7, "joy", "idle", false);
      physics.step(p, 1 / 60);
      expect(maxOffset(physics.offsets)).toBe(0);
    }
  });

  test("the renderer re-uploads the base while hair moves and draws byte-identical frames for a strand-free rig", () => {
    const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), syntheticMotionHead);
    syntheticMotionHead.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    expect(renderer.motionParts()).toEqual({ strands: 4, hand: false });
    const still = { ...restHead(), hair: 1 };
    renderer.draw(still, 0);
    const before = gl.counts.bufferSubData;
    for (let i = 1; i <= 30; i++) renderer.draw(still, i * 16.7);
    expect(gl.counts.bufferSubData - before).toBeGreaterThanOrEqual(30);
    const plainGl = new FakeWebGl(), plain = new HeadRenderer(fakeCanvas(plainGl), syntheticHead);
    syntheticHead.layers.forEach((layer) => plain.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    plain.draw(still, 0);
    const plainBefore = plainGl.counts.bufferSubData;
    for (let i = 1; i <= 30; i++) plain.draw(still, i * 16.7);
    expect(plainGl.counts.bufferSubData).toBe(plainBefore);
    expect(plain.motionParts()).toEqual({ strands: 0, hand: false });
  });
});

const hand: Hand = {
  outline: [[30, 150], [50, 150], [52, 100], [40, 92], [28, 100]], jaw: [[28, 92], [52, 92]], jawRange: [28, 52], background: [[30, 150], [50, 150], [52, 100], [28, 100]],
  elbow: [20, 230], wrist: [40, 140], knuckle: [40, 104], contact: [40, 92], forearmShare: 0.3,
  armBand: [178, 206], wristBand: [130, 150], handBand: [131, 149], fingerXBand: [37, 48], fingerYBand: [109, 117], pinBand: [179, 192],
};

describe("hand bones", () => {
  const handRig: Rig = { ...syntheticHead.rig, hand };
  test("rest parameters leave the hand where it is drawn; arm and hand angles move it; fingers tap only past the knuckle", () => {
    const mesh = headGrid([26, 90, 28, 62], 4), weights = handWeights(hand, mesh.rest), bones = new HandBones(handRig, hand), out = new Float32Array(mesh.rest.length);
    bones.frame(restHead()); bones.deform(mesh.rest, weights, restHead(), out);
    for (let i = 0; i < out.length; i++) expect(Math.abs(out[i] - mesh.rest[i])).toBeLessThan(1e-3);
    const moved = { ...restHead(), armAngle: 10, handAngle: 10 };
    bones.frame(moved); bones.deform(mesh.rest, weights, moved, out);
    expect(Math.max(...Array.from(out, (value, i) => Math.abs(value - mesh.rest[i])))).toBeGreaterThan(0.3);
    const tap = { ...restHead(), fingerTap: 1 };
    bones.frame(tap); bones.deform(mesh.rest, weights, tap, out);
    const tip = 8, low = mesh.rest.length - 2;
    expect([mesh.rest[tip], mesh.rest[tip + 1]]).toEqual([42, 90]);
    expect(Math.hypot(out[tip] - mesh.rest[tip], out[tip + 1] - mesh.rest[tip + 1])).toBeGreaterThan(Math.hypot(out[low] - mesh.rest[low], out[low + 1] - mesh.rest[low + 1]));
  });

  test("the manifest accepts a hand layer only with hand bones, and ignores accessories", () => {
    const handLayer = { name: "hand", rect: [26, 90, 28, 62], image: syntheticHead.layers[0].image };
    expect(loadHeadManifest({ ...syntheticHead, rig: handRig, layers: [...syntheticHead.layers, handLayer] }).layers.map((layer) => layer.name).at(-1)).toBe("hand");
    expect(() => loadHeadManifest({ ...syntheticHead, layers: [...syntheticHead.layers, handLayer] })).toThrow("hand bones");
    expect(loadHeadManifest({ ...syntheticHead, rig: handRig }).layers).toHaveLength(9);
    const accessory = { name: "charm", pivot: [60, 100], tip: [60, 120], split: 0.4, box: [50, 95, 70, 125], color: { redness: 0.3, minRed: 80 } };
    expect(loadHeadManifest({ ...syntheticHead, rig: { ...syntheticHead.rig, accessories: [accessory] } }).layers).toHaveLength(9);
  });

  test("the renderer draws the hand layer last and leaves a hand rig without its layer still", () => {
    const handLayer = { name: "hand", rect: [26, 90, 28, 62] as [number, number, number, number], image: syntheticHead.layers[0].image };
    const manifest = loadHeadManifest({ ...syntheticHead, rig: handRig, layers: [...syntheticHead.layers, handLayer] });
    const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), manifest);
    manifest.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    expect(renderer.motionParts()).toEqual({ strands: 0, hand: true });
    renderer.draw(restHead(), 0);
    expect(gl.counts.draws).toBe(10);
    const bare = new HeadRenderer(fakeCanvas(new FakeWebGl()), loadHeadManifest({ ...syntheticHead, rig: handRig }));
    expect(bare.motionParts()).toEqual({ strands: 0, hand: false });
  });
});

test("a held hair pose places every strand tip at its soft limit for review frames", () => {
  const physics = new HairPhysics(rig);
  physics.hold(1, 0);
  physics.step({ ...restHead() }, 1 / 60);
  const tips = usableStrands(rig).map((strand, s) => physics.offsets[s * 16 + (strand.nodes.length - 1) * 2]);
  expect(tips).toEqual(usableStrands(rig).map((strand) => strand.max * 0.9));
  physics.hold(null);
  physics.step({ ...restHead() }, 1 / 60);
  expect(maxOffset(physics.offsets)).toBe(0);
});
