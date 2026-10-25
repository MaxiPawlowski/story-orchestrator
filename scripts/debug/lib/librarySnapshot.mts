import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { planLibraryRestore, type LibraryCapture } from './configRestore.mts';

export const LIBRARY_INDEX_PATH = '/user/files/so-library-index.json';

export async function captureLibrary(page): Promise<LibraryCapture> {
  return evaluateInST(page, async (path) => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return { trusted: false, records: [] };
    const records = settings['story-orchestrator']?.stories;
    const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    const index = response?.ok ? await response.text() : null;
    return { trusted: true, records: Array.isArray(records) ? JSON.parse(JSON.stringify(records)) : [], index };
  }, LIBRARY_INDEX_PATH);
}

export async function restoreLibraryIndex(page, before: LibraryCapture | null | undefined) {
  if (!before?.trusted || typeof before.index !== 'string') return { restored: false, reason: before?.index === null ? 'no index file before the run' : 'not captured' };
  return evaluateInST(page, async ({ path, text }) => {
    const ctx = SillyTavern.getContext();
    const current = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' }).then((response) => (response.ok ? response.text() : null)).catch(() => null);
    if (current === text) return { restored: false, reason: 'unchanged' };
    const data = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    const response = await fetch('/api/files/upload', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: path.split('/').pop(), data }) });
    if (!response.ok) return { restored: false, error: `the library index upload answered ${response.status}` };
    const readBack = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' }).then((answer) => answer.text()).catch(() => null);
    return readBack === text ? { restored: true } : { restored: false, error: 'the library index read back after the restore does not match the pre-run copy' };
  }, { path: LIBRARY_INDEX_PATH, text: before.index });
}

export async function restoreLibrary(page, before: LibraryCapture | null | undefined, save: (page) => Promise<unknown> = saveSettingsNow) {
  const current = await evaluateInST(page, () => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return null;
    const records = settings['story-orchestrator']?.stories;
    return Array.isArray(records) ? JSON.parse(JSON.stringify(records)) : [];
  }) as unknown[] | null;
  if (current === null) return { untrusted: true, note: 'the library could not be read at cleanup, so nothing was restored' };
  const plan = planLibraryRestore(before, current);
  if (plan.untrusted) return { untrusted: true, note: 'the library before this run could not be read, so nothing was restored' };
  const index = await restoreLibraryIndex(page, before).catch((error) => ({ restored: false, error: error instanceof Error ? error.message : String(error) }));
  if (!plan.changed) return { changed: false, removed: [], restored: [], index };
  await evaluateInST(page, (records) => {
    const settings = SillyTavern.getContext().extensionSettings;
    const root = settings['story-orchestrator'] ?? (settings['story-orchestrator'] = {});
    root.stories = records;
    return true;
  }, plan.next);
  const saved = await save(page).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const readBack = await evaluateInST(page, () => JSON.stringify(SillyTavern.getContext().extensionSettings?.['story-orchestrator']?.stories ?? []));
  const verified = readBack === JSON.stringify(plan.next);
  return { changed: true, removed: plan.removed, restored: plan.restored, saved, verified, index, ...(verified ? {} : { error: 'the library read back after the restore does not match the pre-run snapshot' }) };
}
