import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS } from "@memory/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { TALK_CHAIN_MAX_CAP, TALK_CHAIN_MAX_DEFAULT } from "@engine/index";
import { defaultJudgeSettings, sanitizeJudgeSettings, type JudgeSettings } from "@judge/index";
import { sanitizePassProfiles, sanitizeRoleRoutes } from "./passProfiles";
import { sanitizeReasoningBudget } from "@utils/reasoningEffort";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, StagecraftSettings } from "./types";
import { isRecord } from "@utils/guards";
import { defaultImageSettings, sanitizeImageSettings, type ImageSettings } from "../image/settings";
import { defaultSpriteSettings, sanitizeSpriteSettings, type SpriteSettings } from "../sprites/settings";

// The system default for answering one player message with several voices. A checkpoint's own
// `talk_control.chain` overrides each field; absent fields fall back here.
export interface TalkChainSettings {
  enabled: boolean;
  max: number;
  stopOnTransition: boolean;
  holdExtraction: boolean;
}

export const INLINE_CATEGORIES = ["progress", "memory", "threads", "lore", "cast", "pacing", "calls", "health"] as const;
export type InlineCategory = (typeof INLINE_CATEGORIES)[number];

export const INLINE_LEVELS = [0, 1, 2, 3, 4] as const;
export type InlineLevel = (typeof INLINE_LEVELS)[number];

export const INLINE_WINDOW_DEFAULT = 20;
export const INLINE_WINDOW_MAX = 200;

export interface InlineSettings {
  level: InlineLevel;
  categories: Partial<Record<InlineCategory, boolean>>;
  window: number;
}

export const PLAYER_LEVEL_CAP: InlineLevel = 2;

export const effectiveInlineLevel = (requested: InlineLevel, authorView: boolean): InlineLevel =>
  (authorView ? requested : Math.min(requested, PLAYER_LEVEL_CAP) as InlineLevel);

export const defaultInlineSettings = (): InlineSettings => ({ level: 1, categories: {}, window: INLINE_WINDOW_DEFAULT });

export const sanitizeInlineSettings = (value: unknown): InlineSettings => {
  if (!isRecord(value)) return defaultInlineSettings();
  const level = (INLINE_LEVELS as readonly unknown[]).includes(value.level) ? value.level as InlineLevel : defaultInlineSettings().level;
  const categories = isRecord(value.categories)
    ? Object.fromEntries(INLINE_CATEGORIES.filter((category) => typeof (value.categories as Record<string, unknown>)[category] === "boolean")
      .map((category) => [category, (value.categories as Record<string, unknown>)[category] as boolean]))
    : {};
  const window = typeof value.window === "number" && Number.isInteger(value.window) && value.window >= 1 ? Math.min(value.window, INLINE_WINDOW_MAX) : INLINE_WINDOW_DEFAULT;
  return { level, categories, window };
};

// User/install lifetime (spec addendum §Configuration homes). Chat lifetime keeps only engine
// state, rings and the per-chat overrides listed in ChatOverrides.
export interface GlobalSettings {
  extraction: ExtractionRuntimeSettings;
  pacing: { alpha: number; hintEnabled: boolean };
  display: { announceTransitions: boolean; hudEnabled: boolean; inline: InlineSettings };
  copilot: CopilotRuntimeSettings;
  memory: MemoryRuntimeSettings;
  talk: { enabled: boolean; chain: TalkChainSettings };
  stagecraft: StagecraftSettings;
  judge: JudgeSettings;
  worldInfo: WorldInfoSettings;
  image: ImageSettings;
  sprites: SpriteSettings;
  spikes: SpikeSettings;
}

export const SPIKE_FLAGS = ["recommitEdit", "swipeBackCache", "witnessFilter", "sp5Scenario", "sp7Chance", "sp6Complications", "sp4AppendShortTerm", "sp8CuratorTiers", "sp8CuratorDigest"] as const;

export type SpikeFlag = (typeof SPIKE_FLAGS)[number];

export type SpikeSettings = Record<SpikeFlag, boolean>;

export const sanitizeSpikeSettings = (value: unknown): SpikeSettings =>
  Object.fromEntries(SPIKE_FLAGS.map((flag) => [flag, isRecord(value) && value[flag] === true])) as SpikeSettings;

export const defaultSpikeSettings = (): SpikeSettings => sanitizeSpikeSettings(null);

