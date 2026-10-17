import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFixture, rescoreFixture, rescoreRecord, summarizeInventory, type RecordedFixture } from './lib/needleInventory.mts';

const live = (facts: string[], reasons: string[] = [], intents: Array<[string, string]> = []) => ({
  facts: facts.map((text) => ({ text })),
  rejected: reasons.map((reason) => ({ reason })),
  memory: [],
  arcs: [],
  epistemic: intents.map(([subject, content]) => ({ tag: 'intends', subject, content })),
  ledger: [],
});

const fixture = (expected: Record<string, unknown>, recorded: ReturnType<typeof live> | null, name = 'planted'): RecordedFixture => ({ name, expected, players: [], live: recorded });

test('v2.8 35 G1: each needle is classed against its recorded live answer', () => {
  const rows = inventoryFixture(fixture({
    facts: { mustContain: ['wound', 'brass key', 'dragon'], mustNotContain: ['bel'] },
    rejected: [{ reason: 'speculat' }, { reason: 'culat' }],
    intents: { expect: [{ subject: 'Mara', anyOf: ['barg', 'bargain'] }] },
  }, live(['His wounded arm; the brass key lies below.'], ['speculation'], [['Mara', 'to bargain']])));
  const classOf = (needle: string) => rows.find((row) => row.needle === needle)?.class;
  assert.equal(classOf('wound'), 'prefix');
  assert.equal(classOf('brass key'), 'term');
  assert.equal(classOf('dragon'), 'absent');
  assert.equal(classOf('bel'), 'prefix');
  assert.equal(classOf('speculat'), 'prefix');
  assert.equal(classOf('culat'), 'substring-only');
  assert.equal(classOf('barg'), 'prefix');
  assert.equal(classOf('bargain'), 'term');
  assert.equal(rows.find((row) => row.needle === 'wound')?.mode, 'prefix');
});

test('an unrecorded fixture is listed as unrecorded, and a declared prefix mode is read back', () => {
  const rows = inventoryFixture(fixture({ facts: { mustContain: ['wound'], modes: { wound: 'prefix' } } }, null));
  assert.deepEqual(rows.map((row) => [row.class, row.declared]), [['unrecorded', 'prefix']]);
  const declared = inventoryFixture(fixture({ facts: { mustContain: ['wound'], modes: { wound: 'prefix' } } }, live(['wounded'])));
  const summary = summarizeInventory([fixture({}, live([]))], declared);
  assert.equal(summary.prefixDependent.length, 1);
  assert.equal(summary.undeclaredPrefix.length, 0);
});

test('v2.8 35 G2: the re-score lists every verdict that changes between scorer v1 and v2', () => {
  const changed = rescoreFixture(fixture({ facts: { mustContain: ['wound'] } }, live(['wounded'])));
  assert.deepEqual(changed?.tiers.map((row) => [row.tier, row.v1, row.v2, row.changed]), [['facts', true, false, true]]);
  const kept = rescoreFixture(fixture({ facts: { mustContain: ['wound'], modes: { wound: 'prefix' } } }, live(['wounded'])));
  assert.equal(kept?.changed, false);
  const record = rescoreRecord([fixture({ facts: { mustContain: ['wound'] } }, live(['wounded']), 'a'), fixture({}, null, 'b')], 'test/goldens/live', '2026-10-16T00:00:00.000Z');
  assert.equal(record.scorerVersion, 2);
  assert.equal(record.fromScorerVersion, 1);
  assert.deepEqual(record.changed, [{ fixture: 'a', tier: 'facts', v1: true, v2: false }]);
  assert.deepEqual(record.unrecorded, ['b']);
});
