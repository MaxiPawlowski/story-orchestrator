import { getContext } from "@services/STAPI";
import type { NormalizedCheckpoint, NormalizedStory, NormalizedTransition, NormalizedTransitionTrigger } from "@utils/story-validator";
import { getExtensionSettingsRoot } from "@utils/settings";

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

export const clampCheckpointIndex = (idx: number, story: NormalizedStory | null | undefined): number => {
  if (!story) return 0;
  const max = Math.max(0, story.checkpoints.length - 1);
  return Math.max(0, Math.min(Math.floor(idx), max));
};

export const sanitizeTurnsSinceEval = (value: number): number => {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
};

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
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

function migratePersistedState(entry: PersistedStateCandidate, story: NormalizedStory): PersistedChatState | null {
  if (!entry) return null;

  return {
    storySignature: entry.storySignature,
    storyKey: sanitizeStoryKey(entry.storyKey),
    checkpointIndex: clampCheckpointIndex(entry.checkpointIndex ?? 0, story),
    activeCheckpointKey: entry.activeCheckpointKey?.trim() || story.startId,
    turnsSinceEval: sanitizeTurnsSinceEval(entry.turnsSinceEval ?? 0),
    checkpointTurnCount: sanitizeTurnsSinceEval(entry.checkpointTurnCount ?? 0),
    checkpointStatusMap: entry.checkpointStatusMap ?? {},
    updatedAt: entry.updatedAt ?? Date.now(),
  };
}

export function loadStoryState({
  chatId,
  story,
}: {
  chatId: string | null | undefined;
  story: NormalizedStory | null | undefined;
}): LoadedStoryState {
  const defaults = makeDefaultState(story);
  if (!story) {
    return { state: defaults, source: "default", storyKey: null };
  }

  const key = chatId?.trim();
  if (!key) {
    return { state: defaults, source: "default", storyKey: null };
  }

  const map = getStateMap();
  const entry = map[key];
  const storedKey = sanitizeStoryKey(entry?.storyKey);

  if (!isPersistedChatState(entry) || entry.storySignature !== computeStorySignature(story)) {
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

  const key = chatId?.trim();
  if (!key) return;

  const { saveSettingsDebounced } = getContext();
  const map = getStateMap();
  const sanitized = sanitizeRuntime(state, story);

  map[key] = {
    storySignature: computeStorySignature(story),
    storyKey: sanitizeStoryKey(storyKey),
    checkpointIndex: sanitized.checkpointIndex,
    activeCheckpointKey: sanitized.activeCheckpointKey,
    turnsSinceEval: sanitized.turnsSinceEval,
    checkpointTurnCount: sanitized.checkpointTurnCount,
    checkpointStatusMap: sanitized.checkpointStatusMap,
    updatedAt: Date.now(),
  };

  saveSettingsDebounced();
}

export function getPersistedStorySelection(chatId: string | null | undefined): string | null {
  const key = chatId?.trim();
  if (!key) return null;
  const map = getStateMap();
  return sanitizeStoryKey(map[key]?.storyKey);
}

export function makeDefaultState(story: NormalizedStory | null | undefined): RuntimeStoryState {
  const checkpoints = story?.checkpoints ?? [];
  const startId = story?.startId ?? checkpoints[0]?.id ?? null;
  const startIndex = startId ? checkpoints.findIndex((cp) => cp.id === startId) : -1;
  const normalizedIndex = startIndex >= 0 ? startIndex : (checkpoints.length > 0 ? 0 : -1);
  const activeId = checkpoints[normalizedIndex]?.id ?? null;
  const checkpointStatusMap = computeStatusMapForIndex(story, Math.max(0, normalizedIndex), undefined);

  return {
    checkpointIndex: Math.max(0, normalizedIndex),
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
    story.description ?? "",
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
  const checkpointTurnCount = sanitizeTurnsSinceEval(candidate.checkpointTurnCount);

  if (!story?.checkpoints?.length) {
    return {
      checkpointIndex: 0,
      activeCheckpointKey: null,
      turnsSinceEval,
      checkpointTurnCount,
      checkpointStatusMap: {},
    };
  }

  const checkpoints = story.checkpoints;
  let activeId = candidate.activeCheckpointKey?.trim() || null;
  let checkpointIndex = Math.floor(candidate.checkpointIndex);

  if (activeId) {
    const matchIndex = checkpoints.findIndex((cp) => cp.id === activeId);
    if (matchIndex >= 0) {
      checkpointIndex = matchIndex;
    }
  }

  if (checkpointIndex < 0 || checkpointIndex >= checkpoints.length) {
    checkpointIndex = clampCheckpointIndex(candidate.checkpointIndex, story);
    activeId = checkpoints[checkpointIndex]?.id ?? story.startId;
  } else {
    activeId = checkpoints[checkpointIndex]?.id ?? story.startId;
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
}: {
  text: string;
  transitions: NormalizedTransition[] | undefined;
}): TransitionTriggerMatch[] {
  if (!text || !transitions?.length) return [];
  const matches: TransitionTriggerMatch[] = [];

  for (const transition of transitions) {
    const trigger = transition.trigger;
    if (trigger.type !== "regex") continue;

    const pattern = matchRegexList(text, trigger.regexes);
    if (pattern) {
      matches.push({ transition, trigger, pattern });
    }
  }

  return matches;
}

export function sanitizeChatKey(chatId: string | null | undefined): string | null {
  return chatId?.trim() || null;
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
