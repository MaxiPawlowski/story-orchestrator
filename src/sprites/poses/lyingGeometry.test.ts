import { createHash, webcrypto } from "node:crypto";
import type { PoseEntry } from "@engine/poseSchema";
import { shippedPoses } from "./library";
import { poseCacheKey } from "./layers";
import { poseHead } from "./bodyRenderer";
import { BODY_EDGES } from "./skeleton";
import { retargetPose, RETARGET_VERSION, type Retarget } from "./retarget";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

type Points = PoseEntry["keypoints"]["points"];
const poses = shippedPoses(), byId = (id: string) => poses.find((pose) => pose.id === id)!;
const standing = byId("stand_relaxed").keypoints;
const canvas: [number, number] = [768, 1152];

const LEGACY_LIE_SIDE_V1: Points = [[125, 430], [170, 525], [140, 530], [95, 650], [145, 460], [190, 570], [320, 595], [435, 630], [345, 660], [500, 690], [660, 715],
  [375, 710], [500, 785], [660, 800], [112, 416], [137, 416], [100, 436], [150, 436]];

const distance = (points: Points, a: number, b: number): number => Math.hypot(points[b]![0] - points[a]![0], points[b]![1] - points[a]![1]);
const angle = (points: Points, a: number, b: number): number => Math.atan2(points[b]![1] - points[a]![1], points[b]![0] - points[a]![0]) * 180 / Math.PI;
const hipMiddle = (points: Points): [number, number] => [(points[8]![0] + points[11]![0]) / 2, (points[8]![1] + points[11]![1]) / 2];
const torsoTilt = (points: Points): number => {
  const [x, y] = hipMiddle(points);
  return Math.abs(Math.atan2(y - points[1]![1], Math.abs(x - points[1]![0])) * 180 / Math.PI);
};
const side = (points: Points, at: number): number => {
  const [x, y] = hipMiddle(points), neck = points[1]!, point = points[at]!;
  return Math.sign((x - neck[0]) * (point[1] - neck[1]) - (y - neck[1]) * (point[0] - neck[0]));
};
const wrap = (degrees: number): number => ((degrees + 540) % 360) - 180;
const bones = BODY_EDGES.map(([a, b], at) => ({ a, b, at }));

const member = (sx: number, sy: number): Points => standing.points.map((p) => p ? [384 + (p[0] - 384) * sx, 60 + (p[1] - 130) * sy] : null);
const boxOf = (points: Points) => {
  const xs = points.flatMap((p) => p ? [p[0]] : []), ys = points.flatMap((p) => p ? [p[1]] : []);
  return { x: Math.floor(Math.min(...xs)) - 10, y: Math.floor(Math.min(...ys)) - 20, width: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 20, height: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 30 };
};
const targetFor = (points: Points): Retarget => ({ canvas, box: boxOf(points), member: { ...standing, points }, version: RETARGET_VERSION });
const PROPORTIONS: Array<[string, number, number]> = [["small", 0.6, 0.6], ["average", 0.78, 0.78], ["tall and narrow", 0.7, 0.95], ["short and wide", 1, 0.72]];

const standLength = (child: number): number => {
  const parent = BODY_EDGES.find(([, b]) => b === child)![0], mirror = ({ 2: 5, 5: 2, 3: 6, 6: 3, 4: 7, 7: 4, 8: 11, 11: 8, 9: 12, 12: 9, 10: 13, 13: 10, 14: 15, 15: 14, 16: 17, 17: 16 } as Record<number, number>)[child];
  const own = distance(standing.points, parent, child);
  if (mirror === undefined) return own;
  const other = distance(standing.points, BODY_EDGES.find(([, b]) => b === mirror)![0], mirror);
  return (own + other) / 2;
};

function expectedLengths(source: Points, measured: Points, rigidTrunk: boolean): number[] {
  const lengths = bones.map(({ a, b }) => distance(measured, a, b) * Math.max(0.25, Math.min(1.1, distance(source, a, b) / standLength(b))));
  if (rigidTrunk) for (const [x, y] of [[2, 5], [8, 11]]) {
    const left = bones.findIndex(({ b }) => b === x), right = bones.findIndex(({ b }) => b === y), mean = (lengths[left] + lengths[right]) / 2;
    lengths[left] = lengths[right] = mean;
  }
  return lengths;
}

