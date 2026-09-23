// v2.3 plan 11's concurrent-load recipe needs two isolated sessions, and `.debug/` is the second
// half of that isolation (the CDP port is the first): two processes sharing one directory also share
// `session.json`, the journey config snapshot and the asset baseline. The override is asserted here
// because a silent fallback to the shared directory is exactly what the recipe cannot detect from a
// run's output — the run works either way, and only the second one's cleanup reveals the collision.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { debugDirFor } from './connection.mts';

const ROOT = resolve('C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator');

test('an unset or blank SO_DEBUG_DIR keeps the historical directory', () => {
  assert.equal(debugDirFor({}, ROOT), resolve(ROOT, '.debug'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '' }, ROOT), resolve(ROOT, '.debug'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '   ' }, ROOT), resolve(ROOT, '.debug'), 'whitespace is unset, not a directory named "   "');
});

test('a relative SO_DEBUG_DIR resolves under the project root', () => {
  assert.equal(debugDirFor({ SO_DEBUG_DIR: '.debug-load-b' }, ROOT), resolve(ROOT, '.debug-load-b'));
  assert.equal(debugDirFor({ SO_DEBUG_DIR: 'tmp/session-2' }, ROOT), resolve(ROOT, 'tmp/session-2'));
});

test('an absolute SO_DEBUG_DIR is used as given, not joined onto the root', () => {
  const absolute = resolve(ROOT, '..', 'so-debug-b');
  assert.equal(debugDirFor({ SO_DEBUG_DIR: absolute }, ROOT), absolute);
});
