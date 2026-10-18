import { rigStrands } from "../synthesis/rigGeometry";
import type { Band } from "../types";
import type { BodyLandmarks } from "./landmarks";
import type { BodyRig } from "./types";

export const BODY_TUNE = { headRoll: 0.1, standRoll: 0.03, sitRoll: 0.025, sway: 0.02, breath: 0.012, swing: 0.12, bend: 0.22 };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const ordered = (a: number, b: number, minimum: number): Band => (b - a >= minimum ? [r2(a), r2(b)] : [r2(b - minimum), r2(b)]);

export function synthesizeBodyRig(marks: BodyLandmarks): BodyRig {
  const { width, height } = marks.image, head = marks.head, neck = marks.neck;
  const hipX = (marks.hips[0][0] + marks.hips[1][0]) / 2, hipY = (marks.hips[0][1] + marks.hips[1][1]) / 2;
  const torsoLength = Math.max(8, hipY - neck[1]), shoulderY = (marks.shoulders[0][1] + marks.shoulders[1][1]) / 2;
  const shoulderWidth = Math.max(8, marks.shoulders[1][0] - marks.shoulders[0][0]), baseCell = Math.max(4, Math.round(Math.max(width, height) / 72));
  const rig: BodyRig = {
    version: 1, kind: "body", pose: marks.pose, image: { width, height },
    head: { cx: r2(head.cx), cy: r2(head.cy), rx: r2(head.rx), ry: r2(head.ry), pivotX: r2(neck[0]), pivotY: r2(neck[1]), maxRoll: BODY_TUNE.headRoll,
      band: ordered(Math.min(head.cy + head.ry * 0.45, neck[1] - 1), neck[1], Math.max(4, head.ry * 0.35)), side: [1.5, 3] },
    torso: { pivotX: r2(hipX), pivotY: r2(hipY), maxRoll: marks.pose === "sitting" ? BODY_TUNE.sitRoll : BODY_TUNE.standRoll,
      sway: r2(torsoLength * BODY_TUNE.sway), breath: r2(torsoLength * BODY_TUNE.breath),
      waistBand: ordered(marks.waist[1], hipY, torsoLength * 0.12), breathBand: ordered(shoulderY, marks.waist[1], torsoLength * 0.2),
      chest: { cx: r2(marks.chest[0]), cy: r2(marks.chest[1]), rx: r2(shoulderWidth * 0.45), ry: r2(torsoLength * 0.22) } },
    mesh: { baseCell, armCell: Math.max(3, Math.round(baseCell / 2)) },
  };
  if (marks.arms?.length) rig.arms = marks.arms.map((arm) => ({ ...arm, outline: arm.outline.map(([x, y]) => [x, y]), swing: BODY_TUNE.swing, bend: BODY_TUNE.bend }));
  const strands = marks.hair ? rigStrands(marks.hair, head.rx * 1.1) : [];
  if (strands.length) rig.strands = strands;
  if (marks.eyes) rig.eyes = marks.eyes.map(([x, y]) => ({ cx: r2(x), cy: r2(y), rx: r2(head.rx * 0.18), ry: r2(head.ry * 0.12) }));
  return rig;
}
