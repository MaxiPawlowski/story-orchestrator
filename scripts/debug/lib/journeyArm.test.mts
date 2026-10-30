import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeyArmProblems, journeyItem, splitJourneyItem } from './journeyArm.mts';

test('C-H3: a journey row carries its arm as flag/value pairs from the arm allowlist', () => {
  assert.deepEqual(journeyArmProblems(undefined), []);
  assert.deepEqual(journeyArmProblems(['--judge-uses', 'houseRules', '--warden-mode', 'auto']), []);
  assert.deepEqual(journeyArmProblems(['--judge-uses', 'off']), []);
  assert.match(journeyArmProblems(['--judge-uses']).join(), /pairs/);
  assert.match(journeyArmProblems(['--strict', 'x']).join(), /not one of/);
  assert.match(journeyArmProblems(['--warden-mode', 'auto']).join(), /needs --judge-uses/);
  assert.match(journeyArmProblems(['--judge-uses', 'houseRules', '--warden-mode', 'always']).join(), /auto or review/);
  assert.match(journeyArmProblems(['--judge-uses', 'a b']).join(), /without spaces/);
  assert.match(journeyArmProblems([]).join(), /non-empty/);
});

test('C-H3: an armed journey item round-trips through its batch item string', () => {
  const item = journeyItem('J13', ['--judge-uses', 'houseRules', '--warden-mode', 'auto']);
  assert.equal(item, 'J13 --judge-uses houseRules --warden-mode auto');
  assert.deepEqual(splitJourneyItem(item), { id: 'J13', args: ['--judge-uses', 'houseRules', '--warden-mode', 'auto'] });
  assert.equal(journeyItem('J6'), 'J6');
  assert.deepEqual(splitJourneyItem('J6'), { id: 'J6', args: [] });
});
