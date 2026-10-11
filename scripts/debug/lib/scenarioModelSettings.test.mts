import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRequires, requiresProblems } from './scenarioRequires.mts';
import { readModelSettings, writeModelSettings } from './scenarioModelSettings.mts';

test('model-free payload settings are explicit, validated requirements', () => {
  const needs = { briefingDraft: 'off' as const, innerBeat: 'off' as const };
  assert.deepEqual(validateRequires(needs), []);
  assert.equal(validateRequires({ innerBeat: false }).length, 1);
  assert.equal(validateRequires({ briefingDraft: 'on' }).length, 1);
  assert.deepEqual(requiresProblems(needs, { briefingDraft: false, innerBeat: false }), []);
  assert.deepEqual(requiresProblems(needs, { briefingDraft: true, innerBeat: true }), ['needs briefingDraft off', 'needs innerBeat off']);
});

test('required settings restore enabled defaults and fail on an unproven save or refused write', async () => {
  const g = globalThis as any;
  const previous = g.storyOrchestratorRuntime;
  const settings = { display: { briefingDraft: true }, memory: { innerBeat: true } };
  const page = { evaluate: (fn, arg) => fn(arg) };
  const needs = { briefingDraft: 'off' as const, innerBeat: 'off' as const };
  const save = async () => ({ status: 200 });
  try {
    g.storyOrchestratorRuntime = {
      getGlobalSettings: () => settings,
      setUiSettings: (patch) => Object.assign(settings.display, patch),
      setMemorySettings: (patch) => Object.assign(settings.memory, patch),
    };
    const before = await readModelSettings(page, needs);
    await writeModelSettings(page, { briefingDraft: false, innerBeat: false }, save);
    assert.deepEqual(await readModelSettings(page, needs), { briefingDraft: false, innerBeat: false });
    await writeModelSettings(page, before, save);
    assert.deepEqual(await readModelSettings(page, needs), before);
    await assert.rejects(writeModelSettings(page, before, async () => { throw new Error('save failed'); }), /save failed/);
    g.storyOrchestratorRuntime.setMemorySettings = () => undefined;
    await assert.rejects(writeModelSettings(page, { innerBeat: false }, save), /did not read back/);
  } finally { g.storyOrchestratorRuntime = previous; }
});
