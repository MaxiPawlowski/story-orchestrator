// v2.3 plan 01 §D/§E (seed S11). Extraction settings are INSTALL-WIDE: a run that changes cadence,
// stability lag or the enabled flag changes them for the next run and for the next real player.
//
// Two ways that happened, both measured on 2026-09-20:
//   - a journey set cadence 1 and nothing put it back (only J1 snapshotted the config at all);
//   - the mocked scenario corpus left extraction DISABLED and stabilityLag 1 behind, because
//     `plan06-convergence` writes stabilityLag and a failed read pauses extraction install-wide.
//
// Both runners capture these before they touch anything and restore them at cleanup, through the
// one reader below so the two ends cannot drift apart.

import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

export interface ExtractionSettingsSnapshot {
  enabled: boolean;
  cadence: number;
  stabilityLag: number;
  profileId: string | null;
  profiles: Record<string, string>;
}

export async function readExtractionSettings(page): Promise<ExtractionSettingsSnapshot | null> {
  return evaluateInST(page, () => {
    const runtime = globalThis.storyOrchestratorRuntime;
    const settings = runtime?.getGlobalSettings?.()?.extraction ?? runtime?.getSnapshot?.()?.extraction?.settings ?? null;
    return settings
      ? { enabled: settings.enabled, cadence: settings.cadence, stabilityLag: settings.stabilityLag, profileId: settings.profileId ?? null, profiles: settings.profiles ?? {} }
      : null;
  });
}

export async function restoreExtractionSettings(page, before: ExtractionSettingsSnapshot | null) {
  if (!before) return { restored: false, reason: 'no pre-run capture' };
  const after = await readExtractionSettings(page);
  if (after && JSON.stringify(after) === JSON.stringify(before)) return { restored: false, unchanged: true, settings: before };
  await evaluateInST(page, async (settings) => {
    globalThis.storyOrchestratorRuntime?.setExtractionSettings(settings);
    return true;
  }, before);
  // Persist, or the restore lives only until the page reloads.
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const verified = await readExtractionSettings(page);
  const ok = JSON.stringify(verified) === JSON.stringify(before) && !('error' in saved);
  return { restored: true, from: after, to: before, verified, saved, ok, ...(ok ? {} : { error: 'error' in saved ? `extraction settings were not saved: ${saved.error}` : 'extraction settings did not read back as restored' }) };
}
