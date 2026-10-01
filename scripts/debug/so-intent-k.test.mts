import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';
import { collectSceneGaps, measureK, median, RECIPE_PATH, rewriteRecipe, rewriteSource, SOURCE_PATH } from './so-intent-k.mts';

const store = (...boundaries: number[]) => ({
  memory: { derived: [...boundaries.map((boundary) => ({ kind: 'scene_summary', boundary })), { kind: 'canon', boundary: 3 }] },
});

test('scene gaps are measured per store between consecutive scene summaries, other kinds ignored', () => {
  const blob = { stories: { a: { extras: store(10, 4, 20) }, b: { extras: store(5) } } };
  assert.deepEqual(collectSceneGaps(blob), { stores: 2, gaps: [6, 10] });
});

test('median handles odd and even counts and an empty sample', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(median([]), null);
});

test('K is three times the rounded median', () => {
  const roots = [store(...Array.from({ length: 22 }, (_, index) => index * 7))];
  assert.deepEqual(measureK(roots, 20), { ok: true, median: 7, k: 21, scenes: 21, chats: 1 });
});

test('negative control: a corpus below minScenes refuses instead of setting K from too little', () => {
  const result = measureK([store(0, 8, 16)], 20);
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /at least 20/);
});

test('negative control: a corpus with no scene summaries refuses', () => {
  assert.equal(measureK([{ chat: [] }], 1).ok, false);
});

test('the shipped source and recipe are what the rewriter expects, and the rewrite flips provisional', async () => {
  const source = await readFile(join(PROJECT_ROOT, SOURCE_PATH), 'utf-8');
  const recipe = JSON.parse(await readFile(join(PROJECT_ROOT, RECIPE_PATH), 'utf-8'));
  const rewritten = rewriteSource(source, 11);
  assert.match(rewritten, /export const MEDIAN_BOUNDARIES_PER_SCENE = 11;/);
  assert.match(rewritten, /export const INTENT_LAPSE_K_PROVISIONAL = false;/);
  const next = rewriteRecipe(recipe, { corpus: 'd1', median: 11, k: 33, scenes: 40, chats: 3, at: 'now' });
  assert.equal(next.provisional, false);
  assert.equal(next.constants.INTENT_LAPSE_BOUNDARIES, 33);
  assert.equal(next.measured.corpus, 'd1');
});

test('negative control: a source that no longer holds K as one constant is refused', () => {
  assert.throws(() => rewriteSource('export const INTENT_LAPSE_BOUNDARIES = 24;', 9), /single constants/);
});
