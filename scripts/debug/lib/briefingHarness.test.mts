import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBriefingSetting, restoreBriefing, suppressBriefing } from './briefingHarness.mts';

const fakePage = (initial: boolean | undefined) => {
  const settings = { display: { briefing: initial } as { briefing?: boolean } };
  const writes: boolean[] = [];
  (globalThis as Record<string, unknown>).storyOrchestratorRuntime = {
    getGlobalSettings: () => settings,
    setUiSettings: (patch: { briefing: boolean }) => { writes.push(patch.briefing); settings.display.briefing = patch.briefing; },
  };
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => (String(fn).includes('/script.js') ? true : fn(arg)),
    waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
  };
  return { page, writes, settings };
};

test('suppresses the briefing for a run and puts the install value back', async () => {
  const { page, writes } = fakePage(true);
  const suppressed = await suppressBriefing(page);
  assert.equal(suppressed.changed, true);
  assert.equal(suppressed.before, true);
  assert.equal(await readBriefingSetting(page), false);
  const restored = await restoreBriefing(page, suppressed.before);
  assert.equal(restored.restored, true);
  assert.equal((restored as { ok?: boolean }).ok, true);
  assert.deepEqual(writes, [false, true]);
});

test('controls: an install already off is left alone, and a missing capture restores nothing', async () => {
  const { page, writes } = fakePage(false);
  assert.deepEqual(await suppressBriefing(page), { changed: false, before: false });
  assert.deepEqual(await restoreBriefing(page, false), { restored: false, unchanged: true, value: false });
  assert.deepEqual(await restoreBriefing(page, null), { restored: false, reason: 'no pre-run capture' });
  assert.deepEqual(writes, []);
  const unknown = fakePage(undefined);
  assert.equal(await readBriefingSetting(unknown.page), null);
});
