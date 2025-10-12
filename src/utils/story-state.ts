import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import type { NormalizedCheckpoint, NormalizedStory, NormalizedTransition, NormalizedTransitionTrigger } from "@utils/story-validator";
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

type StateMap = Record<string, PersistedChatState>;

export interface RuntimeStoryState {
  checkpointIndex: number;
  activeCheckpointKey: string | null;
  turnsSinceEval: number;
  checkpointTurnCount: number;
  checkpointStatusMap: CheckpointStatusMap;
}

export interface PersistedChatState {
  storySignature: string;
  storyKey?: string | null;
  checkpointIndex: number;
  activeCheckpointKey: string | null;
  turnsSinceEval: number;
  checkpointTurnCount?: number;
  checkpointStatusMap: CheckpointStatusMap;
  updatedAt: number;
}

export type LoadedStoryState = {
  state: RuntimeStoryState;
  source: "stored" | "default";
  storyKey: string | null;
};

type PersistedStateCandidate = PersistedChatState;

const sanitizeStoryKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

function migratePersistedState(entry: PersistedStateCandidate, story: NormalizedStory): PersistedChatState | null {
  if (!entry || typeof entry !== "object") return null;

  const candidate = entry as PersistedChatState;
  const activeKey = typeof candidate.activeCheckpointKey === "string" && candidate.activeCheckpointKey.trim()
    ? candidate.activeCheckpointKey.trim()
    : null;
  return {
    storySignature: candidate.storySignature,
    storyKey: sanitizeStoryKey(candidate.storyKey),
    checkpointIndex: clampIndex(candidate.checkpointIndex ?? 0, story),
    activeCheckpointKey: activeKey ?? story.startId ?? null,
    turnsSinceEval: sanitizeTurns(candidate.turnsSinceEval ?? 0),
    checkpointTurnCount: sanitizeTurns(candidate.checkpointTurnCount ?? 0),
    checkpointStatusMap: candidate.checkpointStatusMap ?? {},
    updatedAt: candidate.updatedAt ?? Date.now(),
  };
}

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
    return { state: defaults, source: "default", storyKey: null };
  }

  const key = sanitizeChatKey(chatId);
  if (!key) {
    return { state: defaults, source: "default", storyKey: null };
  }

  const map = getStateMap();
  const entry = map[key];
  const storedKey = entry ? sanitizeStoryKey((entry as PersistedStateCandidate).storyKey) : null;
  console.log("[StoryState] found entry", { entry });
  if (!isPersistedChatState(entry)) {
    return { state: defaults, source: "default", storyKey: storedKey };
  }
  if (entry.storySignature !== computeStorySignature(story)) {
    return { state: defaults, source: "default", storyKey: storedKey };
  }
  const migrated = migratePersistedState(entry, story);
  if (!migrated) {
    return { state: defaults, source: "default", storyKey: storedKey };
  }

  const sanitized = sanitizeRuntime({
    checkpointIndex: migrated.checkpointIndex,
    activeCheckpointKey: migrated.activeCheckpointKey,
    turnsSinceEval: migrated.turnsSinceEval,
    checkpointTurnCount: migrated.checkpointTurnCount ?? 0,
    checkpointStatusMap: migrated.checkpointStatusMap,
  }, story);

  return {
    state: sanitized,
    source: "stored",
    storyKey: storedKey,
  };
}

export function persistStoryState({
  chatId,
  story,
  state,
  storyKey,
}: {
  chatId: string | null | undefined;
  story: NormalizedStory | null | undefined;
  state: RuntimeStoryState;
  storyKey?: string | null | undefined;
}): void {
  console.log("[StoryState] persistStoryState", { chatId, story, state });
  if (!story) return;

  const key = sanitizeChatKey(chatId);
  if (!key) return;

  const map = getStateMap();
  const sanitized = sanitizeRuntime(state, story);
  const persistedKey = sanitizeStoryKey(storyKey);

  map[key] = {
    storySignature: computeStorySignature(story),
    storyKey: persistedKey,
    checkpointIndex: sanitized.checkpointIndex,
    activeCheckpointKey: sanitized.activeCheckpointKey,
    turnsSinceEval: sanitized.turnsSinceEval,
    checkpointTurnCount: sanitized.checkpointTurnCount,
    checkpointStatusMap: sanitized.checkpointStatusMap,
    updatedAt: Date.now(),
  };

  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[StoryState] Failed to persist extension settings", err);
  }
}

