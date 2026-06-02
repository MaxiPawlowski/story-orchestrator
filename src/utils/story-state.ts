import { getContext } from "@services/STAPI";
import { z } from "zod";
import {
  type NormalizedCheckpoint,
  type NormalizedStory,
  type NormalizedTransition,
  type NormalizedTransitionTrigger,
  isNormalizedStubCheckpoint,
} from "@utils/story-validator";
import { PacingPhase } from "@utils/arc-templates";
import { getExtensionSettingsRoot } from "@utils/settings";
import type {
  Consequence,
  ForegoneTransition,
  NarrativeMemoryState,
  NarrativeSeed,
  RoleState,
  SceneMemoryEntry,
} from "../types/narrative-memory";

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
  tension_current?: number;
  tension_ema?: number;
  pacing_phase?: string;
  pacing_hint?: string;
  memory?: NarrativeMemoryState;
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
  tension_current?: number;
  tension_ema?: number;
  pacing_phase?: string | null;
  pacing_hint?: string | null;
  memory?: NarrativeMemoryState;
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
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}, z.number().finite().optional());

const OptionalTrimmedStringSchema = z.preprocess((value) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}, z.string().nullable().optional());

const clampOptionalUnitInterval = (value: unknown): number | undefined => {
  const parsed = OptionalFiniteNumberSchema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) return undefined;
  return Math.max(0, Math.min(1, parsed.data));
};

const sanitizeOptionalTrimmedString = (value: unknown): string | undefined => {
  const parsed = OptionalTrimmedStringSchema.safeParse(value);
  if (!parsed.success || parsed.data === null || parsed.data === undefined) return undefined;
  return parsed.data;
};

const PACING_PHASE_VALUES = new Set<string>(Object.values(PacingPhase));

const sanitizePacingPhase = (value: unknown): string | undefined => {
  const parsed = sanitizeOptionalTrimmedString(value);
  return parsed && PACING_PHASE_VALUES.has(parsed) ? parsed : undefined;
};

const ConsequenceSchema: z.ZodType<Consequence> = z.object({
  id: z.string(),
  text: z.string(),
  weight: z.number().finite(),
  tags: z.array(z.string()),
  sourceCheckpointId: z.string(),
  createdAtTurn: z.number().int(),
});

const NarrativeSeedSchema: z.ZodType<NarrativeSeed> = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["foreshadowing", "thread", "hook"]),
  resolved: z.boolean(),
  sourceCheckpointId: z.string(),
  createdAtTurn: z.number().int(),
});

const RoleStateSchema: z.ZodType<RoleState> = z.object({
  role: z.string(),
  summary: z.string(),
  lastUpdatedTurn: z.number().int(),
});

const SceneMemoryEntrySchema: z.ZodType<SceneMemoryEntry> = z.object({
  text: z.string(),
  checkpointId: z.string(),
  turn: z.number().int(),
});

const ForegoneTransitionSchema: z.ZodType<ForegoneTransition> = z.object({
  transitionId: z.string(),
  fromCheckpointId: z.string(),
  reason: z.string(),
  turn: z.number().int(),
});

const decodeSafeArray = <T>(value: unknown, schema: z.ZodType<T>): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => schema.safeParse(entry))
    .filter((entry): entry is { success: true; data: T } => entry.success)
    .map((entry) => entry.data);
};

const decodeSafeRecord = <T>(value: unknown, schema: z.ZodType<T>): Record<string, T> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const parsed = schema.safeParse(entry);
        return parsed.success ? ([key, parsed.data] as const) : null;
      })
      .filter((entry): entry is readonly [string, T] => entry !== null),
  );
};

const OptionalCheckpointStatusMapSchema = z.preprocess(
  (value) => decodeCheckpointStatusMap(value),
  z.record(z.string(), z.nativeEnum(CheckpointStatus)).optional(),
);