const lieSide = byId("lie_side"), lieBack = byId("lie_back");

test("lie_side is authored as a horizontal side-lying figure with one proportion and mirrored limbs", () => {
  const points = lieSide.keypoints.points;
  expect(points.every(Boolean)).toBe(true);
  expect(torsoTilt(points)).toBeLessThan(3);
  expect(Math.abs(wrap(angle(points, 1, 0) - 180))).toBeLessThan(15);
  const bonePairs = [[1, 2, 1, 5], [2, 3, 5, 6], [3, 4, 6, 7], [1, 8, 1, 11], [8, 9, 11, 12], [9, 10, 12, 13], [0, 14, 0, 15], [14, 16, 15, 17]];
  for (const [a, b, c, d] of bonePairs) expect(Math.abs(distance(points, a, b) - distance(points, c, d))).toBeLessThanOrEqual(0.03 * distance(points, a, b) + 1.5);
  const ratios = [[1, 0], [1, 8], [8, 9], [9, 10], [2, 3], [3, 4]].map(([a, b]) => distance(points, a, b) / standLength(b));
  expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.15);
  expect(points[2]![1]).toBeLessThan(points[5]![1]);
  expect(points[8]![1]).toBeLessThan(points[11]![1]);
  expect(points[10]![1]).toBeLessThan(points[13]![1]);
  expect(Math.max(...points.map((p) => p![1]))).toBeLessThanOrEqual(Math.max(points[10]![1], points[13]![1], points[6]![1]));
});

test("a changed lie_side carries a new pose version and a different body cache identity", async () => {
  expect(lieSide.version).toBeGreaterThan(1);
  const fingerprint = { name: "model", sha256: "a".repeat(64), size: 1 };
  const input = { story: "s", member: "a", fields: {}, pose: lieSide, retarget: { canvas, box: { x: 216, y: 25, width: 318, height: 1088 }, version: RETARGET_VERSION },
    recipe: { id: "p2", version: 1 }, models: { diffusion: fingerprint, encoder: fingerprint, vae: fingerprint }, base: "a", steps: 25, resolution: 1024 };
  const legacy = { ...lieSide, version: 1, keypoints: { ...lieSide.keypoints, points: LEGACY_LIE_SIDE_V1 } };
  expect(await poseCacheKey({ ...input, pose: legacy })).not.toBe(await poseCacheKey(input));
  expect(await poseCacheKey({ ...input, retarget: { ...input.retarget, version: RETARGET_VERSION - 1 } })).not.toBe(await poseCacheKey(input));
  expect(RETARGET_VERSION).toBeGreaterThan(2);
});

