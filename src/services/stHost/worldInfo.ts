import { trimStringList } from "@utils/dataHelpers";
import { lorebookFileId, quoteSlashArg } from "@utils/string";
import { getContext } from "./context";
import { saveOpenChat } from "./persistence";
import type { HostWorldInfoSettings } from "./hostTypes";
import { worldInfoModule } from "./modules";
import { executeSlashCommands } from "./slashCommands";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";

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

export async function loadScanLorebook(name: string): Promise<{ name: string; entries: Array<LoreEntry & { world: string; content: string }> } | null> {
  const book = await loadExisting(name);
  if (!book) return null;
  const entries = Object.values(book.data.entries).map(({ uid, ...rest }) => ({ ...rest, content: typeof rest.content === "string" ? rest.content : "", uid, world: book.name }));
  return { name: book.name, entries };
}

export async function loadLorebook(name: string): Promise<Lorebook | null> {
  return (await loadExisting(name))?.data ?? null;
}

// ST's `_save` posts `/api/worldinfo/edit` and never reads the answer (world-info.js:4151), so a
// refused save resolves exactly like a kept one. The server's own copy is the evidence; `null` means
// the read itself could not answer, which is not evidence of a lost write.
export async function readServerLorebook(name: string): Promise<Lorebook | null> {
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

export interface WIEntrySwitches {
  enable?: string | string[];
  disable?: string | string[];
}

const listOf = (value: string | string[] | undefined) => trimStringList(value === undefined ? [] : Array.isArray(value) ? value : [value]);

const restsOff = (entry: LoreEntry) => entry.disable === true;

export async function setWIEntriesState(lorebook: string, switches: WIEntrySwitches): Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>> {
  if (!lorebook) return couldNot("no lorebook was named");
  const wanted = [
    ...listOf(switches.disable).map((comment) => ({ comment, disabled: true })),
    ...listOf(switches.enable).map((comment) => ({ comment, disabled: false })),
  ];
  if (!wanted.length) return couldNot("no entry was named");

  const book = await loadExisting(lorebook);
  if (!book) {
    log.warn("world info: lorebook does not exist", { lorebook });
    return couldNot(`there is no lorebook "${lorebook}"`);
  }

  const target = new Map<number, { comment: string; disabled: boolean }>();
  const unmatched: string[] = [];
  for (const { comment, disabled } of wanted) {
    const [found] = findMatchedLoreEntries(book.data, [comment]);
    if (!found) unmatched.push(comment);
    else target.set(found.uid, { comment, disabled });
  }
  unmatched.forEach((comment) => log.warn("world info: no matching world info entry found", { lorebook, comment }));
  if (!target.size) return couldNot(`"${unmatched.join("\", \"")}" is not in "${lorebook}"`);

  let changed = false;
  for (const [uid, { disabled }] of target) {
    const entry = book.data.entries[uid];
    if (!entry) continue;
    if (disabled ? entry.disable === true : !restsOff(entry)) continue;
    entry.disable = disabled;
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
  const lost = [...target].filter(([uid, { disabled }]) => onServer.entries[uid] && restsOff(onServer.entries[uid]) !== disabled);
  if (lost.length) {
    worldInfoModule.worldInfoCache.delete(book.name);
    return couldNot(`"${lorebook}" was saved, but the server still holds the old flag on "${lost.map(([, entry]) => entry.comment).join("\", \"")}", so the write was lost`);
  }
  return wrote({ changed: true, confirmed: true });
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntriesState(lorebook, { enable: comments });
}

export async function disableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntriesState(lorebook, { disable: comments });
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

export async function createLorebook(name: string): Promise<WriteResult<{ name: string; created: boolean }>> {
  const ensured = await ensureLorebook(name);
  return ensured ? wrote({ name: ensured.name, created: ensured.created }) : couldNot(`could not create "${name}"`);
}

// Exact listed name only: `deleteWorldInfo` (world-info.js:4346) answers false for an
// unlisted name and refreshes `world_names` itself on success, so the list is the evidence. The cache
// is evicted here too, because a failed delete leaves whatever `loadWorldInfo` fetched.
export async function deleteLorebook(name: string): Promise<WriteResult<{ name: string }>> {
  if (!name || !listAllLorebooks().includes(name)) return couldNot(`there is no lorebook "${name}"`);
  let deleted: boolean;
  try {
    deleted = await worldInfoModule.deleteWorldInfo(name);
  } catch (error) {
    deleted = false;
    log.warn("world info: lorebook delete failed", { name, error });
  }
  worldInfoModule.worldInfoCache.delete(name);
  if (!deleted) return couldNot(`"${name}" could not be deleted`);
  return listAllLorebooks().includes(name) ? couldNot(`"${name}" is still listed after the delete`) : wrote({ name });
}

// The chat's lorebook slot as ST reads it (world-info.js:4545); "" when unbound.
export function readChatLorebookSlot(): string {
  const slot = getContext().chatMetadata?.[worldInfoModule.METADATA_KEY];
  return typeof slot === "string" ? slot.trim() : "";
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

// A branch carries its parent's chat lorebook slot, so an unadopted branch would
// fire the parent's story memory. ST's own unbind (world-info.js:5980-5983) deletes the key, clears the
// button state and saves; this does the same, and only when the slot names exactly `name`.
export async function unbindChatLorebook(name: string): Promise<WriteResult<{ name: string }>> {
  const context = getContext();
  if (!context.chatId) return couldNot("no chat is open");
  const key = worldInfoModule.METADATA_KEY;
  const slot = context.chatMetadata[key];
  if (typeof slot !== "string" || slot !== name) return couldNot(`the chat lorebook slot does not name "${name}"`);
  delete context.chatMetadata[key];
  globalThis.document?.querySelectorAll(".chat_lorebook_button").forEach((button) => button.classList.remove("world_set"));
  await saveOpenChat();
  return wrote({ name });
}

export async function deactivateGlobalLorebook(name: string): Promise<WriteResult<{ name: string }>> {
  const lorebook = listSelectedLorebooks().find((entry) => entry.toLowerCase() === name.trim().toLowerCase());
  if (!lorebook) return wrote({ name: name.trim() });
  await executeSlashCommands(`/world silent=true state=off ${quoteSlashArg(lorebook)}`);
  return isGloballySelected(lorebook) ? couldNot(`"${lorebook}" is still selected`) : wrote({ name: lorebook });
}

const isGloballySelected = (lorebook: string) => listSelectedLorebooks().some((entry) => entry.toLowerCase() === lorebook.toLowerCase());

// The globally active books, read from the array `/world state=on` actually writes
// (world-info.js:66/5799). `world_info.globalSelect` is only a mirror, assigned inside a *debounced*
// save (world-info.js:83) — reading it right after activating a book returns the previous state, and
// after deleting one it keeps a name that no longer exists. Both bit us live.
export function listSelectedLorebooks(): string[] {
  const live = worldInfoModule.selected_world_info;
  const source = Array.isArray(live) ? live : listGlobalSelect();
  return source.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => entry.length > 0);
}

const listGlobalSelect = (): string[] => (getWorldInfoSettings() as { world_info?: { globalSelect?: string[] } }).world_info?.globalSelect ?? [];

// Writes only into a book that exists. Whether a missing book should be created is the caller's
// call (`ensureLorebook`): a raw save lands on disk with no `world_names` refresh and no activation.
export async function upsertWIEntry(lorebook: string, comment: string, content: string, keys: string[] = [], options: { constant?: boolean; live?: boolean } = {}): Promise<WIUpsertResult> {
  if (!comment) return "failed";
  const book = await loadExisting(lorebook);
  if (!book) {
    log.warn("world info: lorebook does not exist", { lorebook });
    return "failed";
  }
  const { name, data } = book;
  const existing = Object.values(data.entries).find((entry) => entry.comment?.trim() === comment);
  const switchedOff = options.live === true && existing?.disable === true;
  if (existing && String(existing.content ?? "").trim() === content.trim() && options.constant === undefined && !switchedOff) return "unchanged";

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
  return {
    content: String(entry.content ?? ""),
    keys: Array.isArray(entry.key) ? entry.key : [],
    constant: Boolean(entry.constant),
    disabled: Boolean(entry.disable),
    uid: typeof entry.uid === "number" ? entry.uid : undefined,
  };
}

export interface WIEntryTarget { lorebookFileId: string; uid: number }

// A curator revert addresses the entry it wrote by the book's file id and the entry's uid, so an
// entry the author renamed afterwards is still the one restored. `comment` rides along so the caller
// can re-check the name against the story's write scope.
export async function readWIEntryAt(target: WIEntryTarget): Promise<(WIEntrySnapshot & { comment: string }) | null> {
  const entry = (await loadExisting(target.lorebookFileId))?.data.entries[target.uid];
  if (!entry) return null;
  return {
    comment: String(entry.comment ?? "").trim(),
    content: String(entry.content ?? ""),
    keys: Array.isArray(entry.key) ? entry.key : [],
    constant: Boolean(entry.constant),
    disabled: Boolean(entry.disable),
    uid: target.uid,
  };
}

export async function updateWIEntryByUid(target: WIEntryTarget, patch: { content?: string; disabled?: boolean }): Promise<WriteResult<{ confirmed: boolean }>> {
  const book = await loadExisting(target.lorebookFileId);
  if (!book) return couldNot(`there is no lorebook "${target.lorebookFileId}"`);
  const entry = book.data.entries[target.uid];
  if (!entry) return couldNot(`entry ${target.uid} is no longer in "${book.name}"`);
  if (patch.content !== undefined) entry.content = patch.content;
  if (patch.disabled !== undefined) entry.disable = patch.disabled;
  try {
    await saveLorebook(book.name, book.data);
  } catch (error) {
    return couldNot(`"${book.name}" could not be saved: ${error instanceof Error ? error.message : "the host refused the write"}`);
  }
  const onServer = await readServerLorebook(book.name);
  if (!onServer) return wrote({ confirmed: false });
  const kept = onServer.entries[target.uid];
  const lost = !kept || (patch.content !== undefined && String(kept.content ?? "") !== patch.content) || (patch.disabled !== undefined && Boolean(kept.disable) !== patch.disabled);
  if (lost) {
    worldInfoModule.worldInfoCache.delete(book.name);
    return couldNot(`"${book.name}" was saved, but the server does not hold the written entry ${target.uid}, so the write was lost`);
  }
  return wrote({ confirmed: true });
}

export const restoreWIEntryAt = (target: WIEntryTarget, image: { content: string; disabled: boolean }): Promise<WriteResult<{ confirmed: boolean }>> => updateWIEntryByUid(target, image);
