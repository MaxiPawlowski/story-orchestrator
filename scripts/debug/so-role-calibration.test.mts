import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, loadHoldout, verdictFromReports } from './so-role-calibration.mts';

test('director cases carry the spike world title and a 25-row floor set (D01-D26 minus D15)', async () => {
  const { cases, floorIds } = await loadCases('director');
  const byId = (id: string) => cases.find((entry) => entry.id === id);
  assert.equal(floorIds.length, 25);
  assert.equal(floorIds.includes('D15'), false);
  assert.equal(floorIds[24], 'D26');
  assert.deepEqual(cases.map((entry) => entry.id), floorIds);
  assert.equal(byId('D01').input.storyTitle, 'Quest for the Sun Ruins');
  assert.equal(byId('D17').input.storyTitle, 'The Long Dark');
  assert.equal(byId('D24').input.lead, 'Ponticius');
});

test('authoring cases resolve their draft by name and carry the environment only on provisioning', async () => {
  const { cases } = await loadCases('authoring');
  assert.equal(cases.length, 12);
  assert.equal(cases.find((entry) => entry.id === 'a01').draft.title, 'The Vault Job');
  assert.equal(cases.find((entry) => entry.id === 'a01').environment, undefined);
  assert.deepEqual(cases.find((entry) => entry.id === 'a12').environment.storyLorebooks, ['Vault Job Lore']);
});

test('no role has a hold-out until an English authoring hold-out is labelled (W25 removed the Spanish one)', async () => {
  assert.equal(await loadHoldout('authoring'), null);
  assert.equal(await loadHoldout('curator'), null);
});

test('verdictFromReports reads two recorded reports and names the hold-out miss', () => {
  const report = (misses: string[]) => ({ role: 'authoring', bundle: 'b1', summary: { meetsFloors: true }, holdout: { cases: 5, validity: { passed: 5, total: 5 }, opShape: { passed: 5, total: 5 }, misses } });
  assert.equal(verdictFromReports([report([]), report([])]).verdict, 'recommended');
  assert.equal(verdictFromReports([report([]), report(['h03'])]).verdict, 'fixture floors met; generalisation not shown');
  assert.equal(verdictFromReports([{ ...report([]), summary: { meetsFloors: false } }, report([])]).verdict, 'not recommended');
  assert.throws(() => verdictFromReports([report([]), { ...report([]), role: 'curator' }]), /one role/);
});
