import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFrozen, OUTCOMES, readDrafts, replayAll, type Outcome } from './lib/sceneReplay.mts';
import { blindLeaks, blindPrompt, buildRatePacks, parseRating, ratePacks, unblind, writeRatePacks, type KeyRow, type Rating } from './lib/sceneRate.mts';
import { overallVerdict, scoreScene, scoreSceneRun } from './lib/sceneScore.mts';
import { main } from './so-scene-test-replay.mts';
import { testTempDir } from '../lib/testTemp.mjs';

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));
const quiet = async <T,>(run: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

let plumbed: Promise<string> | null = null;
const plumbingOut = () => {
  plumbed ??= (async () => {
    const out = await testTempDir('so-scene-rate-');
    await replayAll({ out, run: 1, plumbing: true, log: () => {} });
    return out;
  })();
  return plumbed;
};

test('blind pack: seeded shuffle, name and objective only, keys apart, identical prompt for the same anchor in any arm', async () => {
  const { set } = await loadFrozen();
  const drafts = await readDrafts(await plumbingOut(), 1);
  const one = buildRatePacks(set, drafts, 'seed-a');
  const same = buildRatePacks(set, drafts, 'seed-a');
  const other = buildRatePacks(set, drafts, 'seed-b');
  assert.deepEqual(one, same);
  assert.equal(one.blind.pack.length, 60);
  assert.equal(one.honour.pack.length, 40);
  assert.notDeepEqual(one.blind.key.map((row) => `${row.frontierId}-${row.outcome}`), other.blind.key.map((row) => `${row.frontierId}-${row.outcome}`));
  assert.notDeepEqual(one.blind.key.map((row) => `${row.frontierId}-${row.outcome}`), drafts.map((draft) => `${draft.frontierId}-${draft.outcome}`));
  assert.deepEqual(blindLeaks(one.blind.pack, drafts), []);
  for (const item of one.blind.pack) {
    assert.deepEqual(Object.keys(item).sort(), ['anchor', 'context', 'expected', 'id']);
    assert.deepEqual(Object.keys(item.anchor).sort(), ['name', 'objective']);
  }
  const byFrontier = new Map<string, string[]>();
  for (const [index, row] of one.blind.key.entries()) byFrontier.set(row.frontierId, [...(byFrontier.get(row.frontierId) ?? []), blindPrompt(one.blind.pack[index])]);
  assert.ok([...byFrontier.values()].every((prompts) => prompts.length === 3 && new Set(prompts).size === 1));
  assert.ok(one.honour.pack.every((item) => item.signal.startsWith('Scene signal:')));
  const leaky = [{ ...one.blind.pack[0], anchor: { ...one.blind.pack[0].anchor, changed: ['place'] } }, { ...one.blind.pack[1], arm: 'altered' }];
  assert.equal(new Set(blindLeaks(leaky as never, drafts).map((leak) => leak.split(':')[0])).size, 2);
  assert.equal(blindLeaks([{ ...one.blind.pack[2], expected: drafts.find((draft) => draft.signal).signal }], drafts).length, 1);
});

test('unblinding maps each rated id back to its frontier and arm, and refuses an id the key does not hold', () => {
  const key: KeyRow[] = [{ id: 'b-1', frontierId: 'f01', outcome: 'altered' }, { id: 'b-2', frontierId: 'f02', outcome: 'expected' }];
  const rows = unblind([{ id: 'b-2' }, { id: 'b-1' }], key);
  assert.deepEqual(rows, [{ id: 'b-2', frontierId: 'f02', outcome: 'expected' }, { id: 'b-1', frontierId: 'f01', outcome: 'altered' }]);
  assert.throws(() => unblind([{ id: 'b-3' }], key), /not in the key/);
});

test('rating replies: booleans required, a bad reply stays unrated and is retried on the next rate run', async () => {
  assert.equal(parseRating('blind', 'x', { text: 'Sure: {"agency_flag": false, "surprising": true, "coherent": true}', model: 'm' }).ok, true);
  assert.match(parseRating('blind', 'x', { text: '{"agency_flag": "no"}', model: 'm' }).error ?? '', /agency_flag, surprising, coherent/);
  assert.match(parseRating('honour', 'x', { text: 'no json', model: 'm' }).error ?? '', /honours, world_side/);
  const out = await testTempDir('so-scene-rate-');
  await replayAll({ out, run: 1, plumbing: true, log: () => {} });
  await writeRatePacks({ out, run: 1 });
  let calls = 0;
  const flaky = async (prompt: string) => {
    calls += 1;
    if (calls === 3) return { text: 'garbled', model: 'fake' };
    return { text: prompt.includes('"honours"') ? '{"honours":true,"world_side":true}' : '{"agency_flag":false,"surprising":false,"coherent":true}', model: 'fake' };
  };
  const first = await ratePacks({ out, run: 1, plumbing: true, ask: flaky, log: () => {} });
  assert.equal(first.totals.honour.failed, 1);
  const second = await ratePacks({ out, run: 1, plumbing: true, ask: flaky, log: () => {} });
  assert.deepEqual([second.totals.honour.rated, second.totals.honour.kept, second.totals.blind.kept], [1, 39, 60]);
  await assert.rejects(ratePacks({ out, run: 1, plumbing: false, log: () => {} }), /plumbing/);
});

const ARM_SIZE = 20;

interface Plan { agency?: Partial<Record<Outcome, number>>; critic?: Partial<Record<Outcome, number>>; honour?: Partial<Record<Outcome, number>>; surprisingCoherent?: Partial<Record<Outcome, number>>; surprising?: Partial<Record<Outcome, number>>; narrated?: number; drop?: number }

function synthetic(plan: Plan) {
  const drafts: any[] = [];
  const blind: Rating[] = [];
  const honour: Rating[] = [];
  const blindKey: KeyRow[] = [];
  const honourKey: KeyRow[] = [];
  for (const outcome of OUTCOMES) {
    for (let index = 0; index < ARM_SIZE - (outcome === 'interrupt' ? plan.drop ?? 0 : 0); index += 1) {
      const frontierId = `f${String(index + 1).padStart(2, '0')}`;
      const criticRefused = index < (plan.critic?.[outcome] ?? 0);
      drafts.push({
        outcome, frontierId, plumbing: false, status: 'ok', route: { model: 'openai/gpt-6.1-sol' }, delivered: { name: 'n', objective: 'o', ...(outcome === 'altered' ? { changed: ['place'] } : {}) },
        attempts: [
          ...(criticRefused ? [{ stage: 'critic', critic: { refused: true }, narrated: false, scene: [] }] : []),
          { stage: 'ok', critic: { refused: false }, narrated: outcome === 'expected' && index < (plan.narrated ?? 0), scene: [] },
        ],
      });
      const id = `${outcome}-${index}`;
      const sc = index < (plan.surprisingCoherent?.[outcome] ?? (outcome === 'expected' ? 0 : 16));
      const surprising = sc || index >= ARM_SIZE - (plan.surprising?.[outcome] ?? 0);
      blind.push({ id: `b${id}`, ok: true, raw: '', rater: 'claude', answer: { agency_flag: index < (plan.agency?.[outcome] ?? 0), surprising, coherent: true } });
      blindKey.push({ id: `b${id}`, frontierId, outcome });
      if (outcome !== 'expected') {
        const yes = index < (plan.honour?.[outcome] ?? 18);
        honour.push({ id: `h${id}`, ok: true, raw: '', rater: 'claude', answer: { honours: yes, world_side: true } });
        honourKey.push({ id: `h${id}`, frontierId, outcome });
      }
    }
  }
  return { run: 1, drafts, honour: { ratings: honour, key: honourKey }, blind: { ratings: blind, key: blindKey } };
}

test('scorer: every floor exactly at its bar passes (margins +0.05 and +0.10, >= 0.80, >= 0.70, <= 0.30)', () => {
  const score = scoreSceneRun(synthetic({
    agency: { expected: 1, altered: 2, interrupt: 2 }, critic: { expected: 2, altered: 4, interrupt: 4 },
    honour: { altered: 16, interrupt: 16 }, surprisingCoherent: { altered: 14, interrupt: 14, expected: 0 }, surprising: { expected: 6 },
  }));
  assert.deepEqual(score.reasons, []);
  assert.deepEqual(score.floors, { S7: true, S8: true, S9: true, S11: true });
  assert.equal(score.verdict, 'pass');
  assert.deepEqual(score.S8.agency.altered, { hits: 2, of: 20, rate: 0.1 });
  assert.equal(score.S8.bar, 0.05 + 0.05);
  assert.deepEqual(score.S9.critic.interrupt, { hits: 4, of: 20, rate: 0.2 });
  assert.deepEqual(score.S7.arms.altered, { hits: 16, of: 20, rate: 0.8 });
  assert.deepEqual(score.S11.surprising.expected, { hits: 6, of: 20, rate: 0.3 });
  assert.deepEqual(score.S9.informational.changedKinds.altered, { place: 20 });
});

test('scorer: a planted miss one step past each bar fails that floor only', () => {
  const base: Plan = { agency: { expected: 1, altered: 2, interrupt: 2 }, critic: { expected: 2, altered: 4, interrupt: 4 }, honour: { altered: 16, interrupt: 16 }, surprisingCoherent: { altered: 14, interrupt: 14 }, surprising: { expected: 6 } };
  const cases: Array<[string, Plan, string]> = [
    ['S8 agency', { ...base, agency: { expected: 1, altered: 3, interrupt: 2 } }, 'S8'],
    ['S8 narrated', { ...base, narrated: 1 }, 'S8'],
    ['S9 critic', { ...base, critic: { expected: 2, altered: 4, interrupt: 5 } }, 'S9'],
    ['S7 honour', { ...base, honour: { altered: 15, interrupt: 16 } }, 'S7'],
    ['S11 changed', { ...base, surprisingCoherent: { altered: 14, interrupt: 13 } }, 'S11'],
    ['S11 expected', { ...base, surprising: { expected: 7 } }, 'S11'],
  ];
  for (const [name, plan, floor] of cases) {
    const score = scoreSceneRun(synthetic(plan));
    assert.equal(score.verdict, 'fail', name);
    assert.deepEqual(Object.entries(score.floors).filter(([, ok]) => ok === false).map(([id]) => id), [floor], name);
  }
});

test('scorer: missing drafts, missing ratings, plumbing or a single run are insufficient, never pass', async () => {
  const short = scoreSceneRun(synthetic({ drop: 1 }));
  assert.equal(short.verdict, 'insufficient');
  assert.ok(short.reasons.some((reason) => /interrupt: 19 of 20 drafts/.test(reason)));
  const unrated = synthetic({});
  unrated.blind.ratings = unrated.blind.ratings.slice(1);
  assert.equal(scoreSceneRun(unrated).verdict, 'insufficient');
  assert.equal(scoreSceneRun({ ...synthetic({}), honour: null }).verdict, 'insufficient');
  assert.equal(overallVerdict([{ verdict: 'pass' }]), 'insufficient');
  assert.equal(overallVerdict([{ verdict: 'pass' }, { verdict: 'fail' }]), 'fail');
  assert.equal(overallVerdict([{ verdict: 'pass' }, { verdict: 'pass' }]), 'pass');
  const out = await plumbingOut();
  await writeRatePacks({ out, run: 1 });
  await ratePacks({ out, run: 1, plumbing: true, log: () => {} });
  const result = await scoreScene(out, [1]);
  assert.equal(result.verdict, 'insufficient');
  assert.ok(result.runs[0].reasons.includes('plumbing drafts: never a measurement'));
  const file = join(out, 'score.json');
  assert.equal(await quiet(() => main(['score', '--out', out, '--runs', '1', '--result', file])), 2);
  assert.equal((await readJson(file)).verdict, 'insufficient');
});
