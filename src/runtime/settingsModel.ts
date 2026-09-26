import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS } from "@memory/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { defaultJudgeSettings, sanitizeJudgeSettings, type JudgeSettings } from "@judge/index";
import { sanitizePassProfiles } from "./passProfiles";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, StagecraftSettings } from "./types";
import { isRecord } from "@utils/guards";

// User/install lifetime (spec addendum §Configuration homes). Chat lifetime keeps only engine
// state, rings and the per-chat overrides listed in ChatOverrides.
export interface GlobalSettings {
  extraction: ExtractionRuntimeSettings;
  pacing: { alpha: number; hintEnabled: boolean };
  display: { announceTransitions: boolean; hudEnabled: boolean };
  copilot: CopilotRuntimeSettings;
  memory: MemoryRuntimeSettings;
  talk: { enabled: boolean };
  stagecraft: StagecraftSettings;
  judge: JudgeSettings;
  worldInfo: WorldInfoSettings;
  spikes: SpikeFlags;
}

export interface SpikeFlags {
  toolTurnFold: boolean;
}

const sanitizeSpikeFlags = (value: unknown): SpikeFlags => ({ toolTurnFold: isRecord(value) && value.toolTurnFold === true });

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

export const defaultWorldInfoSettings = (): WorldInfoSettings => ({ gatingMode: "file", normalized: {}, normalizedFrom: {}, scanMemory: false });

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
    scanMemory: value.scanMemory === true,
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

// Off by default: an agent that edits the author's lorebook has to be asked for.
export const defaultStagecraftSettings = (): StagecraftSettings => ({ curatorEnabled: false, acceptMode: "review", wardenEnabled: false, wardenAcceptMode: "review" });

export const defaultGlobalSettings = (): GlobalSettings => ({
  extraction: defaultExtractionSettings(),
  pacing: { alpha: DEFAULT_TENSION_EMA_ALPHA, hintEnabled: true },
  display: { announceTransitions: true, hudEnabled: true },
  copilot: { enabled: true },
  memory: defaultMemorySettings(),
  talk: { enabled: true },
  stagecraft: defaultStagecraftSettings(),
  judge: defaultJudgeSettings(),
  worldInfo: defaultWorldInfoSettings(),
  spikes: sanitizeSpikeFlags(null),
});

const clampAlpha = (value: unknown) => (typeof value === "number" && value >= 0 && value <= 1 ? value : DEFAULT_TENSION_EMA_ALPHA);

export const sanitizeGlobalSettings = (value: unknown): GlobalSettings => {
  const defaults = defaultGlobalSettings();
  if (!isRecord(value)) return defaults;
  const { profiles: rawProfiles, ...extraction }: Record<string, unknown> = isRecord(value.extraction) ? value.extraction : {};
  const profiles = sanitizePassProfiles(rawProfiles);
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
    },
    pacing: { alpha: clampAlpha(pacing.alpha), hintEnabled: pacing.hintEnabled !== false },
    display: { announceTransitions: display.announceTransitions !== false, hudEnabled: display.hudEnabled !== false },
    copilot: { enabled: isRecord(value.copilot) ? value.copilot.enabled !== false : true },
    memory: { ...defaults.memory, ...memory, injectionDepths: { ...defaults.memory.injectionDepths, ...(isRecord(memory.injectionDepths) ? memory.injectionDepths : {}) } } as MemoryRuntimeSettings,
    talk: { enabled: isRecord(value.talk) ? value.talk.enabled !== false : true },
    stagecraft: {
      curatorEnabled: isRecord(value.stagecraft) && value.stagecraft.curatorEnabled === true,
      acceptMode: isRecord(value.stagecraft) && STAGECRAFT_ACCEPT_MODES.includes(value.stagecraft.acceptMode as StagecraftAcceptMode)
        ? (value.stagecraft.acceptMode as StagecraftAcceptMode)
        : defaults.stagecraft.acceptMode,
      wardenEnabled: isRecord(value.stagecraft) && value.stagecraft.wardenEnabled === true,
      wardenAcceptMode: isRecord(value.stagecraft) && STAGECRAFT_ACCEPT_MODES.includes(value.stagecraft.wardenAcceptMode as StagecraftAcceptMode)
        ? (value.stagecraft.wardenAcceptMode as StagecraftAcceptMode)
        : defaults.stagecraft.wardenAcceptMode,
    },
    judge: sanitizeJudgeSettings(value.judge),
    worldInfo: sanitizeWorldInfoSettings(value.worldInfo),
    spikes: sanitizeSpikeFlags(value.spikes),
  };
};
