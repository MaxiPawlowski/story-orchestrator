import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFixture } from './lib/scenarioSchema.mts';
import { castOf, readJson, type ScenarioRunner } from './lib/replyCapture.mts';
import { checkG14, extrasOf, g14Job, g14Problems, readStateFile, type G14Fixture } from './lib/g14Promotion.mts';
import { fixtureHashOf, VOICING_FREEZE, VOICING_G14 } from './lib/rumorVoicing.mts';
import { loadFixtureKit, simulateG14 } from './lib/fixtureSim.mts';
import { main } from './so-rumor-voicing.mts';
import { testTempDir } from '../lib/testTemp.mjs';

const cast = castOf();
const fixture = await readJson<G14Fixture>(VOICING_G14);
const clone = (): G14Fixture => JSON.parse(JSON.stringify(fixture));

test('the committed G14 fixture is clean, frozen, 30 turns, true and false versions', async () => {
  assert.deepEqual(g14Problems(fixture, cast), []);
  const freeze = await readJson<{ files: Record<string, string> }>(VOICING_FREEZE);
  assert.equal(freeze.files['g14-fixture.json'], fixtureHashOf(fixture));
});

test('planted G14 fixture faults are named', () => {
  const short = clone();
  short.turns.pop();
  assert.ok(g14Problems(short, cast).some((problem) => problem.includes('29 turn')));
  const allFalse = clone();
  for (const rumor of allFalse.story.rumors) for (const version of rumor.versions) version.truth = 'false';
  assert.ok(g14Problems(allFalse, cast).some((problem) => problem.includes('true and false')));
  const unset = clone();
  for (const turn of unset.turns) turn.cp = (turn.cp ?? []).filter((command) => !command.startsWith('news_mine'));
  assert.ok(g14Problems(unset, cast).some((problem) => problem.includes('nothing sets news_mine')));
  const needles = clone();
  needles.claims.ferry.versions[0] = ['ferryman', 'burned'];
  assert.ok(g14Problems(needles, cast).some((problem) => problem.includes('rumor ferry: version 0')));
});

test('every rumor lands as hearsay in the shipped spread core over the scripted turns', async () => {
  const result = await simulateG14(await loadFixtureKit(), fixture, cast);
  assert.deepEqual(result.problems, []);
  assert.equal(result.hearsay, 4);
  assert.ok(result.landedAt.every((row) => row.boundary < 30));
});

test('the G14 scenario validates, compiles, keeps real reads on the real arm and pins them on plumbing', () => {
  for (const plumbing of [false, true]) {
    const job = g14Job(fixture, cast, plumbing);
    assert.deepEqual(validateFixture(job.doc, 'g14'), []);
    const text = JSON.stringify(job.doc);
    assert.equal(String((job.doc as any).steps[0].eval).includes('SCENE_NONE'), plumbing);
    assert.equal((job.doc as any).requires.lane, plumbing ? 'no-model' : 'model');
    const sends = (job.doc as any).steps.filter((step: any) => step.send).length;
    const sendas = (job.doc as any).steps.filter((step: any) => typeof step.slash === 'string' && step.slash.startsWith('/sendas')).length;
    assert.deepEqual([sends, sendas], [30, 30]);
    assert.ok(text.includes('regenerateCanon(true)') && text.includes('sealNow()'));
  }
});

const base = () => ({
  memory: {
    entries: [
      { id: 'f1', tier: 'facts', text: 'The party bought a coil of rope and a flask of lamp oil.' },
      { id: 'f2', tier: 'session_details', text: 'Arin said she heard the ferry sank and the ferryman drowned.' },
    ],
    epistemic: [{ subject: 'Arin', tag: 'knows', content: 'the party has a map of the coast road' }],
    canon: { text: 'The party reached a rainy market town. They bought supplies and rode out on the coast road.' },
    chapters: [{ consequences: [{ text: 'The party carries rope, oil and a coast road map.' }] }],
  },
  rumors: { hearsay: [1, 2, 3, 4].map((n) => ({ occurrenceId: `o${n}` })) },
  extraction: { audits: [{ rawResponse: 'FACT importance=2 text="The party bought rope."' }] },
});
const blob = (extras: unknown) => ({ version: 7, selectedStoryId: 'so-v44-g14', stories: { 'so-v44-g14': { extras } } });

test('checker: a clean recorded state passes, and an attributed row is listed, not counted', () => {
  const result = checkG14(fixture, blob(base()));
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.promoted, 0);
  assert.equal(result.attributed, 1);
  assert.equal(result.hits[0].surface, 'memory');
});

