import type { RunGuard } from "@runtime/runToken";
import { sha256Hex } from "@utils/sha256";
import { encodeImage } from "../builder/images";
import { decodeBytes } from "../liveHead/synthesis/decode";
import { synthesizeCheckedHead } from "../liveHead/synthesis/synthesize";
import { detectorChecker } from "../liveHead/synthesis/detectorCheck";
import type { DetectorFace } from "../liveHead/synthesis/landmarkCheck";
import { detectorLandmarks } from "./detectorLandmarks";

export interface DemoRigInput { member: string; look: string; png: string; face: DetectorFace; detector: unknown }

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export async function buildDemoRig(input: DemoRigInput) {
  const bytes = bytesOf(input.png), sha256 = await sha256Hex(bytes);
  const source = `data:image/png;base64,${input.png}`;
  const result = await synthesizeCheckedHead({ member: input.member, look: input.look, source, sha256 }, owner(), {
    landmarks: async (request) => detectorLandmarks(input.face, { width: request.width, height: request.height }),
    read: async () => bytes,
    hash: async (data) => sha256Hex(data),
    decode: decodeBytes,
    encode: async (image) => encodeImage(image),
    check: detectorChecker(async () => ({ ok: true, result: input.detector })),
  });
  if (!result) throw new Error("Rig synthesis stopped.");
  return { manifest: { ...result.manifest, source: "" }, check: result.check ?? null };
}

Object.assign(globalThis, { soBuildDemoRig: buildDemoRig });
