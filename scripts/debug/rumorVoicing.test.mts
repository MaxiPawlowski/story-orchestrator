import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFixture } from './lib/scenarioSchema.mts';
import { rateItems, jsonObject } from './lib/blindRater.mts';
import { castOf, readJson, type ScenarioRunner } from './lib/replyCapture.mts';
import {
  ARMS, fixtureHashOf, parseVoicingLabel, scoreVoicing, VOICING_CASES, VOICING_FREEZE, voicingJobs, voicingPack, voicingProblems, voicingPrompt,
  type Arm, type VoicingFixture, type VoicingLabel, type VoicingRecord, type VoicingSecret,
} from './lib/rumorVoicing.mts';
import { loadFixtureKit, simulateVoicing } from './lib/fixtureSim.mts';
import { main } from './so-rumor-voicing.mts';
import type { BlindKey, StoredLabel } from './lib/blindRater.mts';

const cast = castOf();
const fixture = await readJson<VoicingFixture>(VOICING_CASES);
const clone = (): VoicingFixture => JSON.parse(JSON.stringify(fixture));
const evalsOf = (doc: any): string[] => doc.steps.filter((step: any) => typeof step.eval === 'string').map((step: any) => step.eval);

test('the committed fixture is clean, frozen, 20 cases', async () => {
  assert.deepEqual(voicingProblems(fixture, cast), []);
  assert.equal(fixture.cases.length, 20);
  const freeze = await readJson<{ files: Record<string, string> }>(VOICING_FREEZE);
  assert.equal(freeze.files['cases.json'], fixtureHashOf(fixture));
});

test('planted fixture faults are named', () => {
  const leaky = clone();
  leaky.cases[0].transcript[1].text = 'I saw soldiers by the bridge.';
  assert.ok(voicingProblems(leaky, cast).some((problem) => problem.includes('v01') && problem.includes('off arm could use it')));
  const noInvite = clone();
  noInvite.cases[1].transcript.push({ speaker: 'narrator', text: 'The wind rises.' });
  assert.ok(voicingProblems(noInvite, cast).some((problem) => problem.includes('v02') && problem.includes('invite')));
  const short = clone();
  short.cases.pop();
  assert.ok(voicingProblems(short, cast).some((problem) => problem.includes('19 case')));
  const piped = clone();
  piped.cases[2].transcript[0].text = 'He says | the mayor left for the capital on business.';
  assert.ok(voicingProblems(piped, cast).some((problem) => problem.includes('v03')));
  const unsaid = clone();
  unsaid.cases[3].transcript[0].text = 'The quay is busy.';
  assert.ok(voicingProblems(unsaid, cast).some((problem) => problem.includes('never says the origin')));
});

test('every generated scenario validates, compiles and carries its arm', () => {
  for (const plumbing of [false, true]) {
    const jobs = voicingJobs(fixture, ARMS, cast, plumbing);
    assert.equal(jobs.length, 40);
    for (const job of jobs) {
      assert.deepEqual(validateFixture(job.doc, job.key), [], job.key);
      const doc = job.doc as any;
      assert.equal(doc.requires.lane, plumbing ? 'no-model' : 'model');
      assert.equal(doc.requires.group, cast.group);
      const evals = evalsOf(doc).join('\n');
      assert.ok(evals.includes("storyOrchestratorDebugExtractionResponse\"] = \"SCENE_NONE\""));
      const arm = (job.meta as { arm: Arm }).arm;
      assert.equal(evals.includes("setFeatureOverride('rumors', 'off')"), arm === 'off');
      assert.ok(evals.includes('told you:'));
      const generate = doc.steps.at(-1).eval as string;
      assert.equal(generate.includes('h.generate("Arin", null'), !plumbing);
      assert.equal(doc.steps.filter((step: any) => step.import_story).length, 1);
    }
  }
});

test('the shipped parser and spread core land every hearsay line before the invite', async () => {
  const kit = await loadFixtureKit();
  assert.deepEqual((await simulateVoicing(kit, fixture, cast)).problems, []);
  const control = clone();
  control.cases = [control.cases[0]];
  control.cases[0].transcript = [control.cases[0].transcript[0], control.cases[0].transcript[3]];
  const planted = await simulateVoicing(kit, control, cast);
  assert.ok(planted.problems.some((problem) => problem.startsWith('v01: the hearsay line did not land')));
});

const capture = (entry: VoicingFixture['cases'][number], arm: Arm, overrides: Partial<{ reply: string; hearsay: boolean }> = {}) => ({
  requests: [`Narration: ${entry.origin}.\n${(overrides.hearsay ?? arm === 'on') ? `- DM Narrator told you: ${entry.received} (you are not sure of it; hearsay, it may be wrong)\n` : ''}Player: tell me`],
  reply: overrides.reply ?? (arm === 'on' ? `I heard ${entry.received}.` : `${entry.origin}.`), replyName: 'Arin', error: null, blocks: {}, plumbing: false,
});

