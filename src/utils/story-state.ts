import { getContext } from "@services/STAPI";
import { z } from "zod";
import {
  type NormalizedCheckpoint,
  type NormalizedStory,
  type NormalizedTransition,
  type NormalizedTransitionTrigger,
  isNormalizedStubCheckpoint,
} from "@utils/story-validator";
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
  roadmap?: string;
}

export interface RuntimeCheckpointSummary {
  id: string;
  name: string;
  objective: string;
  status: CheckpointStatus;
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
  roadmap?: string;
}

export type LoadedStoryState = {
  state: RuntimeStoryState;
  source: "stored" | "default";
  storyKey: string | null;
  roadmap?: string;
};

const OptionalFiniteNumberSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().finite().optional());

const OptionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || null;
}, z.string().nullable().optional());

const PersistedChatStateSchema = z.object({
  storySignature: z.string(),
  storyKey: OptionalTrimmedStringSchema,
  checkpointIndex: OptionalFiniteNumberSchema,
  activeCheckpointKey: OptionalTrimmedStringSchema,
  turnsSinceEval: OptionalFiniteNumberSchema,
  checkpointTurnCount: OptionalFiniteNumberSchema,
  checkpointStatusMap: z.record(z.string(), z.unknown()).transform(decodeCheckpointStatusMap).optional(),
  updatedAt: OptionalFiniteNumberSchema,
  roadmap: z.string().optional(),
});

const StateMapSchema = z.record(z.string(), z.unknown());

const sanitizeStoryKey = (value: unknown): string | null => {
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const sanitizeActiveCheckpointKey = (value: unknown, story: NormalizedStory): string | null => {
  const activeKey = typeof value === "string" && value.trim() ? value.trim() : null;
  return activeKey ?? story.startId;
};

const decodeInteger = (value: unknown, fallback = 0): number => {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
};

const decodeTimestamp = (value: unknown, fallback = Date.now()): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export function decodeCheckpointStatusMap(source: unknown): CheckpointStatusMap {
  const parsed = StateMapSchema.safeParse(source);
  if (!parsed.success) return {};

  const result: CheckpointStatusMap = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (isCheckpointStatus(value)) {
      result[key] = value;
    }
  }
  return result;
}

export function decodePersistedChatState(input: unknown, story: NormalizedStory): PersistedChatState | null {
  const parsed = PersistedChatStateSchema.safeParse(input);
  if (!parsed.success) return null;

  return {
    storySignature: parsed.data.storySignature,
    storyKey: parsed.data.storyKey ?? null,
    checkpointIndex: decodeInteger(parsed.data.checkpointIndex, 0),
    activeCheckpointKey: sanitizeActiveCheckpointKey(parsed.data.activeCheckpointKey, story),
    turnsSinceEval: sanitizeTurnsSinceEval(decodeInteger(parsed.data.turnsSinceEval, 0)),
    checkpointTurnCount: sanitizeTurnsSinceEval(decodeInteger(parsed.data.checkpointTurnCount, 0)),
    checkpointStatusMap: parsed.data.checkpointStatusMap ?? {},
    updatedAt: decodeTimestamp(parsed.data.updatedAt),
    roadmap: parsed.data.roadmap,
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
    return { state: defaults, source: "default", storyKey: null, roadmap: undefined };
  }

  const key = chatId?.trim();
  if (!key) {
    return { state: defaults, source: "default", storyKey: null, roadmap: undefined };
  }

  const map = getStateMap();
  const entry = map[key];
  const storedKey = sanitizeStoryKey(entry?.storyKey);

  const decoded = decodePersistedChatState(entry, story);
  if (!decoded || decoded.storySignature !== computeStorySignature(story)) {
    return { state: defaults, source: "default", storyKey: storedKey, roadmap: undefined };
  }

  const sanitized = sanitizeRuntime({
    checkpointIndex: decoded.checkpointIndex,
    activeCheckpointKey: decoded.activeCheckpointKey,
    turnsSinceEval: decoded.turnsSinceEval,
    checkpointTurnCount: decoded.checkpointTurnCount ?? 0,
    checkpointStatusMap: decoded.checkpointStatusMap,
  }, story);

  return {
    state: sanitized,
    source: "stored",
    storyKey: storedKey,
    roadmap: decoded.roadmap ?? undefined,
  };
}

export function persistStoryState({
  chatId,
  story,
  state,
  storyKey,
  roadmap,
}: {
  chatId: string | null | undefined;
  story: NormalizedStory | null | undefined;
  state: RuntimeStoryState;
  storyKey?: string | null | undefined;
  roadmap?: string;
}): void {
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
    roadmap: roadmap ?? map[key]?.roadmap,
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
  const checkpointState = deriveCheckpointRuntimeState(story, {
    checkpointIndex: Math.max(0, normalizedIndex),
    activeCheckpointKey: null,
    checkpointStatusMap: {},
  });

  return {
    checkpointIndex: checkpointState.checkpointIndex,
    activeCheckpointKey: checkpointState.activeCheckpointKey,
    turnsSinceEval: 0,
    checkpointTurnCount: 0,
    checkpointStatusMap: checkpointState.checkpointStatusMap,
  };
}

