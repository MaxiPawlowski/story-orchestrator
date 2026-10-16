import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { subscribeToHostEvent } from "./events";
import { entriesImage } from "./lorebookImage";
import { worldInfoModule } from "./modules";
import { readServerLorebook } from "./worldInfoServer";

export const PENDING_WORLD_SAVE_MS = 1500;

type HostCache = { set?: (name: string, data: unknown) => unknown; get?: (name: string) => unknown };

export interface PendingWorldEdit {
  at: number;
  baseline: string | null;
}

const baselines = new Map<string, string>();
const edits = new Map<string, PendingWorldEdit>();
let handedOut = new WeakSet<object>();
let clock: () => number = Date.now;
let installed: (() => void) | null = null;

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

// ST caches a fetched book with the same `set` its save uses (world-info.js:2054, :4183), so a set
// alone does not say "unsaved edit". A load sets an object nobody has seen; a save sets one the cache
// handed out before (`loadWorldInfo` returns the fetched object, or a clone through `get`). Each load
// and each WORLDINFO_UPDATED records the copy the server holds: an edit's baseline.
export function watchPendingWorldSaves(now: () => number = Date.now): () => void {
  if (installed) return installed;
  const cache: HostCache = worldInfoModule.worldInfoCache;
  const originalSet = cache.set;
  const originalGet = cache.get;
  if (typeof originalSet !== "function") return () => undefined;
  clock = now;
  cache.set = function (this: unknown, name: string, data: unknown) {
    if (isObject(data) && handedOut.has(data)) {
      edits.set(name, { at: now(), baseline: edits.get(name)?.baseline ?? baselines.get(name) ?? null });
    } else if (isObject(data)) {
      baselines.set(name, entriesImage(data));
      handedOut.add(data);
    }
    return originalSet.call(this, name, data);
  };
  if (typeof originalGet === "function") {
    cache.get = function (this: unknown, name: string) {
      const value = originalGet.call(this, name);
      if (isObject(value)) handedOut.add(value);
      return value;
    };
  }
  const off = subscribeToHostEvent("WORLDINFO_UPDATED", (name, data) => {
    edits.delete(String(name));
    if (isObject(data)) baselines.set(String(name), entriesImage(data));
  });
  installed = () => {
    off();
    if (cache.set !== originalSet) cache.set = originalSet;
    if (originalGet && cache.get !== originalGet) cache.get = originalGet;
    edits.clear();
    baselines.clear();
    handedOut = new WeakSet<object>();
    clock = Date.now;
    installed = null;
  };
  return installed;
}

export function pendingWorldEdit(name: string, now: number = clock()): PendingWorldEdit | null {
  const edit = edits.get(name);
  if (!edit) return null;
  if (now - edit.at <= PENDING_WORLD_SAVE_MS) return edit;
  edits.delete(name);
  return null;
}

async function saveCached(name: string): Promise<WriteResult<{ flushed: boolean }>> {
  const data = (worldInfoModule.worldInfoCache as HostCache).get?.(name);
  if (!data) return wrote({ flushed: false });
  try {
    await worldInfoModule.saveWorldInfo(name, data, true);
    edits.delete(name);
    return wrote({ flushed: true });
  } catch (error) {
    return couldNot(`"${name}" had an edit waiting to save and could not be saved: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function flushPendingWorldSave(name: string, now: number = clock()): Promise<WriteResult<{ flushed: boolean }>> {
  return pendingWorldEdit(name, now) ? saveCached(name) : wrote({ flushed: false });
}

// Our immediate save cancels ST's one shared save debounce (world-info.js:4151), so another book's
// waiting edit is saved here, but only while the server still holds the copy that edit was made from.
export async function flushPendingWorldSaves(written: string, now: number = clock()): Promise<WriteResult<{ flushed: string[] }>> {
  const flushed: string[] = [];
  for (const name of [...edits.keys()]) {
    const edit = name === written ? null : pendingWorldEdit(name, now);
    if (!edit) continue;
    const server = edit.baseline === null ? null : await readServerLorebook(name);
    if (!server || entriesImage(server) !== edit.baseline) {
      edits.delete(name);
      log.warn("world info: an edit waiting in ST's save debounce was not saved, because the server copy it was made from could not be confirmed", { name });
      continue;
    }
    const result = await saveCached(name);
    if (!result.ok) return result;
    if (result.flushed) flushed.push(name);
  }
  return wrote({ flushed });
}
