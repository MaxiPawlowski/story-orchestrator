import type { HarnessModel, HarnessRequest } from "@services/stHost/harness";
import type { PixelImage } from "../../builder/pixels";
import { VISION_RIG_MODEL } from "../visionRequest";
import { parseBodyLandmarks } from "./landmarks";
import { synthesizeBodyRig } from "./rig";
import { cutBodyLayers } from "./layers";
import { loadBodyManifest } from "./validate";
import type { BodyManifest } from "./types";

export const BODY_LANDMARK_SCHEMA = "{\"refused\":false,\"reason\":\"\",\"landmarks\":{\"version\":1,\"kind\":\"body\",\"image\":{\"width\":W,\"height\":H},"
  + "\"pose\":\"standing|sitting|other\",\"head\":{\"cx\":0,\"cy\":0,\"rx\":0,\"ry\":0},\"eyes\":[[x,y],[x,y]],\"neck\":[x,y],\"shoulders\":[[x,y],[x,y]],"
  + "\"chest\":[x,y],\"waist\":[x,y],\"hips\":[[x,y],[x,y]],"
  + "\"arms\":[{\"side\":\"left|right\",\"state\":\"free|resting|holding\",\"shoulder\":[x,y],\"elbow\":[x,y],\"wrist\":[x,y],\"outline\":[[x,y],...]}],"
  + "\"hair\":[[[x,y],[x,y],[x,y],[x,y]],...]}}";

export function bodyRigRequest(sha256: string, image: string, target: HarnessModel, signal: AbortSignal, size: { width: number; height: number }): HarnessRequest {
  if (target.id !== VISION_RIG_MODEL || target.image === false || target.available === false) throw new Error("Choose the offered Sol vision model before preparing a rig.");
  if (!image || image.length > 24_000_000) throw new Error("The accepted sprite image is missing or too large.");
  return { harness: "opencode", model: target.id, role: "visual-rig", effort: "high", signal,
    images: [{ data: image, mime: "image/png", description: `Accepted full-body sprite SHA256 ${sha256}` }],
    prompt: `Inspect this author-accepted full-body character sprite. Source SHA256: ${sha256}. `
      + `It is ${size.width} x ${size.height} pixels; use pixel coordinates with the origin at the top left. `
      + "Place body landmarks so the figure can breathe, sway, tilt its head and move its arms a little. "
      + "head is an oval around the whole head including hair mass and headwear, without the neck. eyes are the two eye centres, image-left first; leave eyes out if they are hidden. "
      + "neck is where the neck meets the torso. shoulders are the two shoulder joints, image-left first. chest is the centre of the chest. "
      + "waist is the centre of the waist (the narrowest part of the torso, or the belt line). hips are the two hip joints, image-left first; for a sitting figure, where the thighs leave the torso. "
      + "pose is standing, sitting or other. "
      + "arms lists each visible arm (at most two, side is the image side): shoulder, elbow and wrist joints, and outline, a closed polygon of 8 to 30 points tracing the whole visible arm "
      + "including sleeve and hand, from the shoulder seam to the fingertips, hugging its edge. state is free when the arm hangs or gestures in the air and could swing "
      + "(it may lightly touch the side of the hip or thigh), resting when the hand rests on something that does not move with the torso (knee, thigh, seat, floor, a prop), "
      + "holding when the arm is folded on or held against the torso (crossed arms, hand on chest or hip). "
      + "hair lists up to 10 loose locks that could sway (fringe locks, side locks, long hair over the shoulders or back), each a polyline of 3 to 5 points from root to tip "
      + "drawn along the middle of the lock, every point on hair, never on skin, eyes or clothing; leave hair out when no lock hangs free. "
      + `Return JSON only, shaped ${BODY_LANDMARK_SCHEMA}. Set refused true with a reason when the image is not one full-body character facing roughly front. `
      + "Do not invent hidden anatomy or approve identity.",
    maxOutputChars: 16000, timeoutMs: 240000 };
}

export interface BodyIdentity { member: string; look: string; pose: string; source: string; sha256: string }
export interface BuiltBody { manifest: BodyManifest; notes: string[] }

export async function buildBodyManifest(input: BodyIdentity, image: PixelImage, landmarks: unknown, encode: (image: PixelImage) => Promise<string>): Promise<BuiltBody> {
  if (image.width > 2048 || image.height > 2048) throw new Error("Body images must fit within 2048 pixels.");
  const { marks, notes } = parseBodyLandmarks(landmarks, image);
  const rig = synthesizeBodyRig(marks), layers = [];
  for (const cut of cutBodyLayers(image, rig)) layers.push({ name: cut.name, rect: cut.rect, image: `data:image/png;base64,${await encode(cut.image)}` });
  const manifest = loadBodyManifest({ version: 1, kind: "body", member: input.member, look: input.look, pose: input.pose, artHash: input.sha256, source: input.source, rig, layers });
  return { manifest, notes };
}
