import { webcrypto } from "node:crypto";
import type { PoseEntry } from "@engine/poseSchema";
import { shippedPoses } from "./library";
import { poseCacheKey } from "./layers";
import { retargetPose, RETARGET_VERSION, type Retarget } from "./retarget";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const poses = shippedPoses(), byId = (id: string) => poses.find((pose) => pose.id === id)!;
const standing = byId("stand_relaxed").keypoints;
const canvas: [number, number] = [768, 1152];
const box = { x: 216, y: 25, width: 318, height: 1088 };
const scaled = (factor: number, dx: number, dy: number): PoseEntry["keypoints"] => ({ ...standing,
  points: standing.points.map((point) => point ? [dx + (point[0] - 384) * factor, dy + (point[1] - 130) * factor] : null) });
const member = scaled(0.78, 380, 140);
const target: Retarget = { canvas, box, member, version: RETARGET_VERSION };
const bone = (points: PoseEntry["keypoints"]["points"], a: number, b: number): number => {
  const from = points[a]!, to = points[b]!;
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
};

test("a standing pose retargeted onto a measured member reproduces that member's skeleton", () => {
  const out = retargetPose(byId("stand_relaxed"), target, standing);
  out.points.forEach((point, at) => {
    expect(Math.hypot(point![0] - member.points[at]![0], point![1] - member.points[at]![1])).toBeLessThan(1.5);
  });
});

test("bone lengths follow the member, with foreshortening capped, not the library's proportions", () => {
  const out = retargetPose(byId("sit_chair"), target, standing);
  for (const [a, b] of [[1, 8], [8, 9], [9, 10], [1, 2], [2, 3]] as const) {
    const measured = bone(member.points, a, b);
    expect(bone(out.points, a, b)).toBeLessThanOrEqual(measured * 1.1 + 1);
    expect(bone(out.points, a, b)).toBeGreaterThanOrEqual(measured * 0.25 - 1);
  }
  expect(bone(out.points, 1, 8)).toBeGreaterThan(bone(member.points, 1, 8) * 0.85);
});

test("sitting, kneeling and lying poses rest on the member's floor line; airborne and upright poses keep the standing hip height", () => {
  const floor = Math.max(member.points[10]![1], member.points[13]![1]);
  for (const id of ["sit_chair", "sit_floor", "kneel_one", "crouch", "lie_side", "lie_back"]) {
    const ys = retargetPose(byId(id), target, standing).points.flatMap((point) => point ? [point[1]] : []);
    expect(Math.max(...ys)).toBeCloseTo(floor, 0);
  }
  const hipMid = (points: PoseEntry["keypoints"]["points"]) => (points[8]![1] + points[11]![1]) / 2;
  const memberHip = hipMid(member.points);
  expect(hipMid(retargetPose(byId("stand_hands_hips"), target, standing).points)).toBeCloseTo(memberHip, 0);
  const jump = retargetPose(byId("jump"), target, standing).points;
  expect(Math.max(jump[10]![1], jump[13]![1])).toBeLessThan(floor - 40);
});

test("without a measured member the whole skeleton scales uniformly, never per axis", () => {
  const out = retargetPose(byId("fight_thrust"), { canvas, box }, standing);
  const source = byId("fight_thrust").keypoints.points;
  const ratio = (points: PoseEntry["keypoints"]["points"]) => bone(points, 2, 5) / bone(points, 1, 8);
  expect(ratio(out.points)).toBeCloseTo(ratio(source), 1);
  const width = (points: PoseEntry["keypoints"]["points"]) => points.flatMap((p) => p ? [p[0]] : []);
  const height = (points: PoseEntry["keypoints"]["points"]) => points.flatMap((p) => p ? [p[1]] : []);
  const aspect = (points: PoseEntry["keypoints"]["points"]) => (Math.max(...width(points)) - Math.min(...width(points))) / (Math.max(...height(points)) - Math.min(...height(points)));
  expect(aspect(out.points)).toBeCloseTo(aspect(source), 1);
});

test("every shipped pose lands inside the canvas with all its visible joints, measured or not", () => {
  for (const pose of poses) for (const withMember of [true, false]) {
    const out = retargetPose(pose, withMember ? target : { canvas, box }, standing);
    expect(out.points.filter(Boolean)).toHaveLength(pose.keypoints.points.filter(Boolean).length);
    out.points.forEach((point, at) => {
      expect(point === null).toBe(pose.keypoints.points[at] === null);
      if (point) {
        expect(Number.isFinite(point[0]) && Number.isFinite(point[1])).toBe(true);
        expect(point[0]).toBeGreaterThanOrEqual(0);
        expect(point[0]).toBeLessThan(canvas[0]);
        expect(point[1]).toBeGreaterThanOrEqual(0);
        expect(point[1]).toBeLessThan(canvas[1]);
      }
    });
  }
});

test("a pose without a neck, a member missing joints and an oversized pose still retarget", () => {
  const noNeck = { ...byId("sit_chair"), keypoints: { ...byId("sit_chair").keypoints, points: byId("sit_chair").keypoints.points.map((p, at) => at === 1 ? null : p) } };
  expect(retargetPose(noNeck, target, standing).points[1]).toBeNull();
  const partial = { ...member, points: member.points.map((point, at) => [2, 3, 4, 10].includes(at) ? null : point) };
  const out = retargetPose(byId("point"), { canvas, box, member: partial }, standing);
  expect(out.points.every((point) => point === null || point[0] >= 0 && point[1] >= 0)).toBe(true);
  const tight = retargetPose(byId("lie_back"), { canvas: [400, 300], box: { x: 20, y: 20, width: 360, height: 260 }, member: scaled(0.78, 200, 80) }, standing);
  expect(tight.points.every((point) => point === null || point[0] < 400 && point[1] < 300)).toBe(true);
});

test("the body cache key changes with the measured member and with the retarget algorithm version", async () => {
  const fingerprint = { name: "model", sha256: "a".repeat(64), size: 1 };
  const input = { story: "s", member: "a", fields: {}, pose: byId("sit_chair"), retarget: target, recipe: { id: "p2", version: 1 },
    models: { diffusion: fingerprint, encoder: fingerprint, vae: fingerprint }, base: "a", steps: 25, resolution: 1024 };
  const key = await poseCacheKey(input);
  expect(await poseCacheKey({ ...input, retarget: { ...target, member: scaled(0.7, 380, 140) } })).not.toBe(key);
  expect(await poseCacheKey({ ...input, retarget: { ...target, version: RETARGET_VERSION + 1 } })).not.toBe(key);
  expect(await poseCacheKey({ ...input, retarget: { canvas, box } })).not.toBe(key);
});

test("invalid boxes and ratios are refused as before", () => {
  expect(() => retargetPose(byId("sit_chair"), { canvas, box: { x: 700, y: 0, width: 200, height: 100 } }, standing)).toThrow("alpha box");
  expect(() => retargetPose(byId("sit_chair"), { canvas, box, headToHip: 3 }, standing)).toThrow("Head-to-hip");
});
