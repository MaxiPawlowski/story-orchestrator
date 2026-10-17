import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFixture } from './lib/scenarioSchema.mts';
import { castOf, readJson, type ScenarioRunner } from './lib/replyCapture.mts';
import {
  listedLines, parseS8Label, s8HashOf, s8Jobs, s8Pack, s8Problems, s8Prompt, scoreS8, S8_CASES, S8_CLAUSE, S8_FREEZE,
  type S8Fixture, type S8Label, type S8Record, type S8Secret,
} from './lib/q7Failure.mts';
import { loadFixtureKit, simulateS8 } from './lib/fixtureSim.mts';
import { main } from './so-q7-failure.mts';
import type { BlindKey, StoredLabel } from './lib/blindRater.mts';

const cast = castOf();
const fixture = await readJson<S8Fixture>(S8_CASES);
const clone = (): S8Fixture => JSON.parse(JSON.stringify(fixture));
const HEADER = `The story has already decided these outcomes. Show each one happening in this reply. ${S8_CLAUSE}`;

test('the committed S8 fixture is clean and frozen: 10 cases, half with a quest failure', async () => {
  assert.deepEqual(s8Problems(fixture, cast), []);
  assert.equal(fixture.cases.filter((entry) => entry.quest).length, 5);
  const freeze = await readJson<{ files: Record<string, string> }>(S8_FREEZE);
  assert.equal(freeze.files['cases.json'], s8HashOf(fixture));
});

test('planted S8 fixture faults are named', () => {
  const quests = clone();
  delete quests.cases[0].quest;
  assert.ok(s8Problems(quests, cast).some((problem) => problem.includes('half the cases')));
  const piped = clone();
  piped.cases[1].attempt = 'I try | again.';
  assert.ok(s8Problems(piped, cast).some((problem) => problem.includes('s02')));
  const dup = clone();
  dup.cases[2].id = 's01';
  assert.ok(s8Problems(dup, cast).some((problem) => problem.includes('repeated')));
});

test('shipped parser: every check cannot succeed and reads "<label>: fails." under the S8 clause', async () => {
  const kit = await loadFixtureKit();
  assert.deepEqual((await simulateS8(kit, fixture, cast)).problems, []);
  const drifted = { ...kit, CHECK_OUTCOME_HEADER: 'The story has already decided these outcomes.' };
  assert.ok((await simulateS8(drifted, fixture, cast)).problems.some((problem) => problem.includes('no longer carries the S8 clause')));
});

test('every S8 scenario validates, compiles, waits for the clause and drafts the narrator', () => {
  for (const plumbing of [false, true]) {
    const jobs = s8Jobs(fixture, cast, plumbing);
    assert.equal(jobs.length, 10);
    for (const job of jobs) {
      assert.deepEqual(validateFixture(job.doc, job.key), [], job.key);
      const doc = job.doc as any;
      const text = JSON.stringify(doc);
      assert.ok(text.includes('/cp set tried true'));
      assert.ok(text.includes(JSON.stringify(S8_CLAUSE).slice(1, -1).slice(0, 40)));
      assert.equal(doc.steps.at(-1).eval.includes('h.generate("DM Narrator", null'), !plumbing);
      assert.equal(doc.requires.lane, plumbing ? 'no-model' : 'model');
      const story = doc.steps.find((step: any) => step.import_story).import_story;
      assert.equal(story.checkpoints[0].checks[0].roll.target > story.checkpoints[0].checks[0].roll.sides, true);
    }
  }
});

test('listed lines are the outcome lines plus the just-happened rows, nothing else', () => {
  const blocks = {
    outcome: `${HEADER}\n- Climb the wall: fails.`,
    narratorBlock: 'What the player\'s sheet shows right now. Keep the story consistent with it and never mention the sheet:\n- Inventory: Lantern\nJust happened, already decided (show it where it fits; never undo it):\n- Quest failed: Into the old quarter\nYour private notes:\n- something else',
  };
  assert.deepEqual(listedLines({ blocks }), ['Climb the wall: fails.', 'Quest failed: Into the old quarter']);
  assert.deepEqual(listedLines({ blocks: { outcome: `${HEADER}\n- Pick the cellar lock: fails.` } }), ['Pick the cellar lock: fails.']);
});

