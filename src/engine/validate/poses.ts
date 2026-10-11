import type { MemberSprites, PoseEntry, PosePoint, PoseTag, StoryPoses, StoryStage } from "../poseSchema";
import type { ValidationError } from "../schema";
import { isRecord } from "@utils/guards";
import { rejectUnknownKeys } from "./common";

export const POSE_TAGS: readonly PoseTag[] = ["standing", "sitting", "kneeling", "moving", "fighting", "casting", "gesture", "lying"];
const ID = /^[a-z][a-z0-9_]{0,63}$/;
const framing = (value: unknown) => ["full", "thigh", "close"].includes(String(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 240);

export function readPose(value: unknown, path: string, errors: ValidationError[]): PoseEntry | null {
  const start = errors.length;
  const bad = (field: string, message: string) => errors.push({ path: `${path}.${field}`, message });
  if (!isRecord(value)) { bad("", "pose must be an object"); return null; }
  rejectUnknownKeys(value, ["id", "label", "tags", "framing", "props", "text", "keypoints", "version", "when"], path, errors);
  if (typeof value.id !== "string" || !ID.test(value.id)) bad("id", "pose id must be lowercase letters, digits or underscores");
  for (const key of ["label", "text"] as const) { const text = value[key]; if (typeof text !== "string" || !text.trim() || text.length > 480) bad(key, "pose needs short non-empty text"); }
  if (!strings(value.tags) || !value.tags.length || value.tags.some((tag) => !POSE_TAGS.includes(tag as PoseTag))) bad("tags", "pose needs known posture tags");
  if (!framing(value.framing)) bad("framing", "pose framing must be full, thigh or close");
  if (!strings(value.props)) bad("props", "props must be a list of names");
  if (!Number.isInteger(value.version) || Number(value.version) < 1) bad("version", "pose version must be a positive integer");
  const kp = value.keypoints;
  if (!isRecord(kp)) bad("keypoints", "pose needs keypoints");
  else {
    rejectUnknownKeys(kp, ["format", "canvas", "points"], `${path}.keypoints`, errors);
    if (kp.format !== "openpose-body18") bad("keypoints.format", "keypoint format must be openpose-body18");
    const canvas = kp.canvas;
    const validCanvas = Array.isArray(canvas) && canvas.length === 2 && canvas.every((n) => Number.isInteger(n) && n >= 32 && n <= 8192);
    if (!validCanvas) bad("keypoints.canvas", "canvas needs two pixel dimensions from 32 to 8192");
    if (!Array.isArray(kp.points) || kp.points.length !== 18) bad("keypoints.points", "body18 needs exactly 18 points");
    else {
      kp.points.forEach((point, at) => {
        if (point === null) return;
        if (!Array.isArray(point) || point.length !== 2
          || point.some((n, axis) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || (validCanvas && n >= canvas[axis]))) {
          bad(`keypoints.points.${at}`, "point must be null or an in-canvas [x, y]");
        }
      });
      if (kp.points.filter((point) => point !== null).length < 6) bad("keypoints.points", "pose needs at least six visible joints");
    }
  }
  if (value.when !== undefined) {
    if (!isRecord(value.when) || !strings(value.when.keywords)) bad("when.keywords", "keywords must be non-empty strings");
    else rejectUnknownKeys(value.when, ["keywords"], `${path}.when`, errors);
  }
  return errors.length === start ? JSON.parse(JSON.stringify(value)) as PoseEntry : null;
}

export function readPoseList(value: unknown, path: string, errors: ValidationError[]): PoseEntry[] {
  if (!Array.isArray(value) || value.length > 256) { errors.push({ path, message: "poses must be a list of at most 256 entries" }); return []; }
  const seen = new Set<string>();
  return value.flatMap((raw, at) => {
    const pose = readPose(raw, `${path}.${at}`, errors);
    if (!pose) return [];
    if (seen.has(pose.id)) { errors.push({ path: `${path}.${at}.id`, message: "duplicate pose id" }); return []; }
    seen.add(pose.id);
    return [pose];
  });
}

export function readStoryPoses(value: unknown, errors: ValidationError[]): StoryPoses | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) { errors.push({ path: "poses", message: "poses must be an object" }); return undefined; }
  rejectUnknownKeys(value, ["use", "custom"], "poses", errors);
  if (value.use !== undefined && !strings(value.use)) errors.push({ path: "poses.use", message: "use must be a list of pose ids or tags" });
  return { ...(strings(value.use) ? { use: value.use } : {}), ...(value.custom !== undefined ? { custom: readPoseList(value.custom, "poses.custom", errors) } : {}) };
}

export function readMemberSprites(value: unknown, path: string, errors: ValidationError[]): MemberSprites | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) { errors.push({ path, message: "sprites must be an object" }); return undefined; }
  rejectUnknownKeys(value, ["pose", "poses"], path, errors);
  if (value.pose !== undefined && (typeof value.pose !== "string" || !ID.test(value.pose))) errors.push({ path: `${path}.pose`, message: "pose must be a pose id" });
  if (value.poses !== undefined && (!strings(value.poses) || value.poses.some((id) => !ID.test(id)))) errors.push({ path: `${path}.poses`, message: "poses must be a list of pose ids" });
  return value as MemberSprites;
}

export function readStage(value: unknown, path: string, errors: ValidationError[]): StoryStage | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) { errors.push({ path, message: "stage must be an object" }); return undefined; }
  if (value.framing !== undefined && !framing(value.framing)) errors.push({ path: `${path}.framing`, message: "framing must be full, thigh or close" });
  if (value.spotlight !== undefined && typeof value.spotlight !== "string") errors.push({ path: `${path}.spotlight`, message: "spotlight must name a member" });
  if (value.cast !== undefined && !isRecord(value.cast)) errors.push({ path: `${path}.cast`, message: "cast must be a member map" });
  const members = { ...(isRecord(value.cast) ? value.cast : {}), ...Object.fromEntries(Object.entries(value).filter(([key]) => !["cast", "framing", "spotlight"].includes(key))) };
  for (const [id, raw] of Object.entries(members)) {
    const at = `${path}.${id}`;
    if (!isRecord(raw)) { errors.push({ path: at, message: "stage member must be an object" }); continue; }
    rejectUnknownKeys(raw, ["pose", "set", "face", "hidden", "framing"], at, errors);
    for (const key of ["pose", "set", "face"] as const) if (raw[key] !== undefined && (typeof raw[key] !== "string" || !ID.test(String(raw[key])))) {
      errors.push({ path: `${at}.${key}`, message: "must be a lowercase id" });
    }
    if (raw.hidden !== undefined && typeof raw.hidden !== "boolean") errors.push({ path: `${at}.hidden`, message: "hidden must be boolean" });
    if (raw.framing !== undefined && !framing(raw.framing)) errors.push({ path: `${at}.framing`, message: "framing must be full, thigh or close" });
  }
  return value as StoryStage;
}

export function body18(points: unknown): PosePoint[] | null {
  if (!Array.isArray(points) || points.length !== 54 || points.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  return Array.from({ length: 18 }, (_, at) => Number(points[at * 3 + 2]) > 0.3 ? [Number(points[at * 3]), Number(points[at * 3 + 1])] : null);
}
