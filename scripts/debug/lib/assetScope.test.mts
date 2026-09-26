import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markerNamed, parseAssetsArgs } from './assetScope.mts';

test('so-assets takes an explicit --baseline, and has no default one (S8)', () => {
  assert.deepEqual(parseAssetsArgs(['remove', '--marker', 'SO-J9', '--baseline', '.debug/base.json'], 'SO-J9'), { command: 'remove', marker: 'SO-J9', baselineFile: '.debug/base.json' });
  assert.equal(parseAssetsArgs(['remove'], 'SO-J9').baselineFile, null);
  assert.equal(parseAssetsArgs(['--baseline', 'b.json', 'list'], 'SO-J9').command, 'list');
  assert.throws(() => parseAssetsArgs(['remove', '--baseline'], 'SO-J9'), /--baseline needs a value/);
  assert.throws(() => parseAssetsArgs(['remove', '--baseline', '--marker', 'x'], 'SO-J9'), /--baseline needs a value/);
});

test('regex scripts and QR sets are in scope by marker prefix only (S9)', () => {
  assert.deepEqual(markerNamed(['SO-J9 strip', 'so-j9 lower', 'My regex', 'x SO-J9'], 'SO-J9'), ['SO-J9 strip', 'so-j9 lower']);
  assert.throws(() => markerNamed(['anything'], '  '), /empty marker/);
});
