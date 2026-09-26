import { getContext, observeNextSettingsSave, readServerExtensionSettings, settingsAreLoaded } from "@services/STAPI";
import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS } from "@memory/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { defaultJudgeSettings, sanitizeJudgeSettings, type JudgeSettings, type JudgeUses } from "@judge/index";
import { createSettingsWriteEvidence, recordSettingsWrite } from "./librarySave";
import { sanitizePassProfiles } from "./passProfiles";
import { SETTINGS_ROOT_KEY, settingsRoot, writableSettingsRoot } from "./settingsRoot";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, StagecraftSettings } from "./types";

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
  worldInfo: WorldInfoSettings;
}

// v2.5 plan 01. `scan` is written only by the author's confirm (Q2: an install that never opens the setting stays
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
}

export const defaultWorldInfoSettings = (): WorldInfoSettings => ({ gatingMode: "file", normalized: {}, normalizedFrom: {} });

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
      .map(([book, comments]): [string, string[]] => [book, Array.isArray(comments) ? [...new Set(comments.filter((comment): comment is string => typeof comment === "string" && comment.trim().length > 0))] : []])
      .filter(([, comments]) => comments.length > 0))
    : {};
  return { gatingMode: value.gatingMode === "scan" ? "scan" : "file", normalized, normalizedFrom: sanitizeProvenance(value.normalizedFrom) };
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
  worldInfo: defaultWorldInfoSettings(),
});

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

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
      reconciliationMultiplier: typeof extraction.reconciliationMultiplier === "number" && extraction.reconciliationMultiplier >= 1 ? extraction.reconciliationMultiplier : defaults.extraction.reconciliationMultiplier,
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
  };
};

const WRITE_RING = 16;
let writeSeq = 0;
const recentWrites: Array<{ seq: number; json: string }> = [];

const heldByServer = (stored: { value: unknown } | null, write: { seq: number }): string | null => {
  if (stored === null) return "the server's settings could not be read back";
  const held = JSON.stringify(sanitizeGlobalSettings(stored.value));
  return recentWrites.some((entry) => entry.seq >= write.seq && entry.json === held) ? null : "the server holds other settings than this save wrote";
};

const confirmSettingsWrite = createSettingsWriteEvidence<{ seq: number }, { value: unknown }>({
  observe: () => observeNextSettingsSave(),
  readBack: async () => {
    const root = await readServerExtensionSettings(SETTINGS_ROOT_KEY);
    return root === null ? null : { value: root[SETTINGS_KEY] };
  },
}, heldByServer);

/** v2.4 E3: an install-wide settings write reads its settings save; the server holds it, or a later write. */
const writeSettings = (settings: GlobalSettings, label: string) => {
  writableSettingsRoot()[SETTINGS_KEY] = settings;
  const write = { seq: ++writeSeq };
  recentWrites.push({ ...write, json: JSON.stringify(sanitizeGlobalSettings(settings)) });
  if (recentWrites.length > WRITE_RING) recentWrites.shift();
  recordSettingsWrite("settings save not confirmed", label, () => confirmSettingsWrite(write));
  getContext().saveSettingsDebounced();
};

/**
 * v2.3 plan 06 (F2). The read is ALSO a write: it replaces the stored value with its sanitized form.
 * Before ST has loaded the extension settings that write is destructive — `settingsRoot()` would create
 * our key, the sanitized defaults would be stamped in its place, and the author's settings would be
 * gone the moment anything saved. So the write-back waits for the load, and until then a caller gets
 * sanitized defaults WITHOUT them being stored.
 */
export function getGlobalSettings(): GlobalSettings {
  const root = settingsRoot();
  const sanitized = sanitizeGlobalSettings(root[SETTINGS_KEY]);
  if (settingsAreLoaded?.()) root[SETTINGS_KEY] = sanitized;
  return sanitized;
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
    worldInfo: { ...current.worldInfo, ...(patch.worldInfo ?? {}) },
  };
  const sanitized = sanitizeGlobalSettings(next);
  writeSettings(sanitized, Object.keys(patch).join(", "));
  return sanitized;
}

export function setJudgeSettings(patch: { enabled?: boolean; uses?: Partial<JudgeUses>; expansion?: Partial<JudgeSettings["expansion"]> }): GlobalSettings {
  const current = getGlobalSettings().judge;
  return setGlobalSettings({ judge: { ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), uses: { ...current.uses, ...(patch.uses ?? {}) }, expansion: { ...current.expansion, ...(patch.expansion ?? {}) } } });
}

