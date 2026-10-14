import type { RunGuard } from "@runtime/runToken";
import type { LiveHeadRef } from "../liveHeadRefs";
import { loadHeadManifest, type HeadManifest } from "./manifest";

export interface HeadAssetDeps {
  bytes(url: string, signal: AbortSignal): Promise<ArrayBuffer>;
  hash(bytes: ArrayBuffer): Promise<string>;
  image(url: string, signal: AbortSignal): Promise<HTMLImageElement>;
}
export interface PreparedHead { manifest: HeadManifest; images: HTMLImageElement[]; art: ArrayBuffer }

export async function prepareHead(ref: LiveHeadRef, run: RunGuard, deps: HeadAssetDeps): Promise<PreparedHead | null> {
  if (!run.stillOwns()) return null;
  const bytes = await deps.bytes(ref.manifest, run.signal);
  if (!run.stillOwns()) return null;
  const manifest = loadHeadManifest(JSON.parse(new TextDecoder().decode(bytes)), ref);
  const art = await deps.bytes(manifest.source, run.signal);
  if (!run.stillOwns()) return null;
  const hash = await deps.hash(art);
  if (!run.stillOwns()) return null;
  if (hash !== manifest.artHash) throw new Error("Artwork changed; this rig needs rebuilding.");
  const images = await Promise.all(manifest.layers.map((layer) => deps.image(layer.image, run.signal)));
  if (!run.stillOwns()) return null;
  return { manifest, images, art };
}

export function headImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); image.src = ""; reject(new Error("Live head load cancelled.")); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error("Live head layer could not decode.")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}
