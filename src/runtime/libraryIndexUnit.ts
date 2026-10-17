import { loadUserFiles } from "@services/STAPI";
import { anyLost, findLost, LIBRARY_INDEX_FILE, mergeIndex, parseIndex, seedDelta, type LibraryHeld, type LibraryIndexDelta, type LibraryLost } from "./libraryIndexCore";
import { settingsRoot } from "./settingsRoot";

const listed = (value: unknown): Array<Record<string, unknown>> => (Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : []);

export const heldNow = (): LibraryHeld => {
  const root = settingsRoot();
  return {
    stories: listed(root.v2Stories).flatMap((record) => (typeof record.id === "string" && typeof record.hash === "string" ? [{ id: record.id, hash: record.hash }] : [])),
    sessions: listed(root.wizardSessions).flatMap((session) => (typeof session.key === "string" ? [session.key] : [])),
  };
};

export async function applyDelta(delta: LibraryIndexDelta, at = new Date().toISOString()): Promise<boolean> {
  const files = await loadUserFiles();
  const read = await files.readUserJson(LIBRARY_INDEX_FILE);
  if (!read.ok) return false;
  return (await files.writeUserJson(LIBRARY_INDEX_FILE, mergeIndex(parseIndex(read.value), delta, at))).ok;
}

export async function checkIndex(held: LibraryHeld = heldNow()): Promise<LibraryLost | null> {
  const files = await loadUserFiles();
  const read = await files.readUserJson(LIBRARY_INDEX_FILE);
  if (!read.ok) return null;
  const index = parseIndex(read.value);
  const lost = findLost(index, held);
  const seed = seedDelta(index, held);
  if (seed) await files.writeUserJson(LIBRARY_INDEX_FILE, mergeIndex(index, seed, new Date().toISOString()));
  return anyLost(lost) ? lost : null;
}
