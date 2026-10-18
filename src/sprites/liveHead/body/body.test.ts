import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../../test/support/fakeWebGl";
import { restHead, type HeadParameters } from "../drivers";
import { HeadDriver } from "../headDriver";
import { MotionDriver } from "../motionDriver";
import { headGrid } from "../geometry";
import { HairPhysics } from "../hair";
import { syntheticHead } from "../synthetic";
import { ArmPose, BodyFrame, armForeWeights, bodyWeights, deformBody, invertedTriangles } from "./geometry";
import { parseBodyLandmarks } from "./landmarks";
import { cutBodyLayers, fillBehindArms } from "./layers";
import { BodyRenderer, bodyHairHost } from "./renderer";
import { synthesizeBodyRig } from "./rig";
import { syntheticBody, syntheticBodyRig } from "./synthetic";
import { loadBodyManifest, validateBodyRig } from "./validate";

beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });

const rig = syntheticBodyRig;
const at = (patch: Partial<HeadParameters> = {}): HeadParameters => ({ ...restHead(), ...patch });
const EXTREMES: Array<Partial<HeadParameters>> = [
  { breath: 1 }, { bodyAngleX: -10, bodyAngleZ: -10 }, { bodyAngleX: 10, bodyAngleZ: 10 }, { armAngle: -10 }, { armAngle: 10 }, { handAngle: -10 }, { handAngle: 10 },
  { angleZ: -30 }, { angleZ: 30 }, { bodyAngleX: -10, bodyAngleZ: -10, armAngle: -10, handAngle: -10 }, { bodyAngleX: 10, bodyAngleZ: 10, armAngle: 10, handAngle: 10 },
];
const LANDMARKS = {
  version: 1, kind: "body", image: { width: 400, height: 600 }, pose: "standing", head: { cx: 200, cy: 70, rx: 38, ry: 46 }, eyes: [[186, 72], [214, 72]],
  neck: [200, 128], shoulders: [[150, 145], [250, 145]], chest: [200, 180], waist: [200, 250], hips: [[180, 300], [220, 300]],
  arms: [{ side: "left", state: "free", shoulder: [150, 145], elbow: [138, 225], wrist: [132, 300], outline: rig.arms?.[0].outline }],
  hair: [[[170, 40], [160, 70], [156, 100], [154, 128]]],
};

describe("body rig format", () => {
  test("the synthetic body loads; bust manifests are not body manifests", () => {
    expect(syntheticBody.rig.arms).toHaveLength(2);
    expect(syntheticBody.layers.map((layer) => layer.name)).toEqual(["base", "arm0"]);
    expect(() => loadBodyManifest(syntheticHead)).toThrow("identity");
    expect(validateBodyRig(syntheticHead.rig).length).toBeGreaterThan(0);
  });

  test("an arm layer needs a free arm; a free arm without its layer loads", () => {
    expect(() => loadBodyManifest({ ...syntheticBody, layers: [...syntheticBody.layers, { name: "arm1", rect: [236, 128, 50, 206], image: syntheticBody.layers[0].image }] })).toThrow("free arm");
    expect(loadBodyManifest({ ...syntheticBody, layers: [syntheticBody.layers[0]] }).layers).toHaveLength(1);
    expect(validateBodyRig({ ...rig, torso: { ...rig.torso, pivotY: 100 } })).toContain("body: expected head, neck and hips from top to bottom");
  });

  test("landmarks: core problems refuse, a bad arm or lock is dropped with a note", () => {
    const parsed = parseBodyLandmarks(LANDMARKS, rig.image);
    expect(parsed.notes).toEqual([]);
    expect(parsed.marks.arms).toHaveLength(1);
    const degraded = parseBodyLandmarks({ ...LANDMARKS, arms: [{ ...LANDMARKS.arms[0], elbow: [150, 145] }], hair: [[[1, 1]]] }, rig.image);
    expect(degraded.marks.arms).toBeUndefined();
    expect(degraded.marks.hair).toBeUndefined();
    expect(degraded.notes).toHaveLength(2);
    expect(() => parseBodyLandmarks({ ...LANDMARKS, waist: [200, 320] }, rig.image)).toThrow("top to bottom");
    expect(() => parseBodyLandmarks({ ...LANDMARKS, image: { width: 401, height: 600 } }, rig.image)).toThrow("sprite size");
  });

  test("synthesis writes a valid rig with strands, eyes and arm tuning", () => {
    const built = synthesizeBodyRig(parseBodyLandmarks(LANDMARKS, rig.image).marks);
    expect(validateBodyRig(built)).toEqual([]);
    expect(built.strands).toHaveLength(1);
    expect(built.arms?.[0]).toMatchObject({ state: "free", swing: 0.12, bend: 0.22 });
    expect(built.torso.waistBand).toEqual([250, 300]);
  });
});

