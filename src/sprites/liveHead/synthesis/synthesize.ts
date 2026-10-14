import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../../builder/pixels";
import { HEAD_LAYERS, HEAD_MANIFEST_VERSION, loadHeadManifest, manifestRef, type HeadManifest } from "../manifest";
import { parseLandmarks } from "./landmarks";
import { synthesizeRig } from "./rigGeometry";
import { cutHeadLayers } from "./layers";
import { base64 } from "./png";

export const MAX_RIG_PACKAGE = 24_000_000;
export interface LandmarkRequest { source: string; sha256: string; width: number; height: number; png: string }
export type LandmarkProvider = (request: LandmarkRequest, signal: AbortSignal) => Promise<unknown>;
export interface RigSynthesisInput { member: string; look: string; source: string; sha256: string }
export interface RigSynthesisDeps {
  landmarks: LandmarkProvider;
  read(source: string, signal: AbortSignal): Promise<Uint8Array>;
  hash(bytes: Uint8Array): Promise<string>;
  decode(bytes: Uint8Array, signal: AbortSignal): Promise<PixelImage>;
  encode(image: PixelImage): Promise<string>;
}

export async function synthesizeHead(input: RigSynthesisInput, run: RunGuard, deps: RigSynthesisDeps): Promise<HeadManifest | null> {
  if (!run.stillOwns()) return null;
  const bytes = await deps.read(input.source, run.signal);
  if (!run.stillOwns()) return null;
  const hash = await deps.hash(bytes);
  if (!run.stillOwns()) return null;
  if (hash !== input.sha256) throw new Error("The bust changed after review. Rebuild it before preparing a rig.");
  const image = await deps.decode(bytes, run.signal);
  if (!run.stillOwns()) return null;
  if (image.width > 2048 || image.height > 2048) throw new Error("Live head images must fit within 2048 pixels.");
  const raw = await deps.landmarks({ source: input.source, sha256: input.sha256, width: image.width, height: image.height, png: base64(bytes) }, run.signal);
  if (!run.stillOwns()) return null;
  const rig = synthesizeRig(parseLandmarks(raw, image));
  const cut = cutHeadLayers(image, rig), layers = [];
  for (const layer of cut) {
    const data = await deps.encode(layer.image);
    if (!run.stillOwns()) return null;
    layers.push({ name: layer.name, rect: layer.rect, image: `data:image/png;base64,${data}` });
  }
  if (layers.map((layer) => layer.name).join() !== HEAD_LAYERS.join()) throw new Error("The rig layers are incomplete.");
  const manifest = loadHeadManifest({ version: HEAD_MANIFEST_VERSION, member: input.member, look: input.look, artHash: input.sha256, source: input.source, rig, layers },
    { member: input.member, look: input.look, artHash: input.sha256, source: input.source, manifest: "" });
  if (manifestRef(manifest).manifest.length > MAX_RIG_PACKAGE) throw new Error("The synthesized rig exceeds the import limit. Use a smaller bust.");
  return manifest;
}

export function rehomeHead(manifest: HeadManifest, source: string, sha256: string): HeadManifest {
  if (manifest.artHash !== sha256) throw new Error("The saved bust differs from the reviewed one.");
  return loadHeadManifest({ ...manifest, source }, { member: manifest.member, look: manifest.look, artHash: sha256, source, manifest: "" });
}