// `scan` is written only by the author's confirm (an install that never opens the setting stays
// `file`). `normalized` is the ledger of gated entries whose FILE rests off (book -> comments); `normalizedFrom`
// is what each entry was before, and is all a restore may undo.
export type WorldInfoGatingMode = "file" | "scan";

export interface NormalizedFrom {
  comment: string;
  wasOn: boolean;
}

export interface WorldInfoSettings {
  gatingMode: WorldInfoGatingMode;
  normalized: Record<string, string[]>;
  normalizedFrom: Record<string, NormalizedFrom[]>;
  /** Facts, scene history and checkpoint guidance join the World Info scan buffer. Off unless the author switches it on. */
  scanMemory: boolean;
}

export const defaultWorldInfoSettings = (): WorldInfoSettings => ({ gatingMode: "file", normalized: {}, normalizedFrom: {}, scanMemory: true });

const sanitizeProvenance = (value: unknown): Record<string, NormalizedFrom[]> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([book, rows]): [string, NormalizedFrom[]] => {
      const seen = new Set<string>();
      const kept = (Array.isArray(rows) ? rows : [])
        .filter((row): row is NormalizedFrom => isRecord(row) && typeof row.comment === "string" && row.comment.trim().length > 0 && typeof row.wasOn === "boolean")
        .filter((row) => !seen.has(row.comment) && Boolean(seen.add(row.comment)))
        .map((row) => ({ comment: row.comment, wasOn: row.wasOn }));
      return [book, kept];
    })
    .filter(([, rows]) => rows.length > 0));
};

const sanitizeWorldInfoSettings = (value: unknown): WorldInfoSettings => {
  if (!isRecord(value)) return defaultWorldInfoSettings();
  const normalized = isRecord(value.normalized)
    ? Object.fromEntries(Object.entries(value.normalized)
      .map(([book, comments]): [string, string[]] => [
        book,
        Array.isArray(comments) ? [...new Set(comments.filter((comment): comment is string => typeof comment === "string" && comment.trim().length > 0))] : [],
      ])
      .filter(([, comments]) => comments.length > 0))
    : {};
  return {
    gatingMode: value.gatingMode === "scan" ? "scan" : "file",
    normalized,
    normalizedFrom: sanitizeProvenance(value.normalizedFrom),
    scanMemory: typeof value.scanMemory === "boolean" ? value.scanMemory : defaultWorldInfoSettings().scanMemory,
  };
};

export interface ChatOverrides {
  authorView: boolean;
  shapeOverride: PacingSettings["shapeOverride"];
  talkEnabled: boolean | null;
}

export const defaultExtractionSettings = (): ExtractionRuntimeSettings => ({ enabled: true, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 });

export const defaultMemorySettings = (): MemoryRuntimeSettings => ({
  enabled: true,
  epistemicLedgerCapable: true,
  injectionDepths: { ...MEMORY_TIER_INJECTION_DEPTHS },
  tierBudgets: { ...DEFAULT_TIER_BUDGETS },
  tierTokenBudgets: { ...DEFAULT_TIER_TOKEN_BUDGETS },
});

export const defaultStagecraftSettings = (): StagecraftSettings => ({ curatorEnabled: true, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "review" });

export const defaultGlobalSettings = (): GlobalSettings => ({
  extraction: defaultExtractionSettings(),
  pacing: { alpha: DEFAULT_TENSION_EMA_ALPHA, hintEnabled: true },
  display: { announceTransitions: true, hudEnabled: true, inline: defaultInlineSettings() },
  copilot: { enabled: true },
  memory: defaultMemorySettings(),
  talk: { enabled: true, chain: { enabled: true, max: TALK_CHAIN_MAX_DEFAULT, stopOnTransition: true, holdExtraction: false } },
  stagecraft: defaultStagecraftSettings(),
  judge: defaultJudgeSettings(),
  worldInfo: defaultWorldInfoSettings(),
  image: defaultImageSettings(),
  sprites: defaultSpriteSettings(),
  spikes: defaultSpikeSettings(),
});

const clampAlpha = (value: unknown) => (typeof value === "number" && value >= 0 && value <= 1 ? value : DEFAULT_TENSION_EMA_ALPHA);

