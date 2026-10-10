import { getContext, observeNextSettingsSave, readServerExtensionSettings } from "@services/STAPI";
import type { JudgeProviderId, JudgeProviderRoutes, JudgeSettings, JudgeUses } from "@judge/index";
import { createSettingsWriteEvidence, recordSettingsWrite } from "./librarySave";
import { SETTINGS_ROOT_KEY, settingsRoot, writableSettingsRoot } from "./settingsRoot";
import { globalSettingsDelta, readGlobalSettings, type GlobalSettings } from "./settingsModel";

export * from "./settingsModel";

const SETTINGS_KEY = "settings";

const WRITE_RING = 16;
let writeSeq = 0;
const recentWrites: Array<{ seq: number; json: string }> = [];

const heldByServer = (stored: { value: unknown } | null, write: { seq: number }): string | null => {
  if (stored === null) return "the server's settings could not be read back";
  const held = JSON.stringify(readGlobalSettings(stored.value));
  return recentWrites.some((entry) => entry.seq >= write.seq && entry.json === held) ? null : "the server holds other settings than this save wrote";
};

const confirmSettingsWrite = createSettingsWriteEvidence<{ seq: number }, { value: unknown }>({
  observe: () => observeNextSettingsSave(),
  readBack: async () => {
    const root = await readServerExtensionSettings(SETTINGS_ROOT_KEY);
    return root === null ? null : { value: root[SETTINGS_KEY] };
  },
}, heldByServer);

/** An install-wide settings write stores only what differs from the defaults, and reads its settings save. */
const writeSettings = (settings: GlobalSettings, label: string) => {
  const delta = globalSettingsDelta(settings);
  writableSettingsRoot()[SETTINGS_KEY] = delta;
  const write = { seq: ++writeSeq };
  recentWrites.push({ ...write, json: JSON.stringify(readGlobalSettings(delta)) });
  if (recentWrites.length > WRITE_RING) recentWrites.shift();
  recordSettingsWrite("settings save not confirmed", label, () => confirmSettingsWrite(write));
  getContext().saveSettingsDebounced();
};

/** Defaults merged with the stored delta. A read never writes, so a changed default reaches every install that never set the key. */
export function getGlobalSettings(): GlobalSettings {
  return readGlobalSettings(settingsRoot()[SETTINGS_KEY]);
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
    judge: {
      ...current.judge,
      ...(patch.judge ?? {}),
      uses: { ...current.judge.uses, ...(patch.judge?.uses ?? {}) },
      expansion: { ...current.judge.expansion, ...(patch.judge?.expansion ?? {}) },
      provider: { ...current.judge.provider, ...(patch.judge?.provider ?? {}) },
    },
    worldInfo: { ...current.worldInfo, ...(patch.worldInfo ?? {}) },
    image: { ...current.image, ...(patch.image ?? {}) },
    sprites: { ...current.sprites, ...(patch.sprites ?? {}) },
    spikes: { ...current.spikes, ...(patch.spikes ?? {}) },
    help: { ...current.help, ...(patch.help ?? {}) },
  };
  writeSettings(next, Object.keys(patch).join(", "));
  return getGlobalSettings();
}

export interface JudgeSettingsWrite {
  enabled?: boolean;
  uses?: Partial<JudgeUses>;
  expansion?: Partial<JudgeSettings["expansion"]>;
  provider?: Partial<JudgeProviderRoutes>;
  noticesSeen?: JudgeProviderId[];
}

export function setJudgeSettings(patch: JudgeSettingsWrite): GlobalSettings {
  const current = getGlobalSettings().judge;
  return setGlobalSettings({ judge: {
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    uses: { ...current.uses, ...(patch.uses ?? {}) },
    expansion: { ...current.expansion, ...(patch.expansion ?? {}) },
    provider: { ...current.provider, ...(patch.provider ?? {}) },
    ...(patch.noticesSeen ? { noticesSeen: patch.noticesSeen } : {}),
  } });
}

