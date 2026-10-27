import type { SceneReadRecord } from "./scene";
import { JUDGE_CALL_RING_LIMIT, JUDGE_DEFAULT_MODEL, JUDGE_DEFAULT_TIMEOUT_MS } from "./policy";
import type { JudgeCallRecord } from "./types";
import { DEFAULT_JUDGE_PROVIDER, isJudgeProviderId, JUDGE_PROVIDER_IDS, type JudgeProviderId } from "./providers";
import { isRecord } from "@utils/guards";

export const JUDGE_USE_KEYS = [
  "director",
  "memoryVerify",
  "memoryPairs",
  "sceneTrigger",
  "sceneTracker",
  "lookahead",
  "loreSelect",
  "curatorFilter",
  "typedExtraction",
  "stallCheck",
  "expansionCritic",
  "expansionLookahead",
  "agencyCheck",
  "houseRules",
  "wardenLore",
  "loreExclusive",
  "expressions",
  "attentionCheck",
  "wardenVoice",
  "divergence",
  "canonVerify",
  "canonDraft",
  "pictureCue",
  "adversityTrend",
  "idleCheck",
  "toneCheck",
  "repetitionCheck",
] as const;

export type JudgeUseKey = (typeof JUDGE_USE_KEYS)[number];
export type JudgeUses = Record<JudgeUseKey, boolean>;

export const JUDGE_ROUTE_KEYS = [...JUDGE_USE_KEYS, "warden"] as const;
export type JudgeRouteKey = (typeof JUDGE_ROUTE_KEYS)[number];
export type JudgeProviderRoutes = Record<JudgeRouteKey, JudgeProviderId>;

export const WARDEN_RIDERS: readonly JudgeUseKey[] = ["attentionCheck", "wardenVoice"];

export const ridesWardenRoute = (key: JudgeRouteKey): boolean => (WARDEN_RIDERS as readonly string[]).includes(key);

export const routedProvider = (settings: Pick<JudgeSettings, "provider">, key: JudgeRouteKey): JudgeProviderId =>
  settings.provider?.[ridesWardenRoute(key) ? "warden" : key] ?? DEFAULT_JUDGE_PROVIDER;

export const JUDGE_USE_DEPENDENCIES: Partial<Record<JudgeUseKey, JudgeUseKey>> = { expansionLookahead: "lookahead", loreExclusive: "loreSelect", toneCheck: "idleCheck" };

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
  provider: JudgeProviderRoutes;
  noticesSeen: JudgeProviderId[];
}

/** Monotonic spend per chat, exempt from rollback — a rolled-back call was still paid for. */
export interface JudgeMeter {
  calls: number;
  cachedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface JudgeRuntimeState {
  calls: JudgeCallRecord[];
  scene: SceneReadRecord | null;
  meter: JudgeMeter;
}

export const JUDGE_USES_OFF_BY_DEFAULT: readonly JudgeUseKey[] = [];

export const defaultJudgeUses = (): JudgeUses => Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, !JUDGE_USES_OFF_BY_DEFAULT.includes(key)])) as JudgeUses;

export const defaultJudgeProviders = (): JudgeProviderRoutes => Object.fromEntries(JUDGE_ROUTE_KEYS.map((key) => [key, DEFAULT_JUDGE_PROVIDER])) as JudgeProviderRoutes;

export const defaultJudgeSettings = (): JudgeSettings => ({
  enabled: true,
  model: JUDGE_DEFAULT_MODEL,
  timeoutMs: JUDGE_DEFAULT_TIMEOUT_MS,
  uses: defaultJudgeUses(),
  expansion: { variants: 1, temperature: 0.7, pick: "code" },
  provider: defaultJudgeProviders(),
  noticesSeen: [],
});

export function sanitizeJudgeSettings(value: unknown): JudgeSettings {
  const defaults = defaultJudgeSettings();
  if (!isRecord(value)) return defaults;
  const uses = isRecord(value.uses) ? value.uses : {};
  const expansion = isRecord(value.expansion) ? value.expansion : {};
  const provider = isRecord(value.provider) ? value.provider : {};
  const seen: unknown[] = Array.isArray(value.noticesSeen) ? value.noticesSeen : [];
  const variants = expansion.variants === 2 || expansion.variants === 3 ? expansion.variants : 1;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : defaults.model,
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 1 && value.timeoutMs <= 10_000 ? value.timeoutMs : defaults.timeoutMs,
    uses: Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, typeof uses[key] === "boolean" ? uses[key] : defaults.uses[key]])) as JudgeUses,
    expansion: {
      variants,
      temperature: typeof expansion.temperature === "number" && expansion.temperature >= 0 && expansion.temperature <= 2 ? expansion.temperature : defaults.expansion.temperature,
      pick: JUDGE_PICK_MODES.includes(expansion.pick as JudgePickMode) ? (expansion.pick as JudgePickMode) : defaults.expansion.pick,
    },
    provider: Object.fromEntries(JUDGE_ROUTE_KEYS.map((key) => {
      const routed = provider[key];
      return [key, isJudgeProviderId(routed) ? routed : defaults.provider[key]];
    })) as JudgeProviderRoutes,
    noticesSeen: JUDGE_PROVIDER_IDS.filter((id) => seen.includes(id)),
  };
}

export function judgeUseActive(settings: JudgeSettings, key: JudgeUseKey): boolean {
  if (!settings.enabled || !settings.uses[key]) return false;
  const dependency = JUDGE_USE_DEPENDENCIES[key];
  return dependency ? judgeUseActive(settings, dependency) : true;
}

