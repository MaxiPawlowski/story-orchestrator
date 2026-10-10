import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residueCount, residueOf, type ResidueSnapshot } from './runResidue.mts';

const base = (): ResidueSnapshot => ({
  lorebooks: ['Adolion World', 'SO-V25-08 Mirror Req', 'Xentar Checkpoints'],
  selected: ['Xentar Checkpoints'],
  characters: [{ name: 'Luke', avatar: 'Luke.png' }, { name: 'SO-Old Card', avatar: 'SO-Old Card.png' }],
  sessions: [{ key: 'untitled', applied: ['SO-V10B Lore'] }, { key: 'my-story', applied: ['Real Book'] }],
  spikes: { sp5Scenario: false },
});

test('the T7 residue shapes are found: new marked books, a marked book left selected, a marked card, ledger rows and a spike flag', () => {
  const after: ResidueSnapshot = {
    lorebooks: [...base().lorebooks, 'SO-V17 Lore', 'SO-V25-08 Adolion Timed'],
    selected: ['Xentar Checkpoints', 'SO-V25-08 Mirror Req', 'SO-V25-08 Adolion Timed'],
    characters: [...base().characters, { name: 'SO-V18 Harbour', avatar: 'SO-V18 Harbour.png' }],
    sessions: [{ key: 'untitled', applied: ['SO-V10B Lore', 'SO-V17 Lore', 'SO-PF-AE04 Lore'] }, { key: 'my-story', applied: ['Real Book'] }, { key: 'so-v18-owner', applied: ['SO-V18 Harbour'] }],
    spikes: { sp5Scenario: true },
  };
  const plan = residueOf(base(), after);
  assert.deepEqual(plan.lorebooks, ['SO-V17 Lore', 'SO-V25-08 Adolion Timed']);
  assert.deepEqual(plan.deselect, ['SO-V25-08 Mirror Req'], 'a book this run deletes is deselected by the delete; only a pre-existing one needs /world off');
  assert.deepEqual(plan.characters, [{ name: 'SO-V18 Harbour', avatar: 'SO-V18 Harbour.png' }]);
  assert.deepEqual(plan.sessions.prune, { untitled: ['SO-V17 Lore', 'SO-PF-AE04 Lore'], 'so-v18-owner': ['SO-V18 Harbour'] });
  assert.deepEqual(plan.sessions.drop, ['so-v18-owner'], 'a session the run created holding only marked rows goes; the shared untitled session stays with its older row');
  assert.deepEqual(plan.spikes, { sp5Scenario: false });
  assert.equal(residueCount(plan), 8);
});

test('negative controls: unmarked assets, pre-existing marked ones and an author session are never in the plan', () => {
  const after: ResidueSnapshot = {
    lorebooks: [...base().lorebooks, 'A Real New Book'],
    selected: ['Xentar Checkpoints', 'Adolion World'],
    characters: [...base().characters, { name: 'Somebody', avatar: 'Somebody.png' }],
    sessions: [...base().sessions, { key: 'author-draft', applied: ['Real Card', 'SO-Mixed'] }],
    spikes: { sp5Scenario: false },
  };
  const plan = residueOf(base(), after);
  assert.deepEqual(plan.lorebooks, []);
  assert.deepEqual(plan.deselect, []);
  assert.deepEqual(plan.characters, []);
  assert.deepEqual(plan.sessions.drop, [], 'a new session holding an unmarked row is an author session: kept');
  assert.deepEqual(plan.sessions.prune, { 'author-draft': ['SO-Mixed'] });
  assert.equal(plan.spikes, undefined);
  assert.equal(residueCount(residueOf(base(), base())), 0);
});

test('spikes absent before and switched on during the run are restored to absent', () => {
  const plan = residueOf({ ...base(), spikes: null }, { ...base(), spikes: { sp5Scenario: true } });
  assert.equal(plan.spikes, null);
  assert.equal(residueCount(plan), 1);
});

test('spikes compare the effective view and restore the stored delta, so a normalised store is not residue', () => {
  const effective = { sp5Scenario: false, reasoningEffect: false };
  assert.equal(residueOf({ ...base(), spikes: effective, spikesStored: { sp5Scenario: false } }, { ...base(), spikes: effective, spikesStored: null }).spikes, undefined);
  const plan = residueOf({ ...base(), spikes: effective, spikesStored: null }, { ...base(), spikes: { ...effective, sp5Scenario: true }, spikesStored: { sp5Scenario: true } });
  assert.equal(plan.spikes, null, 'an absent stored section is restored to absent');
});
