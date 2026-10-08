import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOUD_SINK_PORT, judgeShareEnv, laneHeaderField, parsePodArg, podLoadProblem, podPortOf, podPortsIn, podTunnelPort, readLanePod, retargetPodUrls, retargetProfiles } from './lanePods.mts';
import { offlineProblems } from './laneModel.mts';
import { laneLoadProblem } from '../st-lanes.mts';

const settings = (urls: Array<string | undefined>) => ({
  main_api: 'textgenerationwebui',
  extension_settings: {
    other: { keep: true },
    connectionManager: { selectedProfile: 'p0', profiles: urls.map((url, index) => ({ id: `p${index}`, name: `P${index}`, ...(url === undefined ? {} : { 'api-url': url }) })) },
  },
});

test('pod k tunnels on 18080+k; cloud on the closed sink port; anything else is refused', () => {
  assert.equal(podTunnelPort(0), 18080);
  assert.equal(podTunnelPort(3), 18083);
  assert.equal(podTunnelPort(null), CLOUD_SINK_PORT);
  assert.equal(parsePodArg('2'), 2);
  assert.equal(parsePodArg('cloud'), null);
  for (const bad of [undefined, '', '-1', '10', 'x', '1.5']) assert.equal(parsePodArg(bad), undefined, String(bad));
});

test('only loopback pod-tunnel urls are pod ports; a local model server or a remote url is not', () => {
  assert.equal(podPortOf('http://127.0.0.1:18080'), 18080);
  assert.equal(podPortOf('http://localhost:18083/'), 18083);
  assert.equal(podPortOf(`http://127.0.0.1:${CLOUD_SINK_PORT}`), CLOUD_SINK_PORT);
  for (const other of ['http://127.0.0.1:1235', 'http://127.0.0.1:18090', 'https://abc-8080.proxy.runpod.net', 'http://10.0.0.5:18080', 'not a url', undefined, 7]) assert.equal(podPortOf(other), null, String(other));
});

test('retargeting moves every pod-tunnel profile to the pod, keeps the trailing slash as written, touches nothing else', () => {
  const before = settings(['http://127.0.0.1:18080', 'http://127.0.0.1:18080/', 'http://127.0.0.1:1235', 'https://api.deepseek.com', undefined]);
  const { next, changed } = retargetProfiles(before, 18082);
  const profiles = (next.extension_settings as any).connectionManager.profiles;
  assert.deepEqual(profiles.map((profile: any) => profile['api-url']), ['http://127.0.0.1:18082', 'http://127.0.0.1:18082/', 'http://127.0.0.1:1235', 'https://api.deepseek.com', undefined]);
  assert.deepEqual(changed.map((entry) => entry.name), ['P0', 'P1']);
  assert.deepEqual((next.extension_settings as any).other, { keep: true });
  assert.equal(next.main_api, 'textgenerationwebui');
  assert.equal((before.extension_settings.connectionManager.profiles[0] as any)['api-url'], 'http://127.0.0.1:18080', 'the input is not mutated');
  assert.deepEqual(podPortsIn(next), [18082]);
});

test('retargeting back to pod 0 and to cloud round-trips; a second retarget to the same pod changes nothing', () => {
  const onPod = retargetProfiles(settings(['http://127.0.0.1:18080']), 18081).next;
  assert.deepEqual(retargetProfiles(onPod, 18081).changed, []);
  const cloud = retargetProfiles(onPod, podTunnelPort(null)).next;
  assert.deepEqual(podPortsIn(cloud), [CLOUD_SINK_PORT]);
  assert.deepEqual(podPortsIn(retargetProfiles(cloud, 18080).next), [18080]);
  assert.throws(() => retargetProfiles(null, 18080), /not an object/);
});

