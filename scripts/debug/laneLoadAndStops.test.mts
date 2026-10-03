import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isIntegrationPlay, laneLoadProblem } from './st-lanes.mts';
import { chatDriftStop, mutationStop } from './lib/integrationRuns.mts';
import { revealSettingsControl } from './so-ui.mts';

const g = globalThis as Record<string, any>;
afterEach(() => { delete g.document; });

test('lane load: more than two lanes with a model refuses, no-model and stopped lanes do not count', () => {
  const lanes = [{ lane: 1, serverUp: true }, { lane: 2, serverUp: true }, { lane: 3, serverUp: false }, { lane: 5, serverUp: true, noModel: true }];
  assert.equal(laneLoadProblem(lanes), null);
  const loaded = laneLoadProblem([...lanes, { lane: 4, serverUp: true }]);
  assert.match(String(loaded), /3 lanes with a model are up \(1, 2, 4\), more than 2/);
  assert.match(String(loaded), /--allow-load/);
  assert.equal(laneLoadProblem([...lanes, { lane: 4, serverUp: true }], 3), null);
  assert.equal(isIntegrationPlay(['scripts/debug/so-integration.mts', 'play', 'I4']), true);
  assert.equal(isIntegrationPlay(['scripts/debug/so-integration.mts', 'settings', 'I4']), false);
  assert.equal(isIntegrationPlay(['scripts/debug/so-run-header.mts', 'capture']), false);
});

test('integration I4: a failed chat switch is a hard stop, and so is any drift away from the run chat', () => {
  assert.match(String(mutationStop('switch-chat-mid-gen', { ok: false, problems: ['open chat did not settle within 60000 ms'] }, 'chat-b', 'chat-a')), /switch-chat-mid-gen failed \(open chat did not settle within 60000 ms\): a failed chat switch is a hard stop/);
  assert.match(String(mutationStop('reload-mid-gen', { ok: false }, 'chat-a', 'chat-a')), /no reason given/);
  assert.match(String(mutationStop('switch-chat-mid-gen', { ok: true }, 'chat-b', 'chat-a')), /after switch-chat-mid-gen: the open chat is chat-b, not the run's chat chat-a/);
  assert.match(String(mutationStop('edit', { ok: false, problems: ['x'] }, null, 'chat-a')), /the open chat is none/);
  assert.equal(mutationStop('edit', { ok: false, problems: ['x'] }, 'chat-a', 'chat-a'), null, 'a failed edit in the right chat is a finding, not a stop');
  assert.equal(mutationStop('switch-chat-mid-gen', { ok: true }, 'chat-a', 'chat-a'), null);
  assert.equal(chatDriftStop('chat-a', 'chat-a', 'before turn 74'), null);
  assert.match(String(chatDriftStop('chat-b', 'chat-a', 'before turn 74')), /^before turn 74: /);
});

function details(open: boolean, parent: any = null) {
  return { tagName: 'DETAILS', open, parentElement: parent };
}

test('the memory-profile select is revealed: the collapsed general setup and every ancestor details open', async () => {
  const general = details(false);
  const lazy = details(false, { tagName: 'DIV', parentElement: general });
  const select = { tagName: 'SELECT', parentElement: lazy };
  g.document = { querySelector: (selector: string) => (selector === '#so-general-setup' ? general : selector === '#so-extraction-profile' ? select : null) };
  const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
  const state = await revealSettingsControl(page, '#so-extraction-profile', { timeoutMs: 0 });
  assert.deepEqual(state, { found: true, opened: 1 });
  assert.equal(general.open, true);
  assert.equal(lazy.open, true);
});

test('a control that never mounts is reported not found after the wait, never as revealed', async () => {
  let reads = 0;
  g.document = { querySelector: () => { reads += 1; return null; } };
  const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
  const state = await revealSettingsControl(page, '#so-extraction-profile', { timeoutMs: 30, pollMs: 5 });
  assert.deepEqual(state, { found: false, opened: 0 });
  assert.ok(reads > 2, 'it polled while the lazy group could still mount');
});
