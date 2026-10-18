import type { HarnessRequest, HarnessModel } from "@services/stHost/harness";
import type { VisualAsset } from "../visualManifest";

export const VISION_RIG_MODEL = "openai/gpt-6.1-sol";
export const LANDMARK_SCHEMA = "{\"refused\":false,\"reason\":\"\",\"occlusions\":[],\"landmarks\":{\"version\":1,\"image\":{\"width\":W,\"height\":H},"
  + "\"face\":{\"cx\":0,\"cy\":0,\"rx\":0,\"ry\":0},\"eyes\":[[[x,y],...],[[x,y],...]],\"brows\":[[x,y],[x,y]],\"nose\":[x,y],"
  + "\"mouth\":{\"left\":[x,y],\"right\":[x,y],\"top\":[x,y],\"bottom\":[x,y]},\"chin\":[x,y],\"neck\":[x,y],\"shoulders\":[[x,y],[x,y]],\"ears\":[[x,y],[x,y]],"
  + "\"hair\":[[[x,y],[x,y],[x,y],[x,y]],...],\"chest\":[x,y],\"hand\":{\"outline\":[[x,y],...],\"wrist\":[x,y],\"knuckle\":[x,y],\"elbow\":[x,y]}}}";

export function visionRigRequest(bust: Pick<VisualAsset, "sha256">, image: string, target: HarnessModel, signal: AbortSignal, size?: { width: number; height: number }): HarnessRequest {
  if (target.id !== VISION_RIG_MODEL || target.image === false || target.available === false) throw new Error("Choose the offered Sol vision model before preparing a rig.");
  if (!image || image.length > 24_000_000) throw new Error("The accepted bust image is missing or too large.");
  return { harness: "opencode", model: target.id, role: "visual-rig", effort: "high", signal,
    images: [{ data: image, mime: "image/png", description: `Accepted bust SHA256 ${bust.sha256}` }],
    prompt: `Inspect this author-accepted bust. Source SHA256: ${bust.sha256}. `
      + (size ? `It is ${size.width} x ${size.height} pixels; use pixel coordinates with the origin at the top left. ` : "")
      + "Describe visible face landmarks, occlusions and whether a live-head rig can be safely prepared. "
      + "Each eye is a closed contour of 6 to 16 points tracing the visible opening (lid line to lid line), the image's left eye first. "
      + "face is the head outline (face and hair mass, no neck). ears lists both ears, image-left first; leave the ears key out entirely when either ear is hidden. "
      + "hair lists up to 10 loose locks that could sway (fringe locks, side locks, long hair over the shoulders), each a polyline of 3 to 5 points from root to tip "
      + "drawn along the middle of the lock, every point on hair, never on skin, eyes or clothing; list fringe locks left to right; leave hair out when no lock hangs free. "
      + "chest is the centre of the visible upper torso. hand is only for a hand fully visible in the bust and pointing up (fingertips above the wrist): "
      + "outline traces the whole visible hand and forearm, knuckle is the base of the fingers, elbow may lie outside the image; leave hand out otherwise. "
      + `Return JSON only, shaped ${LANDMARK_SCHEMA}. Set refused true with a reason when the face is not front-facing, eyes or mouth are hidden, or hands or props cover the face. `
      + "Do not invent hidden anatomy or approve identity.",
    maxOutputChars: 12000, timeoutMs: 180000 };
}
