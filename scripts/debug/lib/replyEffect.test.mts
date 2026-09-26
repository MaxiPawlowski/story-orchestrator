import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindSample, replyEffectVerdict, runFromRescore, type EffectRun } from './replyEffect.mts';

const run = (arm: 'on' | 'off', flagged: number, answered = 20, file = `${arm}-${flagged}.json`): EffectRun => ({ arm, file, answered, flagged });

test('the note reduces the defect when both on runs sit 0.15 under the pooled off rate', () => {
  const verdict = replyEffectVerdict([run('off', 8), run('off', 6), run('on', 3), run('on', 2)]);
  assert.equal(verdict.verdict, 'reduces');
  assert.equal(verdict.offRate, 0.35);
});

test('one on run short of the effect floor is "flags reliably; no effect on replies shown"', () => {
  assert.equal(replyEffectVerdict([run('off', 8), run('off', 6), run('on', 2), run('on', 5)]).verdict, 'flags reliably; no effect on replies shown');
});

test('an off run under 0.2 did not induce the defect: the measurement is void, not a pass', () => {
  const verdict = replyEffectVerdict([run('off', 8), run('off', 3), run('on', 0), run('on', 0)]);
  assert.equal(verdict.verdict, 'void');
  assert.match(verdict.reason, /off-3\.json/);
});

test('fewer than 20 answered replies in any run, or not exactly two runs per arm, is incomplete', () => {
  assert.equal(replyEffectVerdict([run('off', 8, 19), run('off', 6), run('on', 1), run('on', 1)]).verdict, 'incomplete');
  assert.equal(replyEffectVerdict([run('off', 8), run('on', 1), run('on', 1)]).verdict, 'incomplete');
  assert.equal(replyEffectVerdict([run('off', 8), run('off', 8), run('off', 8), run('on', 1), run('on', 1)]).verdict, 'incomplete');
});

test('the effect floor is absolute and inclusive: exactly off - 0.15 reduces', () => {
  assert.equal(replyEffectVerdict([run('off', 6), run('off', 6), run('on', 3), run('on', 3)]).verdict, 'reduces');
});

test('a rescore output with one arm becomes one run; two arms in one file are refused', () => {
  const output = { summary: { use: 'house-rules', records: ['rec.json'], rates: [{ arm: 'on', asked: 21, answered: 20, flagged: 4, defectRate: 0.2 }] } };
  assert.deepEqual(runFromRescore(output, 'a.json'), { arm: 'on', file: 'a.json', answered: 20, flagged: 4 });
  const both = { summary: { rates: [{ arm: 'on', answered: 1, flagged: 0 }, { arm: 'off', answered: 1, flagged: 0 }] } };
  assert.throws(() => runFromRescore(both, 'b.json'), /one arm per rescore/);
});

test('the blind sample hides the arm, draws n per arm deterministically, and keeps a separate key', () => {
  const rows = [
    ...Array.from({ length: 15 }, (_, index) => ({ id: `m${index}`, arm: 'on', file: 'on.json', text: `on ${index}` })),
    ...Array.from({ length: 15 }, (_, index) => ({ id: `m${index}`, arm: 'off', file: 'off.json', text: `off ${index}` })),
  ];
  const first = blindSample(rows, 10, 'seed');
  assert.equal(first.sheet.length, 20);
  assert.ok(first.sheet.every((row) => !('arm' in row) && typeof row.blindId === 'string'));
  assert.equal(first.key.filter((row) => row.arm === 'on').length, 10);
  assert.deepEqual(blindSample(rows, 10, 'seed'), first);
  assert.notDeepEqual(blindSample(rows, 10, 'other').sheet, first.sheet);
});
