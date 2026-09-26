import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { planLibraryRestore, type LibraryCapture } from './configRestore.mts';

export async function captureLibrary(page): Promise<LibraryCapture> {
  return evaluateInST(page, () => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return { trusted: false, records: [] };
    const records = settings['story-orchestrator']?.v2Stories;
    return { trusted: true, records: Array.isArray(records) ? JSON.parse(JSON.stringify(records)) : [] };
  });
}

export async function restoreLibrary(page, before: LibraryCapture | null | undefined, save: (page) => Promise<unknown> = saveSettingsNow) {
  const current = await evaluateInST(page, () => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return null;
    const records = settings['story-orchestrator']?.v2Stories;
    return Array.isArray(records) ? JSON.parse(JSON.stringify(records)) : [];
  }) as unknown[] | null;
  if (current === null) return { untrusted: true, note: 'the library could not be read at cleanup, so nothing was restored' };
  const plan = planLibraryRestore(before, current);
  if (plan.untrusted) return { untrusted: true, note: 'the library before this run could not be read, so nothing was restored' };
  if (!plan.changed) return { changed: false, removed: [], restored: [] };
  await evaluateInST(page, (records) => {
    const settings = SillyTavern.getContext().extensionSettings;
    const root = settings['story-orchestrator'] ?? (settings['story-orchestrator'] = {});
    root.v2Stories = records;
    return true;
  }, plan.next);
  const saved = await save(page).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const readBack = await evaluateInST(page, () => JSON.stringify(SillyTavern.getContext().extensionSettings?.['story-orchestrator']?.v2Stories ?? []));
  const verified = readBack === JSON.stringify(plan.next);
  return { changed: true, removed: plan.removed, restored: plan.restored, saved, verified, ...(verified ? {} : { error: 'the library read back after the restore does not match the pre-run snapshot' }) };
}
