import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyMirrorTargets, markerNamed, parseAssetsArgs } from './assetScope.mts';

test('so-assets takes an explicit --baseline, and has no default one (S8)', () => {
  assert.deepEqual(parseAssetsArgs(['remove', '--marker', 'SO-J9', '--baseline', '.debug/base.json'], 'SO-J9'), { command: 'remove', marker: 'SO-J9', baselineFile: '.debug/base.json', legacyMirrors: [] });
  assert.equal(parseAssetsArgs(['remove'], 'SO-J9').baselineFile, null);
  assert.equal(parseAssetsArgs(['--baseline', 'b.json', 'list'], 'SO-J9').command, 'list');
  assert.throws(() => parseAssetsArgs(['remove', '--baseline'], 'SO-J9'), /--baseline needs a value/);
  assert.throws(() => parseAssetsArgs(['remove', '--baseline', '--marker', 'x'], 'SO-J9'), /--baseline needs a value/);
});

test('a legacy mirror is deleted only when named exactly, listed, and without a chat-id suffix (S9)', () => {
  const listed = ['Story Orchestrator - Sun Ruins', 'Story Orchestrator - Sun Ruins - 2026-09-23@09h09m51s752ms', 'Adolion'];
  const { targets, refused } = legacyMirrorTargets(listed, [
    'Story Orchestrator - Sun Ruins',
    'Story Orchestrator - Sun Ruins - 2026-09-23@09h09m51s752ms',
    'story orchestrator - sun ruins',
    'Story Orchestrator - Gone',
    'Adolion',
  ]);
  assert.deepEqual(targets, ['Story Orchestrator - Sun Ruins']);
  assert.deepEqual(refused.map((entry) => entry.reason), [
    'a per-chat mirror (chat-id suffix); it is cleaned with its chat',
    'listed as "Story Orchestrator - Sun Ruins", not exactly this name',
    'not listed by ST',
    'not a Story Orchestrator mirror name',
  ]);
});

test('regex scripts and QR sets are in scope by marker prefix only (S9)', () => {
  assert.deepEqual(markerNamed(['SO-J9 strip', 'so-j9 lower', 'My regex', 'x SO-J9'], 'SO-J9'), ['SO-J9 strip', 'so-j9 lower']);
  assert.throws(() => markerNamed(['anything'], '  '), /empty marker/);
});
