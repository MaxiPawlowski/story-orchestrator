import { trimStringList } from "@utils/dataHelpers";
import { getContext } from "./context";
import type { HostWorldInfoSettings } from "./hostTypes";
import { worldInfoModule } from "./modules";
import { executeSlashCommands } from "./slashCommands";

export interface Lorebook {
  entries: Record<number, LoreEntry>;
}

export interface LoreEntry {
  uid: number;
  comment: string;
  [key: string]: unknown;
}

export const getWorldInfoSettings: () => HostWorldInfoSettings = worldInfoModule.getWorldInfoSettings;

// Every lorebook that exists, active or not (st-context.js:284 over world-info.js `world_names`).
export function listAllLorebooks(): string[] {
  const names = getContext().getWorldInfoNames?.();
  return (Array.isArray(names) ? names : [])
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0);
}

export async function loadLorebook(name: string): Promise<Lorebook | null> {
  const lorebook = name.trim();
  if (!lorebook) return null;
  return await getContext().loadWorldInfo(lorebook) as Lorebook | null;
}

async function saveLorebook(name: string, data: Lorebook): Promise<void> {
  const context = getContext() as unknown as { saveWorldInfo?: (name: string, data: unknown, immediately?: boolean) => Promise<unknown> };
  if (typeof context.saveWorldInfo === "function") {
    await context.saveWorldInfo(name, data, true);
    return;
  }
  await worldInfoModule.saveWorldInfo(name, data, true);
}

function findMatchedLoreEntries(lorebook: Lorebook, comments: string[]) {
  const entries = Object.values(lorebook.entries);
  const matched: Array<{ comment: string; uid: number }> = [];
  for (const comment of comments) {
    const found = entries.find((entry) => entry.comment?.trim() === comment);
    if (!found) continue;
    matched.push({ comment, uid: found.uid });
  }
  return matched;
}

async function setWIEntryDisabledState(lorebook: string, comments: string | string[], disabled: boolean) {
  if (!lorebook) return false;
  const commentList = trimStringList(Array.isArray(comments) ? comments : [comments]);
  if (!commentList.length) return false;

  const loadedInfo = await loadLorebook(lorebook);
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }

  const matched = findMatchedLoreEntries(loadedInfo, commentList);
  for (const comment of commentList) {
    if (!matched.some((entry) => entry.comment === comment)) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
    }
  }
  if (!matched.length) return false;

  let changed = false;
  for (const entry of matched) {
    const target = loadedInfo.entries[entry.uid];
    if (!target || target.disable === disabled) continue;
    target.disable = disabled;
    changed = true;
  }
  if (changed) await saveLorebook(lorebook, loadedInfo);
  return true;
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, false);
}

export async function disableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, true);
}

export type WIUpsertResult = "created" | "updated" | "unchanged" | "failed";

async function loadOrCreateLorebook(name: string): Promise<Lorebook | null> {
  const existing = await loadLorebook(name);
  if (existing) return existing;
  await worldInfoModule.createNewWorldInfo(name, { interactive: false });
  return loadLorebook(name);
}

// Two host quirks meet here. `loadWorldInfo` can never say whether a book exists — the server
// answers an unknown name with a dummy `{entries:{}}` (src/endpoints/worldinfo.js:18), so existence
// comes from `world_names` instead. And `createNewWorldInfo` writes the file and refreshes the
// picker but does NOT activate the book (world-info.js:4448 — no `globalSelect` write), while a
// story's `requirements.lorebooks` is satisfied only by the *globally selected* books; `/world
// state=on` is ST's own activation path and is what makes a freshly created book count.
export async function createLorebook(name: string): Promise<{ created: boolean; activated: boolean }> {
  const lorebook = name.trim();
  if (!lorebook) return { created: false, activated: false };
  const created = lorebookExists(lorebook) ? false : Boolean(await worldInfoModule.createNewWorldInfo(lorebook, { interactive: false }));
  const activated = await activateGlobalLorebook(lorebook);
  return { created, activated };
}

export const lorebookExists = (name: string): boolean => {
  const wanted = name.trim().toLowerCase();
  return Boolean(wanted) && listAllLorebooks().some((entry) => entry.toLowerCase() === wanted);
};

export async function activateGlobalLorebook(name: string): Promise<boolean> {
  const lorebook = name.trim();
  if (!lorebook) return false;
  if (listGlobalSelect().some((entry) => entry.toLowerCase() === lorebook.toLowerCase())) return true;
  await executeSlashCommands(`/world silent=true state=on ${lorebook}`);
  return listGlobalSelect().some((entry) => entry.toLowerCase() === lorebook.toLowerCase());
}

const listGlobalSelect = (): string[] => (getWorldInfoSettings() as { world_info?: { globalSelect?: string[] } }).world_info?.globalSelect ?? [];

export async function upsertWIEntry(lorebook: string, comment: string, content: string, keys: string[] = [], options: { constant?: boolean } = {}): Promise<WIUpsertResult> {
  const name = lorebook.trim();
  if (!name || !comment) return "failed";
  const data = await loadOrCreateLorebook(name);
  if (!data) {
    console.warn("[Story WI] could not load or create lorebook", { lorebook: name });
    return "failed";
  }
  const existing = Object.values(data.entries).find((entry) => entry.comment?.trim() === comment);
  if (existing && String(existing.content ?? "").trim() === content.trim() && options.constant === undefined) return "unchanged";

  const target = existing ?? (worldInfoModule.createWorldInfoEntry(name, data) as LoreEntry | undefined);
  if (!target) return "failed";
  target.comment = comment;
  target.content = content;
  if (keys.length) target.key = keys;
  if (options.constant !== undefined) target.constant = options.constant;
  target.disable = false;
  await saveLorebook(name, data);
  return existing ? "updated" : "created";
}
