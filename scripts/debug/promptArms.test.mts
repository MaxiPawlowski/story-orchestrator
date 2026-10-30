import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture } from './lib/scenarioSchema.mts';
import { castOf, readJson } from './lib/replyCapture.mts';
import type { StoredLabel } from './lib/blindRater.mts';
import {
  ARM_GATES, ARMS_FREEZE, GATES, PROMPT_ARMS, armJobs, armPack, armPrompt, buildCases, caseProblems, copiedSpan, echoed, fixtureHashOf, parseArmLabel,
  plumbingArmLabel, scoreArms, OUTWARD_MARKER, SWIPE_MARKER, type ArmFixture, type ArmGate, type ArmLabel, type ArmRecord, type PromptArm,
} from './lib/promptArms.mts';
import { loadFixture } from './so-prompt-arms.mts';

const cast = castOf();
const evalsOf = (doc: any): string[] => doc.steps.filter((step: any) => typeof step.eval === 'string').map((step: any) => step.eval);

test('the committed fixtures are clean, rebuilt from the pools, 25 cases each, and frozen', async () => {
  const freeze = await readJson<{ files: Record<string, string> }>(ARMS_FREEZE);
  for (const gate of ARM_GATES) {
    const fixture = await loadFixture(gate);
    assert.deepEqual(caseProblems(fixture, cast), [], gate);
    assert.equal(fixture.cases.length, 25);
    assert.deepEqual(fixture, buildCases(gate));
    assert.equal(freeze.files[GATES[gate].file], fixtureHashOf(fixture));
  }
});

test('planted fixture faults are named', () => {
  const outward = buildCases('outward');
  outward.cases[0].transcript[0].text = `She sold the map | ${outward.cases[0].transcript[0].text}`;
  assert.ok(caseProblems(outward, cast).some((problem) => problem.startsWith('case o01')));
  const swipe = buildCases('swipe');
  swipe.cases[1].rejected = 'Too short.';
  assert.ok(caseProblems(swipe, cast).some((problem) => problem.includes('s02') && problem.includes('30 words')));
  const notes = buildCases('notes');
  notes.cases[2].truth = { place: 'mill', part: 'night' };
  notes.cases[2].transcript.forEach((line) => { if (line.set) line.set.location = 'harbor'; });
  assert.ok(caseProblems(notes, cast).some((problem) => problem.includes('n03')));
});

test('every generated scenario validates, compiles, switches only its own setting and resets it', () => {
  for (const gate of ARM_GATES) {
    for (const plumbing of [false, true]) {
      const jobs = armJobs(buildCases(gate), PROMPT_ARMS, cast, plumbing);
      assert.equal(jobs.length, 50);
      for (const job of jobs) {
        assert.deepEqual(validateFixture(job.doc, job.key), [], job.key);
        const doc = job.doc as any;
        assert.equal(doc.requires.lane, plumbing ? 'no-model' : 'model');
        for (const code of evalsOf(doc)) assert.doesNotThrow(() => new Function(`return (async () => { ${code} })()`), job.key);
        const evals = evalsOf(doc).join('\n');
        const arm = (job.meta as { arm: PromptArm }).arm;
        const [, key] = GATES[gate].setting.split('.');
        assert.ok(evals.includes(`${key}: ${arm === 'on'}`) || evals.includes(`.${key} = true`) || evals.includes(`delete root.settings.talk.${key}`), job.key);
        assert.ok(evals.includes('storyOrchestratorDebugExtractionResponse"] = "SCENE_NONE"'));
        assert.ok(evalsOf(doc).at(-1)!.includes('reset: true'));
        assert.equal(evals.includes('h.swipe('), gate === 'swipe');
      }
    }
  }
});

const reply = (gate: ArmGate, arm: PromptArm, index: number) => (gate === 'swipe' && arm === 'off' ? buildCases('swipe').cases[index].rejected!.replace('{receiver}', cast.receiver) : `Reply ${arm} ${index}: she turns the cup in her hands.`);

const records = (fixture: ArmFixture): ArmRecord[] => fixture.cases.flatMap((entry, index) => PROMPT_ARMS.map((arm) => ({
  key: `${entry.id}-${arm}`, gate: fixture.gate, caseId: entry.id, arm, plumbing: false, cast,
  capture: {
    requests: [arm === 'on' ? (fixture.gate === 'outward' ? OUTWARD_MARKER : fixture.gate === 'swipe' ? SWIPE_MARKER : 'x\n[Day 1, evening, the night market]\ny') : 'plain request'],
    reply: reply(fixture.gate, arm, index), raw: reply(fixture.gate, arm, index), reasoning: 40, replyName: 'Arin', error: null,
  },
})));

