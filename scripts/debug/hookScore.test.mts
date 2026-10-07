import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookRunFromTurns, moveLabelPrompt, parseMoveLabel, parseReplyLabel, replyLabelPrompt, runEnd, scoreM2, type HookArm, type HookRun, type MoveLabel, type ReplyLabel } from './lib/hookScore.mts';
import { runsFileProblems } from './so-b1-hooks.mts';

const turnRow = (line: string, before: string, after: string, replies = 1) => ({
  kind: 'turn', line, checkpoint: { before: { id: before }, after: { id: after } },
  replies: Array.from({ length: replies }, (_, index) => ({ messageId: index, speaker: 'Kela', text: `reply ${index} to ${line}` })),
});

const spec = (arm: HookArm, stub: string, run: number, pullAfter = 3) => ({ dir: 'x', stub, arm, run, startCheckpoint: stub, arriveCheckpoints: ['dest'], pullAfter, destination: 'the gate' });

const sessionRows = (turns: number, arriveAt: number | null, stub: string) => Array.from({ length: turns }, (_, index) => turnRow(`line ${index + 1}`, stub, arriveAt === index + 1 ? 'dest' : stub));

const build = (arm: HookArm, stub: string, run: number, turns: number, arriveAt: number | null) => hookRunFromTurns(sessionRows(turns, arriveAt, stub), spec(arm, stub, run));

const allLabels = (runs: HookRun[], over: (run: HookRun, turn: number) => Partial<ReplyLabel> = () => ({})): ReplyLabel[] =>
  runs.flatMap((run) => run.turns.filter((turn) => turn.turn <= run.endTurn).flatMap((turn) => turn.replies.map((_, reply) => ({
    stub: run.stub, arm: run.arm, run: run.run, turn: turn.turn, reply, hook: turn.turn === run.pullAfter + 1, decision: false, ...over(run, turn.turn),
  }))));

const moveLabels = (runs: HookRun[], move: MoveLabel['move'] = 'player'): MoveLabel[] => runs.filter((run) => !run.capped).map((run) => ({ stub: run.stub, arm: run.arm, run: run.run, move }));

const fullSet = (arriveAt: number | null = 5) => ['s1', 's2', 's3'].flatMap((stub) => [1, 2].flatMap((run) => (['open', 'expanded'] as HookArm[]).map((arm) => build(arm, stub, run, 20, arriveAt))));

test('35 M2: a run ends at arrival or at pull_after + 12 player turns, max_turns when lower; OOC lines are no turn', () => {
  assert.equal(runEnd(3), 15);
  assert.equal(runEnd(6, 10), 10);
  const capped = build('open', 's1', 1, 40, null);
  assert.equal(capped.endTurn, 15);
  assert.equal(capped.capped, true);
  const arrived = build('open', 's1', 1, 40, 7);
  assert.deepEqual([arrived.arrivedAtTurn, arrived.endTurn, arrived.capped], [7, 7, false]);
  const rows = [turnRow('before the stub', 'earlier', 'earlier'), turnRow('((brb))', 's1', 's1'), turnRow('OOC: one sec', 's1', 's1'), ...sessionRows(4, 4, 's1')];
  const ooc = hookRunFromTurns(rows, spec('open', 's1', 1));
  assert.equal(ooc.oocLines, 2);
  assert.equal(ooc.arrivedAtTurn, 4);
  assert.throws(() => hookRunFromTurns([turnRow('x', 'elsewhere', 'elsewhere')], spec('open', 's1', 1)), /no turn starts at s1/);
});

test('35 M2: a complete set meeting every floor passes; the expanded arm is recorded, never gated', () => {
  const runs = fullSet(5);
  const result = scoreM2(runs, allLabels(runs), moveLabels(runs));
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.open));
  assert.equal(result.expanded.verdict, 'RECORDED');
  assert.equal(result.open.floors.ownMove.value, 1);
  assert.equal(result.open.floors.hookInWindow.runs, 6);
  assert.deepEqual(result.runs[0].window, [4, 9]);
  assert.deepEqual([...new Set(result.runs.map((row) => row.stub))].sort(), ['stub-1', 'stub-2', 'stub-3'], 'stub ids never reach the public summary');
});

