import { MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS } from "@memory/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { TALK_CHAIN_MAX_CAP, TALK_CHAIN_MAX_DEFAULT } from "@engine/index";
import { defaultJudgeSettings, sanitizeJudgeSettings, type JudgeSettings } from "@judge/index";
import { sanitizePassProfiles, sanitizeRoleRoutes } from "./passProfiles";
import { isReplyEffort, sanitizeReasoningBudget } from "@utils/reasoningEffort";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, StagecraftSettings } from "./types";
import { isRecord } from "@utils/guards";
import { DEFAULT_MEANWHILE_ACCEPT_MODE, isMeanwhileAcceptMode } from "./agendaProposals";
import { defaultImageSettings, sanitizeImageSettings, type ImageSettings } from "../image/settings";
import { defaultSpriteSettings, sanitizeSpriteSettings, type SpriteSettings } from "../sprites/settings";
import { defaultPresenceSettings, sanitizePresenceSettings, type PresenceSettings } from "./displayToggles";
import { deltaFrom, overDefaults } from "./settingsDelta";

// The system default for answering one player message with several voices. A checkpoint's own
// `talk_control.chain` overrides each field; absent fields fall back here.
export interface TalkChainSettings {
  enabled: boolean;
  max: number;
}

export const TALK_CHAIN_FIXED = { stopOnTransition: true, holdExtraction: false } as const;

export const RECONCILIATION_MULTIPLIER = 1.5;

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
  pacing: { hintEnabled: boolean };
  display: { announceTransitions: boolean; hudEnabled: boolean; briefing: boolean; playerSetup: boolean; inline: InlineSettings; presence: PresenceSettings };
  copilot: CopilotRuntimeSettings;
  memory: MemoryRuntimeSettings;
  talk: { enabled: boolean; chain: TalkChainSettings };
  stagecraft: StagecraftSettings;
  judge: JudgeSettings;
  worldInfo: WorldInfoSettings;
  image: ImageSettings;
  sprites: SpriteSettings;
  spikes: SpikeSettings;
  help: HelpSettings;
}

export interface HelpSettings {
  checklistDismissed: boolean;
  dismissedChecks: string[];
  onboardingSeen: boolean;
  openSections: string[];
}

export const DEFAULT_OPEN_SECTIONS: readonly string[] = ["play"];

export const defaultHelpSettings = (): HelpSettings => ({
  checklistDismissed: false, dismissedChecks: [], onboardingSeen: false, openSections: [...DEFAULT_OPEN_SECTIONS],
});

const SECTION_ID = /^[a-z]+$/;

const uniqueIds = (value: unknown): string[] => (Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
  : []);

export const sanitizeHelpSettings = (value: unknown): HelpSettings => ({
  checklistDismissed: isRecord(value) && value.checklistDismissed === true,
  dismissedChecks: isRecord(value) ? uniqueIds(value.dismissedChecks) : [],
  onboardingSeen: isRecord(value) && value.onboardingSeen === true,
  openSections: isRecord(value) && Array.isArray(value.openSections) ? uniqueIds(value.openSections).filter((id) => SECTION_ID.test(id)) : [...DEFAULT_OPEN_SECTIONS],
});

export const SPIKE_FLAGS = [
  "swipeBackCache", "sp6Complications",
  "reasoningEffect", "editReread",
] as const;

export type SpikeFlag = (typeof SPIKE_FLAGS)[number];

export type SpikeSettings = Record<SpikeFlag, boolean>;

export const sanitizeSpikeSettings = (value: unknown): SpikeSettings =>
  Object.fromEntries(SPIKE_FLAGS.map((flag) => [flag, !(isRecord(value) && value[flag] === false)])) as SpikeSettings;

export const defaultSpikeSettings = (): SpikeSettings => sanitizeSpikeSettings(null);

// `normalized` is the ledger of gated entries whose FILE rests off (book -> comments); `normalizedFrom`
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
  keptGlobal: string[];
}

