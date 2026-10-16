import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { subscribeToHostEvent } from "./events";
import { worldInfoModule } from "./modules";

export const PENDING_WORLD_SAVE_MS = 1500;

type HostCache = { set?: (name: string, data: unknown) => unknown; get?: (name: string) => unknown };

const marks = new Map<string, number>();
let installed: (() => void) | null = null;

export function watchPendingWorldSaves(now: () => number = Date.now): () => void {
  if (installed) return installed;
  const cache: HostCache = worldInfoModule.worldInfoCache;
  const original = cache.set;
  if (typeof original !== "function") return () => undefined;
  cache.set = function (this: unknown, name: string, data: unknown) {
    marks.set(name, now());
    return original.call(this, name, data);
  };
  const off = subscribeToHostEvent("WORLDINFO_UPDATED", (name) => { marks.delete(String(name)); });
  installed = () => {
    off();
    if (cache.set !== original) cache.set = original;
    marks.clear();
    installed = null;
  };
  return installed;
}

export async function flushPendingWorldSaves(written: string, now: number = Date.now(), only?: string): Promise<WriteResult<{ flushed: string[] }>> {
  const cache: HostCache = worldInfoModule.worldInfoCache;
  const flushed: string[] = [];
  for (const [name, at] of [...marks]) {
    if (only !== undefined && name !== only) continue;
    marks.delete(name);
    if (name === written || now - at > PENDING_WORLD_SAVE_MS) continue;
    const data = cache.get?.(name);
    if (!data) continue;
    try {
      await worldInfoModule.saveWorldInfo(name, data, true);
      flushed.push(name);
    } catch (error) {
      return couldNot(`"${name}" had an edit waiting to save and could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return wrote({ flushed });
}

export async function flushPendingWorldSave(name: string, now: number = Date.now()): Promise<WriteResult<{ flushed: boolean }>> {
  const result = await flushPendingWorldSaves("", now, name);
  return result.ok ? wrote({ flushed: result.flushed.includes(name) }) : result;
}
