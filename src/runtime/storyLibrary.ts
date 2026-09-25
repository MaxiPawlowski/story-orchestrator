import { parseStoryV2, isValidationErrorList, type NormalizedStoryV2 } from "@engine/index";
import { getContext, observeNextSettingsSave, readServerExtensionSettings } from "@services/STAPI";
import { hashStory } from "./hash";
import { createSettingsWriteEvidence, missingFromServer, missingMigrated, recordSettingsWrite, stillHeldByServer, type LibrarySaveEvidence } from "./librarySave";
import type { LoadedStory, StoryLibraryRecord, RuntimeSnapshot } from "./types";

const SETTINGS_KEY = "v2Stories";
const ROOT_KEY = "story-orchestrator";

const getRoot = () => {
  const context = getContext();
  const settings = context.extensionSettings;
  settings[ROOT_KEY] = settings[ROOT_KEY] ?? {};
  return settings[ROOT_KEY] as Record<string, unknown>;
};

const storyObject = (raw: unknown): Record<string, unknown> | null => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null);

const isStoryRecord = (value: unknown): value is StoryLibraryRecord => {
  return Boolean(value) && typeof value === "object" && typeof (value as StoryLibraryRecord).hash === "string" && typeof (value as StoryLibraryRecord).title === "string";
};

// Identity is authored (`id`), never derived from content. A story without one keeps a stable
// identity anyway, derived from the content it had when it entered the library.
export const storyIdFor = (story: Pick<NormalizedStoryV2, "id">, contentHash: string): string => story.id ?? `legacy-${contentHash}`;

const rawIdOf = (record: StoryLibraryRecord): string | undefined => {
  const raw = record.raw as { id?: unknown } | undefined;
  return typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim().toLowerCase() : undefined;
};

const rawVersionOf = (record: StoryLibraryRecord): number => {
  const raw = record.raw as { version?: unknown } | undefined;
  return typeof raw?.version === "number" && Number.isInteger(raw.version) && raw.version >= 1 ? raw.version : 1;
};

const stampedAt = (record: StoryLibraryRecord) => Date.parse(record.updatedAt ?? record.importedAt ?? "") || 0;

// Records written before v2.1 carry no id/version; rekey them on read, newest wins on collision.
const migrateRecords = (records: StoryLibraryRecord[]): { records: StoryLibraryRecord[]; changed: boolean } => {
  let changed = false;
  const byId = new Map<string, StoryLibraryRecord>();
  for (const record of records) {
    const id = record.id ?? rawIdOf(record) ?? `legacy-${record.hash}`;
    const migrated: StoryLibraryRecord = {
      ...record,
      id,
      version: record.version ?? rawVersionOf(record),
      updatedAt: record.updatedAt ?? record.importedAt ?? new Date().toISOString(),
    };
    if (!record.id || !record.version || !record.updatedAt) changed = true;
    const existing = byId.get(id);
    if (existing && stampedAt(existing) >= stampedAt(migrated)) {
      console.warn(`[Story Orchestrator] duplicate story id '${id}' in the library; keeping the newer record "${existing.title}"`);
      changed = true;
      continue;
    }
    if (existing) {
      console.warn(`[Story Orchestrator] duplicate story id '${id}' in the library; replacing "${existing.title}" with the newer record`);
      changed = true;
    }
    byId.set(id, migrated);
  }
  return { records: [...byId.values()], changed };
};

const readServerLibrary = async (): Promise<unknown[] | null> => {
  const root = await readServerExtensionSettings(ROOT_KEY);
  return root === null ? null : Array.isArray(root[SETTINGS_KEY]) ? (root[SETTINGS_KEY] as unknown[]) : [];
};

const observeLibraryWrite = <T>(missing: (stored: unknown[] | null, write: T) => string | null) => createSettingsWriteEvidence<T>({ observe: () => observeNextSettingsSave(), readBack: readServerLibrary }, missing);