test('35 M2 planted failures: one narrated decision, one capped run, one run without a hook in the window', () => {
  const runs = fullSet(5);
  const narrated = scoreM2(runs, allLabels(runs, (run, turn) => (run.arm === 'open' && run.stub === 's2' && run.run === 1 && turn === 2 ? { decision: true } : {})), moveLabels(runs));
  assert.equal(narrated.verdict, 'FAIL');
  assert.equal(narrated.open.floors.narratedDecisions.value, 1);
  const decisionInExpanded = scoreM2(runs, allLabels(runs, (run) => (run.arm === 'expanded' ? { decision: true } : {})), moveLabels(runs));
  assert.equal(decisionInExpanded.verdict, 'PASS', 'the floors bind the open arm only');
  const oneCapped = runs.map((run) => (run.arm === 'open' && run.stub === 's3' && run.run === 2 ? build('open', 's3', 2, 30, null) : run));
  const capped = scoreM2(oneCapped, allLabels(oneCapped), moveLabels(oneCapped));
  assert.equal(capped.verdict, 'FAIL');
  assert.equal(capped.open.floors.ownMove.ownMoves, 5, '5 of 6 is under the 90 % floor');
  const noHook = scoreM2(runs, allLabels(runs, (run) => (run.arm === 'open' && run.stub === 's1' && run.run === 1 ? { hook: false } : {})), moveLabels(runs));
  assert.equal(noHook.verdict, 'FAIL');
  const narratedMove = scoreM2(runs, allLabels(runs), moveLabels(runs).map((label, index) => (index === 0 ? { ...label, move: 'narrated' as const } : label)));
  assert.equal(narratedMove.verdict, 'FAIL');
  const long = fullSet(14);
  const lateHook = scoreM2(long, allLabels(long, (run, turn) => ({ hook: turn === run.pullAfter + 7 })), moveLabels(long));
  assert.equal(lateHook.open.floors.hookInWindow.ok, false, 'a hook at pull_after + 7 is outside the 6-turn window');
  const lastHook = scoreM2(long, allLabels(long, (run, turn) => ({ hook: turn === run.pullAfter + 6 })), moveLabels(long));
  assert.equal(lastHook.open.floors.hookInWindow.ok, true, 'pull_after + 6 is the last turn inside the window');
});

test('35 M2 is INCOMPLETE, never PASS, on fewer than 6 open runs, a missing label, or no run reaching the window', () => {
  const runs = fullSet(5);
  const short = runs.filter((run) => !(run.arm === 'open' && run.stub === 's3' && run.run === 2));
  assert.equal(scoreM2(short, allLabels(short), moveLabels(short)).verdict, 'INCOMPLETE');
  const labels = allLabels(runs);
  labels[0] = { ...labels[0], hook: null };
  assert.equal(scoreM2(runs, labels, moveLabels(runs)).verdict, 'INCOMPLETE');
  const early = fullSet(2);
  const quick = scoreM2(early, allLabels(early), moveLabels(early));
  assert.equal(quick.verdict, 'INCOMPLETE');
  assert.match(quick.open.incomplete.join(), /no run reached pull_after \+ 1/);
});

test('35 M2 labels: strict lines only, prompts carry the destination and the reply', () => {
  assert.deepEqual(parseReplyLabel('HOOK: yes\nDECISION: no'), { hook: true, decision: false });
  assert.deepEqual(parseReplyLabel('hook - yes'), { hook: null, decision: null });
  assert.equal(parseMoveLabel('MOVE: player'), 'player');
  assert.equal(parseMoveLabel('MOVE: maybe'), null);
  const run = build('open', 's1', 1, 6, 6);
  assert.match(replyLabelPrompt(run, run.turns[0], run.turns[0].replies[0]), /the gate[\s\S]*reply 0 to line 1/);
  assert.match(moveLabelPrompt(run), /line 6/);
});

test('35 M2 runs file: kept out of this repo, every run complete', () => {
  assert.match(runsFileProblems(null, null).join(), /needs --runs/);
  assert.match(runsFileProblems(`${process.cwd()}/test/runs.json`, {}).join(), /inside this public repo/);
  const outside = 'C:/elsewhere/runs.json';
  assert.match(runsFileProblems(outside, { runs: [{ arm: 'open', pullAfter: 3 }] }).join(), /no replyProfile[\s\S]*startCheckpoint[\s\S]*destination[\s\S]*no turns.jsonl/);
});
