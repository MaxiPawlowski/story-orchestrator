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
] as const;

export type JudgeUseKey = (typeof JUDGE_USE_KEYS)[number];
export type JudgeUses = Record<JudgeUseKey, boolean>;

export const JUDGE_ROUTE_KEYS = [...JUDGE_USE_KEYS, "warden"] as const;
export type JudgeRouteKey = (typeof JUDGE_ROUTE_KEYS)[number];
export type JudgeProviderRoutes = Record<JudgeRouteKey, JudgeProviderId>;

export const JUDGE_USE_DEPENDENCIES: Partial<Record<JudgeUseKey, JudgeUseKey>> = { expansionLookahead: "lookahead", loreExclusive: "loreSelect" };

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

export interface JudgeUseCopy {
  label: string;
  description: string;
  sends: string;
}

export const JUDGE_USE_COPY: Record<JudgeUseKey, JudgeUseCopy> = {
  director: {
    label: "Speaker direction",
    description: "Picks who speaks next in a group chat when the checkpoint has talk control. Needs a one-line role for every character in the pool; otherwise the usual director decides.",
    sends: "the last 8 messages, character names and roles, the scene name and goal",
  },
  memoryVerify: {
    label: "Check memory before storing",
    description: "Drops notes the story never showed and down-weights doubtful ones.",
    sends: "the read's messages, the candidate notes, story title and cast names",
  },
  memoryPairs: { label: "Merge related notes", description: "Decides whether two similar notes are a duplicate, an update, or both true.", sends: "two memory notes per question" },
  sceneTrigger: {
    label: "Notice scene changes",
    description: "Asks for the scene read on the turn a scene changes, next to today's keyword check.",
    sends: "the last 8 messages, the checkpoint name and goal, cast names and roles, your persona name",
  },
  sceneTracker: {
    label: "Scene tracker",
    description: "Keeps location, time and who is present, and adds them to the prompt.",
    sends: "the last 8 messages, the checkpoint name and goal, cast names and roles, your persona name, the story's locations",
  },
  lookahead: {
    label: "Heading toward (author view)",
    description: "Shows which upcoming checkpoints play is moving toward.",
    sends: "the last 8 messages and the names and goals of the next checkpoints",
  },
  loreSelect: {
    label: "Lore selection",
    description: "Adds the lore entries that matter to the next reply, even without their keywords.",
    sends: "the last 8 messages, the checkpoint name and goal, and the title and text of each entry in the story's lore-select books",
  },
  curatorFilter: { label: "Curator focus", description: "Shows the World Info curator only the entries the story may have overtaken.", sends: "the story so far and the story's lore entries" },
  typedExtraction: {
    label: "Every-turn story reads",
    description: "Reads qualities the author marked for it on every turn, so gates fire sooner; the rest stay with the story model.",
    sends: "the last 3 messages (or the read's window), the story title and checkpoint, and each marked quality's description, values and numbers or names found in the messages",
  },
  stallCheck: {
    label: "Stall check",
    description: "Checks a stalled gate before spending a full re-read; writes only what the messages clearly show.",
    sends: "the messages since the checkpoint began and the unmet conditions' descriptions and values",
  },
  expansionCritic: {
    label: "Expansion review",
    description: "Reviews generated story beats instead of a second model call; the code checks still run first.",
    sends: "up to 40 established facts, the target checkpoint's name and goal, cast names with your persona, the tension trajectory and the generated beats",
  },
  expansionLookahead: {
    label: "Prepare ahead",
    description: "Writes the generated beats one checkpoint ahead, where play is heading, before the story gets there.",
    sends: "nothing beyond Heading toward and the expansion itself (reviewed by Expansion review when that is on)",
  },
  agencyCheck: {
    label: "Agency check (warden)",
    description: "After a character reply, asks whether it wrote what only you do, say or decide; when it did, the next reply's prompt carries one line leaving your part to " +
      "you. Uses the continuity warden's review or auto mode.",
    sends: "the character reply, your latest message and your persona name",
  },
  houseRules: {
    label: "House rules (warden)",
    description: "After a character reply, checks it against the story's house rules; a broken rule is named in the next reply's prompt. Uses the continuity warden's review or auto mode.",
    sends: "the character reply and the story's house rules",
  },
  wardenLore: {
    label: "Lore check (warden)",
    description: "After a character reply, checks it against the story's own lore entries that fired for that reply; a contradicted entry is named in the next reply's prompt. " +
      "Needs the continuity warden on, and uses its review or auto mode.",
    sends: "the character reply and the title and text of up to 8 story lore entries that fired for it (600 characters each); never memory or other books",
  },
  loreExclusive: {
    label: "Exclusive lore selection",
    description: "For a story marked exclusive, switches off, for that one reply, the entries of its lore-select books the judge did not pick. Only with per-chat gating; " +
      "a timeout, a refused pick or a timed entry keeps the keyword scan as it is.",
    sends: "nothing beyond Lore selection: it acts on the same request",
  },
  expressions: {
    label: "Sprite expressions",
    description: "Reads each passage of a reply as it streams and picks which character it is about and their facial expression, for the sprite stage. " +
      "Otherwise the sprite model, then the local classifier, decide.",
    sends: "each reply's passages, the on-stage character names and the expression labels with their descriptions",
  },
  attentionCheck: {
    label: "Answers the player (warden)",
    description: "After a character reply, asks whether it answered what you just said or did; a reply that passed over it gets a one-line reminder in the next reply's prompt. " +
      "A refusal or an in-character dodge counts as an answer. Not measured yet.",
    sends: "nothing beyond the warden's call: the character reply, your latest message and your persona name",
  },
  wardenVoice: {
    label: "In character (warden)",
    description: "After a character reply, asks whether it sounds like that character, against their role, drive and feelings; a reply that does not gets a one-line note "
      + "in the next reply's prompt, never a rewrite. Not measured yet.",
    sends: "the character reply, the speaker's name, roster role and drive, and their feelings toward the others in the scene",
  },
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
];

// Steering-grade usages, listed only in author view.
export const AUTHOR_JUDGE_USES: readonly JudgeUseKey[] = ["expansionCritic", "expansionLookahead", "agencyCheck", "houseRules", "wardenLore", "loreExclusive", "attentionCheck", "wardenVoice"];
