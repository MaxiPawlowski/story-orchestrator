import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWiGating, parseWiGating, readWiGating, restoreWiGating, WI_GATING_CONFIRM_TEXT } from './wiGatingHarness.mts';

const page = { evaluate: (fn, arg) => fn(arg) };

// A small in-page world: the settings root, the snapshot, the gating debug handle and ST's popup, whose OK
// button resolves the author's confirm. `popupText` is what the confirm says.
function install({ popupText = WI_GATING_CONFIRM_TEXT, capability = 'present', settingsReadable = true } = {}) {
  const worldInfo = { gatingMode: 'file', normalized: {} as Record<string, string[]>, normalizedFrom: {} };
  let active = false;
  let open: { content: string; resolve: (ok: boolean) => void } | null = null;
  const clicks: string[] = [];
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: settingsReadable ? { 'story-orchestrator': { settings: { worldInfo } } } : {} }) };
  (globalThis as any).storyOrchestratorRuntime = { getSnapshot: () => ({ wiGating: { active, capability: { state: capability, detail: 'd' } } }), getGlobalSettings: () => (settingsReadable ? { worldInfo } : null) };
  (globalThis as any).storyOrchestratorScanGating = {
    active: () => active,
    capability: () => ({ state: capability, detail: 'd' }),
    requestScan: () => new Promise<boolean>((resolve) => {
      setTimeout(() => {
        open = { content: popupText, resolve: (ok) => {
          if (!ok || capability !== 'present') return resolve(false);
          worldInfo.gatingMode = 'scan';
          worldInfo.normalized = { Ruins: ['CP1', 'CP2'] };
          active = true;
          resolve(true);
        } };
      }, 5);
    }),
    requestFile: async () => { worldInfo.gatingMode = 'file'; active = false; },
  };
  (globalThis as any).document = {
    querySelectorAll: (selector: string) => (selector === 'dialog[open]' && open ? [{
      querySelector: (inner: string) => (inner === '.popup-content' ? { textContent: open!.content } : inner === '.popup-button-ok' ? { click: () => { clicks.push(open!.content); const current = open!; open = null; current.resolve(true); } } : null),
    }] : []),
  };
  return { worldInfo, clicks, isActive: () => active };
}

test('--wi-gating takes scan or file, and nothing else', () => {
  assert.equal(parseWiGating(undefined), null);
  assert.equal(parseWiGating('scan'), 'scan');
  assert.equal(parseWiGating('file'), 'file');
  assert.throws(() => parseWiGating('per-chat'), /scan or file/);
});

test('scan goes through the product confirm: the OK click is what switches the mode, and it reads back active', async () => {
  const world = install();
  const result = await applyWiGating(page as never, 'scan', 2000);
  assert.deepEqual(world.clicks, [WI_GATING_CONFIRM_TEXT]);
  assert.deepEqual(result.before, { mode: 'file', active: false, ledgerEntries: 0, capability: 'present' });
  assert.deepEqual(result.applied, { mode: 'scan', active: true, ledgerEntries: 2, capability: 'present' });
});

test('control: a popup that is not the gating confirm is never clicked, and the switch fails loudly', async () => {
  const world = install({ popupText: 'Delete "Heist" from the library?' });
  await assert.rejects(applyWiGating(page as never, 'scan', 200), /confirm never appeared/);
  assert.deepEqual(world.clicks, []);
  assert.equal(world.worldInfo.gatingMode, 'file');
});

test('an install that cannot gate scans is a failed switch, not a silent file-mode run', async () => {
  install({ capability: 'absent' });
  await assert.rejects(applyWiGating(page as never, 'scan', 2000), /did not activate/);
});

test('refuses to switch when the settings cannot be read, because nothing could restore them', async () => {
  install({ settingsReadable: false });
  assert.equal(await readWiGating(page as never), null);
  await assert.rejects(applyWiGating(page as never, 'scan', 200), /could not be read/);
});

test('restore puts the mode back and leaves an unchanged mode alone', async () => {
  const world = install();
  const { before } = await applyWiGating(page as never, 'scan', 2000);
  assert.deepEqual(await restoreWiGating(page as never, before), { restored: true, mode: 'file' });
  assert.equal(world.worldInfo.gatingMode, 'file');
  assert.equal(world.isActive(), false);
  assert.deepEqual(await restoreWiGating(page as never, before), { restored: false, unchanged: true });
});