export function getPersistedStorySelection(chatId: string | null | undefined): string | null {
  const key = sanitizeChatKey(chatId);
  if (!key) return null;
  try {
    const map = getStateMap();
    const entry = map[key];
    if (!entry) return null;
    return sanitizeStoryKey((entry as PersistedStateCandidate).storyKey);
  } catch (err) {
    console.warn("[StoryState] getPersistedStorySelection failed", err);
    return null;
  }
}

export function makeDefaultState(story: NormalizedStory | null | undefined): RuntimeStoryState {
  const checkpoints = story?.checkpoints ?? [];
  const startId = story?.startId ?? (checkpoints[0]?.id ?? null);
  const startIndex = startId ? checkpoints.findIndex((cp) => cp.id === startId) : -1;
  const normalizedIndex = startIndex >= 0 ? startIndex : (checkpoints.length > 0 ? 0 : -1);
  const activeId = checkpoints[normalizedIndex]?.id ?? null;
  const checkpointStatusMap = computeStatusMapForIndex(story, normalizedIndex < 0 ? 0 : normalizedIndex, undefined);
  return {
    checkpointIndex: normalizedIndex < 0 ? 0 : normalizedIndex,
    activeCheckpointKey: activeId,
    turnsSinceEval: 0,
    checkpointTurnCount: 0,
    checkpointStatusMap,
  };
}

function computeStorySignature(story: NormalizedStory): string {
  const cpSig = story.checkpoints
    .map((cp) => `${String(cp.id)}::${cp.name ?? ""}::${cp.objective ?? ""}`)
    .join("||");
  const edgeSig = (story.transitions ?? [])
    .map((edge) => {
      const trigger = edge.trigger;
      const regexSig = (trigger.regexes ?? [])
        .map((re) => `${re.source}/${re.flags ?? ""}`)
        .join(",");
      const windowSig = trigger.withinTurns ? `@${trigger.withinTurns}` : "";
      const conditionSig = trigger.condition ?? "";
      return `${edge.id}->${edge.from}|${edge.to}|${trigger.type}${windowSig}|${conditionSig}|${regexSig}`;
    })
    .join("||");
  return [
    story.schemaVersion ?? "?",
    story.title ?? "",
    String(story.checkpoints.length ?? 0),
    cpSig,
    edgeSig,
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
  const turnsSinceEval = sanitizeTurnsSinceEval(candidate.turnsSinceEval);
  const checkpointTurnCount = sanitizeTurns(candidate.checkpointTurnCount ?? 0);

  if (!story || !Array.isArray(story.checkpoints) || !story.checkpoints.length) {
    return {
      checkpointIndex: 0,
      activeCheckpointKey: null,
      turnsSinceEval,
      checkpointTurnCount,
      checkpointStatusMap: {},
    };
  }

  const checkpoints = story.checkpoints;
  const trimmedKey = typeof candidate.activeCheckpointKey === "string" ? candidate.activeCheckpointKey.trim() : "";
  let activeId = trimmedKey || null;
  let checkpointIndex = Number.isFinite(candidate.checkpointIndex)
    ? Math.floor(candidate.checkpointIndex)
    : -1;

  if (activeId) {
    const matchIndex = checkpoints.findIndex((cp) => cp.id === activeId);
    if (matchIndex >= 0) {
      checkpointIndex = matchIndex;
    }
  }

  if (checkpointIndex < 0 || checkpointIndex >= checkpoints.length) {
    checkpointIndex = clampCheckpointIndex(candidate.checkpointIndex, story);
    activeId = checkpoints[checkpointIndex]?.id ?? story.startId ?? null;
  } else {
    activeId = checkpoints[checkpointIndex]?.id ?? story.startId ?? null;
  }

  const checkpointStatusMap = computeStatusMapForIndex(story, checkpointIndex, candidate.checkpointStatusMap);

  return {
    checkpointIndex,
    activeCheckpointKey: activeId,
    turnsSinceEval,
    checkpointTurnCount,
    checkpointStatusMap,
  };
}

export function deriveCheckpointStatuses(
  story: NormalizedStory | null | undefined,
  runtime: Pick<RuntimeStoryState, "checkpointIndex" | "activeCheckpointKey" | "checkpointStatusMap">,
): CheckpointStatus[] {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return [];

  const cpAtIndex = checkpoints[runtime.checkpointIndex];
  const activeKey = runtime.activeCheckpointKey ?? cpAtIndex?.id ?? story?.startId ?? null;

  const map = normalizeStatusMap(story, activeKey, runtime.checkpointStatusMap);
  return checkpoints.map((cp) => map[cp.id] ?? CheckpointStatus.Pending);
}

/**
 * Match a text against precompiled regex lists.
 * Returns { reason: 'win'|'fail', pattern } or null.
 */
export interface TransitionTriggerMatch {
  transition: NormalizedTransition;
  trigger: NormalizedTransitionTrigger;
  pattern: string;
}

function matchRegexList(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    try {
      re.lastIndex = 0;
      if (re.test(text)) {
        return re.toString();
      }
    } catch {
      // ignore malformed or runtime errors
    }
  }
  return null;
}