test('B1b H1: a lane moved to another pod also moves ST own echoes of the old pod url (textgen server_urls, connection history), and nothing else', () => {
  const echoed = { ...settings(['http://127.0.0.1:18080/']), textgenerationwebui_settings: { server_urls: { llamacpp: 'http://127.0.0.1:18080', ollama: 'http://127.0.0.1:18079', ooba: 'https://api.example.test' } }, history: [{ label: 'llamacpp', url: 'http://127.0.0.1:18080/' }, { label: 'x', url: 'http://127.0.0.1:8105/' }] };
  const { next, changed } = retargetPodUrls(retargetProfiles(echoed, podTunnelPort(null)).next, podTunnelPort(null));
  assert.deepEqual(changed, ['http://127.0.0.1:18080', 'http://127.0.0.1:18080']);
  assert.deepEqual((next as any).textgenerationwebui_settings.server_urls, { llamacpp: 'http://127.0.0.1:18079', ollama: 'http://127.0.0.1:18079', ooba: 'https://api.example.test' });
  assert.deepEqual((next as any).history.map((row: any) => row.url), ['http://127.0.0.1:18079/', 'http://127.0.0.1:8105/']);
  const onPod2 = retargetPodUrls(next, 18082).next;
  assert.equal((onPod2 as any).textgenerationwebui_settings.server_urls.llamacpp, 'http://127.0.0.1:18082');
  assert.equal((onPod2 as any).textgenerationwebui_settings.server_urls.ooba, 'https://api.example.test');
  assert.deepEqual(offlineProblems(onPod2, 8105, { podPort: 18082 }).filter((problem) => problem.includes('names')), [], 'the offline check accepts the moved lane');
  assert.ok(offlineProblems(echoed, 8105, { podPort: 18082 }).some((problem) => problem.includes('18080')), 'control: the unmoved echo is refused');
});

test('lane load counts model lanes per pod: two per pod pass on any number of pods, a third on one pod refuses and names it', () => {
  const four = [{ lane: 1, serverUp: true, pod: 0 }, { lane: 2, serverUp: true, pod: 0 }, { lane: 3, serverUp: true, pod: 1 }, { lane: 4, serverUp: true, pod: 1 }];
  assert.equal(podLoadProblem(four, 2), null);
  const crowded = podLoadProblem([...four, { lane: 5, serverUp: true, pod: 1 }], 2);
  assert.match(String(crowded), /3 lanes with a model are up on pod 1 \(3, 4, 5\), more than 2/);
  assert.match(String(crowded), /st-lanes\.mts pod <n> <k>/);
  assert.equal(podLoadProblem([...four, { lane: 5, serverUp: true, pod: null }, { lane: 6, serverUp: true, noModel: true, pod: 0 }, { lane: 7, serverUp: false, pod: 0 }], 2), null, 'cloud, no-model and stopped lanes count on no pod');
});

test('lane load control: without pod records every lane is pod 0, as before multi-pod', () => {
  const unassigned = laneLoadProblem([{ lane: 1, serverUp: true }, { lane: 2, serverUp: true }, { lane: 4, serverUp: true }]);
  assert.match(String(unassigned), /^3 lanes with a model are up \(1, 2, 4\), more than 2/);
  assert.equal(laneLoadProblem([{ lane: 1, serverUp: true, pod: 0 }, { lane: 2, serverUp: true, pod: 1 }, { lane: 4, serverUp: true, pod: 2 }]), null);
});

