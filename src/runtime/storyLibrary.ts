import { parseStoryV2, isValidationErrorList } from "@engine/index";
import { getContext } from "@services/STAPI";
import { hashStory } from "./hash";
import type { LoadedStory, StoryLibraryRecord, RuntimeSnapshot } from "./types";

const SETTINGS_KEY = "v2Stories";

const getRoot = () => {
  const context = getContext();
  const settings = context.extensionSettings;
  settings["story-orchestrator"] = settings["story-orchestrator"] ?? {};
  return settings["story-orchestrator"] as Record<string, unknown>;
};

const isStoryRecord = (value: unknown): value is StoryLibraryRecord => {
  return Boolean(value) && typeof value === "object" && typeof (value as StoryLibraryRecord).hash === "string" && typeof (value as StoryLibraryRecord).title === "string";
};

export function listStoryRecords(): StoryLibraryRecord[] {
  const root = getRoot();
  const records = Array.isArray(root[SETTINGS_KEY]) ? root[SETTINGS_KEY].filter(isStoryRecord) : [];
  return [...records].sort((left, right) => left.title.localeCompare(right.title));
}

export function findStoryRecord(hash: string): StoryLibraryRecord | null {
  return listStoryRecords().find((record) => record.hash === hash) ?? null;
}

export function saveStoryRecord(raw: unknown): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(raw);
  if (isValidationErrorList(parsed)) return parsed;
  const hash = hashStory(raw);
  const record: StoryLibraryRecord = {
    hash,
    title: parsed.title,
    description: parsed.description,
    raw,
    importedAt: new Date().toISOString(),
  };
  const root = getRoot();
  const records = listStoryRecords().filter((entry) => entry.hash !== hash);
  root[SETTINGS_KEY] = [...records, record];
  getContext().saveSettingsDebounced();
  return { record, story: parsed };
}

export function loadStoryRecord(record: StoryLibraryRecord): LoadedStory | RuntimeSnapshot["validationErrors"] {
  const parsed = parseStoryV2(record.raw);
  if (isValidationErrorList(parsed)) return parsed;
  return { record, story: parsed };
}
