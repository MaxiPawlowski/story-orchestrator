import type { PoseEntry, PosePoint } from "@engine/poseSchema";

export const BODY_EDGES: ReadonlyArray<readonly [number, number]> = [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1,
  0], [0, 14], [14, 16], [0, 15], [15, 17]];
const COLORS = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff",
  "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055"];

export interface Retarget { canvas: [number, number]; box: { x: number; y: number; width: number; height: number }; headToHip?: number }

export function retargetPose(pose: PoseEntry, target: Retarget): PoseEntry["keypoints"] {
  const { box, canvas } = target;
  if (![...canvas, box.width, box.height].every((n) => Number.isFinite(n) && n > 0) || ![box.x, box.y].every((n) => Number.isFinite(n) && n >= 0)
    || box.x + box.width > canvas[0] || box.y + box.height > canvas[1]) throw new Error("Retarget needs an alpha box inside the sprite canvas.");
  const visible = pose.keypoints.points.filter((point): point is [number, number] => point !== null);
  const minX = Math.min(...visible.map((p) => p[0])), maxX = Math.max(...visible.map((p) => p[0]));
  const minY = Math.min(...visible.map((p) => p[1])), maxY = Math.max(...visible.map((p) => p[1]));
  const sx = box.width / Math.max(1, maxX - minX), sy = box.height / Math.max(1, maxY - minY);
  const ratio = target.headToHip;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0 || ratio > 2)) throw new Error("Head-to-hip ratio must be positive and at most two.");
  const neck = pose.keypoints.points[1], hip = pose.keypoints.points[8], otherHip = pose.keypoints.points[11];
  const torso = neck && hip && otherHip ? Math.abs((hip[1] + otherHip[1]) / 2 - neck[1]) : 0;
  const head = neck && pose.keypoints.points[0] ? Math.abs(neck[1] - pose.keypoints.points[0][1]) : 0;
  const points: PosePoint[] = pose.keypoints.points.map((point, at) => {
    if (!point) return null;
    let y = point[1];
    if (ratio && neck && torso && head && [0, 14, 15, 16, 17].includes(at)) y = neck[1] + (y - neck[1]) * torso * ratio / head;
    return [Math.max(0, Math.min(canvas[0] - 1, box.x + (point[0] - minX) * sx)), Math.max(0, Math.min(canvas[1] - 1, box.y + (y - minY) * sy))];
  });
  return { format: "openpose-body18", canvas, points };
}

export function drawSkeleton(canvas: HTMLCanvasElement, keypoints: PoseEntry["keypoints"]): void {
  canvas.width = keypoints.canvas[0]; canvas.height = keypoints.canvas[1];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw a pose skeleton.");
  context.fillStyle = "black"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(3, canvas.width / 100); context.lineCap = "round";
  BODY_EDGES.forEach(([a, b], at) => {
    const left = keypoints.points[a], right = keypoints.points[b];
    if (!left || !right) return;
    context.strokeStyle = COLORS[at]; context.beginPath(); context.moveTo(...left); context.lineTo(...right); context.stroke();
  });
  keypoints.points.forEach((point, at) => {
    if (!point) return;
    context.fillStyle = COLORS[at]; context.beginPath(); context.arc(...point, Math.max(4, canvas.width / 90), 0, Math.PI * 2); context.fill();
  });
}

export function skeletonImage(keypoints: PoseEntry["keypoints"]): string {
  const canvas = document.createElement("canvas");
  drawSkeleton(canvas, keypoints);
  return canvas.toDataURL("image/png").split(",")[1];
}