const record = (entry: S8Fixture['cases'][number], overrides: Partial<{ clause: boolean; reply: string; quest: boolean }> = {}): S8Record => ({
  key: entry.id, caseId: entry.id, plumbing: false, cast,
  capture: {
    requests: [`${overrides.clause === false ? 'The story has already decided these outcomes.' : HEADER}\n- ${entry.check.label}: fails.\nPlayer: ${entry.attempt}`],
    reply: overrides.reply ?? 'The ivy tears loose and you slide back down.', replyName: 'DM Narrator', error: null, plumbing: false,
    blocks: { outcome: `${HEADER}\n- ${entry.check.label}: fails.`, narratorBlock: entry.quest && overrides.quest !== false ? `Just happened, already decided (show it where it fits; never undo it):\n- Quest failed: ${entry.quest.title}` : '' },
  },
});
const records = (shape = record) => fixture.cases.map((entry) => shape(entry));
const labelsFor = (key: BlindKey<S8Secret>, pick: (secret: S8Secret, index: number) => S8Label | null, rater = 'second-model') => {
  const labels = new Map<string, StoredLabel<S8Label>>();
  Object.entries(key.items).forEach(([id, secret], index) => labels.set(id, { id, rater, model: 'fake', label: pick(secret, index) }));
  return labels;
};
const score = (recs: S8Record[], pick: (secret: S8Secret, index: number) => S8Label | null, extra: Partial<Parameters<typeof scoreS8>[0]> = {}) => {
  const { key } = s8Pack(fixture, recs, 's');
  const hash = s8HashOf(fixture);
  return scoreS8({ fixture, fixtureHash: hash, frozenHash: hash, records: recs, key, labels: labelsFor(key, pick), ...extra });
};
const clean = (): S8Label => ({ added: 'no', consequence: '', failureShown: 'yes' });

test('the S8 pack is blind and seeded; the listed lines ride the pack, the case id stays in the key', () => {
  const { pack, key } = s8Pack(fixture, records(), 'one');
  assert.equal(pack.items.length, 10);
  for (const item of pack.items) assert.deepEqual(Object.keys(item).sort(), ['id', 'listed', 'reply', 'scene']);
  assert.ok(!JSON.stringify(pack).includes('"caseId"'));
  assert.deepEqual(s8Pack(fixture, records(), 'one').pack, pack);
  assert.notDeepEqual(s8Pack(fixture, records(), 'two').pack.items.map((item) => item.id), pack.items.map((item) => item.id));
  const withQuest = pack.items.find((item) => item.listed.length === 2);
  assert.ok(withQuest && s8Prompt(withQuest).includes('- Quest failed:'));
  assert.equal(Object.keys(key.items).length, 10);
});

test('scorer records the unlisted-consequence rate unrounded with counts; planted controls', () => {
  const ok = score(records(), clean);
  assert.equal(ok.verdict, 'RECORDED');
  assert.equal(ok.unlisted.rate, 0);
  assert.equal(ok.unlisted.counts, '0/10');
  const added = score(records(), (secret) => (['s01', 's02', 's04'].includes(secret.caseId) ? { added: 'yes', consequence: 'a guard hears', failureShown: 'yes' } : clean()));
  assert.equal(added.unlisted.rate, 3 / 10);
  assert.equal(added.unlisted.withQuest, '1/5');
  assert.equal(added.unlisted.bare, '2/5');
  const noClause = score(records((entry) => record(entry, { clause: false })), clean);
  assert.equal(noClause.verdict, 'INCOMPLETE');
  assert.ok(noClause.incomplete.some((line) => line.includes('header clause')));
  const noQuestRow = score(records((entry) => record(entry, { quest: false })), clean);
  assert.ok(noQuestRow.incomplete.some((line) => line.includes('quest failure was not listed')));
  assert.equal(score(records(), (secret, index) => (index === 3 ? null : clean())).verdict, 'INCOMPLETE');
  assert.equal(score(records().slice(1), clean).verdict, 'INCOMPLETE');
  assert.equal(score(records((entry) => record(entry, { reply: ' ' })), clean).verdict, 'INCOMPLETE');
  assert.equal(score(records(), clean, { frozenHash: 'x' }).verdict, 'INCOMPLETE');
  assert.equal(score(records().map((item) => ({ ...item, plumbing: true })), clean).verdict, 'PLUMBING');
});

test('S8 labels parse strictly', () => {
  assert.deepEqual(parseS8Label({ added: 'yes', consequence: 'the alarm', failureShown: 'no' }), { added: 'yes', consequence: 'the alarm', failureShown: 'no' });
  assert.equal(parseS8Label({ added: 'maybe', failureShown: 'yes' }), null);
  assert.equal(parseS8Label(null), null);
});

test('CLI plumbing end to end with a fake lane: record, pack, rate, score says PLUMBING', async () => {
  const out = await mkdtemp(join(tmpdir(), 'so-s8-cli-'));
  const seen: string[] = [];
  const runner = (fn: (run: ScenarioRunner) => Promise<unknown>) => fn(async (file) => {
    const doc = JSON.parse(await readFile(file, 'utf-8'));
    seen.push(file);
    const story = doc.steps.find((step: any) => step.import_story).import_story;
    const entry = fixture.cases.find((item) => story.id.endsWith(item.id)) as S8Fixture['cases'][number];
    return { ok: true, capture: { ...record(entry).capture, plumbing: true } };
  });
  const log = () => {};
  assert.equal(await main(['record', '--out', out, '--plumbing'], { runner, log }), 0);
  assert.equal(seen.length, 10);
  assert.equal(await main(['pack', '--out', out, '--seed', 'cli'], { log }), 0);
  assert.equal(await main(['rate', '--out', out, '--plumbing'], { log }), 0);
  assert.equal(await main(['score', '--out', out, '--json', join(out, 'score.json')], { log }), 0);
  const result = await readJson<any>(join(out, 'score.json'));
  assert.equal(result.verdict, 'PLUMBING');
  assert.equal(result.unlisted.counts, '0/10');
});
