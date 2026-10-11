import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeBudget, lanePrepare, lanePrepareProblems, readFixture, runRecordName, scoreRun, tallyJudge, type PickRow } from './posePickCl.mts';

const fixturePath = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'test', 'fixtures', 'poses', 'replies.json');

const rows = (picked: (string | null)[], sources: PickRow['source'][] = []): PickRow[] => picked.map((pose, at) => ({ id: `p${at}`, label: at % 2 ? 'sit' : null, picked: pose, source: sources[at] ?? 'judge' }));

test('the shipped fixture reads as 40 unique replies', async () => {
  const fixture = readFixture(JSON.parse(await readFile(fixturePath, 'utf-8')));
  assert.equal(fixture.length, 40);
  assert.equal(fixture.filter((reply) => reply.pose === null).length, 8);
});

test('a fixture that is short, repeats an id or has a bad pose is refused', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf-8'));
  assert.throws(() => readFixture(fixture.slice(1)), /39 replies/);
  assert.throws(() => readFixture([...fixture.slice(1), fixture[1]]), /repeats an id/);
  assert.throws(() => readFixture(fixture.map((row: any, at: number) => (at ? row : { ...row, pose: 3 }))), /neither an id nor null/);
  assert.throws(() => readFixture('x'), /not a list/);
});

test('scoring counts exact matches, splits by leg and tallies confusions by count', () => {
  const picked = rows([null, 'sit', 'stand', 'sit', null, 'run'], ['judge', 'judge', 'llm', 'llm', 'none', 'none']);
  const score = scoreRun(picked);
  assert.equal(score.total, 6);
  assert.equal(score.correct, 4);
  assert.equal(score.complete, false);
  assert.equal(score.meetsFloor, false);
  assert.deepEqual(score.legs.judge, { answered: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(score.legs.llm, { answered: 2, correct: 1, accuracy: 0.5 });
  assert.deepEqual(score.legs.none, { answered: 2, correct: 1, accuracy: 0.5 });
  assert.deepEqual(score.confusions, [{ pair: 'none -> stand', count: 1 }, { pair: 'sit -> run', count: 1 }]);
  assert.deepEqual(score.labelledNone, { total: 3, correct: 2 });
});

test('an empty leg has no accuracy rather than a zero one', () => {
  assert.equal(scoreRun(rows([null], ['judge'])).legs.llm.accuracy, null);
});

test('the floor is inclusive at 80 percent over 40 rows', () => {
  const forty = Array.from({ length: 40 }, (_, at) => ({ id: `p${at}`, label: 'sit', picked: at < 32 ? 'sit' : 'run', source: 'judge' as const }));
  const score = scoreRun(forty);
  assert.equal(score.accuracy, 0.8);
  assert.equal(score.meetsFloor, true);
  assert.equal(score.complete, true);
});

test('judge tally counts what was sent, not what was cached or never left the page', () => {
  const tally = tallyJudge([
    { cached: false, fallback: null, model: 'jev-1', latencyMs: 300, answered: true },
    { cached: false, fallback: null, model: 'jev-1', latencyMs: 100, answered: true },
    { cached: true, fallback: null, model: 'jev-1', latencyMs: 0, answered: true },
    { cached: false, fallback: 'timeout', model: null, latencyMs: 4000, answered: false },
    { cached: false, fallback: 'busy', model: null, latencyMs: 0, answered: false },
    { cached: false, fallback: 'too-large', model: null, latencyMs: 0, answered: false },
    { cached: false, fallback: 'invalid', model: null, latencyMs: 0, answered: false },
  ]);
  assert.equal(tally.asked, 7);
  assert.equal(tally.sent, 4);
  assert.equal(tally.cached, 1);
  assert.equal(tally.answered, 3);
  assert.deepEqual(tally.fallbacks, { timeout: 1, busy: 1, 'too-large': 1, invalid: 1 });
  assert.deepEqual(tally.models, ['jev-1']);
  assert.equal(tally.medianLatencyMs, 100);
});

test('the judge budget is a sum over runs and inclusive at 300', () => {
  assert.deepEqual(judgeBudget([{ sent: 150 }, { sent: 150 }]), { sent: 300, budget: 300, within: true });
  assert.equal(judgeBudget([{ sent: 150 }, { sent: 151 }]).within, false);
});

test('lane preparation switches images, sprites and the Image Generation extension off and reads back', () => {
  const settings: Record<string, any> = { extension_settings: { 'story-orchestrator': { settings: { image: { enabled: true }, sprites: { enabled: true, explicit: true } } }, disabledExtensions: ['other'] } };
  const changed = lanePrepare(settings);
  assert.deepEqual(changed.was, { image: true, sprites: true });
  assert.deepEqual(lanePrepareProblems(settings), []);
  assert.deepEqual(settings.extension_settings.disabledExtensions, ['other', 'stable-diffusion']);
  assert.ok(lanePrepareProblems({ extension_settings: { 'story-orchestrator': { settings: { image: { enabled: true } } } } }).length >= 2);
});

test('a lane copy with no story orchestrator root still ends with both off', () => {
  const settings: Record<string, any> = {};
  lanePrepare(settings);
  assert.deepEqual(lanePrepareProblems(settings), []);
});

test('record names carry the arm and the run', () => {
  assert.equal(runRecordName('chain', 2), 'run2-chain.json');
});
