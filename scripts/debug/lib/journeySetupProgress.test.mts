import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySetup, emptySetup } from '../so-journey.mts';

function stubbedPage({ groups = [] as Array<{ id: string; name: string }> } = {}) {
  const extraction = { enabled: true, cadence: 1, stabilityLag: 0, profileId: 'memory', profiles: {} };
  const writes: Array<Record<string, unknown>> = [];
  const g = globalThis as Record<string, any>;
  g.SillyTavern = { getContext: () => ({ extensionSettings: { 'story-orchestrator': { v2Stories: [] } }, groups, groupId: null }) };
  g.storyOrchestratorRuntime = {
    getGlobalSettings: () => ({ extraction: { ...extraction } }),
    setExtractionSettings: (next: Record<string, unknown>) => { writes.push(next); Object.assign(extraction, next); },
  };
  g.document = { querySelectorAll: () => [] };
  const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
  return { page, extraction, writes };
}

test('J12 runner-error path: a setup that dies on the group keeps what it captured, so cleanup can restore extraction', async () => {
  const { page, extraction, writes } = stubbedPage();
  const into = emptySetup();
  await assert.rejects(
    applySetup(page, { group: '1789797226071', extraction: { cadence: 3, stabilityLag: 0, profile: 'inherit' } }, { allowConfig: false, into }),
    /no group matching "1789797226071"/,
  );
  assert.deepEqual(writes, [{ cadence: 3, stabilityLag: 0 }], 'the declared cadence was written before the group failed');
  assert.equal(extraction.cadence, 3);
  assert.deepEqual(into.extractionBefore, { enabled: true, cadence: 1, stabilityLag: 0, profileId: 'memory', profiles: {} }, 'the pre-run cadence survives the throw for runCleanup');
  assert.deepEqual(into.libraryBefore, { trusted: true, records: [] });
});

test('negative control: without a caller-owned object the capture is lost with the throw', async () => {
  const { page } = stubbedPage();
  let returned: unknown = 'unset';
  await applySetup(page, { group: 'missing', extraction: { cadence: 3, stabilityLag: 0, profile: 'inherit' } }, { allowConfig: false }).then((value) => { returned = value; }, () => undefined);
  assert.equal(returned, 'unset');
});