test('the pack is pairwise, blind and seeded; the key stays apart', () => {
  for (const gate of ARM_GATES) {
    const fixture = buildCases(gate);
    const { pack, key } = armPack(fixture, records(fixture), 'seed-1');
    assert.equal(pack.items.length, 25);
    const text = JSON.stringify(pack);
    assert.ok(!/"arm"|"on"|"off"|outwardNarration|historyNotes|swipeContrast/.test(text));
    assert.deepEqual([...new Set(Object.values(key.items).map((secret) => secret.A))].sort(), ['off', 'on']);
    assert.deepEqual(armPack(fixture, records(fixture), 'seed-1').pack, pack);
    const prompt = armPrompt(pack.items[0]);
    assert.ok(!/\b(arm|trial|setting|history note|clause)\b/i.test(prompt), gate);
    assert.equal(prompt.includes('rejected this earlier reply'), gate === 'swipe');
  }
});

test('the label parser refuses a malformed answer', () => {
  const side = { character: 4, scene: 4, prose: 3, agency: 5, flag: false, interior: 0, restates: false, contradicts: false, differs: 3 };
  assert.ok(parseArmLabel({ A: side, B: side, prefer: 'A', differs: null }));
  assert.equal(parseArmLabel({ A: side, B: { ...side, prose: 9 }, prefer: 'A', differs: null }), null);
  assert.equal(parseArmLabel({ A: side, B: side, prefer: 'left', differs: null }), null);
});

test('span copy and echo are counted in code', () => {
  assert.equal(copiedSpan('she said the guards closed it two days ago and nobody came', 'The guards closed it two days ago and nobody has come through since.'), true);
  assert.equal(copiedSpan('A different answer entirely.', 'The guards closed it two days ago and nobody has come through since.'), false);
  assert.equal(echoed('[Day 2, evening, the docks]\nShe waves.'), true);
  assert.equal(echoed('She waves. [Day 2]'), false);
});

const labelsFor = (key: ReturnType<typeof armPack>['key'], pick: (on: 'A' | 'B') => ArmLabel, rater = 'second-model') => {
  const labels = new Map<string, StoredLabel<ArmLabel>>();
  for (const [id, secret] of Object.entries(key.items)) labels.set(id, { id, rater, model: 'fake', label: pick(secret.A === 'on' ? 'A' : 'B') });
  return labels;
};

const side = (patch: Partial<ArmLabel['A']> = {}) => ({ scores: { character: 4, scene: 4, prose: 4, agency: 4 }, flag: false, interior: 0, restates: false, contradicts: false, differs: 3, ...patch });

test('score: floors pass on a good on arm, fail on a worse one, plumbing never reads as a measurement', () => {
  const fixture = buildCases('swipe');
  const recs = records(fixture);
  const { key, pack } = armPack(fixture, recs, 's');
  const hash = fixtureHashOf(fixture);
  const run = (pick: (on: 'A' | 'B') => ArmLabel, rater?: string) => scoreArms({ fixture, fixtureHash: hash, frozenHash: hash, records: recs, key, labels: labelsFor(key, pick, rater) });
  const good = run((on) => ({ A: side(), B: side(), prefer: on, differs: on, note: '' }));
  assert.equal(good.verdict, 'PASS', JSON.stringify(good.incomplete));
  const worse = run((on) => ({ A: on === 'A' ? side({ scores: { character: 2, scene: 4, prose: 4, agency: 4 } }) : side(), B: on === 'B' ? side({ scores: { character: 2, scene: 4, prose: 4, agency: 4 } }) : side(), prefer: 'tie', differs: on === 'A' ? 'B' : 'A', note: '' }));
  assert.equal(worse.verdict, 'FAIL');
  const label = plumbingArmLabel(key);
  const plumbingLabels = new Map(pack.items.map((item) => [item.id, { id: item.id, rater: 'plumbing', model: null, label: label(item) }]));
  assert.equal(scoreArms({ fixture, fixtureHash: hash, frozenHash: hash, records: recs, key, labels: plumbingLabels }).verdict, 'PLUMBING');
  const drifted = scoreArms({ fixture, fixtureHash: hash, frozenHash: 'other', records: recs, key, labels: labelsFor(key, (on) => ({ A: side(), B: side(), prefer: on, differs: on, note: '' })) });
  assert.equal(drifted.verdict, 'INCOMPLETE');
});

test('score: an on arm whose request lacks its block is incomplete', () => {
  const fixture = buildCases('outward');
  const recs = records(fixture).map((record) => (record.arm === 'on' && record.caseId === 'o01' ? { ...record, capture: { ...record.capture, requests: ['plain'] } } : record));
  const { key } = armPack(fixture, recs, 's');
  const hash = fixtureHashOf(fixture);
  const result = scoreArms({ fixture, fixtureHash: hash, frozenHash: hash, records: recs, key, labels: labelsFor(key, (on) => ({ A: side(), B: side(), prefer: on, differs: null, note: '' })) });
  assert.equal(result.verdict, 'INCOMPLETE');
  assert.ok(result.incomplete.some((line) => line.startsWith('o01-on')));
});
