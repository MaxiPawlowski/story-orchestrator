// v2.4 plan 01 (X4, X10): the interop verbs, driven through the real functions against a fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyExtSetting, cutCommand, expectOverSteer, generationEvents, pendingExtSettingRestores, readOverSteer, restoreExtSettings, stateDifferences, type RecordedState } from './interopVerbs.mts';

const page = {
  evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => (String(fn).includes("'/script.js'") ? true : fn(arg)),
  waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
};

const withSettings = (extensionSettings: Record<string, Record<string, unknown>>) => {
  (globalThis as { SillyTavern?: unknown }).SillyTavern = { getContext: () => ({ extensionSettings }) };
  return extensionSettings;
};

test('cut takes one id or a range and nothing else', () => {
  assert.equal(cutCommand('3-5'), '/cut 3-5');
  assert.equal(cutCommand(4), '/cut 4');
  assert.throws(() => cutCommand('3,5'), /expected "a" or "a-b"/);
  assert.throws(() => cutCommand('/cut 3'), /expected/);
});

test('emit_generation names event_types KEYS and carries args as a list', () => {
  assert.deepEqual(generationEvents([{ event: 'GENERATION_STARTED', args: [{ source: 'gg' }] }, { event: 'GENERATION_ENDED' }]), [
    { event: 'GENERATION_STARTED', args: [{ source: 'gg' }] },
    { event: 'GENERATION_ENDED', args: [] },
  ]);
  assert.throws(() => generationEvents([]), /non-empty list/);
  assert.throws(() => generationEvents([{ event: 'generation_started' }]), /event_types KEY/);
  assert.throws(() => generationEvents([{ event: 'GENERATION_ENDED', args: 3 }]), /args must be a list/);
});

test('ext_setting writes in place and the restore puts back the value AND its absence', async () => {
  const settings = withSettings({ 'st-stepped-thinking': { is_enabled: false } });
  const holderBefore = settings['st-stepped-thinking'];
  await applyExtSetting(page as never, { extension: 'st-stepped-thinking', key: 'is_enabled', value: true });
  await applyExtSetting(page as never, { extension: 'st-stepped-thinking', key: 'mode', value: 'separated' });
  assert.equal(settings['st-stepped-thinking'], holderBefore, 'the extension reads its settings object by reference, so the write must be in place');
  assert.deepEqual(settings['st-stepped-thinking'], { is_enabled: true, mode: 'separated' });
  assert.equal(pendingExtSettingRestores(), 2);
  const restored = await restoreExtSettings(page as never);
  assert.equal(restored.ok, true);
  assert.deepEqual(settings['st-stepped-thinking'], { is_enabled: false }, 'a key that did not exist is removed, not set to undefined');
  assert.equal(pendingExtSettingRestores(), 0);
});

test('control: a second write to the same key restores to the FIRST value, not the intermediate one', async () => {
  const settings = withSettings({ ext: { key: 'original' } });
  await applyExtSetting(page as never, { extension: 'ext', key: 'key', value: 'first' });
  await applyExtSetting(page as never, { extension: 'ext', key: 'key', value: 'second' });
  await restoreExtSettings(page as never);
  assert.equal(settings.ext.key, 'original');
});

const recorded = (): RecordedState => ({
  engine: { values: { a: 1, b: true }, versions: { a: 2 }, active: 'cp1', path: ['start', 'cp1'], boundary: 3 },
  rows: { memory: ['m1', 'm2'], epistemic: ['e1'], ledger: [] },
});

test('stateEquals: equal recordings compare equal, key order does not matter', () => {
  const now = recorded();
  now.engine.values = { b: true, a: 1 };
  assert.deepEqual(stateDifferences(recorded(), now), []);
});

test('stateEquals names every scoped field that differs, and a scope narrows the comparison', () => {
  const now = recorded();
  now.engine.active = 'cp2';
  now.rows.memory = ['m1', 'm2', 'm3'];
  const all = stateDifferences(recorded(), now);
  assert.equal(all.length, 2);
  assert.match(all.join(' | '), /active: recorded "cp1" now "cp2"/);
  assert.match(all.join(' | '), /memory:/);
  assert.deepEqual(stateDifferences(recorded(), now, ['values', 'epistemic']), []);
  assert.throws(() => stateDifferences(recorded(), now, ['blackboard']), /unknown scope blackboard/);
});

const GUIDANCE = 'Scene direction: The sphinx blocks the only way in.';
const withChat = (chat: Array<Record<string, unknown>>, captures: Array<{ blocks: Array<{ key: string; value: string }> }>, current: string | null) => {
  (globalThis as { SillyTavern?: unknown }).SillyTavern = { getContext: () => ({ chat, extensionPrompts: current === null ? {} : { story_orchestrator_guidance: { value: current } } }) };
  (globalThis as { storyOrchestratorRuntime?: unknown }).storyOrchestratorRuntime = { getPayloadCaptures: () => captures };
};

test('overSteer reads the newest capture that carried the block and the last character reply, skipping user and system rows', async () => {
  withChat(
    [{ mes: 'greeting', is_user: false }, { mes: 'I ask about the door.', is_user: true }, { mes: 'The sphinx lowers its head.', is_user: false }, { mes: '◈ Note', is_system: true }],
    [{ blocks: [{ key: 'story_orchestrator_guidance', value: 'older' }] }, { blocks: [{ key: 'story_orchestrator_guidance', value: GUIDANCE }] }, { blocks: [] }],
    '',
  );
  (globalThis as Record<string, unknown>).__soControl = 'The sphinx waits.';
  const reading = await readOverSteer(page as never, { block: 'story_orchestrator_guidance', family: 'guidance', controlRun: { global: '__soControl' } });
  assert.deepEqual(reading, { captured: GUIDANCE, current: '', reply: 'The sphinx lowers its head.', control: 'The sphinx waits.' });
  const verdict = await expectOverSteer(page as never, { block: 'story_orchestrator_guidance', family: 'guidance', controlRun: { global: '__soControl' } });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.swing?.controlWords, 3);
  delete (globalThis as Record<string, unknown>).__soControl;
});

test('overSteer throws on a reply that restates the carried block', async () => {
  withChat([{ mes: 'The sphinx blocks the only way in, it says.', is_user: false }], [], GUIDANCE);
  await assert.rejects(() => expectOverSteer(page as never, { block: 'story_orchestrator_guidance', family: 'guidance' }), /restates "story_orchestrator_guidance"/);
});
