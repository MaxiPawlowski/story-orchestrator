import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offlineSettings, REMOTE_AUTHORING_PATHS, remoteAuthoringOn, withRemoteAuthoringOff, withRemoteAuthoringRestored } from './lib/laneModel.mts';
import { requiresProblems } from './lib/scenarioRequires.mts';

const install = (ours: Record<string, unknown>) => ({ other: 1, extension_settings: { tts: {}, 'story-orchestrator': { keep: true, settings: ours } } });
const ours = (settings: Record<string, any>) => settings.extension_settings['story-orchestrator'].settings;

test('a no-model lane switches off every feature that calls a remote authoring model on its own, and says which', () => {
  const before = install({ stagecraft: { livingEnabled: true, curatorEnabled: false }, display: { hudEnabled: true } });
  assert.deepEqual(remoteAuthoringOn(before), [...REMOTE_AUTHORING_PATHS], 'absent keys are on: the stored settings are a delta over defaults');
  const { next, backup } = withRemoteAuthoringOff(before);
  assert.deepEqual(remoteAuthoringOn(next), []);
  assert.equal(ours(next).stagecraft.livingEnabled, false);
  assert.equal(ours(next).stagecraft.curatorEnabled, false, 'unrelated keys are kept');
  assert.equal(ours(next).display.hudEnabled, true);
  assert.equal((next as any).other, 1);
  assert.equal((next as any).extension_settings['story-orchestrator'].keep, true);
  assert.deepEqual(backup['stagecraft.livingEnabled'], true);
  assert.deepEqual(backup['display.briefingDraft'], null, 'an absent key is recorded as absent');
  assert.ok(REMOTE_AUTHORING_PATHS.includes('stagecraft.livingEnabled'));
});

test('restore-model puts back exactly what was there, absent keys absent', () => {
  const before = install({ stagecraft: { livingEnabled: true, prefetchEnabled: false }, characters: { delivery: true } });
  const { next, backup } = withRemoteAuthoringOff(before);
  const restored = withRemoteAuthoringRestored(next, backup);
  assert.equal(ours(restored).stagecraft.livingEnabled, true);
  assert.equal(ours(restored).stagecraft.prefetchEnabled, false);
  assert.equal('branchingEnabled' in ours(restored).stagecraft, false);
  assert.equal('polish' in ours(restored).characters, false);
  assert.equal(ours(restored).characters.delivery, true);
  assert.equal('briefingDraft' in ours(restored).display, false);
});

test('switching off twice keeps the first backup meaningful: the second backup only sees false', () => {
  const once = withRemoteAuthoringOff(install({ stagecraft: { livingEnabled: true } }));
  const twice = withRemoteAuthoringOff(once.next);
  assert.equal(twice.backup['stagecraft.livingEnabled'], false);
  assert.equal(once.backup['stagecraft.livingEnabled'], true);
});

test('an offline seed switches remote authoring off too', () => {
  const { next } = offlineSettings(install({ judge: { enabled: true } }), 8101);
  assert.deepEqual(remoteAuthoringOn(next), []);
});

test('a no-model scenario is not runnable while something would still call a remote model (planted control)', () => {
  const facts = { modelReachable: false, remoteAuthoring: ['stagecraft.livingEnabled', 'extraction.profiles.authoring (harness route)'] };
  const problems = requiresProblems({ lane: 'no-model' }, facts);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /stagecraft\.livingEnabled, extraction\.profiles\.authoring/);
  assert.deepEqual(requiresProblems({ lane: 'no-model' }, { modelReachable: false, remoteAuthoring: [] }), []);
  assert.deepEqual(requiresProblems({ lane: 'model' }, { modelReachable: true, remoteAuthoring: ['stagecraft.livingEnabled'] }), []);
});