const sanitizeTalkChain = (value: unknown): TalkChainSettings => {
  const source = isRecord(value) ? value : {};
  const max = typeof source.max === "number" && Number.isInteger(source.max) && source.max >= 1 && source.max <= TALK_CHAIN_MAX_CAP
    ? source.max
    : TALK_CHAIN_MAX_DEFAULT;
  return {
    enabled: source.enabled !== false,
    max,
    stopOnTransition: source.stopOnTransition !== false,
    holdExtraction: source.holdExtraction === true,
  };
};

const sanitizeTalkSettings = (value: unknown): GlobalSettings["talk"] => {
  const source = isRecord(value) ? value : {};
  return { enabled: source.enabled !== false, chain: sanitizeTalkChain(source.chain) };
};

export const sanitizeGlobalSettings = (value: unknown): GlobalSettings => {
  const defaults = defaultGlobalSettings();
  if (!isRecord(value)) return defaults;
  const { profiles: rawProfiles, routes: rawRoutes, reasoningBudget: rawBudget, ...extraction }: Record<string, unknown> = isRecord(value.extraction) ? value.extraction : {};
  const profiles = sanitizePassProfiles(rawProfiles);
  const routes = sanitizeRoleRoutes(rawRoutes);
  const reasoningBudget = sanitizeReasoningBudget(rawBudget);
  const pacing = isRecord(value.pacing) ? value.pacing : {};
  const display = isRecord(value.display) ? value.display : {};
  const memory = isRecord(value.memory) ? value.memory : {};
  return {
    extraction: {
      ...defaults.extraction,
      ...extraction,
      enabled: typeof extraction.enabled === "boolean" ? extraction.enabled : defaults.extraction.enabled,
      profileId: typeof extraction.profileId === "string" && extraction.profileId ? extraction.profileId : null,
      cadence: typeof extraction.cadence === "number" && extraction.cadence >= 1 ? extraction.cadence : defaults.extraction.cadence,
      reconciliationMultiplier: typeof extraction.reconciliationMultiplier === "number" && extraction.reconciliationMultiplier >= 1
        ? extraction.reconciliationMultiplier
        : defaults.extraction.reconciliationMultiplier,
      stabilityLag: typeof extraction.stabilityLag === "number" && extraction.stabilityLag >= 0 ? extraction.stabilityLag : defaults.extraction.stabilityLag,
      ...(profiles ? { profiles } : {}),
      ...(routes ? { routes } : {}),
      ...(reasoningBudget ? { reasoningBudget } : {}),
    },
    pacing: { alpha: clampAlpha(pacing.alpha), hintEnabled: pacing.hintEnabled !== false },
    display: { announceTransitions: display.announceTransitions !== false, hudEnabled: display.hudEnabled !== false, inline: sanitizeInlineSettings(display.inline) },
    copilot: { enabled: isRecord(value.copilot) ? value.copilot.enabled !== false : true },
    memory: { ...defaults.memory, ...memory, injectionDepths: { ...defaults.memory.injectionDepths, ...(isRecord(memory.injectionDepths) ? memory.injectionDepths : {}) } } as MemoryRuntimeSettings,
    talk: sanitizeTalkSettings(value.talk),
    stagecraft: {
       curatorEnabled: isRecord(value.stagecraft) && typeof value.stagecraft.curatorEnabled === "boolean" ? value.stagecraft.curatorEnabled : defaults.stagecraft.curatorEnabled,
      acceptMode: isRecord(value.stagecraft) && STAGECRAFT_ACCEPT_MODES.includes(value.stagecraft.acceptMode as StagecraftAcceptMode)
        ? (value.stagecraft.acceptMode as StagecraftAcceptMode)
        : defaults.stagecraft.acceptMode,
       wardenEnabled: isRecord(value.stagecraft) && typeof value.stagecraft.wardenEnabled === "boolean" ? value.stagecraft.wardenEnabled : defaults.stagecraft.wardenEnabled,
      wardenAcceptMode: isRecord(value.stagecraft) && STAGECRAFT_ACCEPT_MODES.includes(value.stagecraft.wardenAcceptMode as StagecraftAcceptMode)
        ? (value.stagecraft.wardenAcceptMode as StagecraftAcceptMode)
        : defaults.stagecraft.wardenAcceptMode,
    },
    judge: sanitizeJudgeSettings(value.judge),
    worldInfo: sanitizeWorldInfoSettings(value.worldInfo),
    image: sanitizeImageSettings(value.image),
    sprites: sanitizeSpriteSettings(value.sprites),
    spikes: sanitizeSpikeSettings(value.spikes),
  };
};
