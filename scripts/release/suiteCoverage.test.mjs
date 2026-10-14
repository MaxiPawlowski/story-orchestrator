import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRanges, featureIds, floorTables, report, tableAfter } from '../suite/coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('expandRanges expands id ranges and check ranges', () => {
  assert.equal(expandRanges('C1–C3'), 'C1, C2, C3');
  assert.equal(expandRanges('GS2.1–GS2.3'), 'GS2.1, GS2.2, GS2.3');
  assert.equal(expandRanges('R7/R9'), 'R7/R9');
});

test('floorTables reads first-column ids of Floor/Pass tables only', () => {
  const doc = ['| # | Condition | Floor |', '|---|---|---|', '| C1 | x | y |', '| **C2** | x | y |', '', '| # | Item | Source |', '|---|---|---|', '| Z9 | x | y |'].join('\n');
  assert.deepEqual(floorTables(doc), ['C1', 'C2']);
});

test('tableAfter returns body rows under a heading', () => {
  const doc = ['## T', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'after'].join('\n');
  assert.deepEqual(tableAfter(doc, '## T'), [['1', '2']]);
});

test('every registry feature has a plan 24 matrix row and every floor is named', () => {
  const ids = featureIds(join(ROOT, 'src', 'features'), join(ROOT, 'src', 'judge', 'settings.ts'));
  assert.ok(ids.length > 100);
  const result = report({ root: ROOT });
  assert.deepEqual(result.features.filter((feature) => feature.reason === 'no matrix row').map((feature) => feature.id), []);
  assert.deepEqual(result.floorRed, []);
});
