import type { ScenarioRequires } from './scenarioRequires.mts';
import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

export interface ModelSettings {
  briefingDraft?: boolean;
  innerBeat?: boolean;
}

export async function readModelSettings(page, requires: ScenarioRequires): Promise<ModelSettings> {
  if (!requires.briefingDraft && !requires.innerBeat) return {};
  return evaluateInST(page, (needs) => {
    const settings = globalThis.storyOrchestratorRuntime.getGlobalSettings();
    return { ...(needs.briefingDraft ? { briefingDraft: settings.display.briefingDraft } : {}), ...(needs.innerBeat ? { innerBeat: settings.memory.innerBeat } : {}) };
  }, requires);
}

export async function writeModelSettings(page, settings: ModelSettings, save = saveSettingsNow) {
  if (!Object.keys(settings).length) return { unchanged: true };
  await evaluateInST(page, (patch) => {
    const rt = globalThis.storyOrchestratorRuntime;
    if (patch.briefingDraft !== undefined) rt.setUiSettings({ briefingDraft: patch.briefingDraft });
    if (patch.innerBeat !== undefined) rt.setMemorySettings({ innerBeat: patch.innerBeat });
  }, settings);
  await save(page);
  const after = await readModelSettings(page, { ...(settings.briefingDraft !== undefined ? { briefingDraft: 'off' as const } : {}), ...(settings.innerBeat !== undefined ? { innerBeat: 'off' as const } : {}) });
  if (JSON.stringify(after) !== JSON.stringify(settings)) throw new Error(`model settings did not read back: ${JSON.stringify({ settings, after })}`);
  return { restored: true, settings: after };
}