const records = (shape: (entry: VoicingFixture['cases'][number], arm: Arm) => ReturnType<typeof capture> = capture): VoicingRecord[] =>
  fixture.cases.flatMap((entry) => ARMS.map((arm) => ({ key: `${entry.id}-${arm}`, caseId: entry.id, arm, plumbing: false, cast, capture: shape(entry, arm) })));

test('the pack is blind and seeded; the key stays apart', () => {
  const { pack, key } = voicingPack(fixture, records(), 'seed-1');
  assert.equal(pack.items.length, 40);
  for (const item of pack.items) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'reply', 'scene', 'speaker', 'versionA', 'versionB']);
    assert.ok(!/\b(on|off)\b"|received|origin/.test(JSON.stringify(Object.keys(item))));
    assert.ok(key.items[item.id]);
  }
  assert.ok(!JSON.stringify(pack).includes('"arm"'));
  const again = voicingPack(fixture, records(), 'seed-1');
  assert.deepEqual(again.pack, pack);
  const other = voicingPack(fixture, records(), 'seed-2');
  assert.notDeepEqual(other.pack.items.map((item) => item.reply), pack.items.map((item) => item.reply));
  const firsts = new Set(Object.values(key.items).map((secret) => secret.A));
  assert.deepEqual([...firsts].sort(), ['origin', 'received']);
  const prompt = voicingPrompt(pack.items[0]);
  assert.ok(!/\b(arm|feature off|feature on|hearsay line|private block)\b/i.test(prompt));
  assert.ok(prompt.includes('"uses"') && prompt.includes('"framing"'));
});

const labelsFor = (key: BlindKey<VoicingSecret>, pick: (secret: VoicingSecret, index: number) => VoicingLabel | null, rater = 'second-model') => {
  const labels = new Map<string, StoredLabel<VoicingLabel>>();
  Object.entries(key.items).forEach(([id, secret], index) => labels.set(id, { id, rater, model: 'fake', label: pick(secret, index) }));
  return labels;
};
const letter = (secret: VoicingSecret, version: 'origin' | 'received') => (secret.A === version ? 'A' : 'B');
const good = (secret: VoicingSecret): VoicingLabel => (secret.arm === 'on'
  ? { uses: letter(secret, 'received'), framing: 'heard', quote: '' }
  : { uses: letter(secret, 'origin'), framing: 'fact', quote: '' });

const score = (recs: VoicingRecord[], pick: (secret: VoicingSecret, index: number) => VoicingLabel | null, extra: Partial<Parameters<typeof scoreVoicing>[0]> = {}) => {
  const { key } = voicingPack(fixture, recs, 's');
  const hash = fixtureHashOf(fixture);
  return scoreVoicing({ fixture, fixtureHash: hash, frozenHash: hash, records: recs, key, labels: labelsFor(key, pick), ...extra });
};

test('scorer: a clean run passes with unrounded rates and counts', () => {
  const result = score(records(), good);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.checks.g7.on, 1);
  assert.equal(result.checks.g7.off, 0);
  assert.equal(result.checks.g7Lift.value, 1);
  assert.equal(result.checks.g8.on, 1);
  assert.equal(result.checks.g7.onCounts, '20/20');
});

test('scorer planted controls: G7 below floor, flat lift, G8 below floor', () => {
  const lowG7 = score(records(), (secret) => {
    const index = Number(secret.caseId.slice(1));
    return secret.arm === 'on' && index > 13 ? { uses: letter(secret, 'origin'), framing: 'fact', quote: '' } : good(secret);
  });
  assert.equal(lowG7.verdict, 'FAIL');
  assert.equal(lowG7.checks.g7.on, 13 / 20);
  assert.equal(lowG7.checks.g7.ok, false);
  const flat = score(records(), (secret) => {
    const index = Number(secret.caseId.slice(1));
    return secret.arm === 'off' && index <= 15 ? { uses: letter(secret, 'received'), framing: 'heard', quote: '' } : good(secret);
  });
  assert.equal(flat.verdict, 'FAIL');
  assert.equal(flat.checks.g7.ok, true);
  assert.equal(flat.checks.g7Lift.ok, false);
  assert.equal(flat.checks.g7Lift.value, 1 - 15 / 20);
  const lowG8 = score(records(), (secret) => {
    const index = Number(secret.caseId.slice(1));
    return secret.arm === 'on' && index > 15 ? { uses: 'both', framing: 'fact', quote: '' } : good(secret);
  });
  assert.equal(lowG8.verdict, 'FAIL');
  assert.equal(lowG8.checks.g8.on, 15 / 20);
  assert.equal(lowG8.checks.g7.on, 1);
});