const NarrativeMemoryStateSchema = z.object({
  consequences: z.preprocess((value) => decodeSafeArray(value, ConsequenceSchema), z.array(ConsequenceSchema)).default([]),
  seeds: z.preprocess((value) => decodeSafeArray(value, NarrativeSeedSchema), z.array(NarrativeSeedSchema)).default([]),
  roleStates: z.preprocess((value) => decodeSafeRecord(value, RoleStateSchema), z.record(z.string(), RoleStateSchema)).default({}),
  sceneMemory: z.preprocess((value) => decodeSafeArray(value, SceneMemoryEntrySchema), z.array(SceneMemoryEntrySchema)).default([]),
  foregoneTransitions: z.preprocess((value) => decodeSafeArray(value, ForegoneTransitionSchema), z.array(ForegoneTransitionSchema)).default([]),
});

const OptionalNarrativeMemoryStateSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}, NarrativeMemoryStateSchema.optional());

const sanitizeNarrativeMemoryState = (value: unknown): NarrativeMemoryState | undefined => {
  const parsed = OptionalNarrativeMemoryStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const PersistedChatStateSchema = z.object({
  storySignature: z.string(),
  storyKey: OptionalTrimmedStringSchema,
  checkpointIndex: OptionalFiniteNumberSchema,
  activeCheckpointKey: OptionalTrimmedStringSchema,
  turnsSinceEval: OptionalFiniteNumberSchema,
  checkpointTurnCount: OptionalFiniteNumberSchema,
  checkpointStatusMap: OptionalCheckpointStatusMapSchema,
  tension_current: OptionalFiniteNumberSchema,
  tension_ema: OptionalFiniteNumberSchema,
  pacing_phase: OptionalTrimmedStringSchema,
  pacing_hint: OptionalTrimmedStringSchema,
  memory: OptionalNarrativeMemoryStateSchema,
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
    tension_current: clampOptionalUnitInterval(parsed.data.tension_current),
    tension_ema: clampOptionalUnitInterval(parsed.data.tension_ema),
    pacing_phase: sanitizePacingPhase(parsed.data.pacing_phase),
    pacing_hint: sanitizeOptionalTrimmedString(parsed.data.pacing_hint),
    memory: parsed.data.memory,
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
    tension_current: decoded.tension_current,
    tension_ema: decoded.tension_ema,
    pacing_phase: decoded.pacing_phase ?? undefined,
    pacing_hint: decoded.pacing_hint ?? undefined,
    memory: decoded.memory,
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
    tension_current: sanitized.tension_current,
    tension_ema: sanitized.tension_ema,
    pacing_phase: sanitized.pacing_phase,
    pacing_hint: sanitized.pacing_hint,
    memory: sanitized.memory,
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
    tension_current: undefined,
    tension_ema: undefined,
    pacing_phase: undefined,
    pacing_hint: undefined,
    memory: undefined,
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
  const tension_current = clampOptionalUnitInterval(candidate.tension_current);
  const tension_ema = clampOptionalUnitInterval(candidate.tension_ema);
  const pacing_phase = sanitizePacingPhase(candidate.pacing_phase);
  const pacing_hint = sanitizeOptionalTrimmedString(candidate.pacing_hint);
  const memory = sanitizeNarrativeMemoryState(candidate.memory);

  if (!story?.checkpoints?.length) {
    return {
      checkpointIndex: 0,
      activeCheckpointKey: null,
      turnsSinceEval,
      checkpointTurnCount,
      checkpointStatusMap: {},
      tension_current,
      tension_ema,
      pacing_phase,
      pacing_hint,
      memory,
    };
  }
  const checkpointState = deriveCheckpointRuntimeState(story, candidate);

  return {
    checkpointIndex: checkpointState.checkpointIndex,
    activeCheckpointKey: checkpointState.activeCheckpointKey,
    turnsSinceEval,
    checkpointTurnCount,
    checkpointStatusMap: checkpointState.checkpointStatusMap,
    tension_current,
    tension_ema,
    pacing_phase,
    pacing_hint,
    memory,
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
