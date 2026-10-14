import type { FaceLandmarks } from "./landmarks";
import { crossCheckLandmarks, readDetectorResult, type LandmarkCrossCheck } from "./landmarkCheck";

export type DetectorReply = { ok: true; result: unknown } | { ok: false; reason: string };
export type FaceDetector = (png: string, signal: AbortSignal) => Promise<DetectorReply>;
export type LandmarkChecker = (png: string, marks: FaceLandmarks, signal: AbortSignal) => Promise<LandmarkCrossCheck>;

const UNAVAILABLE = "The face detector is not running; landmarks were not cross-checked.";

export function detectorChecker(detect: FaceDetector): LandmarkChecker {
  return async (png, marks, signal) => {
    let reply: DetectorReply;
    try { reply = await detect(png, signal); }
    catch {
      signal.throwIfAborted();
      return { status: "skipped", note: UNAVAILABLE };
    }
    signal.throwIfAborted();
    if (!reply.ok) return { status: "skipped",
      note: reply.reason === "unavailable" ? UNAVAILABLE : `The face detector could not read this bust (${reply.reason}); landmarks were not cross-checked.` };
    const result = readDetectorResult(reply.result);
    if (!result) return { status: "skipped", note: "The face detector answered in an unknown shape; landmarks were not cross-checked." };
    return crossCheckLandmarks(marks, result);
  };
}