export const defaultWorldInfoSettings = (): WorldInfoSettings => ({ gatingMode: "scan", normalized: {}, normalizedFrom: {}, scanMemory: true, keptGlobal: [] });

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
    gatingMode: value.gatingMode === "file" ? "file" : "scan",
    normalized,
    normalizedFrom: sanitizeProvenance(value.normalizedFrom),
    scanMemory: typeof value.scanMemory === "boolean" ? value.scanMemory : defaultWorldInfoSettings().scanMemory,
    keptGlobal: Array.isArray(value.keptGlobal)
      ? [...new Set(value.keptGlobal.filter((book): book is string => typeof book === "string").map((book) => book.trim()).filter(Boolean))]
      : [],
  };
};

export interface ChatOverrides {
  authorView: boolean;
  shapeOverride: PacingSettings["shapeOverride"];
  talkEnabled: boolean | null;
}

export const defaultExtractionSettings = (): ExtractionRuntimeSettings => ({ enabled: true, profileId: null, cadence: 3, stabilityLag: 0 });

export const defaultMemorySettings = (): MemoryRuntimeSettings => ({
  enabled: true,
  epistemicLedgerCapable: true,
  injectionDepths: { ...MEMORY_TIER_INJECTION_DEPTHS },
  tierBudgets: { ...DEFAULT_TIER_BUDGETS },
  tierTokenBudgets: { ...DEFAULT_TIER_TOKEN_BUDGETS },
  innerBeat: true,
  harvestReasoning: true,
});

export const defaultStagecraftSettings = (): StagecraftSettings => ({
  curatorEnabled: true, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "review", agencyAcceptMode: "auto",
  meanwhileAcceptMode: DEFAULT_MEANWHILE_ACCEPT_MODE, livingEnabled: true, branchingEnabled: true, prefetchEnabled: true, createEnabled: true, createRequireMeasured: false,
});

export const defaultGlobalSettings = (): GlobalSettings => ({
  extraction: defaultExtractionSettings(),
  pacing: { hintEnabled: true },
  display: { announceTransitions: false, hudEnabled: true, briefing: true, playerSetup: true, inline: defaultInlineSettings(), presence: defaultPresenceSettings() },
  copilot: { enabled: true },
  memory: defaultMemorySettings(),
  talk: { enabled: true, chain: { enabled: true, max: TALK_CHAIN_MAX_DEFAULT } },
  stagecraft: defaultStagecraftSettings(),
  judge: defaultJudgeSettings(),
  worldInfo: defaultWorldInfoSettings(),
  image: defaultImageSettings(),
  sprites: defaultSpriteSettings(),
  spikes: defaultSpikeSettings(),
  help: defaultHelpSettings(),
});

const sanitizeInnerVoice = (memory: MemoryRuntimeSettings, defaults: MemoryRuntimeSettings): MemoryRuntimeSettings => {
  if (typeof memory.innerBeat !== "boolean") memory.innerBeat = defaults.innerBeat;
  if (memory.innerFanOut !== "top2") delete memory.innerFanOut;
  if (typeof memory.harvestReasoning !== "boolean") memory.harvestReasoning = defaults.harvestReasoning;
  return memory;
};

const sanitizeTalkChain = (value: unknown): TalkChainSettings => {
  const source = isRecord(value) ? value : {};
  const max = typeof source.max === "number" && Number.isInteger(source.max) && source.max >= 1 && source.max <= TALK_CHAIN_MAX_CAP
    ? source.max
    : TALK_CHAIN_MAX_DEFAULT;
  return {
    enabled: source.enabled !== false,
    max,
  };
};

const sanitizeTalkSettings = (value: unknown): GlobalSettings["talk"] => {
  const source = isRecord(value) ? value : {};
  return { enabled: source.enabled !== false, chain: sanitizeTalkChain(source.chain) };
};

const LIVING_FLAGS = ["livingEnabled", "branchingEnabled", "prefetchEnabled"] as const;

