import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSp6Runs, scoreSp6, type Sp6Release, type Sp6Run } from './lib/sp6Score.mts';

const release = (index: number, reached: boolean | null, reply = 'The rain keeps falling on the roof while the keeper sweeps the floor.'): Sp6Release => ({
  boundary: index * 3,
  id: `c${index + 1}`,
  block: `World pressure: A rider arrives at a gallop, wounded, and collapses by the well number ${index}. Let it land in this reply as something the world does.`,
  reply,
  after: reached ? ['escalate', 'hold'] : ['escalate'],
  reached,
});

const run = (arm: Sp6Run['arm'], judge: Sp6Run['judge'], reachedRate: number, agencyFlags = 0, count = 20): Sp6Run => ({
  arm,
  judge,
  replies: 72,
  agencyFlags,
  carried: arm === 'release' ? count : 0,
  releases: Array.from({ length: count }, (_, index) => release(index, index < Math.round(reachedRate * count))),
});

const full = (overrides: Partial<Record<'releaseOn' | 'controlOn' | 'releaseOff' | 'controlOff', Sp6Run[]>> = {}) => [
  ...(overrides.releaseOn ?? [run('release', 'on', 0.7, 1), run('release', 'on', 0.7, 2)]),
  ...(overrides.controlOn ?? [run('control', 'on', 0.2, 1), run('control', 'on', 0.2, 1)]),
  ...(overrides.releaseOff ?? [run('release', 'off', 0.65), run('release', 'off', 0.6)]),
  ...(overrides.controlOff ?? [run('control', 'off', 0.3), run('control', 'off', 0.25)]),
];

test('SP6: a complete set that meets every bar passes', () => {
  const result = scoreSp6(full());
  assert.equal(result.overall, 'PASS', JSON.stringify(result));
  assert.equal(result.k3.controlMean, 1);
  assert.deepEqual(result.k3.judgeOffColumn.map((row) => row.flags), [0, 0, 0, 0]);
});

test('SP6 K3: a release run over control mean + 1 fails', () => {
  const result = scoreSp6(full({ releaseOn: [run('release', 'on', 0.7, 3), run('release', 'on', 0.7, 1)] }));
  assert.equal(result.k3.verdict, 'FAIL');
});

test('SP6 K4: a reply that copies six words of the block fails, and a framing token fails', () => {
  const copied = run('release', 'off', 0.7);
  copied.releases[3] = release(3, true, 'Then a rider arrives at a gallop, wounded, and collapses by the gate.');
  assert.equal(scoreSp6(full({ releaseOff: [copied, run('release', 'off', 0.7)] })).k4.verdict, 'FAIL');
  const framed = run('release', 'on', 0.7, 1);
  framed.releases[0] = release(0, true, 'World pressure: the night grows loud.');
  assert.equal(scoreSp6(full({ releaseOn: [framed, run('release', 'on', 0.7, 1)] })).k4.verdict, 'FAIL');
});

test('SP6 K5: a release run under 60 % or a control run over 30 % fails', () => {
  assert.equal(scoreSp6(full({ releaseOff: [run('release', 'off', 0.55), run('release', 'off', 0.7)] })).k5.verdict, 'FAIL');
  assert.equal(scoreSp6(full({ controlOff: [run('control', 'off', 0.35), run('control', 'off', 0.1)] })).k5.verdict, 'FAIL');
});

test('SP6: fewer than two runs in a cell, or fewer than 20 releases in a run, is INCOMPLETE, never PASS', () => {
  assert.equal(scoreSp6(full({ controlOff: [run('control', 'off', 0.1)] })).overall, 'INCOMPLETE');
  assert.equal(scoreSp6(full({ releaseOn: [run('release', 'on', 0.7, 1, 19), run('release', 'on', 0.7, 1)] })).overall, 'INCOMPLETE');
});

test('SP6: the reader refuses a record that is not an SP6 run, and accepts the stored string form', () => {
  assert.throws(() => readSp6Runs([{ arm: 'x', judge: 'on', releases: [] }]), /not an SP6 run/);
  assert.equal(readSp6Runs(JSON.parse(JSON.stringify(full()))).length, 8);
});
