import type { PoseEntry, PosePoint } from "@engine/schema";
import { isRecord } from "@utils/guards";
import { body18 } from "@engine/validate/poses";

export const DWPOSE_FILES = ["yolox_l.onnx", "dw-ll_ucoco_384.onnx"] as const;
export function headToHipRatio(keypoints: PoseEntry["keypoints"]): number | undefined {
  const [nose, neck] = keypoints.points, left = keypoints.points[8], right = keypoints.points[11];
  if (!nose || !neck || !left || !right) return undefined;
  const torso = Math.hypot(neck[0] - (left[0] + right[0]) / 2, neck[1] - (left[1] + right[1]) / 2);
  const ratio = Math.hypot(nose[0] - neck[0], nose[1] - neck[1]) / torso;
  return Number.isFinite(ratio) && ratio > 0 && ratio <= 2 ? ratio : undefined;
}
export function readDWPose(raw: unknown): PoseEntry["keypoints"] {
  const frames: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const frame = Array.isArray(frames) && frames.length === 1 ? frames[0] : null;
  if (!isRecord(frame) || !Array.isArray(frame.people) || frame.people.length !== 1 || !isRecord(frame.people[0])) throw new Error("Import one image with exactly one visible person.");
  const width = Number(frame.canvas_width), height = Number(frame.canvas_height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width > 8192 || height > 8192) throw new Error("The estimator canvas is invalid.");
  const points = body18(frame.people[0].pose_keypoints_2d);
  if (!points || points.filter(Boolean).length < 6 || points.some((point) => point && (point[0] < 0 || point[1] < 0 || point[0] > width ||
    point[1] > height))) throw new Error("DWPose returned too few reliable body points.");
  return { format: "openpose-body18", canvas: [width, height], points };
}

export function posePck(output: PoseEntry["keypoints"], target: PoseEntry["keypoints"], threshold = 0.1): number {
  const points = target.points.flatMap((point, index) => point ? [{ point, found: output.points[index] }] : []);
  if (!points.length) return 0;
  const visible = points.map(({ point }) => point);
  const extent = Math.max(1, Math.max(...visible.map((p) => p[0])) - Math.min(...visible.map((p) => p[0])), Math.max(...visible.map((p) => p[1])) - Math.min(...visible.map((p) => p[1])));
  const scaled = (point: NonNullable<PosePoint>) => [point[0] * target.canvas[0] / output.canvas[0], point[1] * target.canvas[1] / output.canvas[1]];
  return points.filter(({ point, found }) => {
    if (!found) return false;
    const b = scaled(found);
    return Math.hypot(point[0] - b[0], point[1] - b[1]) <= threshold * extent;
  }).length / points.length;
}

export const dwposeGraph = (reference: string): Record<string, unknown> => ({
  "1": { class_type: "LoadImage", inputs: { image: reference } },
  "2": { class_type: "DWPreprocessor", inputs: { image: ["1", 0], detect_hand: "disable", detect_body: "enable", detect_face: "disable", resolution: 1024,
    bbox_detector: DWPOSE_FILES[0], pose_estimator: DWPOSE_FILES[1], scale_stick_for_xinsr_cn: "disable" } },
  "3": { class_type: "PreviewImage", inputs: { images: ["2", 0] } },
});
