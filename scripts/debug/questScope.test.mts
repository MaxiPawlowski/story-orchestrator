import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveRead } from './lib/b1Runs.mts';
import { applyGuarded, caseOutcome, caseProblems, caseSpec, holds, scoreM1, scoreM2, transcriptUpTo, type ArmRun, type CompletionCase } from './lib/questScope.mts';

const read = (over: Partial<LiveRead> = {}): LiveRead => ({
  ms: 1000, tokens: 1000, scope: [], sources: [{ kind: 'quest', cap: null, keys: [], dropped: [] }], deltas: [], guarded: [], facts: [], rejected: [], judged: null, prompt: '', rawResponse: '', ...over,
});

const entry = (latches: boolean, over: Partial<CompletionCase> = {}): CompletionCase => ({
  id: 'c', latches, expected: { q: 'clues', v: 3 }, before: { clues: 2 }, turns: [{ player: 'I show the letter.', replies: [{ speaker: 'Kela', text: 'That settles it.' }] }],
  facts: { none: 'no facts claimed' }, rejected: [], ...over,
});

const cases = (latching = 14) => Array.from({ length: 20 }, (_, index) => entry(index < latching));

const outcomesFor = (list: CompletionCase[], wrote: (index: number) => unknown | null) => list.map((item, index) => {
  const value = wrote(index);
  return caseOutcome(index + 1, item, [{ turn: 1, read: read({ guarded: value === null ? [] : [{ q: 'clues', v: value }] }) }]);
});

test('36 Q1 M2: recall over latching cases and false latches over all 20 decide; planted pass and fail', () => {
  const list = cases();
  const pass = scoreM2(outcomesFor(list, (index) => (index < 12 ? 3 : null)), caseProblems(list));
  assert.equal(pass.verdict, 'PASS', JSON.stringify(pass.floors));
  assert.equal(pass.floors.recall.value, 0.8571);
  const low = scoreM2(outcomesFor(list, (index) => (index < 11 ? 3 : null)), caseProblems(list));
  assert.equal(low.verdict, 'FAIL', '11 of 14 is 0.786');
  const falseLatched = scoreM2(outcomesFor(list, (index) => (index < 14 || index >= 18 ? 3 : null)), caseProblems(list));
  assert.equal(falseLatched.floors.falseLatches.value, 2);
  assert.equal(falseLatched.verdict, 'FAIL');
  const oneFalse = scoreM2(outcomesFor(list, (index) => (index < 14 || index === 19 ? 3 : null)), caseProblems(list));
  assert.equal(oneFalse.verdict, 'PASS', '1 of 20 false latches is the ceiling');
});

test('36 Q1 M2 is INCOMPLETE on 19 cases, an over-long case or an errored read', () => {
  const short = cases().slice(0, 19);
  assert.equal(scoreM2(outcomesFor(short, () => 3), caseProblems(short)).verdict, 'INCOMPLETE');
  const long = cases().map((item, index) => (index ? item : { ...item, turns: Array.from({ length: 5 }, () => item.turns[0]) }));
  assert.match(caseProblems(long).join(), /5 turns, more than the act plus 3/);
  const list = cases();
  const errored = list.map((item, index) => caseOutcome(index + 1, item, [{ turn: 1, read: read({ error: index ? undefined : 'no answer' }) }]));
  assert.equal(scoreM2(errored, caseProblems(list)).verdict, 'INCOMPLETE');
});

test('36 Q1 replay helpers: a counter latches at or past the target, the transcript grows turn by turn, guarded deltas carry forward', () => {
  assert.equal(holds(3, 3, 2), true);
  assert.equal(holds(3, 4, 2), true);
  assert.equal(holds(3, 2, 1), false);
  assert.equal(holds('found', 'found', undefined), true);
  const two = entry(true, { turns: [{ player: 'a', replies: [{ speaker: 'K', text: 'b' }] }, { player: 'c', replies: [] }] });
  assert.deepEqual(transcriptUpTo(two, 2).map((row) => [row.speaker, row.text, row.is_user === true]), [['You', 'a', true], ['K', 'b', false], ['You', 'c', true]]);
  assert.deepEqual(caseSpec({}, two, 1, { clues: 2 }).scopeCaps, { quest: null });
  assert.deepEqual(applyGuarded({ clues: 2 }, read({ guarded: [{ q: 'clues', v: 3 }] })), { clues: 3 });
});

const armRun = (arm: number, { accuracy = 1, tokens = 1000, ms = 1000, extra = arm }: { accuracy?: number; tokens?: number; ms?: number; extra?: number } = {}): ArmRun => {
  const list = cases(20);
  return {
    arm,
    cases: list,
    reads: list.map((_, index) => [{ turn: 1, read: read({ tokens, ms, guarded: index < Math.round(accuracy * 20) ? [{ q: 'clues', v: 3 }] : [], sources: [{ kind: 'quest', cap: null, keys: Array.from({ length: 1 + extra }, (__, key) => `q${key}`), dropped: [] }] }) }]),
  };
};

const withFacts = (run: ArmRun): ArmRun => ({ ...run, cases: run.cases.map((item) => ({ ...item, facts: { mustNotContain: ['dragon'] } })) });

test('36 Q1 M1: tiers within 3 points, tokens +15 %, p50 +20 %; the highest passing arm sets the cap', () => {
  const runs = [armRun(0), armRun(5, { tokens: 1100, ms: 1150 }), armRun(10, { tokens: 1140, accuracy: 0.95 }), armRun(20, { tokens: 1300 })].map(withFacts);
  const result = scoreM1(runs);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.incomplete));
  assert.deepEqual(result.judged.map((row) => [row.arm, row.passes]), [[5, true], [10, false], [20, false]], '5 points down on deltas fails arm 10; +30 % tokens fails arm 20');
  assert.equal(result.questScopeCap, 5);
  const fiveFails = scoreM1([armRun(0), armRun(5, { ms: 1300 }), armRun(10), armRun(20)].map(withFacts));
  assert.equal(fiveFails.verdict, 'FAIL');
  assert.match(fiveFails.decision, /without side quests discovered by extraction/);
});

test('36 Q1 M1 is INCOMPLETE when a tier the floor names is stated by no case, an arm is missing, or the cap clipped an arm', () => {
  const unstated = scoreM1([armRun(0), armRun(5), armRun(10), armRun(20)]);
  assert.equal(unstated.verdict, 'INCOMPLETE');
  assert.match(unstated.incomplete.join(), /tier facts is stated by no case/);
  assert.match(scoreM1([armRun(0), armRun(5)].map(withFacts)).incomplete.join(), /arm 10 did not run/);
  const clipped = scoreM1([armRun(0), armRun(5), armRun(10, { extra: 5 }), armRun(20, { extra: 5 })].map(withFacts));
  assert.match(clipped.incomplete.join(), /arm 10 carried 5 extra quest key\(s\) in scope, not 10/);
  assert.equal(clipped.questScopeCap, null);
});
