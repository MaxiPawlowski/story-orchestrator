import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetFromArgs } from './so-pod.mts';

test('a RunPod target keeps the default known_hosts alias; an explicit --known-hosts (Vast) drops it, none drops both', () => {
  const env = { SO_POD_KNOWN_HOSTS: 'C:/dev/so-pod-test-missing/known_hosts' } as NodeJS.ProcessEnv;
  const vast = targetFromArgs(1, ['--host', 'ssh4.vast.ai', '--ssh-port', '41234', '--key', 'K', '--known-hosts', 'KH'], env);
  assert.equal(vast.localPort, 18081);
  assert.equal(vast.key, 'K');
  assert.equal(vast.knownHosts, 'KH');
  assert.equal(vast.hostKeyAlias, null);
  assert.equal(vast.user, 'root');
  assert.equal(vast.remotePort, 8080);
  assert.equal(targetFromArgs(1, ['--host', 'h', '--ssh-port', '22', '--remote-port', '18080'], env).remotePort, 18080);
  assert.throws(() => targetFromArgs(1, ['--host', 'h', '--ssh-port', '22', '--remote-port', 'x'], env), /--remote-port/);
  const aliased = targetFromArgs(1, ['--host', 'h', '--ssh-port', '22', '--known-hosts', 'KH', '--host-key-alias', 'a'], env);
  assert.equal(aliased.hostKeyAlias, 'a');
  const none = targetFromArgs(0, ['--host', 'h', '--ssh-port', '22', '--known-hosts', 'none'], env);
  assert.equal(none.knownHosts, null);
  assert.equal(none.hostKeyAlias, null);
  assert.throws(() => targetFromArgs(0, ['--host', 'h'], env), /--ssh-port/);
});
