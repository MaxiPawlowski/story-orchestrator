import { getContext, observeNextSettingsSave, readServerExtensionSettings, settingsAreLoaded } from "@services/STAPI";
import type { JudgeSettings, JudgeUses } from "@judge/index";
import { createSettingsWriteEvidence, recordSettingsWrite } from "./librarySave";
import { SETTINGS_ROOT_KEY, settingsRoot, writableSettingsRoot } from "./settingsRoot";
import { sanitizeGlobalSettings, type GlobalSettings } from "./settingsModel";

export * from "./settingsModel";

const SETTINGS_KEY = "settings";

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

