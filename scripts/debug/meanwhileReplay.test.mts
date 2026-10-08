import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { goalOf, parseProposalLabel, proposalLabelPrompt, scoreL3, unreachedHits, type CaseReplay, type MeanwhileCase, type ProposalLabel } from './lib/meanwhileReplay.mts';

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/meanwhile-proposals.cases.json'), 'utf-8'));
const story = JSON.parse(readFileSync(join(process.cwd(), fixture.story), 'utf-8'));
const cases: MeanwhileCase[] = fixture.cases;

const replays = (text: (entry: MeanwhileCase, index: number) => string | null): CaseReplay[] => cases.map((entry, index) => {
  const line = text(entry, index);
  return { proposals: line === null ? [] : [{ memberId: entry.member, agendaId: entry.agenda, text: line }], refused: [] };
});
const labels = (list: CaseReplay[], over: (index: number) => Partial<ProposalLabel> = () => ({})): ProposalLabel[] =>
  list.flatMap((replay, index) => replay.proposals.map((_, at) => ({ case: index + 1, proposal: at, inGoal: true, narratesPlayer: false, ...over(index) })));

test('37 L3: the fixture is the frozen 20-case gate with a spoiler subset, and its floors match the plan', () => {
  assert.equal(cases.length, 20);
  assert.deepEqual(fixture.floors, { inGoalRate: 0.85, narratedPlayerActions: 0, unreachedReferencesInSpoilerSubset: 0, runs: 2 });
  assert.ok(cases.some((entry) => entry.spoiler));
  assert.ok(goalOf(story, cases[0].member, cases[0].agenda));
});

test('37 L3: in-goal >= 0.85, 0 narrated, 0 unreached passes; planted failures fail', () => {
  const clean = replays(() => 'Arin sold a bracelet at the stall.');
  assert.equal(scoreL3(cases, clean, labels(clean)).verdict, 'PASS');
  const offGoal = scoreL3(cases, clean, labels(clean, (index) => ({ inGoal: index > 3 })));
  assert.equal(offGoal.floors.inGoal.value, 0.8);
  assert.equal(offGoal.verdict, 'FAIL');
  assert.equal(scoreL3(cases, clean, labels(clean, (index) => ({ inGoal: index > 2 }))).verdict, 'PASS', '17 of 20 is exactly 0.85');
  assert.equal(scoreL3(cases, clean, labels(clean, (index) => ({ narratesPlayer: index === 7 }))).verdict, 'FAIL');
  const leak = replays((entry) => (entry.spoiler ? 'Arin rehearsed the confession.' : 'Arin counted coins.'));
  const leaked = scoreL3(cases, leak, labels(leak));
  assert.equal(leaked.floors.unreached.value, cases.filter((entry) => entry.spoiler).length);
  assert.equal(leaked.verdict, 'FAIL');
  const notSpoiler = cases.find((entry) => !entry.spoiler);
  assert.equal(unreachedHits({ ...notSpoiler, unreached: ['coins'] }, 'coins'), 0, 'only the spoiler subset is counted');
});

test('37 L3 is INCOMPLETE without proposals, with an unparsed label, an errored replay or a short fixture', () => {
  const none = replays(() => null);
  assert.match(scoreL3(cases, none, []).incomplete.join(), /no proposal in any case/);
  const clean = replays(() => 'Arin sold a bracelet.');
  const unparsed = labels(clean);
  unparsed[0] = { ...unparsed[0], inGoal: null };
  assert.equal(scoreL3(cases, clean, unparsed).verdict, 'INCOMPLETE');
  const errored = clean.map((replay, index) => (index ? replay : { ...replay, error: 'timeout' }));
  assert.equal(scoreL3(cases, errored, labels(errored)).verdict, 'INCOMPLETE');
  assert.equal(scoreL3(cases.slice(1), clean.slice(1), labels(clean.slice(1))).verdict, 'INCOMPLETE');
});

test('37 L3 labels: strict lines, the prompt carries the goal and the proposal', () => {
  assert.deepEqual(parseProposalLabel('IN_GOAL: yes\nNARRATES_PLAYER: no'), { inGoal: true, narratesPlayer: false });
  assert.deepEqual(parseProposalLabel('in goal'), { inGoal: null, narratesPlayer: null });
  assert.match(proposalLabelPrompt('pay the debt', { memberId: 'arin', text: 'Arin sold a ring.' }), /pay the debt[\s\S]*Arin sold a ring/);
  const prompt = proposalLabelPrompt('pay the debt', { memberId: 'arin', text: 'She sold a ring.' });
  assert.match(prompt, /arin is not the player character/, 'B1b H4: the labeller is told whose event it is');
  assert.doesNotMatch(prompt, /yes\|no/, 'B1b H4: no yes|no template whose first option a model echoes (Artemis answered yes/yes on 39 of 40)');
});
