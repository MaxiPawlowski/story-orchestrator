import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import type { NormalizedCheckpoint, NormalizedStory } from "@utils/story-validator";
import { extensionName } from "@constants/main";

export enum CheckpointStatus {
  Pending = "pending",
  Current = "current",
  Complete = "complete",
  Failed = "failed",
}

export type CheckpointStatusMap = Record<string, CheckpointStatus>;

const CHECKPOINT_STATUS_VALUES = new Set<CheckpointStatus>([
  CheckpointStatus.Pending,
  CheckpointStatus.Current,
  CheckpointStatus.Complete,
  CheckpointStatus.Failed,
]);

export const isCheckpointStatus = (value: unknown): value is CheckpointStatus => (
  typeof value === "string" && CHECKPOINT_STATUS_VALUES.has(value as CheckpointStatus)
);

export const DEFAULT_INTERVAL_TURNS = 3;
export const clampCheckpointIndex = (idx: number, story: NormalizedStory | null | undefined): number => {
  if (!story) return 0;
  return clampIndex(idx, story);
};

export const sanitizeTurnsSinceEval = (value: number): number => sanitizeTurns(value);

const STORAGE_KEY = "storyState";
const STORAGE_VERSION = 3;

type StateMap = Record<string, PersistedChatState>;

export interface RuntimeStoryState {
  checkpointIndex: number;
  turnsSinceEval: number;
  checkpointStatusMap: CheckpointStatusMap;
}

export interface PersistedChatState {
  ver: number;
  storySignature: string;
  checkpointIndex: number;
  turnsSinceEval: number;
  checkpointStatusMap: CheckpointStatusMap;
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
  const checkpointStatusMap = normalizeStatusMap(story, checkpointIndex, entry.checkpointStatusMap);

  return {
    state: {
      checkpointIndex,
      turnsSinceEval,
      checkpointStatusMap,
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
  const checkpointStatusMap = normalizeStatusMap(story, checkpointIndex, state.checkpointStatusMap);

  map[key] = {
    ver: STORAGE_VERSION,
    storySignature: computeStorySignature(story),
    checkpointIndex,
    turnsSinceEval,
    checkpointStatusMap,
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
  const normalizedIndex = checkpointIndex < 0 ? 0 : checkpointIndex;
  const checkpointStatusMap = normalizeStatusMap(story, normalizedIndex, undefined);
  return {
    checkpointIndex: normalizedIndex,
    turnsSinceEval: 0,
    checkpointStatusMap,
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
 * Sanitizes a candidate runtime state against the provided story.
 * Returns a safe RuntimeStoryState.
 */
export function sanitizeRuntime(candidate: RuntimeStoryState, story: NormalizedStory | null): RuntimeStoryState {
  const checkpointIndex = clampCheckpointIndex(candidate.checkpointIndex, story);
  const turnsSinceEval = sanitizeTurnsSinceEval(candidate.turnsSinceEval);
  const checkpointStatusMap = normalizeStatusMap(story, checkpointIndex, candidate.checkpointStatusMap);

  return {
    checkpointIndex,
    turnsSinceEval,
    checkpointStatusMap,
  };
}

export function deriveCheckpointStatuses(
  story: NormalizedStory | null | undefined,
  runtime: Pick<RuntimeStoryState, "checkpointIndex" | "checkpointStatusMap">,
): CheckpointStatus[] {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return [];

  const map = normalizeStatusMap(story, runtime.checkpointIndex, runtime.checkpointStatusMap);
  return checkpoints.map((cp, idx) => {
    const key = checkpointKeyFrom(cp, idx);
    return map[key] ?? CheckpointStatus.Pending;
  });
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

function checkpointKeyFrom(cp: NormalizedCheckpoint | undefined, idx: number): string {
  if (!cp) return String(idx);
  const rawId = cp.id;
  if (rawId === null || rawId === undefined) return String(idx);
  if (typeof rawId === "string") {
    const trimmed = rawId.trim();
    return trimmed ? trimmed : String(idx);
  }
  return String(rawId);
}

export function checkpointKeyAtIndex(story: NormalizedStory | null | undefined, index: number): string {
  const cp = story?.checkpoints?.[index];
  return checkpointKeyFrom(cp, index);
}

function normalizeStatusMap(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  source: unknown,
): CheckpointStatusMap {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return {};

  const clampedIndex = clampCheckpointIndex(checkpointIndex, story ?? null);
  const incoming = (source && typeof source === "object") ? source as Record<string, unknown> : {};
  const result: CheckpointStatusMap = {};

  checkpoints.forEach((cp, idx) => {
    const key = checkpointKeyFrom(cp, idx);
    const raw = incoming[key];
    let status: CheckpointStatus;

    if (idx < clampedIndex) {
      status = CheckpointStatus.Complete;
    } else if (idx === clampedIndex) {
      status = CheckpointStatus.Current;
    } else {
      status = CheckpointStatus.Pending;
    }

    if (isCheckpointStatus(raw)) {
      if (idx < clampedIndex) {
        status = raw === CheckpointStatus.Failed ? CheckpointStatus.Failed : CheckpointStatus.Complete;
      } else if (idx === clampedIndex) {
        status = raw === CheckpointStatus.Failed ? CheckpointStatus.Failed : CheckpointStatus.Current;
      } else {
        status = raw === CheckpointStatus.Complete ? CheckpointStatus.Pending : raw;
      }
    }

    result[key] = status;
  });

  return result;
}

function isPersistedChatState(input: unknown): input is PersistedChatState {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<PersistedChatState>;
  const statusField = candidate.checkpointStatusMap;
  const statusValid = statusField === undefined || typeof statusField === "object";
  return (
    candidate.ver === STORAGE_VERSION
    && typeof candidate.storySignature === "string"
    && typeof candidate.checkpointIndex === "number"
    && typeof candidate.turnsSinceEval === "number"
    && statusValid
  );
}
