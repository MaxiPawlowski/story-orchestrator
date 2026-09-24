import { trimStringList } from "@utils/dataHelpers";
import { lorebookFileId, quoteSlashArg } from "@utils/string";
import { getContext } from "./context";
import type { HostWorldInfoSettings } from "./hostTypes";
import { worldInfoModule } from "./modules";
import { executeSlashCommands } from "./slashCommands";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export { lorebookFileId };

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

export function findLorebook(name: string): string | null {
  const wanted = lorebookFileId(name).toLowerCase();
  if (!wanted) return null;
  return listAllLorebooks().find((entry) => entry.toLowerCase() === wanted) ?? null;
}

export const lorebookExists = (name: string): boolean => findLorebook(name) !== null;

// Never asks the host for a book that is not listed: `loadWorldInfo` answers an unknown name with
// the server's dummy `{entries:{}}` (src/endpoints/worldinfo.js:18) and caches it
// (world-info.js:2054), which then shadows a book of that name imported later in the session.
async function loadExisting(name: string): Promise<{ name: string; data: Lorebook } | null> {
  const lorebook = findLorebook(name);
  if (!lorebook) return null;
  const data = await getContext().loadWorldInfo(lorebook) as Lorebook | null;
  return data?.entries ? { name: lorebook, data } : null;
}

export async function loadLorebook(name: string): Promise<Lorebook | null> {
  return (await loadExisting(name))?.data ?? null;
}

// V17: ST's `_save` posts `/api/worldinfo/edit` and never reads the answer (world-info.js:4151), so a
// refused save resolves exactly like a kept one. The server's own copy is the evidence; `null` means
// the read itself could not answer, which is not evidence of a lost write.
async function readServerLorebook(name: string): Promise<Lorebook | null> {
  try {
    const headers = getContext().getRequestHeaders?.() ?? {};
    const response = await fetch("/api/worldinfo/get", { method: "POST", headers, body: JSON.stringify({ name }), cache: "no-cache" });
    if (!response.ok) return null;
    const data = await response.json() as Lorebook | null;
    return data?.entries ? data : null;
  } catch {
    return null;
  }
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

async function setWIEntryDisabledState(lorebook: string, comments: string | string[], disabled: boolean): Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>> {
  if (!lorebook) return couldNot("no lorebook was named");
  const commentList = trimStringList(Array.isArray(comments) ? comments : [comments]);
  if (!commentList.length) return couldNot("no entry was named");

  const book = await loadExisting(lorebook);
  if (!book) {
    console.warn("[Story WI] lorebook does not exist", { lorebook });
    return couldNot(`there is no lorebook "${lorebook}"`);
  }

  const matched = findMatchedLoreEntries(book.data, commentList);
  for (const comment of commentList) {
    if (!matched.some((entry) => entry.comment === comment)) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
    }
  }
  if (!matched.length) return couldNot(`"${commentList.join("\", \"")}" is not in "${lorebook}"`);

  let changed = false;
  for (const entry of matched) {
    const target = book.data.entries[entry.uid];
    if (!target || target.disable === disabled) continue;
    target.disable = disabled;
    changed = true;
  }
  if (!changed) return wrote({ changed: false });
  try {
    await saveLorebook(book.name, book.data);
  } catch (error) {
    return couldNot(`"${lorebook}" could not be saved: ${error instanceof Error ? error.message : "the host refused the write"}`);
  }
  const onServer = await readServerLorebook(book.name);
  if (!onServer) return wrote({ changed: true, confirmed: false });
  const lost = matched.filter((entry) => onServer.entries[entry.uid] && onServer.entries[entry.uid].disable !== disabled);
  if (lost.length) {
    worldInfoModule.worldInfoCache.delete(book.name);
    return couldNot(`"${lorebook}" was saved, but the server still holds the old flag on "${lost.map((entry) => entry.comment).join("\", \"")}", so the write was lost`);
  }
  return wrote({ changed: true, confirmed: true });
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, false);
}

export async function disableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, true);
}

export type WIUpsertResult = "created" | "updated" | "unchanged" | "failed";

