import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batchReplayPlan, replayProfiles, replayUrlsIn, restoreProfiles } from './laneReplay.mts';
import { offlineProblems } from './laneModel.mts';

const settings = () => ({
  textgenerationwebui_settings: { server_urls: { llamacpp: 'http://127.0.0.1:18079', ooba: 'http://127.0.0.1:18079/' } },
  extension_settings: {
    connectionManager: {
      profiles: [
        { id: 'p1', name: 'Artemis Local', api: 'llamacpp', 'api-url': 'http://127.0.0.1:18888' },
        { id: 'p2', name: 'Memory', api: 'llamacpp', 'api-url': 'http://127.0.0.1:18079' },
        { id: 'p3', name: 'DeepSeek', api: 'deepseek', 'api-url': 'https://api.deepseek.com' },
        { id: 'p4', name: 'Remote llama', api: 'llamacpp', 'api-url': 'https://example.org:8080' },
      ],
    },
  },
});

test('replay on points every loopback llama.cpp profile and ST\'s llama.cpp URL at the lane session; off puts them back', () => {
  const { next, replay, changed } = replayProfiles(settings(), 41);
  assert.equal(replay.url, 'http://127.0.0.1:18078/lane/41');
  assert.deepEqual(changed, ['Artemis Local', 'Memory']);
  assert.deepEqual(replay.previous, { profiles: { p1: 'http://127.0.0.1:18888', p2: 'http://127.0.0.1:18079' }, serverUrl: 'http://127.0.0.1:18079' });
  const profiles = (next.extension_settings as any).connectionManager.profiles;
  assert.deepEqual(profiles.map((profile: any) => profile['api-url']), ['http://127.0.0.1:18078/lane/41', 'http://127.0.0.1:18078/lane/41', 'https://api.deepseek.com', 'https://example.org:8080']);
  assert.equal((next.textgenerationwebui_settings as any).server_urls.llamacpp, 'http://127.0.0.1:18078/lane/41');
  assert.equal((next.textgenerationwebui_settings as any).server_urls.ooba, 'http://127.0.0.1:18079/');
  assert.deepEqual(replayUrlsIn(next), ['http://127.0.0.1:18078/lane/41', 'https://example.org:8080']);
  const back = restoreProfiles(next, replay);
  assert.deepEqual(back.restored, ['Artemis Local', 'Memory']);
  assert.deepEqual(back.next, settings());
});

test('an offline lane pointed at the replay port is still offline', () => {
  const offline = {
    extension_settings: { 'story-orchestrator': { settings: { image: { enabled: false }, judge: { enabled: false } } }, disabledExtensions: ['stable-diffusion'], connectionManager: { profiles: [{ id: 'p', api: 'llamacpp', 'api-url': 'http://127.0.0.1:18078/lane/30' }] } },
    power_user: { default_persona: null }, user_avatar: 'user-default.png',
  };
  assert.deepEqual(offlineProblems(offline, 8130), []);
  const leaking = { ...offline, extension_settings: { ...offline.extension_settings, connectionManager: { profiles: [{ id: 'p', api: 'llamacpp', 'api-url': 'http://127.0.0.1:18888' }] } } };
  assert.match(offlineProblems(leaking, 8130).join(' '), /18888/);
});

test('batchReplayPlan: replay defaults to any (none rows belong on no-model lanes) and refuses judged; record and mixed need model lanes; every lane must be a replay lane', () => {
  const lanes = [{ lane: 41, replay: true, noModel: true }];
  assert.equal(batchReplayPlan({ replay: null, record: null, liveMisses: false, model: null, upstream: null }, lanes), null);
  assert.throws(() => batchReplayPlan({ replay: null, record: null, liveMisses: true, model: null, upstream: null }, lanes), /needs --replay/);
  assert.deepEqual(batchReplayPlan({ replay: 'gs1', record: null, liveMisses: false, model: null, upstream: null }, lanes), { mode: 'replay', store: 'gs1', model: 'any', upstream: null, usesModel: false });
  assert.throws(() => batchReplayPlan({ replay: 'gs1', record: null, liveMisses: false, model: 'any,judged', upstream: null }, lanes), /cannot run judged/);
  assert.throws(() => batchReplayPlan({ replay: 'gs1', record: null, liveMisses: false, model: null, upstream: null }, [{ lane: 42, replay: false, noModel: false }]), /42 are not pointed/);
  assert.throws(() => batchReplayPlan({ replay: null, record: 'gs1', liveMisses: false, model: null, upstream: null }, lanes), /no-model lanes/);
  assert.throws(() => batchReplayPlan({ replay: 'a', record: 'b', liveMisses: false, model: null, upstream: null }, lanes), /not both/);
  const model = [{ lane: 45, replay: true, noModel: false }];
  assert.deepEqual(batchReplayPlan({ replay: null, record: 'gs1', liveMisses: false, model: null, upstream: null }, model), { mode: 'record', store: 'gs1', model: 'any,judged', upstream: 'http://127.0.0.1:18888', usesModel: true });
  assert.deepEqual(batchReplayPlan({ replay: 'gs1', record: null, liveMisses: true, model: 'any', upstream: 'http://127.0.0.1:18080' }, model), { mode: 'mixed', store: 'gs1', model: 'any', upstream: 'http://127.0.0.1:18080', usesModel: true });
});