describe.each(PROPORTIONS)("lying poses on a %s member", (_name, sx, sy) => {
  const points = member(sx, sy), target = targetFor(points);

  test.each(["lie_side", "lie_back"])("%s keeps a horizontal torso and every library bone direction", (id) => {
    const pose = byId(id), out = retargetPose(pose, target, standing).points;
    expect(torsoTilt(out)).toBeLessThan(3);
    expect(Math.abs(torsoTilt(out) - torsoTilt(pose.keypoints.points))).toBeLessThan(1);
    for (const { a, b } of bones) expect(Math.abs(wrap(angle(out, a, b) - angle(pose.keypoints.points, a, b)))).toBeLessThan(1.5);
  });

  test.each(["lie_side", "lie_back"])("%s joins bones at the member's own foreshortened lengths under one uniform fit", (id) => {
    const pose = byId(id), out = retargetPose(pose, target, standing).points, expected = expectedLengths(pose.keypoints.points, points, true);
    const fits = bones.map(({ a, b }, at) => distance(out, a, b) / expected[at]).sort((x, y) => x - y), k = fits[fits.length >> 1];
    expect(k).toBeGreaterThan(0.3);
    expect(k).toBeLessThanOrEqual(1.001);
    bones.forEach(({ a, b }, at) => expect(Math.abs(distance(out, a, b) - k * expected[at])).toBeLessThanOrEqual(0.01 * k * expected[at] + 0.4));
  });

  test("lie_side keeps its left and right sides and mirrored bones match in length", () => {
    const out = retargetPose(lieSide, target, standing).points;
    for (const at of [2, 5, 8, 11]) expect(side(out, at)).toBe(side(lieSide.keypoints.points, at));
    for (const at of [2, 8]) expect(side(out, at)).toBe(-1);
    for (const at of [5, 11]) expect(side(out, at)).toBe(1);
    for (const [right, left] of [[2, 5], [8, 11], [9, 12], [10, 13]]) expect(out[right]![1]).toBeLessThan(out[left]![1]);
    for (const [x, y] of [[[1, 2], [1, 5]], [[2, 3], [5, 6]], [[3, 4], [6, 7]], [[1, 8], [1, 11]], [[8, 9], [11, 12]], [[9, 10], [12, 13]], [[0, 14], [0, 15]], [[14, 16], [15, 17]]]) {
      expect(Math.abs(distance(out, x[0], x[1]) - distance(out, y[0], y[1]))).toBeLessThanOrEqual(0.02 * distance(out, x[0], x[1]) + 0.4);
    }
  });

  test("lie_side keeps the head in proportion to the body and rests on the member's floor line inside the canvas", () => {
    const out = retargetPose(lieSide, target, standing).points, floor = Math.max(points[10]![1], points[13]![1]);
    const headRatio = distance(out, 1, 0) / distance(points, 1, 0), torsoRatio = distance(out, 1, 8) / distance(points, 1, 8);
    expect(Math.abs(headRatio - torsoRatio) / torsoRatio).toBeLessThan(0.1);
    expect(Math.max(...out.map((p) => p![1]))).toBeCloseTo(floor, 0);
    const xs = out.map((p) => p![0]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(target.box.x + target.box.width / 2, 0);
    out.forEach((p) => { expect(p![0]).toBeGreaterThanOrEqual(0); expect(p![0]).toBeLessThan(canvas[0]); expect(p![1]).toBeGreaterThanOrEqual(0); expect(p![1]).toBeLessThan(canvas[1]); });
  });

  test("lie_side is deterministic", () => {
    expect(JSON.stringify(retargetPose(lieSide, target, standing))).toBe(JSON.stringify(retargetPose(lieSide, target, standing)));
  });
});

describe("a lying pose without a full measurement", () => {
  const box = { x: 216, y: 25, width: 318, height: 1088 };

  test("an alpha box alone scales the library shape uniformly and keeps a horizontal torso", () => {
    const out = retargetPose(lieSide, { canvas, box }, standing).points, source = lieSide.keypoints.points;
    const ratios = bones.map(({ a, b }) => distance(out, a, b) / distance(source, a, b)), mean = ratios.reduce((x, y) => x + y, 0) / ratios.length;
    ratios.forEach((ratio) => expect(Math.abs(ratio - mean) / mean).toBeLessThan(0.03));
    expect(torsoTilt(out)).toBeLessThan(3);
    for (const [right, left] of [[2, 5], [8, 11], [9, 12], [10, 13]]) expect(out[right]![1]).toBeLessThan(out[left]![1]);
  });

  test("a member missing arm, leg and hip joints still lands every library joint inside the canvas with the library direction", () => {
    const full = member(0.78, 0.78), missing = full.map((p, at) => [3, 4, 7, 10, 13].includes(at) ? null : p) as Points;
    const out = retargetPose(lieSide, { canvas, box: boxOf(full), member: { ...standing, points: missing } }, standing).points;
    expect(out.filter(Boolean)).toHaveLength(18);
    expect(torsoTilt(out)).toBeLessThan(3);
    out.forEach((p) => { expect(p![0]).toBeGreaterThanOrEqual(0); expect(p![0]).toBeLessThan(canvas[0]); expect(p![1]).toBeGreaterThanOrEqual(0); expect(p![1]).toBeLessThan(canvas[1]); });
  });

  test("the head box follows the retargeted head, stays inside the canvas and falls back to the alpha box without head joints", () => {
    const out = { ...standing, points: retargetPose(lieSide, targetFor(member(0.78, 0.78)), standing).points };
    const head = poseHead(out, { x: 1, y: 2, width: 3, height: 4 });
    expect(head.x).toBeGreaterThanOrEqual(0);
    expect(head.y).toBeGreaterThanOrEqual(0);
    expect(head.x + head.width).toBeLessThanOrEqual(canvas[0]);
    expect(head.y + head.height).toBeLessThanOrEqual(canvas[1]);
    for (const at of [0, 14, 15, 16, 17]) {
      const [x, y] = out.points[at]!;
      expect(x).toBeGreaterThanOrEqual(head.x);
      expect(x).toBeLessThanOrEqual(head.x + head.width);
      expect(y).toBeGreaterThanOrEqual(head.y);
      expect(y).toBeLessThanOrEqual(head.y + head.height);
    }
    const headless = { ...out, points: out.points.map((p, at) => [0, 14, 15, 16, 17].includes(at) ? null : p) };
    expect(poseHead(headless, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe("a lying skeleton whose two trunk sides differ in length", () => {
  const legacy: PoseEntry = { ...lieSide, version: 1, keypoints: { ...lieSide.keypoints, points: LEGACY_LIE_SIDE_V1 } };
  const skewed = (tags: PoseEntry["tags"]): PoseEntry => ({ ...lieSide, tags, keypoints: { ...lieSide.keypoints, points: lieSide.keypoints.points.map((p, at) => at === 11 ? [p![0] + 50, p![1]] : p) } });
  const target = targetFor(member(0.78, 0.78));

  test("its trunk bones come out rigid for a lying pose", () => {
    for (const pose of [legacy, skewed(["lying"])]) {
      const out = retargetPose(pose, target, standing).points;
      expect(Math.abs(distance(out, 1, 8) - distance(out, 1, 11))).toBeLessThanOrEqual(0.3);
      expect(Math.abs(distance(out, 1, 2) - distance(out, 1, 5))).toBeLessThanOrEqual(0.3);
    }
  });

  test("the library trunk axis is kept when the sides are made equal", () => {
    const out = retargetPose(legacy, target, standing).points;
    expect(Math.abs(torsoTilt(out) - torsoTilt(LEGACY_LIE_SIDE_V1))).toBeLessThan(1.5);
  });

  test("every shipped lying pose has a rigid trunk after retargeting", () => {
    for (const pose of poses.filter((entry) => entry.tags.includes("lying"))) for (const withMember of [true, false]) {
      const out = retargetPose(pose, withMember ? target : { canvas, box: target.box }, standing).points;
      expect(Math.abs(distance(out, 1, 8) - distance(out, 1, 11))).toBeLessThanOrEqual(0.3);
      expect(Math.abs(distance(out, 1, 2) - distance(out, 1, 5))).toBeLessThanOrEqual(0.3);
    }
  });

  test("the same skeleton under a non-lying tag keeps the earlier per-side lengths", () => {
    const out = retargetPose(skewed(["sitting"]), target, standing).points;
    expect(Math.abs(distance(out, 1, 8) - distance(out, 1, 11))).toBeGreaterThan(5);
  });
});

test("every shipped standing, seated, kneeling, moving, fighting, casting and gesture pose retargets exactly as before the lying repair", () => {
  const earlierMember: Points = standing.points.map((p) => p ? [380 + (p[0] - 384) * 0.78, 140 + (p[1] - 130) * 0.78] : null);
  const earlierBox = { x: 216, y: 25, width: 318, height: 1088 };
  const rows = poses.filter((pose) => !pose.tags.includes("lying")).map((pose) => [pose.id, retargetPose(pose, { canvas, box: earlierBox, member: { ...standing, points: earlierMember } }, standing).points,
    retargetPose(pose, { canvas, box: earlierBox }, standing).points]);
  expect(rows).toHaveLength(37);
  expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe("94b0e7af5b1a7566c1f72df3fc5445a5d0a0a4f79f0842e59d551c09656b90be");
});
