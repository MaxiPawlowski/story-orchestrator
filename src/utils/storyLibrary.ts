import type { Story } from "@utils/story-schema";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { CheckpointBundle } from "@utils/story-loader";
import { extensionName } from "@constants/main";
import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";

export const STUDIO_SETTINGS_KEY = "studio";
export const SAVED_KEY_PREFIX = "saved:";
export const BUNDLE_KEY_PREFIX = "bundle:";

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
  kind: "saved" | "bundle";
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

function getSettingsRoot(): Record<string, unknown> {
  const root = extension_settings[extensionName];
  if (root && typeof root === "object") {
    return root as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  extension_settings[extensionName] = created;
  return created;
}

export function loadStudioState(): StudioState {
  const root = getSettingsRoot();
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
  const lastSelectedKey = typeof candidate.lastSelectedKey === "string"
    ? candidate.lastSelectedKey
    : null;
  return { stories, lastSelectedKey };
}

export function persistStudioState(state: StudioState): void {
  const root = getSettingsRoot();
  root[STUDIO_SETTINGS_KEY] = {
    stories: state.stories.map(({ id, name, story, updatedAt }) => ({
      id,
      name,
      story,
      updatedAt,
    })),
    lastSelectedKey: state.lastSelectedKey ?? undefined,
  };
  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[storyLibrary] Failed to persist studio state", err);
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

export function toBundleEntries(bundle: CheckpointBundle | null): StoryLibraryEntry[] {
  if (!bundle) return [];
  return bundle.results.map((entry) => {
    if (entry.ok) {
      const label = entry.json.title?.trim()
        ? `Builtin · ${entry.json.title.trim()}`
        : `Builtin · ${entry.file}`;
      return {
        key: `${BUNDLE_KEY_PREFIX}${entry.file}`,
        kind: "bundle" as const,
        label,
        ok: true,
        story: entry.json,
        meta: { file: entry.file },
      };
    }
    return {
      key: `${BUNDLE_KEY_PREFIX}${entry.file}`,
      kind: "bundle" as const,
      label: `Builtin · ${entry.file}`,
      ok: false,
      error: describeStoryError(entry.error),
      meta: { file: entry.file },
    };
  });
}

export type { CheckpointBundle } from "@utils/story-loader";
