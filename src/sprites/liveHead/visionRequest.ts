import type { HarnessRequest, HarnessModel } from "@services/stHost/harness";
import type { VisualAsset } from "../visualManifest";

export function visionRigRequest(bust: VisualAsset, image: string, target: HarnessModel, signal: AbortSignal): HarnessRequest {
  if (target.id !== "openai/gpt-6.1-sol" || !target.image || target.available === false) throw new Error("Choose the offered Sol vision model before preparing a rig.");
  if (!image || image.length > 24_000_000) throw new Error("The accepted bust image is missing or too large.");
  return { harness: "opencode", model: target.id, role: "visual-rig", effort: "high", signal,
    images: [{ data: image, mime: "image/png", description: `Accepted bust SHA256 ${bust.sha256}` }],
    prompt: `Inspect this author-accepted bust. Source SHA256: ${bust.sha256}. `
      + "Describe visible face landmarks, occlusions and whether a live-head rig can be safely prepared. "
      + "Return JSON only with landmarks, occlusions, refused and reason. Do not invent hidden anatomy or approve identity.",
    maxOutputChars: 12000, timeoutMs: 180000 };
}
