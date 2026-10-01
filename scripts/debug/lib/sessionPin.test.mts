import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { judgeExpectation, pinVerdict, probeProfile, readRouting, selectMainProfile, type Routing } from './sessionPin.mts';
import { fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';

const realFetch = globalThis.fetch;
afterEach(() => { uninstall(); globalThis.fetch = realFetch; delete (globalThis as any).performance?.soFake; });

const PROFILES = [
  { id: 'art', name: 'Artemis RunPod RP', api: 'textgenerationwebui', 'api-url': 'http://127.0.0.1:18080', preset: 'Artemis v1.1 RP', 'secret-id': 'hidden' },
  { id: 'ds', name: 'DeepSeek flash', api: 'deepseek', model: 'deepseek-chat' },
];
const ROLES = ['read', 'synthesis', 'authoring', 'director', 'curator', 'inner'];

function pinnedPage({ judge = true, key = true, sendRequest = async () => ({ content: 'PONG' }) } = {}) {
  const fake = fakeSt();
  fake.ctx.extensionSettings = { connectionManager: { profiles: PROFILES, selectedProfile: 'ds' } };
  fake.ctx.getRequestHeaders = () => ({});
  fake.ctx.ConnectionManagerRequestService = { sendRequest };
  fake.ctx.powerUserSettings = { reasoning: { auto_parse: true, add_to_prompts: false } };
  fake.ctx.executeSlashCommandsWithOptions = async (command: string) => {
    const name = command.replace(/^\/profile /, '');
    fake.ctx.extensionSettings.connectionManager.selectedProfile = PROFILES.find((profile) => profile.name === name)?.id ?? null;
  };
  fake.state.snapshot.roleRoutes = ROLES.map((role) => ({ role, profileId: 'ds', state: 'ok', effort: 'default' }));
  Object.assign(fake.runtime, { getGlobalSettings: () => ({ judge: { enabled: judge, uses: { director: judge } }, extraction: {} }) });
  install(fake);
  globalThis.fetch = (async () => ({ status: 200, ok: true, json: async () => ({ configured: key }) })) as any;
  return fake;
}

test('pin: the main profile is selected, every role is read with its profile name, secrets are dropped', async () => {
  pinnedPage();
  const selected = await selectMainProfile(fakePage(), 'Artemis RunPod RP');
  assert.deepEqual(selected, { ok: true, id: 'art' });
  const routing = await readRouting(fakePage());
  assert.equal(routing.main.selectedProfileName, 'Artemis RunPod RP');
  assert.deepEqual(routing.roles.map((role) => role.profileName), ROLES.map(() => 'DeepSeek flash'));
  assert.equal('secret-id' in routing.profiles[0].fields, false);
  assert.equal(routing.profiles[0].fields.preset, 'Artemis v1.1 RP');
  assert.deepEqual(routing.judge, { enabled: true, uses: { director: true }, provider: null, pluginHttp: 200, keyPresent: true });
  assert.deepEqual(routing.reasoning, { budget: 'default', powerUser: { auto_parse: true, add_to_prompts: false } });
});

test('pin: an unknown main profile is refused with the names on offer', async () => {
  pinnedPage();
  const selected = await selectMainProfile(fakePage(), 'Artemis RunPod');
  assert.equal(selected.ok, false);
  assert.match(String(selected.reason), /no Connection Manager profile named "Artemis RunPod" \(have Artemis RunPod RP, DeepSeek flash\)/);
});

test('pin: the probe answers, and a dead backend fails it', async () => {
  pinnedPage();
  assert.deepEqual({ ...(await probeProfile(fakePage(), 'Artemis RunPod RP')), ms: 0 }, { profile: 'Artemis RunPod RP', ok: true, ms: 0, text: 'PONG', error: null });
  pinnedPage({ sendRequest: async () => { throw new Error('API request failed'); } });
  const dead = await probeProfile(fakePage(), 'Artemis RunPod RP');
  assert.equal(dead.ok, false);
  assert.equal(dead.error, 'API request failed');
});

const routing = (patch: Partial<Routing> = {}): Routing => ({
  main: { selectedProfileId: 'art', selectedProfileName: 'Artemis RunPod RP', mainApi: 'textgenerationwebui', onlineStatus: 'artemis' },
  profiles: [],
  roles: ROLES.map((role) => ({ role, profileId: 'ds', profileName: 'DeepSeek flash', state: 'ok', effort: 'default', reasoning: null })),
  judge: { enabled: true, uses: {}, provider: null, pluginHttp: 200, keyPresent: true },
  reasoning: { budget: 'default', powerUser: {} },
  ...patch,
});
const probe = { profile: 'Artemis RunPod RP', ok: true, ms: 10, text: 'PONG', error: null };
const expect = { mainProfile: 'Artemis RunPod RP', orchestrator: /deepseek/i, judge: 'on' as const };

test('pin verdict: a clean routing passes; each wrong part is named', () => {
  assert.deepEqual(pinVerdict(routing(), probe, expect), { ok: true, problems: [] });
  const bad = pinVerdict(routing({
    main: { selectedProfileId: 'x', selectedProfileName: 'Other', mainApi: null, onlineStatus: null },
    roles: routing().roles.map((role) => (role.role === 'director' ? { ...role, profileName: 'Artemis RunPod RP' } : role.role === 'inner' ? { ...role, effort: null } : role)).filter((role) => role.role !== 'curator'),
    judge: { enabled: true, uses: {}, provider: null, pluginHttp: 404, keyPresent: null },
  }), { ...probe, ok: false, error: 'API request failed' }, expect);
  assert.equal(bad.ok, false);
  for (const needle of ['main profile is "Other"', 'did not answer a tiny probe: API request failed', 'role "director" routes to "Artemis RunPod RP"', 'role "curator" has no route', 'role "inner" reports no reasoning effort', 'its key is unreadable (plugin http 404)']) {
    assert.ok(bad.problems.some((problem) => problem.includes(needle)), `missing "${needle}" in ${bad.problems.join(' | ')}`);
  }
  assert.ok(pinVerdict(routing(), probe, { ...expect, judge: 'off' }).problems.includes('the judge is on, the card switches it off'));
  assert.ok(pinVerdict(routing({ judge: { enabled: true, uses: {}, provider: null, pluginHttp: 200, keyPresent: false } }), probe, expect).problems.some((problem) => problem.includes('key is absent')));
  assert.equal(judgeExpectation('off'), 'off');
  assert.equal(judgeExpectation({ director: false }), 'mixed');
  assert.equal(judgeExpectation('defaults'), 'on');
});
