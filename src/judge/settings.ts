import { JUDGE_CALL_RING_LIMIT, JUDGE_DEFAULT_MODEL, JUDGE_DEFAULT_TIMEOUT_MS } from "./policy";
import type { JudgeCallRecord } from "./types";

export const JUDGE_USE_KEYS = [
  "director",
  "memoryVerify",
  "memoryPairs",
  "sceneTrigger",
  "sceneTracker",
  "sceneOoc",
  "lookahead",
  "loreSelect",
  "curatorFilter",
  "memoryRerank",
  "typedExtraction",
  "stallCheck",
  "expansionCritic",
  "expansionLookahead",
] as const;

export type JudgeUseKey = (typeof JUDGE_USE_KEYS)[number];
export type JudgeUses = Record<JudgeUseKey, boolean>;

export const JUDGE_USE_DEPENDENCIES: Partial<Record<JudgeUseKey, JudgeUseKey>> = { expansionLookahead: "lookahead" };

export const JUDGE_PICK_MODES = ["code", "llm"] as const;
export type JudgePickMode = (typeof JUDGE_PICK_MODES)[number];

export interface JudgeExpansionSettings {
  variants: 1 | 2 | 3;
  temperature: number;
  pick: JudgePickMode;
}

export interface JudgeSettings {
  enabled: boolean;
  model: string;
  timeoutMs: number;
  uses: JudgeUses;
  expansion: JudgeExpansionSettings;
}

export interface JudgeRuntimeState {
  calls: JudgeCallRecord[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const defaultJudgeUses = (): JudgeUses => Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, false])) as JudgeUses;

export const defaultJudgeSettings = (): JudgeSettings => ({
  enabled: false,
  model: JUDGE_DEFAULT_MODEL,
  timeoutMs: JUDGE_DEFAULT_TIMEOUT_MS,
  uses: defaultJudgeUses(),
  expansion: { variants: 1, temperature: 0.7, pick: "code" },
});

export function sanitizeJudgeSettings(value: unknown): JudgeSettings {
  const defaults = defaultJudgeSettings();
  if (!isRecord(value)) return defaults;
  const uses = isRecord(value.uses) ? value.uses : {};
  const expansion = isRecord(value.expansion) ? value.expansion : {};
  const variants = expansion.variants === 2 || expansion.variants === 3 ? expansion.variants : 1;
  return {
    enabled: value.enabled === true,
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : defaults.model,
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 1 && value.timeoutMs <= 10_000 ? value.timeoutMs : defaults.timeoutMs,
    uses: Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, uses[key] === true])) as JudgeUses,
    expansion: {
      variants,
      temperature: typeof expansion.temperature === "number" && expansion.temperature >= 0 && expansion.temperature <= 2 ? expansion.temperature : defaults.expansion.temperature,
      pick: JUDGE_PICK_MODES.includes(expansion.pick as JudgePickMode) ? (expansion.pick as JudgePickMode) : defaults.expansion.pick,
    },
  };
}

export function judgeUseActive(settings: JudgeSettings, key: JudgeUseKey): boolean {
  if (!settings.enabled || !settings.uses[key]) return false;
  const dependency = JUDGE_USE_DEPENDENCIES[key];
  return dependency ? judgeUseActive(settings, dependency) : true;
}

export const createJudgeRuntime = (): JudgeRuntimeState => ({ calls: [] });

export function sanitizeJudgeRuntime(value: unknown): JudgeRuntimeState {
  if (!isRecord(value) || !Array.isArray(value.calls)) return createJudgeRuntime();
  const calls = value.calls.filter((entry): entry is JudgeCallRecord => isRecord(entry) && typeof entry.use === "string" && typeof entry.at === "string" && typeof entry.messageId === "number");
  return { calls: calls.slice(-JUDGE_CALL_RING_LIMIT) };
}

export const appendJudgeCall = (state: JudgeRuntimeState, record: JudgeCallRecord): JudgeRuntimeState => ({ calls: [...state.calls, record].slice(-JUDGE_CALL_RING_LIMIT) });

export const dropJudgeCallsAfter = (state: JudgeRuntimeState, messageId: number): JudgeRuntimeState => ({ calls: state.calls.filter((entry) => entry.messageId < messageId) });
