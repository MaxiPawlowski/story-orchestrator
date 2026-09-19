import type { SceneReadRecord } from "./scene";
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
  scene: SceneReadRecord | null;
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

export const createJudgeRuntime = (): JudgeRuntimeState => ({ calls: [], scene: null });

export function sanitizeJudgeRuntime(value: unknown): JudgeRuntimeState {
  if (!isRecord(value) || !Array.isArray(value.calls)) return createJudgeRuntime();
  const calls = value.calls.filter((entry): entry is JudgeCallRecord => isRecord(entry) && typeof entry.use === "string" && typeof entry.at === "string" && typeof entry.messageId === "number");
  const scene = isRecord(value.scene) && typeof value.scene.messageId === "number" && isRecord(value.scene.facts) ? (value.scene as unknown as SceneReadRecord) : null;
  return { calls: calls.slice(-JUDGE_CALL_RING_LIMIT), scene };
}

export const appendJudgeCall = (state: JudgeRuntimeState, record: JudgeCallRecord): JudgeRuntimeState => ({ ...state, calls: [...state.calls, record].slice(-JUDGE_CALL_RING_LIMIT) });

export const dropJudgeCallsAfter = (state: JudgeRuntimeState, messageId: number): JudgeRuntimeState => ({
  calls: state.calls.filter((entry) => entry.messageId < messageId),
  scene: state.scene && state.scene.messageId < messageId ? state.scene : null,
});

export interface JudgeUseCopy {
  label: string;
  description: string;
  sends: string;
}

export const JUDGE_USE_COPY: Record<JudgeUseKey, JudgeUseCopy> = {
  director: { label: "Speaker direction", description: "Picks who speaks next in a group chat when the checkpoint has talk control. Needs a one-line role for every character in the pool; otherwise the usual director decides.", sends: "the last 8 messages, character names and roles, the scene name and goal" },
  memoryVerify: { label: "Check memory before storing", description: "Drops notes the story never showed and down-weights doubtful ones.", sends: "the read's messages, the candidate notes, story title and cast names" },
  memoryPairs: { label: "Merge related notes", description: "Decides whether two similar notes are a duplicate, an update, or both true.", sends: "two memory notes per question" },
  sceneTrigger: { label: "Notice scene changes", description: "Asks for the scene read on the turn a scene changes, next to today's keyword check.", sends: "the last 8 messages, the checkpoint name and goal, cast names and roles, your persona name" },
  sceneTracker: { label: "Scene tracker", description: "Keeps location, time and who is present, and adds them to the prompt.", sends: "the last 8 messages, the checkpoint name and goal, cast names and roles, your persona name, the story's locations" },
  sceneOoc: { label: "Out-of-character messages", description: "Keeps out-of-character requests from counting as story events.", sends: "the last 8 messages" },
  lookahead: { label: "Heading toward (author view)", description: "Shows which upcoming checkpoints play is moving toward.", sends: "the last 8 messages and the names and goals of the next checkpoints" },
  loreSelect: { label: "Lore selection", description: "Adds the lore entries that matter to the next reply, even without their keywords.", sends: "the last 8 messages, the checkpoint name and goal, and the title and text of each entry in the story's lore-select books" },
  curatorFilter: { label: "Curator focus", description: "Shows the World Info curator only the entries the story may have overtaken.", sends: "the story so far and the story's lore entries" },
  memoryRerank: { label: "Memory relevance", description: "Ranks memory for the next reply when there is more than fits.", sends: "the last 8 messages and memory notes" },
  typedExtraction: { label: "Every-turn story reads", description: "Reads qualities the author marked for it on every turn, so gates fire sooner.", sends: "the last messages and the marked qualities' descriptions" },
  stallCheck: { label: "Stall check", description: "Checks a stalled gate before spending a full re-read.", sends: "the checkpoint's messages and the unmet conditions" },
  expansionCritic: { label: "Expansion review", description: "Reviews generated story beats instead of a second model call.", sends: "established facts, the target checkpoint, cast names and the generated beats" },
  expansionLookahead: { label: "Prepare ahead", description: "Writes the next generated beats before the story gets there.", sends: "same as Heading toward, plus expansion review" },
};

export const BUILT_JUDGE_USES: readonly JudgeUseKey[] = ["director", "memoryVerify", "memoryPairs", "sceneTrigger", "sceneTracker", "lookahead", "loreSelect"];
