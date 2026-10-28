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
  const changed = rescoreFixture(fixture({ facts: { mustContain: ['wound'] } }, live(['wounded'])), 1, 2);
  assert.deepEqual(changed?.tiers.map((row) => [row.tier, row.before, row.after, row.changed]), [['facts', true, false, true]]);
  const kept = rescoreFixture(fixture({ facts: { mustContain: ['wound'], modes: { wound: 'prefix' } } }, live(['wounded'])), 1, 2);
  assert.equal(kept?.changed, false);
  const record = rescoreRecord([fixture({ facts: { mustContain: ['wound'] } }, live(['wounded']), 'a'), fixture({}, null, 'b')], 'test/goldens/live', '2026-10-16T00:00:00.000Z', 1, 2);
  assert.equal(record.scorerVersion, 2);
  assert.equal(record.fromScorerVersion, 1);
  assert.deepEqual(record.changed, [{ fixture: 'a', tier: 'facts', before: true, after: false }]);
  assert.deepEqual(record.totals, { facts: { scored: 1, before: 1, after: 0 } });
  assert.deepEqual(record.unrecorded, ['b']);
});

test('v3.0 25: scorer v3 reads the product facts tier, v2 read FACT lines only', () => {
  const recorded = { ...live(['Mara lost the key.']), factLines: [] };
  const row = rescoreFixture(fixture({ facts: { minCount: 1, mustContain: ['key'] } }, recorded), 2, 3);
  assert.deepEqual(row?.tiers.map((tier) => [tier.tier, tier.before, tier.after]), [['facts', false, true]]);
  const old = rescoreFixture(fixture({ facts: { minCount: 1, mustContain: ['key'] } }, live(['Mara lost the key.'])), 2, 3);
  assert.equal(old?.changed, false);
  assert.equal(rescoreRecord([], 'x', 't').scorerVersion, 3);
  assert.throws(() => rescoreFixture(fixture({ facts: { mustContain: ['key'] } }, recorded), 9, 3), /unknown scorer version 9/);
});
