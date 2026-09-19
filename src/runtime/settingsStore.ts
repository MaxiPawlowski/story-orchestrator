import { getContext } from "@services/STAPI";
import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS } from "@memory/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { defaultJudgeSettings, sanitizeJudgeSettings, type JudgeSettings, type JudgeUses } from "@judge/index";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, RuntimeExtras, StagecraftSettings, UiRuntimeSettings } from "./types";

const SETTINGS_KEY = "settings";

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
  migratedFromChat?: string;
}

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

// Off by default: an agent that edits the author's lorebook has to be asked for (plan 07).
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
});

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clampAlpha = (value: unknown) => (typeof value === "number" && value >= 0 && value <= 1 ? value : DEFAULT_TENSION_EMA_ALPHA);

export const sanitizeGlobalSettings = (value: unknown): GlobalSettings => {
  const defaults = defaultGlobalSettings();
  if (!isRecord(value)) return defaults;
  const extraction = isRecord(value.extraction) ? value.extraction : {};
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
      reconciliationMultiplier: typeof extraction.reconciliationMultiplier === "number" && extraction.reconciliationMultiplier >= 1 ? extraction.reconciliationMultiplier : defaults.extraction.reconciliationMultiplier,
      stabilityLag: typeof extraction.stabilityLag === "number" && extraction.stabilityLag >= 0 ? extraction.stabilityLag : defaults.extraction.stabilityLag,
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
    ...(typeof value.migratedFromChat === "string" ? { migratedFromChat: value.migratedFromChat } : {}),
  };
};

const getRoot = (): Record<string, unknown> => {
  const settings = getContext().extensionSettings;
  settings["story-orchestrator"] = settings["story-orchestrator"] ?? {};
  return settings["story-orchestrator"] as Record<string, unknown>;
};

export function getGlobalSettings(): GlobalSettings {
  const root = getRoot();
  const sanitized = sanitizeGlobalSettings(root[SETTINGS_KEY]);
  root[SETTINGS_KEY] = sanitized;
  return sanitized;
}

export function isAtDefaults(settings: GlobalSettings = getGlobalSettings()): boolean {
  const defaults = defaultGlobalSettings();
  return !settings.migratedFromChat && JSON.stringify({ ...settings, migratedFromChat: undefined }) === JSON.stringify({ ...defaults, migratedFromChat: undefined });
}

export function setGlobalSettings(patch: Partial<{ [K in keyof GlobalSettings]: Partial<GlobalSettings[K]> }>): GlobalSettings {
  const current = getGlobalSettings();
  const next: GlobalSettings = {
    ...current,
    extraction: { ...current.extraction, ...(patch.extraction ?? {}) },
    pacing: { ...current.pacing, ...(patch.pacing ?? {}) },
    display: { ...current.display, ...(patch.display ?? {}) },
    copilot: { ...current.copilot, ...(patch.copilot ?? {}) },
    memory: { ...current.memory, ...(patch.memory ?? {}) },
    talk: { ...current.talk, ...(patch.talk ?? {}) },
    stagecraft: { ...current.stagecraft, ...(patch.stagecraft ?? {}) },
    judge: { ...current.judge, ...(patch.judge ?? {}), uses: { ...current.judge.uses, ...(patch.judge?.uses ?? {}) }, expansion: { ...current.judge.expansion, ...(patch.judge?.expansion ?? {}) } },
  };
  const sanitized = sanitizeGlobalSettings(next);
  getRoot()[SETTINGS_KEY] = sanitized;
  getContext().saveSettingsDebounced();
  return sanitized;
}

export function setJudgeSettings(patch: { enabled?: boolean; uses?: Partial<JudgeUses>; expansion?: Partial<JudgeSettings["expansion"]> }): GlobalSettings {
  const current = getGlobalSettings().judge;
  return setGlobalSettings({ judge: { ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), uses: { ...current.uses, ...(patch.uses ?? {}) }, expansion: { ...current.expansion, ...(patch.expansion ?? {}) } } });
}

// One-time lift of settings that used to live per chat: an old chat carries the user's real
// configuration, and until the install has its own it is the best source of truth.
export function liftLegacyChatSettings(extras: RuntimeExtras | undefined, chatLabel: string): boolean {
  if (!extras || !isAtDefaults()) return false;
  const legacyExtraction = extras.extraction?.settings;
  const legacyUi = extras.ui as (UiRuntimeSettings & { announceTransitions?: boolean; hudEnabled?: boolean }) | undefined;
  if (!legacyExtraction?.profileId) return false;
  setGlobalSettings({
    extraction: { ...legacyExtraction, enabled: true },
    pacing: { alpha: extras.pacing?.alpha, hintEnabled: extras.pacing?.hintEnabled },
    display: { announceTransitions: legacyUi?.announceTransitions, hudEnabled: legacyUi?.hudEnabled },
    copilot: { enabled: extras.copilot?.enabled },
    memory: extras.memory?.settings,
    talk: { enabled: extras.talk?.enabled },
    stagecraft: extras.stagecraft?.settings,
  });
  getRoot()[SETTINGS_KEY] = { ...getGlobalSettings(), migratedFromChat: chatLabel };
  getContext().saveSettingsDebounced();
  return true;
}