export function evaluateTransitionTriggers({
  text,
  transitions,
  turnsSinceEval: _turnsSinceEval,
}: {
  text: string;
  transitions: NormalizedTransition[] | undefined;
  turnsSinceEval: number;
}): TransitionTriggerMatch[] {
  if (!text || !transitions || !transitions.length) return [];
  const matches: TransitionTriggerMatch[] = [];
  const normalizedText = String(text);

  void _turnsSinceEval;

  transitions.forEach((transition) => {
    const trigger = transition.trigger;
    if (trigger.type !== "regex") return;
    const pattern = matchRegexList(normalizedText, trigger.regexes);
    if (pattern) {
      matches.push({
        transition,
        trigger,
        pattern,
      });
    }
  });

  return matches;
}

export function sanitizeChatKey(chatId: string | null | undefined): string | null {
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
  if (cp?.id) return cp.id;
  if (!cp) return String(idx);
  const rawId = cp.id;
  if (rawId === null || rawId === undefined) return String(idx);
  const trimmed = String(rawId).trim();
  return trimmed ? trimmed : String(idx);
}

export function checkpointKeyAtIndex(story: NormalizedStory | null | undefined, index: number): string {
  const cp = story?.checkpoints?.[index];
  return checkpointKeyFrom(cp, index);
}

export function computeStatusMapForIndex(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  prevMap: CheckpointStatusMap | undefined,
): CheckpointStatusMap {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return {};

  const clampedIndex = clampCheckpointIndex(checkpointIndex, story ?? null);
  const result: CheckpointStatusMap = {};

  checkpoints.forEach((cp, idx) => {
    const key = checkpointKeyFrom(cp, idx);
    const prevStatus = prevMap?.[key];
    if (idx < clampedIndex) {
      result[key] = prevStatus === CheckpointStatus.Failed ? CheckpointStatus.Failed : CheckpointStatus.Complete;
    } else if (idx === clampedIndex) {
      result[key] = prevStatus === CheckpointStatus.Failed ? CheckpointStatus.Failed : CheckpointStatus.Current;
    } else {
      result[key] = prevStatus === CheckpointStatus.Failed ? CheckpointStatus.Failed : CheckpointStatus.Pending;
    }
  });

  return result;
}

function normalizeStatusMap(
  story: NormalizedStory | null | undefined,
  activeKey: string | null,
  source: unknown,
): CheckpointStatusMap {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return {};

  const incoming = (source && typeof source === "object") ? source as Record<string, unknown> : {};
  const result: CheckpointStatusMap = {};

  checkpoints.forEach((cp, idx) => {
    const key = checkpointKeyFrom(cp, idx);
    const raw = incoming[key];
    let status: CheckpointStatus = CheckpointStatus.Pending;
    if (isCheckpointStatus(raw)) {
      status = raw as CheckpointStatus;
    }

    result[key] = status;
  });

  if (activeKey) {
    const active = checkpoints.find((cp) => cp.id === activeKey);
    if (active) {
      const key = active.id;
      const current = result[key];
      if (current === undefined || current === CheckpointStatus.Pending || current === CheckpointStatus.Current) {
        result[key] = CheckpointStatus.Current;
      }
    }
  }

  return result;
}

function isPersistedChatState(input: unknown): input is PersistedStateCandidate {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<PersistedStateCandidate>;
  const statusField = candidate.checkpointStatusMap;
  const statusValid = statusField === undefined || typeof statusField === "object";
  const checkpointTurnsValid = candidate.checkpointTurnCount === undefined || typeof candidate.checkpointTurnCount === "number";
  const keyValid = candidate.storyKey === undefined || candidate.storyKey === null || typeof candidate.storyKey === "string";

  return (
    typeof candidate.storySignature === "string"
    && keyValid
    && typeof candidate.checkpointIndex === "number"
    && typeof candidate.turnsSinceEval === "number"
    && statusValid
    && checkpointTurnsValid
  );
}
