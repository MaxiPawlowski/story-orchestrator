import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armFirstFor, packPaths, packRun, runDirFor, runSpike, scoreRun } from './so-r4-spike.mts';
import { freezeTurns, type R4Key, type R4Pack, type R4TurnsFile } from './lib/r4Pack.mts';
import { r4Fake, type R4FakeOptions } from './lib/r4Fakes.mts';

const turnsFile = (): R4TurnsFile => ({
  plan: 'p',
  step: 'R4',
  arm: 'high',
  frozenSha256: null,
  turns: Array.from({ length: 20 }, (_value, index) => ({
    id: `t${String(index + 1).padStart(2, '0')}`,
    story: index < 10 ? 'Story A' : 'Story B',
    storyId: index < 10 ? 'story-a' : 'story-b',
    checkpoint: 'climax',
    chatId: `chat-${index + 1}`,
    member: null,
    contextMessages: 2,
  })),
});

const json = async <T,>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf-8')) as T;

async function playRun(root: string, turnsPath: string, runId: string, options: R4FakeOptions = {}) {
  const turns = await json<R4TurnsFile>(turnsPath);
  for (const turn of turns.turns) {
    const fake = r4Fake({ ...options, chatId: turn.chatId, storyId: turn.storyId, delayMs: { arm: 30, control: 25 } });
    fake.install();
    try {
      await runSpike(fake.page, { turnsPath, runId, orderSeed: 'order', only: turn.id, deps: fake.deps, root });
    } finally {
      fake.uninstall();
    }
  }
  return runDirFor(runId, root);
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'so-r4-'));
  const turnsPath = join(root, 'r4-turns.json');
  await writeFile(turnsPath, JSON.stringify(freezeTurns(turnsFile()), null, 2));
  return { root, turnsPath };
}

const rate = async (runDir: string, armWins: number) => {
  const paths = packPaths(runDir);
  const pack = await json<R4Pack>(paths.pack);
  const key = await json<R4Key>(paths.key);
  const ratings = { packSha256: key.packSha256, rater: 'test', ratings: pack.items.map((item, index) => ({ item: item.id, prefer: (index < armWins) === (key.items[item.id].a === 'arm') ? 'A' : 'B' })) };
  await writeFile(paths.ratings, JSON.stringify(ratings));
  return paths.ratings;
};