export const judgeCallUse = (call: Pick<JudgeCallRecord, "use" | "families">): string => (call.families?.length ? `${call.use} (${call.families.join(", ")})` : call.use);

export const emptyJudgeMeter = (): JudgeMeter => ({ calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });

export const createJudgeRuntime = (): JudgeRuntimeState => ({ calls: [], scene: null, meter: emptyJudgeMeter() });

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

const sanitizeJudgeMeter = (value: unknown): JudgeMeter => {
  const meter = isRecord(value) ? value : {};
  return { calls: count(meter.calls), cachedCalls: count(meter.cachedCalls), inputTokens: count(meter.inputTokens), outputTokens: count(meter.outputTokens), cost: count(meter.cost) };
};

const isSceneReadRecord = (value: unknown): value is SceneReadRecord => isRecord(value) && typeof value.messageId === "number" && isRecord(value.facts);

export function sanitizeJudgeRuntime(value: unknown): JudgeRuntimeState {
  if (!isRecord(value) || !Array.isArray(value.calls)) return createJudgeRuntime();
  const calls = value.calls.filter((entry): entry is JudgeCallRecord => isRecord(entry) && typeof entry.use === "string" && typeof entry.at === "string" && typeof entry.messageId === "number");
  const scene = isSceneReadRecord(value.scene) ? value.scene : null;
  return { calls: calls.slice(-JUDGE_CALL_RING_LIMIT), scene, meter: sanitizeJudgeMeter(value.meter) };
}

const NEVER_SENT: ReadonlySet<string> = new Set(["unavailable", "invalid", "disabled", "no-roles", "no-seam", "busy", "uncalibrated", "auth", "too-large"]);

export function meterJudgeCall(meter: JudgeMeter, record: JudgeCallRecord): JudgeMeter {
  if (record.cached) return { ...meter, cachedCalls: meter.cachedCalls + 1 };
  if (record.fallback && NEVER_SENT.has(record.fallback)) return meter;
  return {
    calls: meter.calls + 1,
    cachedCalls: meter.cachedCalls,
    inputTokens: meter.inputTokens + count(record.inputTokens),
    outputTokens: meter.outputTokens + count(record.outputTokens),
    cost: meter.cost + count(record.cost),
  };
}

export function appendJudgeCall(state: JudgeRuntimeState, record: JudgeCallRecord): JudgeRuntimeState {
  const meter = meterJudgeCall(state.meter ?? emptyJudgeMeter(), record);
  if (record.discarded) return { ...state, meter };
  return { ...state, calls: [...state.calls, record].slice(-JUDGE_CALL_RING_LIMIT), meter };
}

export interface JudgeMeterView extends JudgeMeter {
  /** The versioned model the newest answered call named: what readiness is compared against. */
  lastAnsweredModel: string | null;
}

export const judgeMeterView = (state: JudgeRuntimeState): JudgeMeterView => ({
  ...(state.meter ?? emptyJudgeMeter()),
  lastAnsweredModel: [...state.calls].reverse().find((call) => call.model)?.model ?? null,
});

export const dropJudgeCallsAfter = (state: JudgeRuntimeState, messageId: number): JudgeRuntimeState => ({
  calls: state.calls.filter((entry) => entry.messageId < messageId),
  scene: state.scene && state.scene.messageId < messageId ? state.scene : null,
  meter: state.meter,
});

export const JUDGE_USE_LABELS: Record<JudgeUseKey, string> = {
  canonVerify: "Check story-so-far sentences",
  canonDraft: "Checked canon drafts",
  pictureCue: "Illustration-worthy replies",
  adversityTrend: "World-pressure trend",
  idleCheck: "Nothing-happens trend",
  toneCheck: "Story tone drift",
  repetitionCheck: "Repeated-phrase check",
  director: "Speaker direction",
  memoryVerify: "Check memory before storing",
  memoryPairs: "Merge related notes",
  sceneTrigger: "Notice scene changes",
  sceneTracker: "Scene tracker",
  lookahead: "Heading toward (author view)",
  loreSelect: "Lore selection",
  curatorFilter: "Curator focus",
  typedExtraction: "Every-turn story reads",
  stallCheck: "Stall check",
  expansionCritic: "Expansion review",
  expansionLookahead: "Prepare ahead",
  agencyCheck: "Agency check (warden)",
  houseRules: "House rules (warden)",
  wardenLore: "Lore check (warden)",
  loreExclusive: "Exclusive lore selection",
  expressions: "Sprite expressions",
  attentionCheck: "Answers the player (warden)",
  divergence: "Branch when the player goes off script",
  wardenVoice: "In character (warden)",
};

export const BUILT_JUDGE_USES: readonly JudgeUseKey[] = [
  "director",
  "memoryVerify",
  "memoryPairs",
  "sceneTrigger",
  "sceneTracker",
  "lookahead",
  "loreSelect",
  "typedExtraction",
  "stallCheck",
  "expansionCritic",
  "expansionLookahead",
  "curatorFilter",
  "agencyCheck",
  "houseRules",
  "wardenLore",
  "loreExclusive",
  "expressions",
  "attentionCheck",
  "wardenVoice",
  "divergence",
  "canonVerify", "canonDraft", "pictureCue", "adversityTrend", "idleCheck", "toneCheck", "repetitionCheck",
];

// Steering-grade usages, listed only in author view.
export const AUTHOR_JUDGE_USES: readonly JudgeUseKey[] = [
  "expansionCritic", "expansionLookahead", "agencyCheck", "houseRules", "wardenLore", "loreExclusive", "attentionCheck", "wardenVoice", "divergence",
  "canonDraft", "adversityTrend", "idleCheck", "toneCheck", "repetitionCheck",
];
