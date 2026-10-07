import { parseStoryV2, isValidationErrorList, slugifyStoryId } from "@engine/index";
import { getContext, observeNextSettingsSave, readServerExtensionSettings } from "@services/STAPI";
import { hashStory } from "./hash";
import { createSettingsWriteEvidence, missingFromServer, recordSettingsWrite, stillHeldByServer, type LibrarySaveEvidence } from "./librarySave";
import { SETTINGS_ROOT_KEY, settingsRoot, writableSettingsRoot } from "./settingsRoot";
import type { LoadedStory, StoryLibraryRecord, RuntimeSnapshot } from "./types";
import { log } from "@utils/log";

const SETTINGS_KEY = "v2Stories";

const storyObject = (raw: unknown): Record<string, unknown> | null => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null);

const isStoryRecord = (value: unknown): value is StoryLibraryRecord => {
  const record = value as Partial<StoryLibraryRecord> | null;
  return Boolean(record) && typeof record === "object" && typeof record?.id === "string" && Boolean(record.id)
    && typeof record.hash === "string" && typeof record.title === "string" && Boolean(storyObject(record.raw));
};

const stampedAt = (record: StoryLibraryRecord) => Date.parse(record.updatedAt ?? record.importedAt ?? "") || 0;

let lastLibraryWarning = "";
const warnOnce = (message: string) => {
  if (message !== lastLibraryWarning) log.warn(`${message}`);
  lastLibraryWarning = message;
};

// The read is a sanitizer and never writes. A record without an id is
// dropped with a warning; a duplicate id keeps the newer record.
const sanitizeRecords = (stored: unknown[]): StoryLibraryRecord[] => {
  const valid = stored.filter(isStoryRecord);
  const byId = new Map<string, StoryLibraryRecord>();
  for (const record of valid) {
    const existing = byId.get(record.id);
    if (!existing || stampedAt(record) > stampedAt(existing)) byId.set(record.id, record);
  }
  const dropped = stored.length - valid.length;
  const duplicates = valid.length - byId.size;
  if (dropped || duplicates) warnOnce(`the story library holds ${dropped} record(s) without an id and ${duplicates} duplicate id(s); they are not read`);
  return [...byId.values()];
};

const readServerLibrary = async (): Promise<unknown[] | null> => {
  const root = await readServerExtensionSettings(SETTINGS_ROOT_KEY);
  return root === null ? null : Array.isArray(root[SETTINGS_KEY]) ? (root[SETTINGS_KEY] as unknown[]) : [];
};

const observeLibraryWrite = <T>(missing: (stored: unknown[] | null, write: T) => string | null) => createSettingsWriteEvidence<T>(
  { observe: () => observeNextSettingsSave(), readBack: readServerLibrary },
  missing,
);

const confirmRecord = observeLibraryWrite(missingFromServer);
const confirmRemoval = observeLibraryWrite(stillHeldByServer);
const armedSaves = new WeakMap<StoryLibraryRecord, Promise<LibrarySaveEvidence>>();

export function listStoryRecords(): StoryLibraryRecord[] {
  const stored = settingsRoot()[SETTINGS_KEY];
  return sanitizeRecords(Array.isArray(stored) ? stored : []).sort((left, right) => left.title.localeCompare(right.title));
}

export function findStoryRecord(id: string): StoryLibraryRecord | null {
  return listStoryRecords().find((record) => record.id === id) ?? null;
}

// A Studio-born draft's first save takes a free id, so it never updates a same-title record it did
// not come from (finding from the authoring side). An id-less import instead updates its title's record.
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
  // Identity is authored (`id`), never derived from content. A story without one takes its title's
  // slug, so re-importing it updates the same record rather than forking one.
  const id = parsed.id ?? slugifyStoryId(parsed.title);
  const records = listStoryRecords();
  const existing = records.find((record) => record.id === id) ?? null;
  // Same identity, new content: the library record is *updated*, never forked. A chat tells its
  // pinned copy is behind by the content hash. A `version` key from an external story is not ours.
  const stored: Record<string, unknown> = { ...body, id };
  delete stored.version;
  const record: StoryLibraryRecord = {
    id,
    hash: hashStory(stored),
    title: parsed.title,
    description: parsed.description,
    raw: stored,
    importedAt: existing?.importedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writableSettingsRoot()[SETTINGS_KEY] = [...records.filter((entry) => entry.id !== id), record];
  const evidence = recordSettingsWrite("library save not confirmed", `“${record.title}”`, () => confirmRecord(record));
  if (evidence) armedSaves.set(record, evidence);
  getContext().saveSettingsDebounced();
  return { record, story: { ...parsed, id } };
}

/** Whether the server holds what `saveStoryRecord` wrote; the evidence it already armed, or armed now. */
export const confirmLibrarySave = (record: StoryLibraryRecord): Promise<LibrarySaveEvidence> => armedSaves.get(record) ?? confirmRecord(record);

export function removeStoryRecord(id: string): boolean {
  const records = listStoryRecords();
  const target = records.find((record) => record.id === id);
  if (!target) return false;
  writableSettingsRoot()[SETTINGS_KEY] = records.filter((entry) => entry.id !== target.id);
  const removal = { id: target.id, at: new Date().toISOString() };
  recordSettingsWrite("library removal not confirmed", `“${target.title}”`, () => confirmRemoval(removal));
  getContext().saveSettingsDebounced();
  return true;
}

export function loadStoryRecord(record: StoryLibraryRecord): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(record.raw);
  if (isValidationErrorList(parsed)) return parsed;
  return { record, story: { ...parsed, id: record.id } };
}

// A chat plays its pinned copy, so it must load without consulting the library at all.
export function loadPinnedStory(id: string, pinned: Record<string, unknown>, hash: string, title: string): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(pinned);
  if (isValidationErrorList(parsed)) return parsed;
  const record: StoryLibraryRecord = {
    id,
    hash,
    title: parsed.title || title,
    description: parsed.description,
    raw: pinned,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { record, story: { ...parsed, id } };
}
