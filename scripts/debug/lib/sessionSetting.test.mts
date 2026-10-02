import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { refresherFor, RUNTIME_REFRESHERS, settingLanded } from './sessionSetting.mts';

test('setting: a section the runtime derives its in-memory view from is refreshed through the runtime setter', () => {
  assert.equal(refresherFor('memory.innerBeat'), 'setMemorySettings');
  assert.equal(refresherFor('memory.chapters.seal'), 'setMemorySettings');
  assert.equal(refresherFor('display.inline.level'), 'setUiSettings');
  assert.equal(refresherFor('judge.uses.loreSelect'), null);
  const manager = readFileSync(resolve(REPO_ROOT, 'src', 'runtime', 'runtimeManager.ts'), 'utf-8');
  for (const setter of Object.values(RUNTIME_REFRESHERS)) assert.ok(manager.includes(`  ${setter}(`), `${setter} is a RuntimeManager method`);
});

test('setting: a false flag the store drops reads back as landed, any other mismatch does not', () => {
  assert.equal(settingLanded(false, null), true);
  assert.equal(settingLanded(true, true), true);
  assert.equal(settingLanded(true, null), false);
  assert.equal(settingLanded(0, null), false);
  assert.equal(settingLanded(2, 1), false);
});
