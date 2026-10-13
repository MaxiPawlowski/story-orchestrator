import type { PoseEntry } from "@engine/poseSchema";

export { retargetPose, retargetVersion, RETARGET_VERSION, LYING_RETARGET_VERSION, type Retarget } from "./retarget";

export const BODY_EDGES: ReadonlyArray<readonly [number, number]> = [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1,
  0], [0, 14], [14, 16], [0, 15], [15, 17]];
const COLORS = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff",
  "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055"];

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
