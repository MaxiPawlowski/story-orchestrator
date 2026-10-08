import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { arm, blocked, connectTarget, parseAllow } from './lib/laneFirewall.mjs';
import { firewalledServerEnv, FIREWALL_ALLOW_ENV, offlineProblems, offlineSettings, withJudgeEnabled } from './lib/laneModel.mts';
import { retargetProfiles } from './lib/lanePods.mts';

const install = () => ({
  textgenerationwebui_settings: { server_urls: { llamacpp: 'http://127.0.0.1:18888' } },
  extension_settings: {
    connectionManager: { profiles: [{ name: 'local', 'api-url': 'http://127.0.0.1:18888' }, { name: 'pod', 'api-url': 'http://127.0.0.1:18080' }] },
    'story-orchestrator': { settings: { judge: { enabled: true }, image: { enabled: true }, sprites: { enabled: true } } },
  },
  power_user: { default_persona: 'owner.png' },
  user_avatar: 'owner.png',
});

test('connectTarget reads every net connect shape; unix paths and named pipes are never loopback ports', () => {
  assert.deepEqual(connectTarget([{ host: '127.0.0.1', port: 18888 }]), { host: '127.0.0.1', port: 18888 });
  assert.deepEqual(connectTarget([8188, '127.0.0.1']), { host: '127.0.0.1', port: 8188 });
  assert.deepEqual(connectTarget([8188]), { host: 'localhost', port: 8188 });
  assert.deepEqual(connectTarget([[{ port: 18888, host: 'localhost' }, null]]), { host: 'localhost', port: 18888 });
  assert.equal(connectTarget([{ path: '\\\\.\\pipe\\x' }]), null);
  assert.equal(connectTarget(['/tmp/sock']), null);
});

test('blocked refuses every loopback port but the allowed ones and never a remote host', () => {
  const allow = parseAllow('8101,18080');
  assert.equal(blocked({ host: '127.0.0.1', port: 18888 }, allow), true);
  assert.equal(blocked({ host: 'localhost', port: 8188 }, allow), true);
  assert.equal(blocked({ host: '::1', port: 8000 }, allow), true);
  assert.equal(blocked({ host: '127.0.0.1', port: 18080 }, allow), false);
  assert.equal(blocked({ host: '127.0.0.1', port: 8101 }, allow), false);
  assert.equal(blocked({ host: 'api.typesafe.ai', port: 443 }, allow), false);
  assert.equal(blocked(null, allow), false);
});

test('an armed firewall refuses a real loopback connection to a blocked port and lets an allowed one through', async () => {
  const server = net.createServer((socket) => socket.end('ok'));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const open = (server.address() as net.AddressInfo).port;
  const lines: string[] = [];
  const disarm = arm(new Set([open]), (line) => lines.push(line));
  try {
    const refused = await new Promise<string>((done) => {
      const socket = net.connect({ host: '127.0.0.1', port: open + 1 });
      socket.on('error', (error: NodeJS.ErrnoException) => done(String(error.code)));
      socket.on('connect', () => done('connected'));
    });
    assert.equal(refused, 'ECONNREFUSED');
    const allowed = await new Promise<string>((done) => {
      const socket = net.connect({ host: '127.0.0.1', port: open });
      socket.on('data', (data) => { done(String(data)); socket.destroy(); });
      socket.on('error', (error) => done(`error ${error.message}`));
    });
    assert.equal(allowed, 'ok');
    assert.ok(lines.some((line) => line.includes(`blocked 127.0.0.1:${open + 1}`)));
    assert.ok(lines[0].includes('armed'));
  } finally {
    disarm();
    server.close();
  }
});

test('an offline lane on a pod may name its pod tunnel port and keep the judge on; any other loopback port still fails', () => {
  const offline = offlineSettings(install(), 8101).next;
  const onPod = withJudgeEnabled(retargetProfiles(offline, 18081).next, true);
  assert.deepEqual(offlineProblems(onPod, 8101, { podPort: 18081 }), []);
  assert.deepEqual(offlineProblems(onPod, 8101), ['settings.json still names http://127.0.0.1:18081', 'judge.enabled is not false']);
  const leaked = JSON.parse(JSON.stringify(onPod));
  leaked.textgenerationwebui_settings.server_urls.llamacpp = 'http://127.0.0.1:18888';
  assert.deepEqual(offlineProblems(leaked, 8101, { podPort: 18081 }), ['settings.json still names http://127.0.0.1:18888']);
  assert.deepEqual(offlineProblems(onPod, 8101, { podPort: null }), ['settings.json still names http://127.0.0.1:18081']);
});

test('firewalledServerEnv preloads the firewall and allows only the lane and pod ports', () => {
  const env = firewalledServerEnv('C:/x/laneFirewall.mjs', 8101, 18081, { NODE_OPTIONS: '--max-old-space-size=4096' });
  assert.match(env.NODE_OPTIONS, /^--max-old-space-size=4096 --import=file:\/\/\/C:\/x\/laneFirewall\.mjs$/);
  assert.equal(env[FIREWALL_ALLOW_ENV], '8101,18081');
  assert.equal(firewalledServerEnv('C:/x/f.mjs', 8101, null, {})[FIREWALL_ALLOW_ENV], '8101');
});
