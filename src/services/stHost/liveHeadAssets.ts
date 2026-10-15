import { sha256Hex } from "@utils/sha256";
import { localHeadAsset } from "../../sprites/liveHeadRefs";

export async function headAssetBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!localHeadAsset(url)) throw new Error("Live head assets must be local.");
  const response = await fetch(url, { signal });
  if (!response.ok || Number(response.headers.get("content-length")) > 24_000_000) throw new Error("Live head asset could not load.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Live head asset has no body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    let done = false;
    while (!done) {
      const next = await reader.read();
      done = next.done;
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 24_000_000) throw new Error("Live head asset is too large.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export const headArtHash = (bytes: ArrayBuffer): Promise<string> => sha256Hex(bytes);