// `createNewWorldInfo` checks only the client's `world_names` before writing `{entries:{}}` over the
// file (world-info.js:4448), so the list is refreshed from the server once before creating: a book
// another tab or an old raw save put on disk is adopted, never emptied. A cached copy of it predates
// the book appearing, so it is dropped.
export async function ensureLorebook(name: string): Promise<{ name: string; created: boolean } | null> {
  const fileId = lorebookFileId(name);
  if (!fileId) return null;
  const known = findLorebook(fileId);
  if (known) return { name: known, created: false };
  await worldInfoModule.updateWorldInfoList();
  const listed = findLorebook(fileId);
  if (listed) {
    worldInfoModule.worldInfoCache.delete(listed);
    return { name: listed, created: false };
  }
  if (!await worldInfoModule.createNewWorldInfo(fileId, { interactive: false })) return null;
  const created = findLorebook(fileId);
  return created ? { name: created, created: true } : null;
}

// `createNewWorldInfo` refreshes the picker but does NOT activate the book (world-info.js:4448 — no
// `globalSelect` write), while a story's `requirements.lorebooks` is satisfied only by the *globally
// selected* books; `/world state=on` is ST's own activation path and is what makes it count.
export async function createLorebook(name: string): Promise<WriteResult<{ name: string; created: boolean }>> {
  const ensured = await ensureLorebook(name);
  if (!ensured) return couldNot(`could not create "${name}"`);
  // A book that exists but will not stay selected is a FAILURE for the caller: a story's requirement
  // is satisfied only by globally selected books, so "created, not active" is not a happy ending.
  const activated = await activateGlobalLorebook(ensured.name);
  return activated.ok ? wrote({ name: ensured.name, created: ensured.created }) : couldNot(activated.reason);
}

// v2.4 plan 02 T14. Exact listed name only: `deleteWorldInfo` (world-info.js:4346) answers false for an
// unlisted name and refreshes `world_names` itself on success, so the list is the evidence. The cache
// is evicted here too, because a failed delete leaves whatever `loadWorldInfo` fetched.
export async function deleteLorebook(name: string): Promise<WriteResult<{ name: string }>> {
  if (!name || !listAllLorebooks().includes(name)) return couldNot(`there is no lorebook "${name}"`);
  let deleted: boolean;
  try {
    deleted = await worldInfoModule.deleteWorldInfo(name);
  } catch (error) {
    deleted = false;
    console.warn("[Story WI] lorebook delete failed", { name, error });
  }
  worldInfoModule.worldInfoCache.delete(name);
  if (!deleted) return couldNot(`"${name}" could not be deleted`);
  return listAllLorebooks().includes(name) ? couldNot(`"${name}" is still listed after the delete`) : wrote({ name });
}

export type ChatLorebookBinding = "bound" | "already-bound" | "occupied" | "no-chat";

// The chat's own lorebook slot, scanned for this chat only (world-info.js:4544). A binding to a book
// that no longer exists counts as empty, as it does for `/getchatbook` (world-info.js:1168); a live
// book the user bound is never replaced unless the caller names it as its own. The slot is saved
// with the chat's metadata, so persisting is the caller's.
export function bindChatLorebook(name: string, replaceable: string[] = []): ChatLorebookBinding {
  const context = getContext();
  if (!context.chatId) return "no-chat";
  const key = worldInfoModule.METADATA_KEY;
  const slot = context.chatMetadata[key];
  const current = typeof slot === "string" ? slot.trim() : "";
  const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  if (current && same(current, name)) return "already-bound";
  if (current && lorebookExists(current) && !replaceable.some((entry) => same(entry, current))) return "occupied";
  context.chatMetadata[key] = name;
  globalThis.document?.querySelectorAll(".chat_lorebook_button").forEach((button) => button.classList.add("world_set"));
  return "bound";
}

export async function activateGlobalLorebook(name: string): Promise<WriteResult<{ name: string }>> {
  const lorebook = findLorebook(name) ?? name.trim();
  if (!lorebook) return couldNot("no lorebook by that name");
  if (isGloballySelected(lorebook)) return wrote({ name: lorebook });
  await executeSlashCommands(`/world silent=true state=on ${quoteSlashArg(lorebook)}`);
  return isGloballySelected(lorebook) ? wrote({ name: lorebook }) : couldNot(`"${lorebook}" did not stay selected`);
}

const isGloballySelected = (lorebook: string) => listSelectedLorebooks().some((entry) => entry.toLowerCase() === lorebook.toLowerCase());

