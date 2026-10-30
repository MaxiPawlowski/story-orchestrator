import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateSteps } from './lib/scenarioSchema.mts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const build = await import(new URL('../../test/measurements/v3.0/d2-offscreen/build.mjs', import.meta.url).href);
const frozen = build.readFrozen();
const arms = { on: read(build.ARMS.on), off: read(build.ARMS.off) };
const cues = frozen.opportunities.filter((entry: { cue: string | null }) => entry.cue);

const STOP = new Set(['about', 'after', 'again', 'from', 'have', 'into', 'like', 'over', 'that', 'their', 'them', 'then', 'there', 'they', 'this', 'what', 'when',
  'while', 'will', 'with', 'your', 'someone', 'somebody', 'away', 'been', 'just', 'once', 'some', 'very', 'come', 'last', 'made', 'only', 'turns', 'turned', 'here', 'whose']);
const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, '');
const words = (text: string) => new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => !STOP.has(word)).map(stem));
const narratorLines = (scenario: any) => scenario.steps.filter((step: any) => typeof step.slash === 'string' && step.slash.startsWith('/sendas name="DM Narrator" '))
  .map((step: any) => step.slash.slice('/sendas name="DM Narrator" '.length));

test('D2: the committed arms are what build.mjs writes from the frozen corpus', () => {
  for (const arm of ['on', 'off'] as const) assert.equal(readFileSync(join(ROOT, build.ARMS[arm]), 'utf8').replace(/\r\n/g, '\n'), `${JSON.stringify(build.buildArm(arm), null, 2)}\n`);
});

test('D2: 40 opportunities in the 2026-10-23 order, 30 cues (10 per member) and 10 no-cue, cue texts unchanged', () => {
  const old = read('test/measurements/v2.9/04-c2c5/frozen.json').opportunities;
  assert.deepEqual(frozen.opportunities.map((entry: any) => [entry.id, entry.member, entry.cue]), old.map((entry: any) => [entry.id, entry.member, entry.cue]));
  assert.equal(cues.length, 30);
  for (const member of ['luke', 'ponticius', 'arin']) assert.equal(cues.filter((entry: any) => entry.member === member).length, 10);
});

const SCENERY = new Set(['hall', 'room', 'table']);

test('D2: no word of an event or its cue reaches a narrator line, and the story names an event only in its cue', () => {
  const screens = narratorLines(arms.on);
  assert.equal(screens.length, 40);
  assert.deepEqual(screens, frozen.opportunities.map((entry: any) => entry.screen));
  const fillers = new Set(cues.flatMap((entry: any) => [...words(entry.screen)]));
  const quiet = new Set(frozen.opportunities.filter((entry: any) => !entry.cue).flatMap((entry: any) => [...words(entry.screen)]));
  for (const entry of cues) {
    assert.deepEqual([entry.id, [...words(`${entry.cue} ${entry.offscreen}`)].filter((word) => fillers.has(word))], [entry.id, []]);
    assert.deepEqual([entry.id, [...words(entry.cue)].filter((word) => quiet.has(word) && !SCENERY.has(word))], [entry.id, []]);
  }
  const story = arms.on.steps.find((step: any) => step.import_story).import_story;
  const { roster, ...rest } = story;
  const texts = (value: unknown): string[] => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(texts)
    : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : []);
  const outside = texts({ ...rest, roster: roster.map(({ cues: _cues, ...member }: any) => member) }).join('\n');
  for (const entry of cues) assert.equal(outside.includes(entry.offscreen), false, entry.id);
  assert.ok(story.qualities.every((quality: any) => /^Harness latch for opportunity [pn]\d\d, set with \/cp set\.$/.test(quality.rubric)));
  assert.equal(cues.some((entry: any) => outside.includes(entry.cue)), false);
});

test('D2: a planted on-screen event is caught (control)', () => {
  const entry = cues[0];
  const planted = `${narratorLines(arms.on)[0]} ${entry.offscreen}`;
  assert.ok([...words(entry.cue)].some((word) => words(planted).has(word)) || [...words(entry.offscreen)].some((word) => words(planted).has(word)));
});

test('D2: the arms differ only in the cue switch and the storage prefix, and both pass the scenario schema', () => {
  const normalised = (scenario: any, arm: string) => JSON.stringify({ ...scenario, _note: '' }).replaceAll(build.STORAGE_PREFIX(arm), 'PREFIX')
    .replace('"key":["settings","characters","cues"],"value":true', 'CUES').replace('"key":["settings","characters","cues"],"value":false', 'CUES');
  assert.equal(normalised(arms.on, 'on'), normalised(arms.off, 'off'));
  for (const arm of ['on', 'off'] as const) {
    assert.deepEqual(validateSteps(arms[arm].steps), []);
    assert.equal(arms[arm].model, 'judged');
    assert.ok(!JSON.stringify(arms[arm]).includes('so-v29-c2'));
    assert.equal(arms[arm].steps.find((step: any) => step.ext_setting?.key?.join('.') === 'settings.characters.cues').ext_setting.value, arm === 'on');
  }
});
