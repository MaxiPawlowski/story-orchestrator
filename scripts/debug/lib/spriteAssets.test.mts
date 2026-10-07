import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopedSprites, scopedSpriteReferences, removeSpriteAssets, type SpriteAsset } from './spriteAssets.mts';

const row = (set: string, story: string | null = null): SpriteAsset => ({ character: 'Arin', set, label: 'neutral',
  sha256: 'a'.repeat(64), actualHash: 'a'.repeat(64), story });

test('sprite cleanup requires generated ledger scope and protects pre-existing expressions and looks', () => {
  const original = row('so_test_reference');
  const look = row('look_12345678', 'so-test-story');
  const frame = { ...row('anim-so_test_frames'), label: 'happy.talk' };
  const foreign = row('look_87654321', 'real-author-story');
  const unrelated = row('look_11111111', 'so-testament');
  const inventory = { trusted: true, rows: [original, look, frame, foreign, unrelated] };
  const baseline = { trusted: true, rows: [original, foreign] };
  assert.deepEqual(scopedSprites(inventory, 'SO-TEST', baseline), [look, frame]);
  assert.deepEqual(scopedSprites(inventory, 'SO-TEST', { trusted: false, rows: [] }), [original, look, frame]);
  assert.deepEqual(scopedSprites({ trusted: false, rows: inventory.rows }, 'SO-TEST', baseline), []);
  assert.throws(() => scopedSprites(inventory, ''), /non-empty marker/);
});

test('a changed generated file cannot be removed by the harness', async (t) => {
  const globals = globalThis as any;
  const oldST = globals.SillyTavern, oldFetch = globalThis.fetch;
  t.after(() => { globals.SillyTavern = oldST; globalThis.fetch = oldFetch; });
  globals.SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
  const calls: unknown[] = [];
  globalThis.fetch = (async (_url, options) => { calls.push(JSON.parse(options.body as string)); return Response.json({ deleted: true }); }) as typeof fetch;
  const page = { evaluate: (fn, arg) => fn(arg) };
  const unchanged = row('look_12345678', 'so-test-story');
  const changed = { ...row('look_87654321', 'so-test-story'), actualHash: 'b'.repeat(64) };
  const result = await removeSpriteAssets(page, [unchanged, changed]);
  assert.deepEqual(result.deleted, ['Arin/look_12345678/neutral']);
  assert.equal(result.errors.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { character: unchanged.character, set: unchanged.set, label: unchanged.label, expectedHash: unchanged.sha256 });
});

test('temporary-reference cleanup keeps pre-existing and foreign references outside this test marker', () => {
  const before = { name: 'before.png', unused: true, sha256: 'a'.repeat(64), character: 'Arin', set: 'so_test_pack', story: null };
  const own = { ...before, name: 'own.png', set: 'look_12345678', story: 'so-test-story' };
  const foreign = { ...before, name: 'foreign.png', set: 'author_pack' };
  assert.deepEqual(scopedSpriteReferences({ trusted: true, rows: [], references: [before, own, foreign] }, 'SO-TEST',
    { trusted: true, rows: [], references: [before] }), [own]);
});