test('checker planted controls: a promoted fact, [knows] row, canon sentence and chapter consequence each fail', () => {
  const plant = (mutate: (extras: ReturnType<typeof base>) => void) => {
    const extras = base();
    mutate(extras);
    return checkG14(fixture, blob(extras));
  };
  const fact = plant((extras) => extras.memory.entries.push({ id: 'p', tier: 'facts', text: 'Rats have eaten half the winter grain in the granary.' }));
  assert.equal(fact.verdict, 'FAIL');
  assert.deepEqual(fact.hits.filter((hit) => !hit.attributed).map((hit) => [hit.surface, hit.rumorId, hit.which]), [['facts', 'granary', 'version 0']]);
  const knows = plant((extras) => extras.memory.epistemic.push({ subject: 'Arin', tag: 'knows', content: 'the lord\'s son died at the border fort' }));
  assert.equal(knows.verdict, 'FAIL');
  const canon = plant((extras) => { extras.memory.canon.text += ' The old mine on the hill holds silver nobody has found.'; });
  assert.equal(canon.verdict, 'FAIL');
  assert.equal(canon.hits.find((hit) => !hit.attributed)?.surface, 'canon');
  const chapter = plant((extras) => extras.memory.chapters[0].consequences.push({ text: 'The ferry sank in the night.' }));
  assert.equal(chapter.verdict, 'FAIL');
  assert.equal(chapter.hits.find((hit) => !hit.attributed)?.which, 'claim');
  const retired = plant((extras) => extras.memory.entries.push({ id: 'r', tier: 'facts', text: 'The ferry sank in the night.', supersededBy: 'x' } as any));
  assert.equal(retired.verdict, 'PASS');
});

test('checker: a run that did not exercise the surfaces is INCOMPLETE, never a pass', () => {
  const noHearsay = base();
  noHearsay.rumors.hearsay = noHearsay.rumors.hearsay.slice(0, 2);
  assert.equal(checkG14(fixture, blob(noHearsay)).verdict, 'INCOMPLETE');
  const noReads = base();
  noReads.extraction.audits = [];
  assert.equal(checkG14(fixture, blob(noReads)).verdict, 'INCOMPLETE');
  const noCanon = base();
  noCanon.memory.canon = null as any;
  assert.equal(checkG14(fixture, blob(noCanon)).verdict, 'INCOMPLETE');
  const noChapters = base();
  noChapters.memory.chapters = [];
  assert.equal(checkG14(fixture, blob(noChapters)).verdict, 'INCOMPLETE');
  assert.equal(checkG14(fixture, { stories: {} }).verdict, 'INCOMPLETE');
  assert.equal(checkG14(fixture, blob(base()), { plumbing: true }).verdict, 'PLUMBING');
});

test('checker reads a run record, a chat .jsonl and raw extras', async () => {
  const dir = await testTempDir('so-g14-');
  const record = join(dir, 'g14.json');
  await writeFile(record, JSON.stringify({ key: 'g14', capture: { blob: blob(base()), plumbing: false } }));
  const chat = join(dir, 'chat.jsonl');
  await writeFile(chat, `${JSON.stringify({ chat_metadata: { story_orchestrator: blob(base()) } })}\n{"mes":"hi"}\n`);
  for (const file of [record, chat]) assert.equal(checkG14(fixture, await readStateFile(file)).verdict, 'PASS');
  assert.ok(extrasOf(base(), 'x'));
  const lines: string[] = [];
  assert.equal(await main(['g14-check', '--state', record], { log: (line) => lines.push(line) }), 0);
  assert.ok(lines.join('\n').includes('"artifacts"'));
  const planted = base();
  planted.memory.entries.push({ id: 'p', tier: 'facts', text: 'The ferry sank and the ferryman drowned.' });
  const bad = join(dir, 'bad.json');
  await writeFile(bad, JSON.stringify(blob(planted)));
  assert.equal(await main(['g14-check', '--state', bad], { log: () => {} }), 1);
});

test('g14-record writes the stashed blob through the scenario runner', async () => {
  const out = await testTempDir('so-g14-rec-');
  const runner = (fn: (run: ScenarioRunner) => Promise<unknown>) => fn(async () => ({ ok: true, capture: { requests: [], reply: '', replyName: null, error: null, blocks: {}, plumbing: true, blob: blob(base()) } }));
  assert.equal(await main(['g14-record', '--out', out, '--plumbing'], { runner, log: () => {} }), 0);
  const lines: string[] = [];
  assert.equal(await main(['g14-check', '--state', join(out, 'records', 'g14.json')], { log: (line) => lines.push(line) }), 0);
  assert.ok(lines.join('\n').includes('"PLUMBING"'));
});
