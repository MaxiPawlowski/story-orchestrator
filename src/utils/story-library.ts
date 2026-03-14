import { z } from "zod";
import type { Story } from "@utils/story-schema";
import { parseAndNormalizeStory, formatZodError, validateStoryShape, type NormalizedStory } from "@utils/story-validator";
import { getContext } from "@services/STAPI";
import { getExtensionSettingsRoot } from "@utils/settings";

export const STUDIO_SETTINGS_KEY = "studio";
export const SAVED_KEY_PREFIX = "saved:";

export type StoredStoryMeta = {
  premise?: string;
  roadmap?: string;
  generatedAt?: number;
  isDynamic?: boolean;
  genre?: string;
  tone?: string;
};

export type StoredStoryRecord = {
  id: string;
  name: string;
  story: Story;
  updatedAt: number;
  meta?: StoredStoryMeta;
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

const DEFAULT_STUDIO_STATE: StudioState = {
  stories: [],
  lastSelectedKey: null,
};

const StoredStoryMetaSchema = z.object({
  premise: z.string().optional(),
  roadmap: z.string().optional(),
  generatedAt: z.number().finite().optional(),
  isDynamic: z.boolean().optional(),
  genre: z.string().optional(),
  tone: z.string().optional(),
});

const StoredStoryRecordSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  story: z.record(z.string(), z.unknown()),
  updatedAt: z.number().finite().optional(),
  meta: z.unknown().optional(),
});

const StudioStateSchema = z.object({
  stories: z.array(z.unknown()).optional(),
  lastSelectedKey: z.unknown().optional(),
});

const decodeStoredStoryMeta = (value: unknown): StoredStoryMeta | undefined => {
  const parsed = StoredStoryMetaSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const decodeStoryName = (value: string | undefined): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Untitled Story";
};

const decodeStoryId = (value: string | undefined, usedIds: Set<string>): string | null => {
  const trimmed = value?.trim() ?? "";
  if (trimmed) {
    if (usedIds.has(trimmed)) return null;
    usedIds.add(trimmed);
    return trimmed;
  }
  return generateStoryId(usedIds);
};

export const decodeStoredStoryRecord = (
  value: unknown,
  usedIds: Set<string>,
  now = Date.now(),
): StoredStoryRecord | null => {
  const parsed = StoredStoryRecordSchema.safeParse(value);
  if (!parsed.success) return null;

  const id = decodeStoryId(parsed.data.id, usedIds);
  if (!id) return null;

  const meta = decodeStoredStoryMeta(parsed.data.meta);
  return {
    id,
    name: decodeStoryName(parsed.data.name),
    story: validateStoryShape(parsed.data.story),
    updatedAt: parsed.data.updatedAt ?? now,
    ...(meta ? { meta } : {}),
  };
};

export function decodeStudioState(value: unknown, now = Date.now()): StudioState {
  const parsed = StudioStateSchema.safeParse(value);
  if (!parsed.success) return { ...DEFAULT_STUDIO_STATE };

  const usedIds = new Set<string>();
  const stories = parsed.data.stories
    ?.map((entry) => decodeStoredStoryRecord(entry, usedIds, now))
    .filter((entry): entry is StoredStoryRecord => entry !== null)
    ?? [];

  return {
    stories,
    lastSelectedKey: normalizeLastSelectedKey(parsed.data.lastSelectedKey),
  };
}

const normalizeLastSelectedKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(SAVED_KEY_PREFIX)) return null;
  return trimmed;
};

export function loadStudioState(): StudioState {
  const root = getExtensionSettingsRoot();
  return decodeStudioState(root[STUDIO_SETTINGS_KEY]);
}

export function persistStudioState(state: StudioState): void {
  const { saveSettingsDebounced } = getContext();
  const root = getExtensionSettingsRoot();
  const sanitizedKey = normalizeLastSelectedKey(state.lastSelectedKey);
  root[STUDIO_SETTINGS_KEY] = {
    stories: state.stories.map(({ id, name, story, updatedAt, meta }) => ({
      id,
      name,
      story,
      updatedAt,
      ...(meta ? { meta } : {}),
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