const confirmRecord = observeLibraryWrite(missingFromServer);
const confirmRemoval = observeLibraryWrite(stillHeldByServer);
const confirmMigration = observeLibraryWrite(missingMigrated);
const armedSaves = new WeakMap<StoryLibraryRecord, Promise<LibrarySaveEvidence>>();

export function listStoryRecords(): StoryLibraryRecord[] {
  const root = getRoot();
  const stored = Array.isArray(root[SETTINGS_KEY]) ? (root[SETTINGS_KEY] as unknown[]).filter(isStoryRecord) : [];
  const { records, changed } = migrateRecords(stored);
  if (changed) {
    root[SETTINGS_KEY] = records;
    const ids = records.map((record) => record.id);
    recordSettingsWrite("library migration not confirmed", `rekeyed records ${ids.join(", ")}`, () => confirmMigration(ids));
    getContext().saveSettingsDebounced();
  }
  return [...records].sort((left, right) => left.title.localeCompare(right.title));
}

export function findStoryRecord(idOrHash: string): StoryLibraryRecord | null {
  const records = listStoryRecords();
  return records.find((record) => record.id === idOrHash) ?? records.find((record) => record.hash === idOrHash) ?? null;
}

// A Studio-born story must enter the library with a real id: without one it keys as
// `legacy-<contentHash>` and every save forks a new record — finding U2, from the authoring side.
export function availableStoryId(base: string): string {
  const used = new Set(listStoryRecords().map((record) => record.id));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function saveStoryRecord(raw: unknown): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(raw);
  if (isValidationErrorList(parsed)) return parsed;
  const body = storyObject(raw);
  if (!body) return [{ path: "$", message: "a story is a JSON object" }];
  const hash = hashStory(raw);
  const id = storyIdFor(parsed, hash);
  const records = listStoryRecords();
  const existing = records.find((record) => record.id === id) ?? null;
  // Same identity, new content: the library record is *updated*, never forked. A version the
  // author did not raise still moves, so a chat can tell its pinned copy is behind.
  const version = existing && existing.hash !== hash && parsed.version <= existing.version ? existing.version + 1 : parsed.version;
  const record: StoryLibraryRecord = {
    id,
    version,
    hash,
    title: parsed.title,
    description: parsed.description,
    raw: body,
    importedAt: existing?.importedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getRoot()[SETTINGS_KEY] = [...records.filter((entry) => entry.id !== id), record];
  const evidence = recordSettingsWrite("library save not confirmed", `“${record.title}” v${record.version}`, () => confirmRecord(record));
  if (evidence) armedSaves.set(record, evidence);
  getContext().saveSettingsDebounced();
  return { record, story: { ...parsed, id, version } };
}

/** v2.4 plan 02 §7: whether the server holds what `saveStoryRecord` wrote; the evidence it already armed, or armed now. */
export const confirmLibrarySave = (record: StoryLibraryRecord): Promise<LibrarySaveEvidence> => armedSaves.get(record) ?? confirmRecord(record);

export function removeStoryRecord(idOrHash: string): boolean {
  const records = listStoryRecords();
  const target = findStoryRecord(idOrHash);
  if (!target) return false;
  getRoot()[SETTINGS_KEY] = records.filter((entry) => entry.id !== target.id);
  const removal = { id: target.id, at: new Date().toISOString() };
  recordSettingsWrite("library removal not confirmed", `“${target.title}”`, () => confirmRemoval(removal));
  getContext().saveSettingsDebounced();
  return true;
}

export function loadStoryRecord(record: StoryLibraryRecord): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(record.raw);
  if (isValidationErrorList(parsed)) return parsed;
  return { record, story: { ...parsed, id: record.id, version: record.version } };
}

// A chat plays its pinned copy, so it must load without consulting the library at all.
export function loadPinnedStory(id: string, pinned: Record<string, unknown>, version: number, hash: string, title: string): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(pinned);
  if (isValidationErrorList(parsed)) return parsed;
  const record: StoryLibraryRecord = {
    id,
    version,
    hash,
    title: parsed.title || title,
    description: parsed.description,
    raw: pinned,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { record, story: { ...parsed, id, version } };
}
