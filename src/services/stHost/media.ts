import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { randomId } from "@utils/uuid";

const ROOT = "/api/plugins/story-orchestrator-media";

export interface ComfyDiscovery {
  nodes: Record<string, { input?: { required?: Record<string, unknown[]> } }>;
  embeddings: string[];
  checkpoints: string[];
  diffusionModels: string[];
  textEncoders: string[];
  vaes: string[];
  loras: string[];
  upscalers: string[];
  alpha?: AlphaRecipe[];
}

export interface MediaStatus { ready: boolean; comfyUrl: string }
export interface ModelFingerprint { name: string; sha256: string; size: number }
export interface AlphaRecipe { id: string; node: "RMBG" | "BiRefNetRMBG"; model: string; files: ModelFingerprint[] }
export interface SpriteReferencePack {
  character: string;
  set: string;
  sha256: string;
  files: Array<{ label: string; path: string; sha256: string; width: number; height: number }>;
}
export interface SpriteManifest {
  owner: "story-orchestrator";
  version: number;
  character: string;
  set: string;
  labels: Record<string, { key: string; sha256: string; recipe: { id: string; version: number }; qa: unknown; status: string;
    inputs?: { base?: string } }>;
}

export async function spriteFileFingerprint(path: string, signal?: AbortSignal): Promise<string> {
  if (!path.startsWith("/characters/")) throw new Error("Choose a sprite served by this SillyTavern.");
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The saved sprite could not be read.");
  const bytes = await response.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function request(route: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${ROOT}${route}`, {
    headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" }, signal,
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Install the optional media plugin and restart SillyTavern to build sprites.");
  return data;
}

export async function mediaStatus(): Promise<MediaStatus | null> {
  let response: Response;
  try {
    response = await fetch(`${ROOT}/status`, { headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" } });
  } catch { return null; }
  if (response.status === 404 || response.status === 405 || !response.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  return isRecord(data) && data.ready === true ? { ready: true, comfyUrl: String(data.comfyUrl ?? "") } : null;
}

export async function comfyDiscover(signal?: AbortSignal): Promise<ComfyDiscovery> {
  const data = await request("/discover", undefined, signal);
  if (!isRecord(data) || !isRecord(data.nodes)) throw new Error("ComfyUI discovery returned no node schemas.");
  const strings = (key: string): string[] => {
    const values = data[key];
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
  };
  return { nodes: data.nodes as ComfyDiscovery["nodes"], embeddings: strings("embeddings"), checkpoints: strings("checkpoints"),
    diffusionModels: strings("diffusionModels"), textEncoders: strings("textEncoders"), vaes: strings("vaes"),
    loras: strings("loras"), upscalers: strings("upscalers"), alpha: Array.isArray(data.alpha) ? data.alpha as AlphaRecipe[] : [] };
}

export async function comfyFingerprint(kind: string, name: string, signal?: AbortSignal): Promise<ModelFingerprint> {
  const data = await request("/fingerprint", { kind, name }, signal);
  if (!isRecord(data) || typeof data.name !== "string" || typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256) || typeof data.size !== "number") {
    throw new Error("The model fingerprint is incomplete.");
  }
  return { name: data.name, sha256: data.sha256, size: data.size };
}

export async function comfyReference(data: string, signal?: AbortSignal, scope?: { character: string; set: string; story?: string }): Promise<string> {
  const answer = await request("/reference", { data, scope }, signal);
  if (!isRecord(answer) || typeof answer.name !== "string") throw new Error("The reference upload returned no name.");
  return answer.name;
}

export async function comfyReleaseReference(name: string): Promise<WriteResult<{ released: true }>> {
  try {
    const data = await request("/reference/release", { name });
    return isRecord(data) && data.released === true ? wrote({ released: true }) : couldNot("Reference cleanup was not confirmed.");
  } catch (error) { return couldNot(error instanceof Error ? error.message : String(error)); }
}

export async function comfyRenderOwned(graph: Record<string, unknown>, signal: AbortSignal): Promise<{ data: string; format: string }> {
  const id = randomId();
  const cancel = () => { void request(`/jobs/${id}/cancel`, {}).catch(() => {}); };
  signal.throwIfAborted();
  signal.addEventListener("abort", cancel, { once: true });
  const deadline = Date.now() + 900_000;
  try {
    let job = await request("/jobs", { id, graph }, signal);
    while (!signal.aborted) {
      signal.throwIfAborted();
      if (!isRecord(job) || typeof job.status !== "string") throw new Error("The render job has no status.");
      if (job.status === "complete") break;
      if (job.status === "failed" || job.status === "cancelled") throw new Error(typeof job.error === "string" ? job.error : "The render was cancelled.");
      if (Date.now() >= deadline) { cancel(); throw new Error("The render exceeded fifteen minutes."); }
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      job = await request(`/jobs/${id}`, undefined, signal);
    }
    signal.throwIfAborted();
    const result = await request(`/jobs/${id}/result`, undefined, signal);
    if (!isRecord(result) || typeof result.data !== "string" || typeof result.format !== "string") throw new Error("ComfyUI returned no image.");
    return { data: result.data, format: result.format };
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); }
}

export async function spriteManifest(character: string, set: string): Promise<SpriteManifest | null> {
  const data = await request("/sprites/read", { character, set });
  return isRecord(data) && data.owner === "story-orchestrator" && isRecord(data.labels) ? data as unknown as SpriteManifest : null;
}

export async function spriteReferenceSets(character: string): Promise<string[]> {
  const data = await request("/sprites/reference-sets", { character });
  if (!Array.isArray(data) || !data.every((set) => typeof set === "string" && (set === "" || /^[a-z0-9_]{1,80}$/.test(set)))) {
    throw new Error("The reference pack list is incomplete.");
  }
  return data;
}

export async function spriteReferencePack(character: string, set: string): Promise<SpriteReferencePack> {
  const data = await request("/sprites/reference-pack", { character, set });
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (!isRecord(data) || data.character !== character || data.set !== set || !hash(data.sha256) || !Array.isArray(data.files)
    || !data.files.every((file) => isRecord(file) && typeof file.label === "string" && typeof file.path === "string" && hash(file.sha256)
      && typeof file.width === "number" && typeof file.height === "number" && file.width > 0 && file.height > 0)) {
    throw new Error("The reference pack inventory is incomplete.");
  }
  return data as unknown as SpriteReferencePack;
}

export async function generatedSpriteSets(character: string): Promise<SpriteManifest[]> {
  const data = await request("/sprites/list", { character });
  return Array.isArray(data) ? data.filter((row): row is SpriteManifest => isRecord(row) && row.owner === "story-orchestrator" && isRecord(row.labels)) : [];
}

export async function saveGeneratedSprite(input: {
  character: string; set: string; label: string; data: string; key: string;
  recipe: { id: string; version: number }; qa: unknown; expectedHash?: string;
  inputs?: unknown;
}): Promise<WriteResult<{ path: string; sha256: string; manifest: SpriteManifest }>> {
  try {
    const data = await request("/sprites/save", input);
    if (!isRecord(data) || typeof data.path !== "string" || typeof data.sha256 !== "string" || !isRecord(data.manifest)) return couldNot("The sprite upload returned incomplete evidence.");
    return wrote({ path: data.path, sha256: data.sha256, manifest: data.manifest as unknown as SpriteManifest });
  } catch (error) { return couldNot(error instanceof Error ? error.message : String(error)); }
}

export async function deleteGeneratedSprite(character: string, set: string, label: string, expectedHash: string): Promise<WriteResult<{ deleted: true }>> {
  try {
    const data = await request("/sprites/delete", { character, set, label, expectedHash });
    return isRecord(data) && data.deleted === true ? wrote({ deleted: true }) : couldNot("The sprite deletion was not confirmed.");
  } catch (error) { return couldNot(error instanceof Error ? error.message : String(error)); }
}

export async function removeStorySprites(story: string): Promise<WriteResult<{ sets: number; labels: number }>> {
  try {
    const data = await request("/sprites/remove-story", { story });
    if (!isRecord(data) || !Array.isArray(data.sets) || !Array.isArray(data.labels)) return couldNot("The sprite removal returned no report.");
    return wrote({ sets: data.sets.length, labels: data.labels.length });
  } catch (error) { return couldNot(error instanceof Error ? error.message : String(error)); }
}