test('scorer: missing label, missing hearsay in the on request, hearsay in the off request, drift and plumbing', () => {
  assert.equal(score(records(), (secret, index) => (index === 0 ? null : good(secret))).verdict, 'INCOMPLETE');
  const noHearsay = score(records((entry, arm) => capture(entry, arm, { hearsay: false })), good);
  assert.equal(noHearsay.verdict, 'INCOMPLETE');
  assert.ok(noHearsay.incomplete.some((line) => line.includes("on arm's request lacks the hearsay")));
  const leaked = score(records((entry, arm) => capture(entry, arm, { hearsay: true })), good);
  assert.ok(leaked.incomplete.some((line) => line.includes("off arm's request carries")));
  assert.equal(score(records().slice(1), good).verdict, 'INCOMPLETE');
  assert.equal(score(records(), good, { frozenHash: 'other' }).verdict, 'INCOMPLETE');
  const canned = records().map((record) => ({ ...record, plumbing: true }));
  assert.equal(score(canned, good).verdict, 'PLUMBING');
});

test('labels parse strictly; a JSON object is found inside prose', () => {
  assert.deepEqual(parseVoicingLabel(jsonObject('Sure. {"uses": "B", "framing": "heard", "quote": "I heard {it}"} done')), { uses: 'B', framing: 'heard', quote: 'I heard {it}' });
  assert.equal(parseVoicingLabel({ uses: 'C', framing: 'heard' }), null);
  assert.equal(parseVoicingLabel({ uses: 'A', framing: 'maybe' }), null);
  assert.equal(parseVoicingLabel(null), null);
});

test('rateItems asks once per item, resumes, and records failures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-v44-rate-'));
  const { pack } = voicingPack(fixture, records().slice(0, 4), 'r');
  const prompts: string[] = [];
  let calls = 0;
  const ask = async (prompt: string, work: string) => {
    calls += 1;
    prompts.push(prompt);
    assert.ok(!work.includes('so-pf-44') && !work.includes('story-orchestrator'));
    if (calls === 2) throw new Error('boom');
    return { text: 'ok {"uses":"neither","framing":"none","quote":""}', model: 'fake-model' };
  };
  const first = await rateItems({ items: pack.items, dir, prompt: voicingPrompt, parse: parseVoicingLabel, ask, width: 1, log: () => {} });
  assert.deepEqual({ asked: first.asked, failed: first.failed }, { asked: 3, failed: 1 });
  const second = await rateItems({ items: pack.items, dir, prompt: voicingPrompt, parse: parseVoicingLabel, ask, width: 1, log: () => {} });
  assert.deepEqual({ asked: second.asked, failed: second.failed }, { asked: 1, failed: 0 });
  assert.equal((await readdir(dir)).length, 4);
  const stored = JSON.parse(await readFile(join(dir, `${pack.items[0].id}.json`), 'utf-8'));
  assert.deepEqual(stored.label, { uses: 'neither', framing: 'none', quote: '' });
  assert.equal(stored.rater, 'second-model');
});

const fakeRunner = (seen: string[]): ((fn: (run: ScenarioRunner) => Promise<unknown>) => Promise<unknown>) => (fn) => fn(async (file, group) => {
  assert.equal(group, cast.group);
  const doc = JSON.parse(await readFile(file, 'utf-8'));
  seen.push(file);
  const story = doc.steps.find((step: any) => step.import_story).import_story;
  const entry = fixture.cases.find((item) => story.id.endsWith(item.id)) as VoicingFixture['cases'][number];
  const arm: Arm = JSON.stringify(doc).includes('setFeatureOverride') ? 'off' : 'on';
  return { ok: true, capture: { ...capture(entry, arm), reply: arm === 'on' ? `Word is that ${entry.received}.` : `They say ${entry.origin}.`, plumbing: true } };
});

test('CLI plumbing end to end with a fake lane: record, pack, rate, score says PLUMBING', async () => {
  const out = await mkdtemp(join(tmpdir(), 'so-v44-cli-'));
  const seen: string[] = [];
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  assert.equal(await main(['record', '--out', out, '--arm', 'both', '--plumbing'], { runner: fakeRunner(seen), log }), 0);
  assert.equal(seen.length, 40);
  assert.equal(await main(['record', '--out', out, '--arm', 'both', '--plumbing'], { runner: fakeRunner(seen), log }), 0);
  assert.equal(seen.length, 40);
  assert.equal(await main(['pack', '--out', out, '--seed', 'cli'], { log }), 0);
  assert.equal(await main(['rate', '--out', out, '--plumbing'], { log }), 0);
  assert.equal(await main(['score', '--out', out, '--json', join(out, 'score.json')], { log }), 0);
  const result = await readJson<any>(join(out, 'score.json'));
  assert.equal(result.verdict, 'PLUMBING');
  assert.equal(result.checks.g7.on, 1);
  assert.equal(result.checks.g7.off, 0);
  assert.equal(result.checks.g8.on, 1);
  assert.deepEqual(result.raters, ['plumbing']);
});
