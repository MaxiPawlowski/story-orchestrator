import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driftVerdict, readDrift, type DriftKeySummary } from './so-prefix-drift.mts';

const row = (extra: Partial<DriftKeySummary>): DriftKeySummary => ({ key: 'reply:c1:Arin', kind: 'reply', pairs: 3, aboveBoundary: 0, noBoundary: 0, worstLost: 0, last: 'ok', ...extra });

test('C-H4 A0: reply pairs under the boundary pass; side keys never gate', () => {
  const verdict = driftVerdict([row({}), row({ key: 'side:memory', kind: 'side', noBoundary: 4, last: 'no-boundary' })]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.replyPairs, 3);
  assert.equal(verdict.sideKeys, 1);
});

test('C-H4 A0: a reply key above the boundary is a finding, and an empty or missing recorder measured nothing', () => {
  const failing = driftVerdict([row({}), row({ key: 'reply:c1:Narrator', aboveBoundary: 1, last: 'above-boundary' })]);
  assert.equal(failing.ok, false);
  assert.match(failing.reason, /reply:c1:Narrator/);
  assert.equal(driftVerdict([]).ok, false);
  assert.match(driftVerdict([row({ pairs: 0 })]).reason, /nothing measured/);
  assert.match(driftVerdict(null).reason, /no recorder/);
});

test('C-H4 A0: the page read returns the recorder summary and records, or null without a recorder', async () => {
  const page = { evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg) };
  const root = globalThis as Record<string, unknown>;
  root.SillyTavern = { getContext: () => ({ chatId: 'c1' }) };
  root.storyOrchestratorPrefixDrift = { summary: () => [row({})], records: () => [{ key: 'reply:c1:Arin' }] };
  try {
    const read = await readDrift(page);
    assert.deepEqual(read.summary, [row({})]);
    assert.equal(read.chatId, 'c1');
    delete root.storyOrchestratorPrefixDrift;
    assert.equal((await readDrift(page)).summary, null);
  } finally {
    delete root.storyOrchestratorPrefixDrift;
    delete root.SillyTavern;
  }
});