describe("body deformation", () => {
  const mesh = headGrid([0, 0, 400, 600], 8), weights = bodyWeights(rig, mesh.rest), frame = new BodyFrame(rig);
  const deform = (p: HeadParameters) => { const out = new Float32Array(mesh.rest.length); deformBody(rig, frame.set(p), mesh.rest, weights, out, null); return out; };
  const vertex = (out: Float32Array, x: number, y: number): [number, number] => { const v = (Math.round(y / 8) * 51 + Math.round(x / 8)) * 2; return [out[v], out[v + 1]]; };

  test("rest parameters are the identity", () => {
    expect(Array.from(deform(at()))).toEqual(Array.from(mesh.rest));
  });

  test("sway moves the head, keeps legs and feet planted", () => {
    const out = deform(at({ bodyAngleX: 10, bodyAngleZ: 10 }));
    expect(Math.abs(vertex(out, 200, 64)[0] - 200)).toBeGreaterThan(3);
    expect(vertex(out, 200, 400)).toEqual([200, 400]);
    expect(vertex(out, 200, 592)).toEqual([200, 592]);
  });

  test("a resting arm: the shoulder follows the torso, the hand stays put", () => {
    const out = deform(at({ bodyAngleX: 10, bodyAngleZ: 10 }));
    const shoulder = vertex(out, 248, 144), hand = vertex(out, 264, 320);
    expect(Math.hypot(shoulder[0] - 248, shoulder[1] - 144)).toBeGreaterThan(1.5);
    expect(Math.hypot(hand[0] - 264, hand[1] - 320)).toBeLessThan(0.01);
  });

  test("a free arm turns about its shoulder and keeps it attached", () => {
    const arm = rig.arms?.[0];
    if (!arm) throw new Error("expected an arm");
    const armMesh = headGrid([114, 128, 52, 206], 4), fore = armForeWeights(arm, armMesh.rest), pose = new ArmPose(rig, arm), out = new Float32Array(armMesh.rest.length);
    pose.set(frame.set(at()), 0, 0); pose.deform(armMesh.rest, fore, out);
    expect(Array.from(out).every((value, i) => Math.abs(value - armMesh.rest[i]) < 1e-9)).toBe(true);
    pose.set(frame.set(at({ bodyAngleZ: 10 })), 0.12, 0.22); pose.deform(armMesh.rest, fore, out);
    const base = new Float32Array(2);
    deformBody(rig, frame, new Float32Array(arm.shoulder), new Float64Array(bodyWeights(rig, new Float32Array(arm.shoulder))), base, null);
    expect(Math.hypot(pose.shoulderX - base[0], pose.shoulderY - base[1])).toBeLessThan(1e-4);
  });

  test("no inverted triangle in any layer at the review extremes", () => {
    const arm = rig.arms?.[0];
    if (!arm) throw new Error("expected an arm");
    const armMesh = headGrid([114, 128, 52, 206], 4), fore = armForeWeights(arm, armMesh.rest), pose = new ArmPose(rig, arm), out = new Float32Array(armMesh.rest.length);
    for (const extreme of EXTREMES) {
      expect(invertedTriangles(mesh.rest, deform(at(extreme)), mesh.triangles)).toBe(0);
      pose.set(frame.set(at(extreme)), (extreme.armAngle ?? 0) / 10 * arm.swing, (extreme.handAngle ?? 0) / 10 * arm.bend);
      pose.deform(armMesh.rest, fore, out);
      expect(invertedTriangles(armMesh.rest, out, armMesh.triangles)).toBe(0);
    }
  });

  test("hair anchors follow the body; held strands reach both extremes", () => {
    const physics = new HairPhysics(bodyHairHost(rig, frame.set(at())));
    expect(physics.strands).toHaveLength(2);
    for (let i = 0; i < 120; i++) { frame.set(at({ hair: 1, bodyAngleZ: 10 * Math.sin(i / 9) })); physics.step(at({ hair: 1, bodyAngleZ: 10 * Math.sin(i / 9) }), 1 / 60); }
    expect(Math.max(...Array.from(physics.offsets).map(Math.abs))).toBeGreaterThan(0.05);
  });
});

