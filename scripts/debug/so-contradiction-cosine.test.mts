import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';
import { bracketFile, FIXTURE_PATH, probeCosines } from './so-contradiction-cosine.mts';

function fakeVectors(cosine: (left: string, right: string) => number) {
  const collections = new Map<string, Array<{ index: number; text: string }>>();
  const calls: string[] = [];
  const fetchStub = async (path: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push(path);
    if (path === '/api/vector/insert') collections.set(body.collectionId, body.items);
    if (path === '/api/vector/purge') collections.delete(body.collectionId);
    const metadata = path === '/api/vector/query'
      ? (collections.get(body.collectionId) ?? []).filter((item) => (item.text === body.searchText ? 1 : cosine(body.searchText, item.text)) >= body.threshold).map((item) => ({ index: item.index }))
      : [];
    return { ok: true, status: 200, json: async () => ({ metadata }) };
  };
  return { collections, calls, fetchStub };
}

test('probeCosines brackets each pair within 1/2^steps, in both directions, and purges every collection', async () => {
  const fake = fakeVectors(() => 0.41);
  const saved = { fetch: globalThis.fetch, st: (globalThis as any).SillyTavern };
  (globalThis as any).fetch = fake.fetchStub;
  (globalThis as any).SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
  try {
    const { probes } = await probeCosines({ rows: [{ id: 'K01', established: 'a', claim: 'b' }, { id: 'K02', established: 'c', claim: 'd' }], steps: 14 });
    assert.equal(probes.length, 2);
    for (const probe of probes) {
      assert.ok(probe.claimToEstablished <= 0.41 && probe.claimToEstablished > 0.41 - 1 / 2 ** 14 - 1e-4, String(probe.claimToEstablished));
      assert.ok(probe.establishedToClaim <= 0.41 && probe.establishedToClaim > 0.41 - 1 / 2 ** 14 - 1e-4);
    }
    assert.equal(fake.collections.size, 0);
    assert.equal(fake.calls.filter((path) => path === '/api/vector/purge').length, 2);
  } finally {
    (globalThis as any).fetch = saved.fetch;
    (globalThis as any).SillyTavern = saved.st;
  }
});

test('bracketFile refuses a capture with a failed or missing row, and keeps the lower direction otherwise', async () => {
  const fixture = JSON.parse(await readFile(join(PROJECT_ROOT, FIXTURE_PATH), 'utf-8'));
  const ids: string[] = fixture.rows.map((row: { id: string }) => row.id);
  assert.equal(ids.length, 35);
  const full = ids.map((id) => ({ id, claimToEstablished: 0.5, establishedToClaim: 0.48 }));
  const built = bracketFile('abcdef012345', 't', 'present', full, ids);
  assert.ok(built.ok);
  if (built.ok) assert.equal(built.file.rows.K01, 0.48);
  const missing = bracketFile('abcdef012345', 't', 'present', full.slice(1), ids);
  assert.deepEqual(missing.ok ? null : missing.missing, ['K01']);
  const failed = bracketFile('abcdef012345', 't', 'present', [{ id: 'K01', claimToEstablished: Number.NaN, establishedToClaim: Number.NaN, error: 'insert 500' }, ...full.slice(1)], ids);
  assert.deepEqual(failed.ok ? null : failed.failed, ['K01']);
});
