import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsPod, plan, podJobs, schedule } from './podSchedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const row = (id, extra = {}) => ({ id, stage: 'C5', tier: ['RP'], reset: 'lane', ...extra });
const estimates = (rows, extra = {}) => ({ resetMinutes: { lane: { seed: 4, snapshot: 1 }, adolion: { seed: 10, snapshot: 1 }, comfy: { seed: 6, snapshot: 3 } }, rows, ...extra });
const job = (id, minutes, extra = {}) => ({ id, row: id, session: 'C', minutes, after: [], comfy: false, samePod: false, ...extra });

test('only rows that need the pod become jobs; each job is both runs with a reset before each', () => {
  const manifest = { rows: [row('a'), row('b', { tier: ['CL'] }), row('c', { tier: ['D'] }), row('d', { reset: 'offline' }), row('e', { stage: 'B1', reset: 'adolion' })] };
  const { jobs, offPod, problems } = podJobs(manifest, estimates({ a: { runMin: 20 }, e: { runMin: 30 } }));
  assert.deepEqual(problems, []);
  assert.deepEqual(jobs.map((j) => [j.id, j.session, j.minutes]), [['a', 'C', 2 * (1 + 20)], ['e', 'B1', 2 * (1 + 30)]]);
  assert.deepEqual(offPod, ['d']);
  assert.deepEqual(podJobs(manifest, estimates({ a: { runMin: 20 }, e: { runMin: 30 } }), { snapshot: false }).jobs.map((j) => j.minutes), [2 * (4 + 20), 2 * (10 + 30)]);
  assert.equal(needsPod(row('x', { tier: ['D', 'RP'] })), true);
});

test('a split row becomes units that each keep two runs and their own resets; --no-split keeps one job', () => {
  const manifest = { rows: [row('m', { reset: 'adolion' })] };
  const est = estimates({ m: { runMin: 120, units: 3, samePod: true } });
  assert.deepEqual(podJobs(manifest, est).jobs.map((j) => [j.id, j.minutes, j.samePod]), [['m#1/3', 2 * (1 + 40), true], ['m#2/3', 2 * (1 + 40), true], ['m#3/3', 2 * (1 + 40), true]]);
  assert.deepEqual(podJobs(manifest, est, { split: false }).jobs.map((j) => [j.id, j.minutes, j.samePod]), [['m', 2 * (1 + 120), false]]);
});

test('derived rows, proposed shares and branch rows leave the pod only as declared; unknown ids are problems', () => {
  const manifest = { rows: [row('host'), row('scored', { reset: 'adolion' }), row('guest'), row('branchy', { branch: 'SP6 PASS' }), row('missing')] };
  const est = estimates({ host: { runMin: 10 }, scored: { derivedFrom: ['host'] }, guest: { runMin: 10 }, branchy: { runMin: 10 }, ghost: { runMin: 5 } }, { shares: { guest: { host: 'host' }, nowhere: { host: 'host' } } });
  const plain = podJobs(manifest, est);
  assert.deepEqual(plain.jobs.map((j) => j.id), ['host', 'guest', 'branchy']);
  assert.deepEqual(plain.offPod, ['scored']);
  assert.deepEqual(plain.problems.sort(), ['estimate for ghost, which is not a manifest row', 'missing needs the pod and has no runMin estimate', 'share nowhere -> host: not a manifest row']);
  const shared = podJobs(manifest, est, { shares: true, branches: 'none' });
  assert.deepEqual(shared.jobs.map((j) => j.id), ['host']);
  assert.deepEqual(shared.offPod, ['scored', 'guest']);
});

test('a dependency is never started before both runs of the row it waits for end, even with a lane free', () => {
  const out = schedule([job('w2', 90), job('warden', 30, { after: ['w2'] }), job('other', 10)], { pods: 2 });
  const at = Object.fromEntries(out.lanes.flatMap((lane) => lane.queue).map((entry) => [entry.id, entry]));
  assert.ok(at.warden.start >= at.w2.end, `warden starts at ${at.warden.start}, w2 ends at ${at.w2.end}`);
  assert.equal(at.other.start, 0);
  assert.deepEqual(out.problems, []);
});

test('comfy jobs never overlap: one local ComfyUI serves every pod', () => {
  const out = schedule([job('i1', 40, { comfy: true }), job('i2', 40, { comfy: true }), job('i3', 40, { comfy: true })], { pods: 3 });
  const spans = out.lanes.flatMap((lane) => lane.queue).sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i].start >= spans[i - 1].end, `${spans[i].id} overlaps ${spans[i - 1].id}`);
});

test('units of a samePod row stay on the pod of the first unit; free units spread', () => {
  const jobs = [1, 2, 3, 4].map((unit) => job(`ab#${unit}/4`, 30, { row: 'ab', samePod: true })).concat([1, 2, 3, 4].map((unit) => job(`free#${unit}/4`, 30, { row: 'free' })));
  const out = schedule(jobs, { pods: 4 });
  const podsOf = (rowId) => new Set(out.lanes.filter((lane) => lane.queue.some((entry) => entry.row === rowId)).map((lane) => lane.pod));
  assert.equal(podsOf('ab').size, 1);
  assert.ok(podsOf('free').size > 1);
});

test('more pods cut wall-clock at about equal pod-minutes; each used pod pays its start and stop, an unused pod pays nothing', () => {
  const jobs = Array.from({ length: 16 }, (_, i) => job(`r${i}`, 60));
  const one = schedule(jobs, { pods: 1, podStartMin: 12, podStopMin: 6 });
  const four = schedule(jobs, { pods: 4, podStartMin: 12, podStopMin: 6 });
  assert.equal(one.wallMin, 12 + 8 * 60 + 6);
  assert.equal(four.wallMin, 12 + 2 * 60 + 6);
  assert.equal(one.podMin, 12 + 480 + 6);
  assert.equal(four.podMin, 4 * (12 + 120 + 6));
  const sparse = schedule([job('only', 60)], { pods: 3, podStartMin: 12, podStopMin: 6 });
  assert.equal(sparse.podsUsed, 1);
  assert.equal(sparse.podMin, 12 + 60 + 6);
});

test('the real manifest: every row that needs the pod has an estimate, a derived source or a share; the plan has no problems', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'test', 'phase-c', 'manifest.json'), 'utf-8'));
  const est = JSON.parse(readFileSync(join(ROOT, 'test', 'phase-c', 'pod-estimates.json'), 'utf-8'));
  for (const pods of [1, 2, 3, 4]) {
    const out = plan(manifest, est, { pods, shares: true });
    assert.deepEqual(out.problems, [], `pods ${pods}`);
    const placed = new Set([...out.sessions.flatMap((s) => s.lanes.flatMap((lane) => lane.queue.map((entry) => entry.row))), ...out.offPod]);
    for (const r of manifest.rows.filter((r) => r.tier.includes('RP'))) assert.ok(placed.has(r.id), `${r.id} is neither scheduled nor off the pod`);
  }
  const one = plan(manifest, est, { pods: 1 });
  const four = plan(manifest, est, { pods: 4 });
  assert.ok(four.wallHours < one.wallHours / 2.5, `4 pods ${four.wallHours} h vs 1 pod ${one.wallHours} h`);
  assert.ok(four.podHours < one.podHours * 1.15, `4 pods ${four.podHours} pod-h vs 1 pod ${one.podHours}`);
});
