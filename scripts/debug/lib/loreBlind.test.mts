import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLore, buildLorePack, lorePackLeaks, median, parseRating, pickLoreEntry, raterPrompt, type LoreArm, type LoreRunTask } from './loreBlind.mts';

const entry = (title: string, content = `${title} content.`) => ({ title, keys: [title.toLowerCase()], content });
const step = (status: string, args: Record<string, unknown>, tool = 'upsertLorebookEntry') => ({ status, call: { tool, args } });
const tasks = (arm: LoreArm, count = 3): LoreRunTask[] => Array.from({ length: count }, (_, at) => ({ id: `t${at + 1}`, kind: 'place', arm, entry: entry(`${arm} entry ${at + 1}`) }));

test('pickLoreEntry takes the entry naming the subject, else the first sent one, and never a refused or empty one', () => {
  const steps = [
    step('applied', { name: 'Book' }, 'createStoryLorebook'),
    step('refused', { comment: 'Gullwater Locks', keys: ['locks'], content: 'refused text' }),
    step('applied', { comment: 'Town Gate', keys: ['gate'], content: 'gate text' }),
    step('applied', { comment: 'The Locks', keys: ['gullwater'], content: 'locks text' }),
    step('applied', { comment: 'Gullwater', keys: [], content: '  ' }),
  ];
  assert.equal(pickLoreEntry({ subject: 'Gullwater Locks' }, steps)?.content, 'locks text');
  assert.equal(pickLoreEntry({ subject: 'Brine Market' }, steps)?.content, 'gate text');
  assert.equal(pickLoreEntry({ subject: 'Brine Market' }, steps.slice(0, 2)), null);
});

test('buildLorePack shuffles both arms under neutral ids, seals the arm in the key and lists missing tasks', () => {
  const runs = [{ run: 'run1', tasks: [...tasks('on'), ...tasks('off'), { id: 't9', kind: 'item', arm: 'off' as const, entry: null }] }];
  const first = buildLorePack({ seed: 's1', rubric: 'R', runs });
  assert.equal(first.pack.entries.length, 6);
  assert.deepEqual(first.missing, [{ run: 'run1', arm: 'off', task: 't9' }]);
  assert.deepEqual(lorePackLeaks(first.pack, first.key, ['SO-A7']), []);
  assert.deepEqual(first.pack.entries.map((row) => row.id), ['E01', 'E02', 'E03', 'E04', 'E05', 'E06']);
  assert.deepEqual(Object.values(first.key.entries).map((row) => row.arm).sort(), ['off', 'off', 'off', 'on', 'on', 'on']);
  for (const row of first.pack.entries) assert.ok(row.title.startsWith(first.key.entries[row.id].arm));
  assert.deepEqual(buildLorePack({ seed: 's1', rubric: 'R', runs }).key, first.key);
  const orders = ['s1', 's2', 's3', 's4'].map((seed) => buildLorePack({ seed, rubric: 'R', runs }).pack.entries.map((row) => row.title).join('|'));
  assert.ok(new Set(orders).size > 1);
});

test('lorePackLeaks names a marker, an arm field and a key/pack mismatch', () => {
  const { pack, key } = buildLorePack({ seed: 's', rubric: 'R', runs: [{ run: 'r', tasks: tasks('on', 2) }] });
  const planted = { ...pack, entries: [{ ...pack.entries[0], content: 'SO-A7 on place-1' }, pack.entries[1]] };
  assert.deepEqual(lorePackLeaks(planted, key, ['SO-A7']), ['the pack names SO-A7']);
  const withArm = { ...pack, entries: pack.entries.map((row) => ({ ...row, arm: 'on' })) } as never;
  assert.deepEqual(lorePackLeaks(withArm, key), ['the pack carries the field "arm"']);
  assert.equal(lorePackLeaks({ ...pack, entries: pack.entries.slice(1) }, key).length, 2);
});

test('the rater prompt shows the entry and the rubric, never an arm or a rule', () => {
  const prompt = raterPrompt({ id: 'E01', kind: 'item', title: 'Lantern', keys: ['lantern'], content: 'A lamp.' }, 'RUBRIC TEXT');
  assert.match(prompt, /for an item/);
  assert.match(prompt, /Title: Lantern/);
  assert.match(prompt, /RUBRIC TEXT/);
  assert.doesNotMatch(prompt, /\barm\b|Write each lore entry|\bon\b arm|E01/);
});

test('parseRating accepts an integer 1-5 inside prose and refuses anything else', () => {
  assert.deepEqual(parseRating('Sure. {"score": 4, "why": "Most basics."}'), { score: 4, why: 'Most basics.' });
  for (const text of ['no json', '{"score": 6}', '{"score": 3.5}', '{"score": "4"}', '{bad']) assert.ok('problem' in parseRating(text), text);
});

test('aggregateLore: entry score is the raters\' mean, arm score its median, each rater\'s median and on - off per run', () => {
  const { key } = buildLorePack({ seed: 'agg', rubric: 'R', runs: [{ run: 'run1', tasks: [...tasks('on'), ...tasks('off')] }] });
  const score = (id: string, rater: 'a' | 'b') => {
    const row = key.entries[id];
    const base = row.arm === 'on' ? 4 : 2;
    return { score: rater === 'a' ? base : base + (row.task === 't1' ? 1 : 0) };
  };
  const ids = Object.keys(key.entries);
  const scores = { a: Object.fromEntries(ids.map((id) => [id, score(id, 'a')])), b: Object.fromEntries(ids.map((id) => [id, score(id, 'b')])) };
  const result = aggregateLore(scores, key);
  assert.equal(result.complete, true);
  const [run] = result.runs;
  assert.deepEqual(run.arms.map((arm) => [arm.arm, arm.entries, arm.median, arm.raters]), [['on', 3, 4, { a: 4, b: 4 }], ['off', 3, 2, { a: 2, b: 2 }]]);
  assert.equal(run.delta, 2);
  assert.deepEqual(run.raterDelta, { a: 2, b: 2 });
  const partial = aggregateLore({ a: scores.a, b: { ...scores.b, [ids[0]]: undefined as never } }, key);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.unrated, [ids[0]]);
  assert.equal(aggregateLore({ a: scores.a }, key).complete, false);
});

test('median of an even list is the mean of the middle pair; empty is null', () => {
  assert.equal(median([1, 4, 2, 3]), 2.5);
  assert.equal(median([3]), 3);
  assert.equal(median([]), null);
});