describe("body layers", () => {
  test("the hole fills only where the body continues behind the arm", () => {
    const width = 20, height = 20, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, body = (x >= 2 && x <= 8) || (x >= 12 && x <= 16);
      if (body) data.set([200, 100, 50, 255], i);
    }
    const hole = new Uint8Array(width * height);
    for (let y = 5; y < 15; y++) { for (let x = 5; x <= 7; x++) hole[y * width + x] = 1; for (let x = 14; x <= 19; x++) hole[y * width + x] = 1; }
    const out = fillBehindArms({ width, height, data }, hole);
    expect(out.data[(10 * width + 6) * 4 + 3]).toBe(255);
    expect(out.data[(10 * width + 6) * 4]).toBe(200);
    expect(out.data[(10 * width + 15) * 4 + 3]).toBe(255);
    expect(out.data[(10 * width + 18) * 4 + 3]).toBe(0);
  });

  test("only free arms are cut; the base keeps its size", () => {
    const image = { width: 400, height: 600, data: new Uint8ClampedArray(400 * 600 * 4).fill(255) };
    const cut = cutBodyLayers(image, rig);
    expect(cut.map((layer) => layer.name)).toEqual(["base", "arm0"]);
    expect(cut[0].rect).toEqual([0, 0, 400, 600]);
  });
});

describe("body renderer", () => {
  const make = () => {
    const gl = new FakeWebGl(), renderer = new BodyRenderer(fakeCanvas(gl, 200, 300), syntheticBody);
    syntheticBody.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    return { gl, renderer };
  };

  test("draws base and arm, uploads nothing while still", () => {
    const { gl, renderer } = make();
    expect(renderer.motionParts()).toEqual({ strands: 2, arms: ["arm0"] });
    renderer.draw(at(), 0);
    expect(gl.counts.draws).toBe(2);
    const before = gl.counts.bufferSubData;
    for (let i = 1; i <= 30; i++) renderer.draw(at(), i * 16.7);
    expect(gl.counts.bufferSubData).toBe(before);
    renderer.destroy();
  });

  test("driven motion is deterministic and reduced motion settles to no uploads", () => {
    const trace = () => {
      const { gl, renderer } = make(), head = new HeadDriver("body"), motion = new MotionDriver("body");
      for (let i = 0; i < 400; i++) { const t = i * 16.7, p = head.drive(t, "neutral", false, true); motion.apply(p, t, "neutral", "idle", true); renderer.draw(p, t); }
      return gl.frameDigests.slice(-50);
    };
    expect(trace()).toEqual(trace());
    const { gl, renderer } = make(), head = new HeadDriver("body"), motion = new MotionDriver("body");
    for (let i = 0; i < 10; i++) { const p = head.drive(i * 16.7, "neutral", false, false); motion.apply(p, i * 16.7, "neutral", "idle", false); renderer.draw(p, i * 16.7); }
    const before = gl.counts.bufferSubData;
    for (let i = 10; i < 610; i++) { const p = head.drive(i * 16.7, "neutral", false, false); motion.apply(p, i * 16.7, "neutral", "idle", false); renderer.draw(p, i * 16.7); }
    expect(gl.counts.bufferSubData).toBe(before);
  });
});
