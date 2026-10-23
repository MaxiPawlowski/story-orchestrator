import type { HarnessModel, HarnessRequest, HarnessStatus } from "@services/stHost/harness";
import type { ModelReply } from "@services/stHost/modelReply";
import { isRecord } from "@utils/guards";
import { visionRigRequest, VISION_RIG_MODEL } from "../visionRequest";
import type { LandmarkProvider } from "./synthesize";
import { landmarkProblems } from "./landmarks";

export interface VisionLandmarkDeps {
  target(signal: AbortSignal): Promise<HarnessModel | undefined>;
  send(request: HarnessRequest): Promise<ModelReply>;
}

export function visionTarget(status: HarnessStatus | null): HarnessModel | undefined {
  const row = status?.harnesses.opencode;
  return row?.offered ? row.models.find((model) => model.id === VISION_RIG_MODEL && model.image !== false && model.available !== false) : undefined;
}

export function readLandmarkAnswer(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The vision model did not return landmark JSON.");
  let answer: unknown;
  try { answer = JSON.parse(text.slice(start, end + 1)); }
  catch { throw new Error("The vision model returned malformed landmark JSON."); }
  if (!isRecord(answer)) throw new Error("The vision model did not return landmark JSON.");
  if (answer.refused === true) throw new Error(`The vision model refused this bust: ${typeof answer.reason === "string" && answer.reason ? answer.reason : "no reason given"}.`);
  if (!isRecord(answer.landmarks)) throw new Error("The vision model returned no landmarks.");
  return answer.landmarks;
}

export function visionLandmarkProvider(deps: VisionLandmarkDeps): LandmarkProvider {
  return async (request, signal) => {
    const target = await deps.target(signal);
    signal.throwIfAborted();
    if (!target) throw new Error("The Sol vision model is not offered. Sign in to opencode, or import a rig instead.");
    const input = visionRigRequest({ sha256: request.sha256 }, request.png, target, signal, { width: request.width, height: request.height });
    const reply = await deps.send(input);
    signal.throwIfAborted();
    if (!reply.ok) throw new Error(`The vision model could not place landmarks: ${reply.message}`);
    const landmarks = readLandmarkAnswer(reply.text), problems = landmarkProblems(landmarks, request);
    if (!problems.length) return landmarks;
    const correction = `${input.prompt}\nYour previous landmark answer failed validation: ${problems.join("; ")}.\nPrevious answer:\n${JSON.stringify({ landmarks })}`
      + "\nReinspect the same image and return a corrected complete answer. Keep all required points inside this crop."
      + " Refuse if the visible anatomy cannot satisfy the contract. Do not clamp, invent hidden anatomy or change the image dimensions.";
    const corrected = await deps.send({ ...input, prompt: correction });
    signal.throwIfAborted();
    if (!corrected.ok) throw new Error(`The vision model could not correct landmarks: ${corrected.message}`);
    return readLandmarkAnswer(corrected.text);
  };
}
