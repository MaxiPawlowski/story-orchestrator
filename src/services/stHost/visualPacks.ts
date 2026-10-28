import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { sha256Hex } from "@utils/sha256";

const ROUTE = "/api/plugins/story-orchestrator-media/packs";

export interface InstalledPackListing { file: string; pack: unknown }

export async function listInstalledPacks(signal?: AbortSignal): Promise<InstalledPackListing[] | null> {
  let response: Response;
  try {
    response = await fetch(ROUTE, { headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" }, signal, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
  if (response.status === 404 || response.status === 405) return null;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(data) || !Array.isArray(data.packs)) {
    throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "The media plugin could not list installed visual packs.");
  }
  return data.packs.flatMap((row) => (isRecord(row) && typeof row.file === "string" ? [{ file: row.file, pack: row.pack }] : []));
}

export async function servedFileHash(path: string, signal?: AbortSignal): Promise<string> {
  if (!/^\/(characters|backgrounds)\//.test(path)) throw new Error("A visual pack file must be served by this SillyTavern.");
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("A visual pack file could not be read.");
  return sha256Hex(await response.arrayBuffer());
}