test('the pod record reads back; a missing or malformed one is null; the run-header field says which pod a lane used', () => {
  const root = mkdtempSync(join(tmpdir(), 'so-lane-pod-'));
  try {
    assert.equal(readLanePod(root), null);
    assert.deepEqual(laneHeaderField('3', root), { n: 3, pod: 0, port: null, podId: null });
    writeFileSync(join(root, 'pod.json'), JSON.stringify({ pod: 2, port: 18082, podId: 'abc123', at: '2026-10-07T00:00:00Z' }));
    assert.deepEqual(readLanePod(root), { pod: 2, port: 18082, podId: 'abc123', at: '2026-10-07T00:00:00Z' });
    assert.deepEqual(laneHeaderField('3', root), { n: 3, pod: 2, port: 18082, podId: 'abc123' });
    writeFileSync(join(root, 'pod.json'), JSON.stringify({ pod: null, port: CLOUD_SINK_PORT, podId: null }));
    assert.equal(laneHeaderField('3', root)?.pod, null);
    writeFileSync(join(root, 'pod.json'), '{broken');
    assert.equal(readLanePod(root), null);
    writeFileSync(join(root, 'pod.json'), JSON.stringify({ pod: 'one', port: 18081 }));
    assert.equal(readLanePod(root), null);
    assert.equal(laneHeaderField(undefined, root), null);
    assert.equal(laneHeaderField('main', root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('k judge lanes each get 1/k of the TypeSafe account, so together they ask for one account', () => {
  assert.deepEqual(judgeShareEnv(1), { SO_JUDGE_ACCOUNT_RATE_PER_MIN: '1200', SO_JUDGE_ACCOUNT_TOKENS_PER_SEC: '250000' });
  assert.deepEqual(judgeShareEnv(8), { SO_JUDGE_ACCOUNT_RATE_PER_MIN: '150', SO_JUDGE_ACCOUNT_TOKENS_PER_SEC: '31250' });
  const lanes = 6;
  assert.ok(lanes * Number(judgeShareEnv(lanes).SO_JUDGE_ACCOUNT_RATE_PER_MIN) <= 1200);
  assert.deepEqual(judgeShareEnv(0), judgeShareEnv(1));
});

test('a memory pod port named in SO_LANE_MEMORY_PORT is allowed beside the lane pod, and only then', async () => {
  const { memoryPodPorts, firewalledServerEnv } = await import('./laneModel.mts');
  assert.deepEqual(memoryPodPorts({ SO_LANE_MEMORY_PORT: '18085' }), [18085]);
  assert.deepEqual(memoryPodPorts({}), []);
  const settings = { extension_settings: { connectionManager: { profiles: [{ 'api-url': 'http://127.0.0.1:18082' }, { 'api-url': 'http://127.0.0.1:18085' }] } } };
  assert.ok(offlineProblems(settings, 8105, { podPort: 18082 }).some((problem) => problem.includes('18085')), 'control: without the memory port the profile is refused');
  assert.ok(!offlineProblems(settings, 8105, { podPort: 18082, extraPorts: [18085] }).some((problem) => problem.includes('18085')));
  assert.equal(firewalledServerEnv('x.mjs', 8105, 18082, {}, [18085]).SO_LANE_FIREWALL_ALLOW, '8105,18082,18085');
});

test('the local controller port is reachable only for a lane started with --allow-local', async () => {
  const { laneExtraPorts, LOCAL_CONTROLLER_PORT } = await import('./laneModel.mts');
  assert.deepEqual(laneExtraPorts(null, false, {}), []);
  assert.deepEqual(laneExtraPorts(null, true, {}), [LOCAL_CONTROLLER_PORT]);
  assert.deepEqual(laneExtraPorts(2, false, { SO_LANE_MEMORY_PORT: '18085' }), [18085]);
  assert.deepEqual(laneExtraPorts(null, false, { SO_LANE_MEMORY_PORT: '18085' }), [], 'a cloud lane never inherits a memory pod port');
  const settings = { extension_settings: { connectionManager: { profiles: [{ 'api-url': 'http://127.0.0.1:18888' }] } } };
  assert.ok(offlineProblems(settings, 8110, { podPort: null }).some((problem) => problem.includes('18888')), 'control: without the opt-in the controller is refused');
  assert.ok(!offlineProblems(settings, 8110, { podPort: null, extraPorts: laneExtraPorts(null, true, {}) }).some((problem) => problem.includes('18888')));
});
