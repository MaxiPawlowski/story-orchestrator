import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYLESS_CC_PROFILE, laneProblems, noModelJourneys, noModelScenarios, prepareLaneSettings, prepareProblems, STRETCH_GROUP, stretchGroupFile, summarizeBatch } from './nomodelSuite.mts';
import { noLlmPartition } from '../../lib/suiteDecisions.mjs';

test('the scenario list is the kept no-model rows that declare model none', () => {
  const rows = [
    { path: 'a.json', shape: { needsLlm: false }, requires: { lane: 'no-model' }, decision: 'keep' },
    { path: 'b.json', shape: { needsLlm: false }, requires: { lane: 'no-model', prior: 'J3' }, decision: 'keep' },
    { path: 'c.json', shape: { needsLlm: false }, requires: { lane: 'model' }, decision: 'keep' },
    { path: 'd.json', shape: { needsLlm: false }, requires: { lane: 'no-model' }, decision: 'fix', reason: 'no assertion step' },
    { path: 'e.json', shape: { needsLlm: true }, requires: {}, decision: 'keep' },
    { path: 'f.json', shape: { needsLlm: false }, requires: { lane: 'no-model', plugins: ['story-orchestrator-lore'] }, decision: 'keep' },
  ];
  const classes: Record<string, string> = { 'a.json': 'none', 'b.json': 'none', 'c.json': 'any', 'd.json': 'none', 'e.json': 'judged', 'f.json': 'none' };
  const out = noModelScenarios(rows, (path) => classes[path], (list) => noLlmPartition(list).noModel);
  assert.deepEqual(out.scenarios, ['a.json']);
  assert.deepEqual(out.problems, []);
  assert.equal(out.left.length, 3);
  assert.match(out.left.join(), /f\.json: needs server plugins, which the suite's offline lanes run without \(story-orchestrator-lore\)/);
  assert.match(out.left.join(), /b\.json: needs a prior step/);
  assert.match(out.left.join(), /d\.json: decision fix/);
  const wrong = noModelScenarios(rows, (path) => (path === 'a.json' ? 'any' : classes[path]), (list) => noLlmPartition(list).noModel);
  assert.match(wrong.problems.join(), /a\.json: on the no-LLM no-model list but declares model any/);
});

test('journeys contribute their none checks whose dependencies are none', () => {
  const journeys = [
    { id: 'J1', checks: [{ id: 'J1.1', model: 'any' }, { id: 'J1.2', model: 'none', dependsOn: ['J1.1'] }, { id: 'J1.3', model: 'none' }, { id: 'J1.4', model: 'none', mode: 'human' }] },
    { id: 'J2', checks: [{ id: 'J2.1', model: 'judged' }] },
    { id: 'J3', status: 'reserved', checks: [{ id: 'J3.1', model: 'none' }] },
  ];
  assert.deepEqual(noModelJourneys(journeys), [{ id: 'J1', checks: ['J1.3'] }]);
});

test('a lane with a model, down or unseeded is refused', () => {
  const status = [
    { lane: 30, seeded: true, serverUp: true, noModel: true },
    { lane: 31, seeded: true, serverUp: true, noModel: false },
    { lane: 32, seeded: false, serverUp: false, noModel: false },
  ];
  assert.deepEqual(laneProblems(status, [30]), []);
  assert.match(laneProblems(status, [31]).join(), /lane 31: has a model/);
  assert.equal(laneProblems(status, [32]).length, 3);
  assert.match(laneProblems(status, [33]).join(), /not listed/);
});

test('the summary is ok only when every row is green', () => {
  assert.equal(summarizeBatch([]).ok, false);
  assert.equal(summarizeBatch([{ item: 'a', lane: 30, run: 1, status: 'GREEN' }]).ok, true);
  const mixed = summarizeBatch([
    { item: 'a', lane: 30, run: 1, status: 'GREEN' },
    { item: 'b', lane: 31, run: 1, status: 'RED', failures: ['FAIL x'] },
    { item: 'c', lane: 32, run: 1, status: 'NOT-RUNNABLE', notRunnable: 'needs group' },
    { item: 'd', lane: 33, run: 1, status: 'INCOMPLETE', evidence: { problems: ['no record'] } },
  ]);
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.counts, { GREEN: 1, RED: 1, INCOMPLETE: 1, 'NOT-RUNNABLE': 1 });
  assert.equal(mixed.lines.length, 3);
  assert.match(mixed.lines.join('\n'), /NOT-RUNNABLE +c \(lane 32\): needs group/);
});
test('lane prepare resets Story Orchestrator settings to defaults with a closed-port memory model', () => {
  const settings = {
    user_avatar: 'user-default.png',
    extension_settings: {
      disabledExtensions: ['memory', 'stable-diffusion'],
      memory: { promptInterval: 10, source: 'main' },
      vectors: { enabled_chats: true, source: 'transformers' },
      connectionManager: { profiles: [{ id: 'tc1', mode: 'tc', api: 'llamacpp' }, { id: 'tc2', mode: 'tc', api: 'llamacpp' }] },
      'story-orchestrator': { v2Stories: { a: 1 }, stories: { b: 2 }, settings: { stagecraft: { wardenEnabled: false }, worldInfo: { gatingMode: 'file' }, extraction: { profileId: 'tc2' }, sprites: { enabled: true } } },
    },
  };
  const { next, profileId } = prepareLaneSettings(settings);
  const home = next.extension_settings['story-orchestrator'];
  assert.equal(profileId, 'tc2');
  assert.deepEqual(home.settings, { judge: { enabled: false }, image: { enabled: false }, sprites: { enabled: false, explicit: true }, help: { onboardingSeen: true }, extraction: { profileId: 'tc2' } });
  assert.equal('v2Stories' in home, false);
  assert.deepEqual(home.stories, { b: 2 });
  assert.deepEqual(next.extension_settings.disabledExtensions, ['stable-diffusion']);
  assert.equal(next.extension_settings.memory.promptInterval, 0);
  assert.equal(next.extension_settings.vectors.enabled_chats, false);
  assert.deepEqual(next.accountStorage, { NavLockOn: 'false', NavOpened: 'false', WINavOpened: 'false' });
  assert.deepEqual(next.extension_settings.connectionManager.profiles.at(-1), KEYLESS_CC_PROFILE);
  assert.equal(settings.extension_settings['story-orchestrator'].settings.worldInfo.gatingMode, 'file');
  const again = prepareLaneSettings(next);
  assert.equal(again.next.extension_settings.connectionManager.profiles.filter((profile: { api: string }) => profile.api === 'deepseek').length, 1);
  const stale = prepareLaneSettings({ extension_settings: { connectionManager: { profiles: [{ id: 'tc1', mode: 'tc' }] }, 'story-orchestrator': { settings: { extraction: { profileId: 'gone' } } } } });
  assert.equal(stale.profileId, 'tc1');
});

test('the stretch group file names the group and its two members', () => {
  const group = stretchGroupFile(1, 'chat');
  assert.equal(group.name, STRETCH_GROUP);
  assert.deepEqual(group.chats, ['chat']);
  assert.equal(group.id, '1');
});

test('a lane probe that misses any prepared condition is refused', () => {
  const good = { image: false, sprites: false, judge: false, profileId: 'tc1', stretch: true, cast: true, arin: true, memory: true, sd: true, deepseek: true };
  assert.deepEqual(prepareProblems(good), []);
  assert.match(prepareProblems({ ...good, image: true }).join(), /image reads true/);
  assert.match(prepareProblems({ ...good, profileId: null }).join(), /no memory model/);
  assert.deepEqual(prepareProblems(null), ['the lane page could not be probed']);
});