test('end to end on a fake page: run, pack blind, rate, score against the floor', async () => {
  const { root, turnsPath } = await setup();
  try {
    const runDir = await playRun(root, turnsPath, 'r1');
    const packed = await packRun(runDir, turnsPath, 'pack-seed');
    assert.deepEqual([packed.items, packed.excluded], [20, []]);
    const paths = packPaths(runDir);
    const pack = await readFile(paths.pack, 'utf-8');
    assert.ok(!/pack-seed|"arm"|"control"|t\d\d|chat-\d/.test(pack), 'the pack names no arm, seed, turn or chat');
    assert.match(await readFile(paths.readable, 'utf-8'), /## r4-01/);
    const score = await scoreRun(runDir, turnsPath, await rate(runDir, 14));
    assert.deepEqual([score.ok, score.armPreferred, score.items], [true, 14, 20], JSON.stringify(score.failures));
    assert.ok((score.p95Ratio ?? 99) < 2);
    assert.equal((await json<{ ok: boolean }>(paths.score)).ok, true);
    const below = await scoreRun(runDir, turnsPath, await rate(runDir, 11));
    assert.equal(below.ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the per-turn order is seeded: both orders occur and replay identically', () => {
  const sides = turnsFile().turns.map((turn) => armFirstFor('order', turn.id));
  assert.ok(sides.includes(true) && sides.includes(false));
  assert.deepEqual(turnsFile().turns.map((turn) => armFirstFor('order', turn.id)), sides);
});

test('score refuses when the frozen turns file was modified after packing, refrozen or not', async () => {
  const { root, turnsPath } = await setup();
  try {
    const runDir = await playRun(root, turnsPath, 'r2');
    await packRun(runDir, turnsPath, 'pack-seed');
    const ratings = await rate(runDir, 14);
    const frozen = await json<R4TurnsFile>(turnsPath);
    const edited = { ...frozen, turns: frozen.turns.map((turn, index) => (index === 0 ? { ...turn, contextMessages: 3 } : turn)) };
    await writeFile(turnsPath, JSON.stringify(edited));
    await assert.rejects(scoreRun(runDir, turnsPath, ratings), /not frozen as recorded/);
    await writeFile(turnsPath, JSON.stringify(freezeTurns({ ...edited, frozenSha256: null })));
    await assert.rejects(scoreRun(runDir, turnsPath, ratings), /the turns file changed since the pack was built/);
    await writeFile(turnsPath, JSON.stringify(frozen));
    assert.equal((await scoreRun(runDir, turnsPath, ratings)).armPreferred, 14);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('score refuses an edited pack and ratings naming an unknown item; pack never overwrites a sealed key', async () => {
  const { root, turnsPath } = await setup();
  try {
    const runDir = await playRun(root, turnsPath, 'r3');
    await packRun(runDir, turnsPath, 'pack-seed');
    await assert.rejects(packRun(runDir, turnsPath, 'other-seed'), /a sealed key is never overwritten/);
    const paths = packPaths(runDir);
    const ratingsPath = await rate(runDir, 14);
    const ratings = await json<{ packSha256: string; ratings: Array<{ item: string; prefer: string }> }>(ratingsPath);
    await writeFile(ratingsPath, JSON.stringify({ ...ratings, ratings: [...ratings.ratings, { item: 'r4-42', prefer: 'A' }] }));
    await assert.rejects(scoreRun(runDir, turnsPath, ratingsPath), /unknown item "r4-42"/);
    await rate(runDir, 14);
    const pack = await json<R4Pack>(paths.pack);
    await writeFile(paths.pack, JSON.stringify({ ...pack, items: [...pack.items].reverse() }));
    await assert.rejects(scoreRun(runDir, turnsPath, ratingsPath), /the pack changed since it was sealed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a planted turn whose arm key did not land is excluded and the score cannot pass on 19 pairs', async () => {
  const { root, turnsPath } = await setup();
  try {
    const runDir = await playRun(root, turnsPath, 'r4', { landed: (chatId) => chatId !== 'chat-3' });
    const packed = await packRun(runDir, turnsPath, 'pack-seed');
    assert.equal(packed.items, 19);
    assert.deepEqual(packed.excluded.map((entry) => entry.turnId), ['t03']);
    assert.match(packed.excluded[0].reasons.join(';'), /the arm key did not land/);
    const score = await scoreRun(runDir, turnsPath, await rate(runDir, 19));
    assert.equal(score.ok, false);
    assert.match(score.failures.join(';'), /19 valid rated pairs, the floor is declared on 20/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pack refuses a run whose reply text leaks a reasoning trace, and writes nothing', async () => {
  const { root, turnsPath } = await setup();
  try {
    const runDir = await playRun(root, turnsPath, 'r6');
    const paths = packPaths(runDir);
    const rows = (await readFile(paths.records, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    rows[0].generations[0].reply = '<think>weigh the oath</think> He kneels.';
    await writeFile(paths.records, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    await assert.rejects(packRun(runDir, turnsPath, 'pack-seed'), /refusing to write a pack that leaks the arm/);
    await assert.rejects(readFile(paths.key, 'utf-8'), /ENOENT/);
    await assert.rejects(readFile(paths.pack, 'utf-8'), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('run refuses unfrozen turns and a run id started on other turns', async () => {
  const { root, turnsPath } = await setup();
  try {
    await writeFile(join(root, 'raw.json'), JSON.stringify(turnsFile()));
    const fake = r4Fake();
    await assert.rejects(runSpike(fake.page, { turnsPath: join(root, 'raw.json'), runId: 'x', orderSeed: null, only: null, deps: fake.deps, root }), /not frozen as recorded/);
    await playRun(root, turnsPath, 'r5');
    const frozen = await json<R4TurnsFile>(turnsPath);
    const other = join(root, 'other.json');
    await writeFile(other, JSON.stringify(freezeTurns({ ...frozen, frozenSha256: null, plan: 'other' })));
    await assert.rejects(runSpike(fake.page, { turnsPath: other, runId: 'r5', orderSeed: null, only: 't01', deps: fake.deps, root }), /was started on other turns/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
