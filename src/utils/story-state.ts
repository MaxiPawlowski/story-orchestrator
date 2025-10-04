import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import type { NormalizedStory } from "@utils/story-validator";
import { extensionName } from "@constants/main";

export type CheckpointStatus = "pending" | "current" | "complete" | "failed";

export const DEFAULT_INTERVAL_TURNS = 3;
export const clampCheckpointIndex = (idx: number, story: NormalizedStory | null | undefined): number => {
  if (!story) return 0;
  return clampIndex(idx, story);
};

export const sanitizeTurnsSinceEval = (value: number): number => sanitizeTurns(value);

const STORAGE_KEY = "storyState";
const STORAGE_VERSION = 1;

type StateMap = Record<string, PersistedChatState>;

export interface RuntimeStoryState {
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  turnsSinceEval: number;
}

export interface PersistedChatState {
  ver: number;
  storySignature: string;
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  turnsSinceEval: number;
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
  console.log("[StoryState] found entry", { entry });
  if (!isPersistedChatState(entry)) {
    return { state: defaults, source: "default" };
  }
  if (entry.storySignature !== computeStorySignature(story)) {
    return { state: defaults, source: "default" };
  }

  const checkpointIndex = clampIndex(entry.checkpointIndex, story);
  const turnsSinceEval = sanitizeTurns(entry.turnsSinceEval);
  const checkpointStatuses = reconcileStatuses({
    story,
    statuses: entry.checkpointStatuses,
    checkpointIndex,
  });

  return {
    state: {
      checkpointIndex,
      checkpointStatuses,
      turnsSinceEval,
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
  const turnsSinceEval = sanitizeTurns(state.turnsSinceEval);
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
    turnsSinceEval,
    updatedAt: Date.now(),
  };

  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[StoryState] Failed to persist extension settings", err);
  }
}

export function makeDefaultState(story: NormalizedStory | null | undefined): RuntimeStoryState {
  const checkpoints = story?.checkpoints ?? [];
  const checkpointIndex = checkpoints.length > 0 ? 0 : -1;
  const checkpointStatuses = buildDefaultStatuses(checkpoints.length, checkpointIndex);
  return {
    checkpointIndex: checkpointIndex < 0 ? 0 : checkpointIndex,
    checkpointStatuses,
    turnsSinceEval: 0,
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

// ---------------------------------------------------------------------------
// Exported pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute next checkpoint statuses given an active index and previous statuses.
 * Pure function.
 */
export function computeNextStatuses(
  activeIndex: number,
  previous: CheckpointStatus[] | null | undefined,
  story: NormalizedStory | null | undefined,
): CheckpointStatus[] {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return [];

  const total = checkpoints.length;
  const prev = Array.isArray(previous) ? previous : [];
  const result: CheckpointStatus[] = new Array(total);
  for (let idx = 0; idx < total; idx++) {
    if (idx < activeIndex) {
      result[idx] = 'complete';
    } else if (idx === activeIndex) {
      result[idx] = prev[idx] === 'failed' ? 'failed' : 'current';
    } else {
      result[idx] = (prev[idx] as CheckpointStatus) ?? 'pending';
    }
  }
  return result;
}

/**
 * Sanitizes a candidate runtime state against the provided story.
 * Returns a safe RuntimeStoryState.
 */
export function sanitizeRuntime(candidate: RuntimeStoryState, story: NormalizedStory | null): RuntimeStoryState {
  const checkpointIndex = clampCheckpointIndex(candidate.checkpointIndex, story);
  const turnsSinceEval = sanitizeTurnsSinceEval(candidate.turnsSinceEval);

  const checkpointStatuses = story
    ? reconcileStatuses({ story, statuses: candidate.checkpointStatuses, checkpointIndex })
    : makeDefaultState(story).checkpointStatuses;

  return {
    checkpointIndex,
    checkpointStatuses,
    turnsSinceEval,
  };
}

/**
 * Match a text against precompiled regex lists.
 * Returns { reason: 'win'|'fail', pattern } or null.
 */
export function matchTrigger(
  text: string,
  winRes: RegExp[],
  failRes: RegExp[],
): { reason: 'win' | 'fail'; pattern: string } | null {
  for (const re of failRes ?? []) {
    try {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'fail', pattern: re.toString() };
    } catch {
      // ignore malformed / unexpected
    }
  }
  for (const re of winRes ?? []) {
    try {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'win', pattern: re.toString() };
    } catch {
      // ignore
    }
  }
  return null;
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
export function clampText(input: string, limit: number): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim();
  if (!Number.isFinite(limit)) return '';
  const safeLimit = Math.floor(limit);
  if (safeLimit <= 0) return normalized ? '...' : '';
  if (normalized.length <= safeLimit) return normalized;
  const truncation = Math.max(0, safeLimit - 3);
  return `${normalized.slice(0, truncation)}...`;
}

function sanitizeTurns(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const num = Math.floor(Number(value));
  return num >= 0 ? num : 0;
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
    && typeof candidate.turnsSinceEval === "number"
  );
}
