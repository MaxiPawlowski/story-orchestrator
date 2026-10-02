import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { wizardAllowance } from './sessionWizardAssets.mts';
import { diffHeaders, parseAllow } from '../so-run-header.mts';
import { headerDiffArgs } from './sessionStop.mts';
import { validateCardDoc, rubricTemplate, type CardDoc } from './sessionCharters.mts';
import { cardCommands } from './sessionRunbook.mts';
import { driverOnlyFlags } from './sessionDigest.mts';
import { agentProblems, runAgentVerb, type AgentUi } from './sessionDriver.mts';
import { agentModeTarget } from '../so-ui.mts';
import { findCard, loadCards, loadIndex, loadSessionFiles, parseLiveArgs, scoreCommand, scoreRefusal } from '../so-session.mts';
import { digestSession } from './sessionDigest.mts';

const T52 = resolve(REPO_ROOT, 'test', 'sessions', 'T5', 'T5-2-1');
const json = (name: string) => JSON.parse(readFileSync(resolve(T52, name), 'utf-8'));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const WIZARD_PATHS = ['inventory.characterCount', 'inventory.lorebookCount', 'inventory.lorebooksSelected', 'inventory.v2Stories', 'inventory.wizardSessions'];

function t52() {
  const drafts = json('wizard-drafts.json');
  const start = json('run-header-start.json');
  const end = json('run-header-end.json');
  end.inventory.wizardSessions = drafts.sessions.map((session: { key: string }) => session.key).sort();
  const session = json('session.json');
  return { drafts, start, end, startedAt: session.startedAt as string };
}

const blockingIn = (before: unknown, after: unknown, allow: string[]) => diffHeaders(before, after, allow).filter((difference) => !difference.allowed && WIZARD_PATHS.includes(difference.path)).map((difference) => difference.path);

test('T5-2 wizard assets: the recorded T5-2-1 ledger allows exactly the five paths that made the session INVALID', () => {
  const { drafts, start, end, startedAt } = t52();
  assert.deepEqual(blockingIn(start, end, []), WIZARD_PATHS);
  const { allow, ledger } = wizardAllowance(start, drafts, startedAt);
  assert.deepEqual(ledger.sessions.sort(), ['the-hoard-of-the-unflown', 'the-pawnbroker-of-forgotten-days', 'untitled-story']);
  assert.deepEqual(ledger.stories.sort(), ['the-hoard-of-the-unflown', 'the-pawnbroker-of-forgotten-days']);
  assert.equal(ledger.characters.length, 9);
  assert.deepEqual(ledger.lorebooks.sort(), ['The Hoard of the Unflown — Lore', 'The Pawnbroker of Forgotten Days']);
  assert.ok(allow.includes('inventory.characterCount=+9'));
  assert.ok(allow.includes('inventory.lorebookCount=+2'));
  assert.deepEqual(blockingIn(start, end, allow), []);
  assert.deepEqual(parseAllow(allow).errors, []);
});

test('T5-2 wizard assets: a removal, an unledgered character or book, and a foreign story still block', () => {
  const { drafts, start, end, startedAt } = t52();
  const { allow } = wizardAllowance(start, drafts, startedAt);
  const removed = clone(end);
  removed.inventory.v2Stories = removed.inventory.v2Stories.filter((item: string) => !item.startsWith('adolion-war@'));
  assert.deepEqual(blockingIn(start, removed, allow), ['inventory.v2Stories']);
  const extraCard = clone(end);
  extraCard.inventory.characterCount += 1;
  assert.deepEqual(blockingIn(start, extraCard, allow), ['inventory.characterCount']);
  const extraBook = clone(end);
  extraBook.inventory.lorebookCount += 1;
  extraBook.inventory.lorebooksSelected = [...extraBook.inventory.lorebooksSelected, 'Someone Else'].sort();
  assert.deepEqual(blockingIn(start, extraBook, allow), ['inventory.lorebookCount', 'inventory.lorebooksSelected']);
  const foreignStory = clone(end);
  foreignStory.inventory.v2Stories = [...foreignStory.inventory.v2Stories, 'imported-by-hand@1'].sort();
  assert.deepEqual(blockingIn(start, foreignStory, allow), ['inventory.v2Stories']);
});

test('T5-2 wizard assets: sessions that existed at start, or were last written before it, ledger nothing', () => {
  const { drafts, start, startedAt } = t52();
  const known = clone(start);
  known.inventory.wizardSessions = ['the-pawnbroker-of-forgotten-days'];
  const fromKnown = wizardAllowance(known, drafts, startedAt).ledger;
  assert.ok(!fromKnown.sessions.includes('the-pawnbroker-of-forgotten-days'));
  assert.ok(!fromKnown.stories.includes('the-pawnbroker-of-forgotten-days'));
  assert.equal(fromKnown.characters.length, 5);
  assert.deepEqual(wizardAllowance(start, drafts, '2026-10-02T09:00:00.000Z').allow, []);
  assert.deepEqual(wizardAllowance(start, null, startedAt).allow, []);
  const comma = clone(drafts);
  comma.sessions[0].createdLorebooks = ['A, B'];
  comma.sessions[0].applied = ['A, B'];
  const { allow, ledger } = wizardAllowance(start, comma, startedAt);
  assert.ok(ledger.skipped.includes('A, B'));
  assert.ok(!allow.some((entry) => entry.includes('A, B')));
});