function computeStorySignature(story: NormalizedStory): string {
  const stubIds = new Set(story.checkpoints.filter(isNormalizedStubCheckpoint).map((cp) => cp.id));

  const cpSig = story.checkpoints
    .filter((cp) => !isNormalizedStubCheckpoint(cp))
    .map((cp) => `${String(cp.id)}::${cp.name ?? ""}::${cp.objective ?? ""}`)
    .join("||");
  const edgeSig = (story.transitions ?? [])
    .filter((edge) => !stubIds.has(edge.to))
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
    String(story.checkpoints.filter((cp) => !isNormalizedStubCheckpoint(cp)).length),
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
  const checkpointState = deriveCheckpointRuntimeState(story, candidate);

  return {
    checkpointIndex: checkpointState.checkpointIndex,
    activeCheckpointKey: checkpointState.activeCheckpointKey,
    turnsSinceEval,
    checkpointTurnCount,
    checkpointStatusMap: checkpointState.checkpointStatusMap,
  };
}

export function deriveCheckpointStatuses(
  story: NormalizedStory | null | undefined,
  runtime: Pick<RuntimeStoryState, "checkpointIndex" | "activeCheckpointKey" | "checkpointStatusMap">,
): CheckpointStatus[] {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return [];

  const map = deriveCheckpointRuntimeState(story, runtime).checkpointStatusMap;
  return checkpoints.map((cp) => map[cp.id] ?? CheckpointStatus.Pending);
}

export function deriveCheckpointSummaries(
  story: NormalizedStory | null | undefined,
  runtime: Pick<RuntimeStoryState, "checkpointIndex" | "activeCheckpointKey" | "checkpointStatusMap">,
): RuntimeCheckpointSummary[] {
  if (!story?.checkpoints?.length) return [];
  const statuses = deriveCheckpointStatuses(story, runtime);
  return story.checkpoints.map((checkpoint, index) => ({
    id: checkpoint.id,
    name: checkpoint.name,
    objective: checkpoint.objective,
    status: statuses[index] ?? CheckpointStatus.Pending,
  }));
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

export function canPersistRuntimeState({
  story,
  chatId,
  groupChatSelected,
}: {
  story: NormalizedStory | null | undefined;
  chatId: string | null | undefined;
  groupChatSelected: boolean | null | undefined;
}): boolean {
  return Boolean(story && sanitizeChatKey(chatId) && groupChatSelected);
}

function getStateMap(): StateMap {
  const root = getExtensionSettingsRoot();
  const parsed = StateMapSchema.safeParse(root[STORAGE_KEY]);
  if (parsed.success) {
    return parsed.data as StateMap;
  }
  const created: StateMap = {};
  root[STORAGE_KEY] = created;
  return created;
}


function checkpointKeyFrom(cp: NormalizedCheckpoint | undefined, idx: number): string {
  return cp?.id || String(idx);
}

export function computeStatusMapForIndex(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  prevMap: CheckpointStatusMap | undefined,
): CheckpointStatusMap {
  return buildCheckpointStatusMap(story, checkpointIndex, prevMap, (status) => status === CheckpointStatus.Failed);
}

function deriveCheckpointRuntimeState(
  story: NormalizedStory | null | undefined,
  runtime: Pick<RuntimeStoryState, "checkpointIndex" | "activeCheckpointKey" | "checkpointStatusMap">,
): Pick<RuntimeStoryState, "checkpointIndex" | "activeCheckpointKey" | "checkpointStatusMap"> {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) {
    return {
      checkpointIndex: 0,
      activeCheckpointKey: null,
      checkpointStatusMap: {},
    };
  }

  const checkpointIndex = resolveCheckpointIndex(story, runtime.checkpointIndex, runtime.activeCheckpointKey ?? null);
  const activeCheckpointKey = checkpoints[checkpointIndex]?.id ?? story?.startId ?? null;
  const checkpointStatusMap = deriveCheckpointStatusMap(story, checkpointIndex, runtime.checkpointStatusMap);

  return {
    checkpointIndex,
    activeCheckpointKey,
    checkpointStatusMap,
  };
}

function deriveCheckpointStatusMap(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  source: unknown,
): CheckpointStatusMap {
  return buildCheckpointStatusMap(story, checkpointIndex, source, isCheckpointStatus);
}

function buildCheckpointStatusMap(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  source: unknown,
  preserveStatus: (status: CheckpointStatus) => boolean,
): CheckpointStatusMap {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return {};

  const incoming = decodeCheckpointStatusMap(source);
  const clampedIndex = clampCheckpointIndex(checkpointIndex, story ?? null);
  const result: CheckpointStatusMap = {};

  checkpoints.forEach((cp, idx) => {
    const key = checkpointKeyFrom(cp, idx);
    const incomingStatus = incoming[key];
    result[key] = incomingStatus && preserveStatus(incomingStatus)
      ? incomingStatus
      : checkpointStatusForPosition(idx, clampedIndex);
  });

  return result;
}

function resolveCheckpointIndex(
  story: NormalizedStory | null | undefined,
  checkpointIndex: number,
  activeCheckpointKey: string | null,
): number {
  const checkpoints = story?.checkpoints ?? [];
  if (!checkpoints.length) return 0;

  const normalizedIndex = Number.isFinite(checkpointIndex) ? Math.floor(checkpointIndex) : Number.NaN;
  if (normalizedIndex >= 0 && normalizedIndex < checkpoints.length) {
    return normalizedIndex;
  }

  const activeKey = activeCheckpointKey?.trim() || null;
  if (activeKey) {
    const indexFromKey = checkpoints.findIndex((cp) => cp.id === activeKey);
    if (indexFromKey >= 0) return indexFromKey;
  }

  return clampCheckpointIndex(checkpointIndex, story ?? null);
}

function checkpointStatusForPosition(index: number, activeIndex: number): CheckpointStatus {
  if (index < activeIndex) return CheckpointStatus.Complete;
  if (index === activeIndex) return CheckpointStatus.Current;
  return CheckpointStatus.Pending;
}
