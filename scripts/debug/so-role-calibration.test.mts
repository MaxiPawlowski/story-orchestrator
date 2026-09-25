import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases } from './so-role-calibration.mts';

test('director cases carry the spike world title, Spanish rows by tag, and a 26-row floor set', async () => {
  const { cases, floorIds } = await loadCases('director');
  const byId = (id: string) => cases.find((entry) => entry.id === id);
  assert.equal(floorIds.length, 26);
  assert.equal(floorIds[25], 'D26');
  assert.equal(byId('D01').input.storyTitle, 'Quest for the Sun Ruins');
  assert.equal(byId('D17').input.storyTitle, 'The Long Dark');
  assert.equal(byId('D27').input.storyTitle, 'Quest for the Sun Ruins');
  assert.equal(byId('D28').input.storyTitle, 'The Long Dark');
  assert.equal(byId('D29').input.storyTitle, 'Rain on Mercer Street');
  assert.equal(byId('D30').input.storyTitle, 'Ashworth Hall');
  assert.deepEqual(cases.filter((entry) => entry.lang === 'es').map((entry) => entry.id), ['D15', 'D27', 'D28', 'D29', 'D30', 'D31', 'D32', 'D33']);
  assert.equal(byId('D24').input.lead, 'Ponticius');
});

test('authoring cases resolve their draft by name and carry the environment only on provisioning', async () => {
  const { cases } = await loadCases('authoring');
  assert.equal(cases.length, 20);
  assert.equal(cases.find((entry) => entry.id === 'a01').draft.title, 'The Vault Job');
  assert.equal(cases.find((entry) => entry.id === 'a01').environment, undefined);
  assert.deepEqual(cases.find((entry) => entry.id === 'a12').environment.storyLorebooks, ['Vault Job Lore']);
});