const livingFlags = (value: unknown): Record<(typeof LIVING_FLAGS)[number], boolean> => {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(LIVING_FLAGS.map((key) => [key, typeof stored[key] === "boolean" ? stored[key] : true])) as Record<(typeof LIVING_FLAGS)[number], boolean>;
};

export const sanitizeGlobalSettings = (value: unknown): GlobalSettings => {
  const defaults = defaultGlobalSettings();
  if (!isRecord(value)) return defaults;
  const {
    profiles: rawProfiles, routes: rawRoutes, reasoningBudget: rawBudget, fallbackProfileId: rawFallback, replyEffort, reconciliationMultiplier: _fixedReconciliation, ...extraction
  }: Record<string, unknown> =
    isRecord(value.extraction) ? value.extraction : {};
  const fallbackProfileId = typeof rawFallback === "string" ? rawFallback.trim() : "";
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
      stabilityLag: typeof extraction.stabilityLag === "number" && extraction.stabilityLag >= 0 ? extraction.stabilityLag : defaults.extraction.stabilityLag,
      ...(profiles ? { profiles } : {}),
      ...(routes ? { routes } : {}),
      ...(reasoningBudget ? { reasoningBudget } : {}),
      ...(fallbackProfileId ? { fallbackProfileId } : {}),
      ...(isReplyEffort(replyEffort) ? { replyEffort } : {}),
    },
    pacing: { hintEnabled: pacing.hintEnabled !== false },
    display: {
      announceTransitions: display.announceTransitions === true, hudEnabled: display.hudEnabled !== false, briefing: display.briefing !== false,
      playerSetup: display.playerSetup !== false,
      inline: sanitizeInlineSettings(display.inline),
      presence: sanitizePresenceSettings(display.presence),
    },
    copilot: { enabled: isRecord(value.copilot) ? value.copilot.enabled !== false : true },
    memory: sanitizeInnerVoice({
      ...defaults.memory, ...memory, injectionDepths: { ...defaults.memory.injectionDepths, ...(isRecord(memory.injectionDepths) ? memory.injectionDepths : {}) },
    } as MemoryRuntimeSettings, defaults.memory),
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
      agencyAcceptMode: isRecord(value.stagecraft) && STAGECRAFT_ACCEPT_MODES.includes(value.stagecraft.agencyAcceptMode as StagecraftAcceptMode)
        ? (value.stagecraft.agencyAcceptMode as StagecraftAcceptMode)
        : defaults.stagecraft.agencyAcceptMode,
      meanwhileAcceptMode: isRecord(value.stagecraft) && isMeanwhileAcceptMode(value.stagecraft.meanwhileAcceptMode)
        ? value.stagecraft.meanwhileAcceptMode
        : defaults.stagecraft.meanwhileAcceptMode,
      ...livingFlags(value.stagecraft),
      createEnabled: isRecord(value.stagecraft) && typeof value.stagecraft.createEnabled === "boolean" ? value.stagecraft.createEnabled : defaults.stagecraft.createEnabled,
      createRequireMeasured: isRecord(value.stagecraft) && typeof value.stagecraft.createRequireMeasured === "boolean"
        ? value.stagecraft.createRequireMeasured : defaults.stagecraft.createRequireMeasured,
    },
    judge: sanitizeJudgeSettings(value.judge),
    worldInfo: sanitizeWorldInfoSettings(value.worldInfo),
    image: sanitizeImageSettings(value.image),
    sprites: sanitizeSpriteSettings(value.sprites),
    spikes: sanitizeSpikeSettings(value.spikes),
    help: sanitizeHelpSettings(value.help),
  };
};

export const readGlobalSettings = (stored: unknown, defaults: GlobalSettings = defaultGlobalSettings()): GlobalSettings =>
  sanitizeGlobalSettings(overDefaults(defaults, isRecord(stored) ? stored : {}));

export const globalSettingsDelta = (settings: GlobalSettings, defaults: GlobalSettings = defaultGlobalSettings()): Record<string, unknown> =>
  (deltaFrom(defaults, sanitizeGlobalSettings(settings)) as Record<string, unknown> | undefined) ?? {};