test('run header delta allowance: path=+n allows only that exact move, and a bare = is refused', () => {
  const before = { inventory: { characterCount: 10 } };
  assert.equal(diffHeaders(before, { inventory: { characterCount: 12 } }, ['inventory.characterCount=+2'])[0].allowed, true);
  assert.equal(diffHeaders(before, { inventory: { characterCount: 13 } }, ['inventory.characterCount=+2'])[0].allowed, false);
  assert.equal(diffHeaders(before, { inventory: { characterCount: 8 } }, ['inventory.characterCount=+2'])[0].allowed, false);
  assert.match(parseAllow(['inventory.characterCount=2']).errors[0], /signed whole number/);
  const args = headerDiffArgs('s', 'e', [], ['inventory.characterCount=+9', 'inventory.lorebooksSelected:+The Hoard of the Unflown — Lore']);
  assert.ok(args[args.indexOf('--allow') + 1].includes('inventory.lorebooksSelected:+The Hoard of the Unflown — Lore'));
});

test('T5-2 charters: wizardAssets is declared on the wizard cards, refused elsewhere, and goal beats only on wizard cards', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  assert.deepEqual(doc.cards.filter((card) => card.wizardAssets).map((card) => card.id), ['T5-1', 'T5-2', 'T5-4', 'T6-3']);
  const broken: CardDoc = clone(doc);
  findCardIn(broken, 'T0-1').wizardAssets = true;
  findCardIn(broken, 'T0-1').drive[0].goal = { mode: 'review' };
  findCardIn(broken, 'T5-2').drive[0].goal = { mode: 'step' as never };
  const problems = validateCardDoc(broken, index);
  assert.ok(problems.some((problem) => /T0-1: wizardAssets is for a card whose story the wizard makes/.test(problem)));
  assert.ok(problems.some((problem) => /T0-1 drive\[0\]: goal is the wizard agent's goal/.test(problem)));
  assert.ok(problems.some((problem) => /T5-2 drive\[0\]: goal.mode must be review\|auto-draft/.test(problem)));
});

const findCardIn = (doc: CardDoc, id: string) => doc.cards.find((card) => card.id === id)!;

test('T5-2 runbook: wizard premises are agent goal steps, never chat turns, and each is read back', async () => {
  const doc = await loadCards();
  const lines = cardCommands(findCard(doc, 'T5-2'), 4);
  assert.equal(lines.filter((line) => line.includes(' turn ')).length, 0);
  const goals = lines.filter((line) => line.includes('so-session.mts goal test/sessions/T5/T5-2-1 '));
  assert.equal(goals.length, 2);
  for (const line of goals) assert.match(line, /--mode auto-draft --new --go$/);
  assert.equal(lines.filter((line) => line.endsWith('so-session.mts agent test/sessions/T5/T5-2-1 state')).length, 2);
  const t51 = cardCommands(findCard(doc, 'T5-1'), 3);
  assert.match(t51.join('\n'), /goal test\/sessions\/T5\/T5-1-1 "A cartographer's apprentice[^"]*" --mode review --new --go/);
  assert.equal(t51.filter((line) => line.includes(' turn ')).length, 1, 'only the play beat after adopt sends a turn');
  assert.ok(t51.findIndex((line) => line.includes(' adopt ')) < t51.findIndex((line) => line.includes(' turn ')));
});

test('T5-2 digest: a flag filed with no chat open reaches the findings from turns.jsonl, once', async () => {
  const { files, paths } = await loadSessionFiles(T52, await loadIndex());
  const digest = digestSession(files, paths);
  assert.equal(digest.flags.length, 5);
  assert.deepEqual(digest.flags.map((flag) => flag.evidence.path), ['turns.jsonl', 'turns.jsonl', 'turns.jsonl', 'turns.jsonl', 'journal.jsonl']);
  assert.ok(digest.flags.every((flag, at, all) => at === 0 || Date.parse(all[at - 1].at) <= Date.parse(flag.at)));
  const known = [{ at: 'A', chatId: null, messageId: -1, note: 'seen', evidence: { path: 'journal.jsonl', line: 1 }, context: [], contextFrom: 'none' as const }];
  const rows = [
    { line: 1, value: { kind: 'flag', at: 'B', note: 'seen', ok: true, flag: { at: 'A' } } },
    { line: 2, value: { kind: 'flag', at: 'C', note: 'new', ok: true, flag: { at: 'C2', messageId: -1 } } },
    { line: 3, value: { kind: 'flag', at: 'D', note: 'failed', ok: false } },
    { line: 4, value: { kind: 'turn', at: 'E' } },
  ];
  assert.deepEqual(driverOnlyFlags(rows, known, null, 'turns.jsonl').map((flag) => [flag.at, flag.note, flag.evidence.line]), [['C2', 'new', 2]]);
});

test('T5-2 Agent verbs: so-session goal and agent parse, run the Agent pane and fail on an unsettled state', async () => {
  assert.deepEqual(parseLiveArgs('goal', ['d', 'A dragon too old to fly.', '--mode', 'auto-draft', '--new', '--go']).args, { text: 'A dragon too old to fly.', agentMode: 'auto-draft', fresh: true, go: true });
  assert.throws(() => parseLiveArgs('goal', ['d']), /goal needs the goal text/);
  assert.throws(() => parseLiveArgs('goal', ['d', 'x', '--mode', 'yolo']), /--mode must be one of review, auto-draft/);
  assert.deepEqual(parseLiveArgs('agent', ['d', 'mode', 'step']).args, { agentOp: 'mode', agentMode: 'step' });
  assert.throws(() => parseLiveArgs('agent', ['d', 'launch']), /agent takes one of go, continue, new-goal, state, mode/);
  assert.throws(() => parseLiveArgs('agent', ['d']), /agent needs an op/);
  assert.deepEqual(agentModeTarget('step'), { wizard: 'staged', agent: null });
  assert.deepEqual(agentModeTarget('auto-draft'), { wizard: 'agent', agent: 'auto-draft' });
  assert.throws(() => agentModeTarget('agent'), /step, review, auto-draft/);
  const calls: string[] = [];
  const ui = (planned: string, settled: string): AgentUi => ({
    agentGoal: async (_page, goal, options) => { calls.push(`goal:${goal}:${options.mode}:${options.fresh}`); return { agent: true, status: planned, plan: '1. build' }; },
    agentGo: async () => { calls.push('go'); return { agent: true, status: settled }; },
    agentContinue: async () => { calls.push('continue'); return { agent: true, status: settled }; },
    agentNewGoal: async () => ({ agent: true, status: null }),
    getAgentState: async () => ({ agent: true, status: settled }),
    setAgentEntry: async (_page, choice) => (choice === 'step' ? { agent: false } : { agent: true, status: null }),
  });
  const went = await runAgentVerb({}, { verb: 'goal', args: { text: 'P', agentMode: 'auto-draft', fresh: true, go: true } }, ui('awaiting-plan', 'awaiting-author'));
  assert.deepEqual({ ok: went.ok, went: (went as { went: boolean }).went }, { ok: true, went: true });
  assert.deepEqual(calls, ['goal:P:auto-draft:true', 'go']);
  const noPlan = await runAgentVerb({}, { verb: 'goal', args: { text: 'P', go: true } }, ui('done', 'done'));
  assert.equal(noPlan.ok, false);
  assert.match(noPlan.problems.join(' '), /no plan to approve/);
  const planned = await runAgentVerb({}, { verb: 'goal', args: { text: 'P' } }, ui('awaiting-plan', 'done'));
  assert.equal(planned.ok, true);
  assert.equal((await runAgentVerb({}, { verb: 'agent', args: { agentOp: 'continue' } }, ui('x', 'budget'))).ok, true);
  assert.equal((await runAgentVerb({}, { verb: 'agent', args: { agentOp: 'mode', agentMode: 'step' } }, ui('x', 'x'))).ok, true);
  assert.deepEqual(agentProblems({ agent: true, status: 'running', busy: true }, ['done']), ['the agent is still working', 'agent status running, expected done']);
  assert.deepEqual(agentProblems({ agent: false }, null), ['the Agent pane is not open']);
});

test('T5-2 score: an INVALID session refuses a score unless --provisional, which marks the row', async () => {
  assert.match(String(scoreRefusal({ valid: false, invalid: ['header diff'] }, false)), /INVALID \(header diff\).*--provisional/);
  assert.equal(scoreRefusal({ valid: false }, true), null);
  assert.match(String(scoreRefusal({ valid: true }, true)), /only for an INVALID session/);
  assert.equal(scoreRefusal(null, false), null);
  const dir = await mkdtemp(join(tmpdir(), 'so-provisional-'));
  await writeFile(join(dir, 'turns.jsonl'), '{"seq":1}\n', 'utf-8');
  await writeFile(join(dir, 'session.json'), JSON.stringify({ valid: false, invalid: ['the run header diff failed (exit 1)'] }), 'utf-8');
  await writeFile(join(dir, 'rubric.json'), JSON.stringify(rubricTemplate(findCard(await loadCards(), 'T5-2'))), 'utf-8');
  await assert.rejects(scoreCommand(dir, ['auto-draft', 'annoying', 'out of budget at step 26', '--evidence', 'turns.jsonl:1'], 'T'), /score refused: the session is INVALID/);
  const scored = await scoreCommand(dir, ['auto-draft', 'annoying', 'out of budget at step 26', '--evidence', 'turns.jsonl:1', '--provisional'], 'T');
  assert.equal(scored.provisional, true);
  const written = JSON.parse(await readFile(join(dir, 'rubric.json'), 'utf-8'));
  assert.deepEqual({ score: written.rows[0].score, provisional: written.rows[0].provisional }, { score: 'annoying', provisional: true });
});
