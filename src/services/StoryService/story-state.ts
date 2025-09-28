import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import type { NormalizedStory } from "@services/SchemaService/story-validator";
import { extensionName } from "@constants/main";

export type CheckpointStatus = "pending" | "current" | "complete" | "failed";

export const DEFAULT_INTERVAL_TURNS = 3;

const STORAGE_KEY = "storyState";
const STORAGE_VERSION = 1;

type StateMap = Record<string, PersistedChatState>;

export interface RuntimeStoryState {
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  intervalTurns: number;
}

export interface PersistedChatState {
  ver: number;
  storySignature: string;
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  intervalTurns: number;
  updatedAt: number;
}

export type LoadedStoryState = {
  state: RuntimeStoryState;
  source: "stored" | "default";
};

export function loadStoryState({
  chatId,
  story,
}: {
  chatId: string | null | undefined;
  story: NormalizedStory | null | undefined;
}): LoadedStoryState {
  console.log("[StoryState] loadStoryState", { chatId, story });
  const defaults = makeDefaultState(story);
  if (!story) {
    return { state: defaults, source: "default" };
  }

  const key = sanitizeChatKey(chatId);
  if (!key) {
    return { state: defaults, source: "default" };
  }

  const map = getStateMap();
  const entry = map[key];
  if (!isPersistedChatState(entry)) {
    return { state: defaults, source: "default" };
  }
  if (entry.storySignature !== computeStorySignature(story)) {
    return { state: defaults, source: "default" };
  }

  const checkpointIndex = clampIndex(entry.checkpointIndex, story);
  const intervalTurns = sanitizeInterval(entry.intervalTurns);
  const checkpointStatuses = reconcileStatuses({
    story,
    statuses: entry.checkpointStatuses,
    checkpointIndex,
  });

  return {
    state: {
      checkpointIndex,
      checkpointStatuses,
      intervalTurns,
    },
    source: "stored",
  };
}

export function persistStoryState({
  chatId,
  story,
  state,
}: {
  chatId: string | null | undefined;
  story: NormalizedStory | null | undefined;
  state: RuntimeStoryState;
}): void {
  console.log("[StoryState] persistStoryState", { chatId, story, state });
  if (!story) return;

  const key = sanitizeChatKey(chatId);
  if (!key) return;

  const map = getStateMap();
  const checkpointIndex = clampIndex(state.checkpointIndex, story);
  const intervalTurns = sanitizeInterval(state.intervalTurns);
  const checkpointStatuses = reconcileStatuses({
    story,
    statuses: state.checkpointStatuses,
    checkpointIndex,
  });

  map[key] = {
    ver: STORAGE_VERSION,
    storySignature: computeStorySignature(story),
    checkpointIndex,
    checkpointStatuses,
    intervalTurns,
    updatedAt: Date.now(),
  };

  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[StoryState] Failed to persist extension settings", err);
  }
}

export function clearStoryState(chatId: string | null | undefined): void {
  const key = sanitizeChatKey(chatId);
  if (!key) return;
  const map = getStateMap();
  if (map[key]) {
    delete map[key];
    try {
      saveSettingsDebounced();
    } catch (err) {
      console.warn("[StoryState] Failed to clear state", err);
    }
  }
}

export function makeDefaultState(story: NormalizedStory | null | undefined): RuntimeStoryState {
  const checkpoints = story?.checkpoints ?? [];
  const checkpointIndex = checkpoints.length > 0 ? 0 : -1;
  const checkpointStatuses = buildDefaultStatuses(checkpoints.length, checkpointIndex);
  return {
    checkpointIndex: checkpointIndex < 0 ? 0 : checkpointIndex,
    checkpointStatuses,
    intervalTurns: DEFAULT_INTERVAL_TURNS,
  };
}

function computeStorySignature(story: NormalizedStory): string {
  const cpSig = story.checkpoints
    .map((cp) => `${String(cp.id)}::${cp.name ?? ""}::${cp.objective ?? ""}`)
    .join("||");
  return [
    story.schemaVersion ?? "?",
    story.title ?? "",
    String(story.checkpoints.length ?? 0),
    cpSig,
  ].join("|");
}

function sanitizeChatKey(chatId: string | null | undefined): string | null {
  if (chatId === null || chatId === undefined) return null;
  const key = String(chatId).trim();
  return key ? key : null;
}

function getStateMap(): StateMap {
  const root = getExtensionSettingsRoot();
  const existing = root[STORAGE_KEY];
  if (existing && typeof existing === "object") {
    return existing as StateMap;
  }
  const created: StateMap = {};
  root[STORAGE_KEY] = created;
  return created;
}

function getExtensionSettingsRoot(): Record<string, unknown> {
  const root = extension_settings[extensionName];
  if (root && typeof root === "object") {
    return root as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  extension_settings[extensionName] = created;
  return created;
}

function clampIndex(idx: number, story: NormalizedStory): number {
  const max = Math.max(0, (story.checkpoints?.length ?? 0) - 1);
  if (!Number.isFinite(idx)) return 0;
  if (idx < 0) return 0;
  if (idx > max) return max;
  return Math.floor(idx);
}

function sanitizeInterval(n: number | null | undefined): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_TURNS;
  const num = Math.floor(Number(n));
  return num >= 1 ? num : DEFAULT_INTERVAL_TURNS;
}

function reconcileStatuses({
  story,
  statuses,
  checkpointIndex,
}: {
  story: NormalizedStory;
  statuses: CheckpointStatus[] | null | undefined;
  checkpointIndex: number;
}): CheckpointStatus[] {
  const total = story.checkpoints?.length ?? 0;
  if (total <= 0) return [];
  const defaults = buildDefaultStatuses(total, checkpointIndex);

  if (!Array.isArray(statuses) || !statuses.length) {
    return defaults;
  }

  const result = defaults.slice();
  for (let i = 0; i < total && i < statuses.length; i++) {
    const sanitized = sanitizeStatus(statuses[i]);
    if (!sanitized) continue;
    if (i === checkpointIndex) {
      result[i] = sanitized === "failed" ? "failed" : "current";
    } else {
      result[i] = sanitized;
    }
  }

  return result;
}

function buildDefaultStatuses(length: number, activeIndex: number): CheckpointStatus[] {
  if (length <= 0) return [];
  const idx = !Number.isFinite(activeIndex) || activeIndex < 0 ? 0 : Math.min(Math.floor(activeIndex), length - 1);
  return Array.from({ length }, (_v, i) => {
    if (i < idx) return "complete";
    if (i === idx) return "current";
    return "pending";
  });
}

function sanitizeStatus(value: unknown): CheckpointStatus | null {
  switch (value) {
    case "pending":
    case "current":
    case "complete":
    case "failed":
      return value;
    default:
      return null;
  }
}

function isPersistedChatState(input: unknown): input is PersistedChatState {
  if (!input || typeof input !== "object") return false;
  const candidate = input as PersistedChatState;
  return (
    candidate.ver === STORAGE_VERSION
    && typeof candidate.storySignature === "string"
    && typeof candidate.checkpointIndex === "number"
    && Array.isArray(candidate.checkpointStatuses)
    && typeof candidate.intervalTurns === "number"
  );
}