// The globally active books, read from the array `/world state=on` actually writes
// (world-info.js:66/5799). `world_info.globalSelect` is only a mirror, assigned inside a *debounced*
// save (world-info.js:83) — reading it right after activating a book returns the previous state, and
// after deleting one it keeps a name that no longer exists. Both bit us live (v2.1 plan 07).
export function listSelectedLorebooks(): string[] {
  const live = worldInfoModule.selected_world_info;
  const source = Array.isArray(live) ? live : listGlobalSelect();
  return source.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => entry.length > 0);
}

const listGlobalSelect = (): string[] => (getWorldInfoSettings() as { world_info?: { globalSelect?: string[] } }).world_info?.globalSelect ?? [];

// Writes only into a book that exists. Whether a missing book should be created is the caller's
// call (`ensureLorebook`): a raw save lands on disk with no `world_names` refresh and no activation.
export async function upsertWIEntry(lorebook: string, comment: string, content: string, keys: string[] = [], options: { constant?: boolean } = {}): Promise<WIUpsertResult> {
  if (!comment) return "failed";
  const book = await loadExisting(lorebook);
  if (!book) {
    console.warn("[Story WI] lorebook does not exist", { lorebook });
    return "failed";
  }
  const { name, data } = book;
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

export interface WIEntrySnapshot {
  content: string;
  keys: string[];
  constant: boolean;
  disabled: boolean;
  uid?: number;
}

// What an entry holds right now, so a write can show a before/after instead of asking the author to
// trust the replacement. `null` covers both "no such book" and "no such entry": both mean there is
// nothing to overwrite, and the review card says which by also knowing whether the book is listed.
export async function readWIEntry(lorebook: string, comment: string): Promise<WIEntrySnapshot | null> {
  if (!comment) return null;
  const book = await loadExisting(lorebook);
  if (!book) return null;
  const entry = Object.values(book.data.entries).find((candidate) => candidate.comment?.trim() === comment);
  if (!entry) return null;
  return { content: String(entry.content ?? ""), keys: Array.isArray(entry.key) ? entry.key : [], constant: Boolean(entry.constant), disabled: Boolean(entry.disable), uid: typeof entry.uid === "number" ? entry.uid : undefined };
}

export interface WIEntryTarget { lorebookFileId: string; uid: number }

// V10: a curator revert addresses the entry it wrote by the book's file id and the entry's uid, so an
// entry the author renamed afterwards is still the one restored. `comment` rides along so the caller
// can re-check the name against the story's write scope.
export async function readWIEntryAt(target: WIEntryTarget): Promise<(WIEntrySnapshot & { comment: string }) | null> {
  const entry = (await loadExisting(target.lorebookFileId))?.data.entries[target.uid];
  if (!entry) return null;
  return { comment: String(entry.comment ?? "").trim(), content: String(entry.content ?? ""), keys: Array.isArray(entry.key) ? entry.key : [], constant: Boolean(entry.constant), disabled: Boolean(entry.disable), uid: target.uid };
}

export async function restoreWIEntryAt(target: WIEntryTarget, image: { content: string; disabled: boolean }): Promise<WriteResult<{ confirmed: boolean }>> {
  const book = await loadExisting(target.lorebookFileId);
  if (!book) return couldNot(`there is no lorebook "${target.lorebookFileId}"`);
  const entry = book.data.entries[target.uid];
  if (!entry) return couldNot(`entry ${target.uid} is no longer in "${book.name}"`);
  entry.content = image.content;
  entry.disable = image.disabled;
  try {
    await saveLorebook(book.name, book.data);
  } catch (error) {
    return couldNot(`"${book.name}" could not be saved: ${error instanceof Error ? error.message : "the host refused the write"}`);
  }
  const onServer = await readServerLorebook(book.name);
  if (!onServer) return wrote({ confirmed: false });
  const kept = onServer.entries[target.uid];
  if (!kept || String(kept.content ?? "") !== image.content || Boolean(kept.disable) !== image.disabled) {
    worldInfoModule.worldInfoCache.delete(book.name);
    return couldNot(`"${book.name}" was saved, but the server does not hold the restored entry ${target.uid}, so the write was lost`);
  }
  return wrote({ confirmed: true });
}
