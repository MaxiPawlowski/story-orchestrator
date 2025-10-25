import type { Story } from "@utils/story-schema";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import { getContext } from "@services/SillyTavernAPI";
import { getExtensionSettingsRoot } from "@utils/settings";

export const STUDIO_SETTINGS_KEY = "studio";
export const SAVED_KEY_PREFIX = "saved:";

export type StoredStoryRecord = {
  id: string;
  name: string;
  story: Story;
  updatedAt: number;
};

export type StudioState = {
  stories: StoredStoryRecord[];
  lastSelectedKey: string | null;
};

export type StoryLibraryEntry = {
  key: string;
  kind: "saved";
  label: string;
  ok: boolean;
  story?: NormalizedStory;
  storyRaw?: Story;
  error?: string;
  meta?: { id?: string; file?: string; name?: string; updatedAt?: number };
};

export type SaveLibraryStoryResult =
  | { ok: true; key: string }
  | { ok: false; error: string };

export type DeleteLibraryStoryResult =
  | { ok: true }
  | { ok: false; error: string };

const normalizeLastSelectedKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(SAVED_KEY_PREFIX)) return null;
  return trimmed;
};

export function loadStudioState(): StudioState {
  const root = getExtensionSettingsRoot();
  const raw = root[STUDIO_SETTINGS_KEY];
  if (!raw || typeof raw !== "object") {
    return { stories: [], lastSelectedKey: null };
  }
  const candidate = raw as Partial<{ stories?: unknown; lastSelectedKey?: unknown }>;
  const storiesRaw = Array.isArray(candidate.stories) ? candidate.stories : [];
  const usedIds = new Set<string>();
  const stories: StoredStoryRecord[] = [];
  for (const item of storiesRaw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<StoredStoryRecord>;
    const id = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : generateStoryId(usedIds);
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    const name = typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : "Untitled Story";
    if (!record.story || typeof record.story !== "object") continue;
    const story = record.story as Story;
    const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
    stories.push({ id, name, story, updatedAt });
  }
  const lastSelectedKey = normalizeLastSelectedKey(candidate.lastSelectedKey);
  return { stories, lastSelectedKey };
}

export function persistStudioState(state: StudioState): void {
  const { saveSettingsDebounced } = getContext();
  const root = getExtensionSettingsRoot();
  const sanitizedKey = normalizeLastSelectedKey(state.lastSelectedKey);
  root[STUDIO_SETTINGS_KEY] = {
    stories: state.stories.map(({ id, name, story, updatedAt }) => ({
      id,
      name,
      story,
      updatedAt,
    })),
    lastSelectedKey: sanitizedKey ?? undefined,
  };
  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[Story - storyLibrary] Failed to persist studio state", err);
  }
}

export function generateStoryId(used: Set<string>): string {
  let candidate = "";
  do {
    candidate = Math.random().toString(36).slice(2, 10);
  } while (!candidate || used.has(candidate));
  used.add(candidate);
  return candidate;
}

export function describeStoryError(error: unknown): string {
  try {
    const formatted = formatZodError(error);
    if (Array.isArray(formatted) && formatted.length) {
      return formatted.join("; ");
    }
  } catch {
    // fall through to general handling
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (Array.isArray(error)) {
    return error.map((entry) => String(entry)).join("; ");
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown validation error";
  }
}

export function toSavedEntries(stories: StoredStoryRecord[]): StoryLibraryEntry[] {
  return stories.map((entry) => {
    try {
      const normalized = parseAndNormalizeStory(entry.story);
      return {
        key: `${SAVED_KEY_PREFIX}${entry.id}`,
        kind: "saved" as const,
        label: `Saved · ${entry.name}`,
        ok: true,
        story: normalized,
        storyRaw: entry.story,
        meta: { id: entry.id, name: entry.name, updatedAt: entry.updatedAt },
      };
    } catch (error) {
      return {
        key: `${SAVED_KEY_PREFIX}${entry.id}`,
        kind: "saved" as const,
        label: `Saved · ${entry.name}`,
        ok: false,
        error: describeStoryError(error),
        meta: { id: entry.id, name: entry.name, updatedAt: entry.updatedAt },
      };
    }
  });
}
