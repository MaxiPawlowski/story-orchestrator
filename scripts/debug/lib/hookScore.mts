import { isOocText } from '../../../src/engine/ooc.ts';
import { ratio, type B1Verdict } from './b1Runs.mts';

export const M2_WINDOW_TURNS = 6;
export const M2_CAP_AFTER_PULL = 12;
export const M2_RUNS_PER_ARM = 6;
export const M2_OWN_MOVE_FLOOR = 0.9;
export const M2_NARRATED_MAX = 0;
export const M2_FLOOR_TEXT = '0 narrated player decisions in open stretches; the player reaches the destination by their own move in at least 90% of runs; every run past `pull_after` player turns shows at least one hook within the pull window. Window: the 6 player turns after `pull_after`; run end at `arrive_when` or `pull_after + 12` player turns; the 90 % floor is over every run of the arm (6 of 6)';

export type HookArm = 'open' | 'expanded';

export interface HookRunSpec {
  dir: string;
  stub: string;
  arm: HookArm;
  run: number;
  startCheckpoint: string;
  arriveCheckpoints: string[];
  pullAfter: number;
  maxTurns?: number;
  destination: string;
}

export interface HookTurn {
  turn: number;
  line: string;
  replies: Array<{ messageId: number | null; speaker: string; text: string }>;
}

export interface HookRun {
  stub: string;
  arm: HookArm;
  run: number;
  pullAfter: number;
  endTurn: number;
  arrivedAtTurn: number | null;
  capped: boolean;
  turns: HookTurn[];
  oocLines: number;
  destination: string;
}

export interface ReplyLabel {
  stub: string;
  arm: HookArm;
  run: number;
  turn: number;
  reply: number;
  hook: boolean | null;
  decision: boolean | null;
}

export interface MoveLabel {
  stub: string;
  arm: HookArm;
  run: number;
  move: 'player' | 'narrated' | 'none' | null;
}

export const runEnd = (pullAfter: number, maxTurns?: number): number => Math.min(pullAfter + M2_CAP_AFTER_PULL, maxTurns ?? Number.POSITIVE_INFINITY);

const checkpointId = (value: unknown): string | null => (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null);

export function hookRunFromTurns(rows: unknown[], spec: HookRunSpec): HookRun {
  const turns = rows.filter((row): row is Record<string, any> => Boolean(row) && typeof row === 'object' && (row as { kind?: unknown }).kind === 'turn');
  const startAt = turns.findIndex((row) => checkpointId(row.checkpoint?.before) === spec.startCheckpoint);
  if (startAt < 0) throw new Error(`${spec.dir}: no turn starts at ${spec.startCheckpoint}; is this the run's session?`);
  const end = runEnd(spec.pullAfter, spec.maxTurns);
  const played: HookTurn[] = [];
  let ooc = 0;
  let arrivedAtTurn: number | null = null;
  for (const row of turns.slice(startAt)) {
    const line = String(row.line ?? '');
    if (isOocText(line)) {
      ooc += 1;
      continue;
    }
    const turn = played.length + 1;
    played.push({ turn, line, replies: (Array.isArray(row.replies) ? row.replies : []).map((reply) => ({ messageId: typeof reply?.messageId === 'number' ? reply.messageId : null, speaker: String(reply?.speaker ?? ''), text: String(reply?.text ?? '') })) });
    if (spec.arriveCheckpoints.includes(checkpointId(row.checkpoint?.after) ?? '')) {
      arrivedAtTurn = turn;
      break;
    }
    if (turn >= end) break;
  }
  return {
    stub: spec.stub, arm: spec.arm, run: spec.run, pullAfter: spec.pullAfter, endTurn: arrivedAtTurn ?? Math.min(played.length, end),
    arrivedAtTurn, capped: arrivedAtTurn === null, turns: played, oocLines: ooc, destination: spec.destination,
  };
}

export function replyLabelPrompt(run: HookRun, turn: HookTurn, reply: HookTurn['replies'][number]): string {
  return [
    'You label one reply from a roleplay for a measurement. Answer only with the two lines asked for.',
    `Where the scene is heading (the destination): ${run.destination}`,
    `The player wrote: ${turn.line}`,
    `The reply (${reply.speaker || 'a character'}): ${reply.text}`,
    'HOOK: yes when the reply contains an in-fiction event or prompt that points toward the destination; otherwise no.',
    'DECISION: yes when the reply narrates a decision, action or words of the player character that the player did not write; otherwise no.',
    'Answer exactly:',
    'HOOK: yes|no',
    'DECISION: yes|no',
  ].join('\n');
}

export function moveLabelPrompt(run: HookRun): string {
  const last = run.turns.slice(-2);
  return [
    'You label how a roleplay reached its destination, for a measurement. Answer only with the line asked for.',
    `The destination: ${run.destination}`,
    ...last.flatMap((turn) => [`Player: ${turn.line}`, ...turn.replies.map((reply) => `${reply.speaker || 'Reply'}: ${reply.text}`)]),
    'MOVE: player when the player\'s own line makes the move that reaches the destination; narrated when a reply moves the player there without the player choosing it; none when nobody reached it.',
    'Answer exactly: MOVE: player|narrated|none',
  ].join('\n');
}

const yesNo = (text: string, key: string): boolean | null => {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(yes|no)\\s*$`, 'im').exec(text);
  return match ? match[1].toLowerCase() === 'yes' : null;
};

export function parseReplyLabel(text: string): { hook: boolean | null; decision: boolean | null } {
  return { hook: yesNo(text, 'HOOK'), decision: yesNo(text, 'DECISION') };
}

export function parseMoveLabel(text: string): MoveLabel['move'] {
  const match = /^\s*MOVE\s*:\s*(player|narrated|none)\s*$/im.exec(text);
  return match ? (match[1].toLowerCase() as MoveLabel['move']) : null;
}

const sameRun = (run: HookRun) => (label: { stub: string; arm: HookArm; run: number }) => label.stub === run.stub && label.arm === run.arm && label.run === run.run;

export function scoreRun(run: HookRun, replies: ReplyLabel[], moves: MoveLabel[]) {
  const own = replies.filter(sameRun(run)).filter((label) => label.turn <= run.endTurn);
  const expected = run.turns.filter((turn) => turn.turn <= run.endTurn).reduce((sum, turn) => sum + turn.replies.length, 0);
  const unlabelled = expected - own.filter((label) => label.hook !== null && label.decision !== null).length;
  const windowFrom = run.pullAfter + 1;
  const windowTo = run.pullAfter + M2_WINDOW_TURNS;
  const reachedWindow = run.endTurn >= windowFrom;
  const hookInWindow = own.some((label) => label.hook === true && label.turn >= windowFrom && label.turn <= windowTo);
  const move = moves.find(sameRun(run))?.move ?? null;
  return {
    stub: run.stub, arm: run.arm, run: run.run, pullAfter: run.pullAfter, endTurn: run.endTurn, arrivedAtTurn: run.arrivedAtTurn, capped: run.capped, oocLines: run.oocLines,
    replies: expected, unlabelled, narratedDecisions: own.filter((label) => label.decision === true).length,
    reachedWindow, hookInWindow, window: [windowFrom, windowTo], move,
    ownMove: !run.capped && move === 'player',
    moveUnlabelled: !run.capped && move === null,
  };
}

export function scoreArm(arm: HookArm, rows: Array<ReturnType<typeof scoreRun>>) {
  const own = rows.filter((row) => row.arm === arm);
  const reached = own.filter((row) => row.reachedWindow);
  const narrated = own.reduce((sum, row) => sum + row.narratedDecisions, 0);
  const ownMoves = own.filter((row) => row.ownMove).length;
  const unlabelled = own.reduce((sum, row) => sum + row.unlabelled + (row.moveUnlabelled ? 1 : 0), 0);
  const incomplete = [
    ...(own.length < M2_RUNS_PER_ARM ? [`${own.length} of ${M2_RUNS_PER_ARM} runs (3 stubs x 2 runs)`] : []),
    ...(unlabelled ? [`${unlabelled} label(s) missing or unparsed`] : []),
    ...(!reached.length ? ['no run reached pull_after + 1, so the hook floor has no denominator'] : []),
  ];
  const floors = {
    narratedDecisions: { value: narrated, max: M2_NARRATED_MAX, ok: narrated <= M2_NARRATED_MAX, over: 'every reply in every run' },
    ownMove: { value: ratio(ownMoves, own.length), runs: own.length, ownMoves, min: M2_OWN_MOVE_FLOOR, ok: own.length > 0 && ownMoves / own.length >= M2_OWN_MOVE_FLOOR, over: 'every run of the arm; a capped run counts as not by own move' },
    hookInWindow: { value: ratio(reached.filter((row) => row.hookInWindow).length, reached.length), runs: reached.length, withHook: reached.filter((row) => row.hookInWindow).length, ok: reached.every((row) => row.hookInWindow), over: 'runs that reached pull_after + 1' },
  };
  const verdict: B1Verdict = arm === 'expanded' ? 'RECORDED' : incomplete.length ? 'INCOMPLETE' : Object.values(floors).every((floor) => floor.ok) ? 'PASS' : 'FAIL';
  return { arm, runs: own.length, verdict, incomplete, floors, gated: arm === 'open' };
}

export function scoreM2(runs: HookRun[], replies: ReplyLabel[], moves: MoveLabel[]) {
  const aliases = new Map([...new Set(runs.map((run) => run.stub))].sort().map((stub, index) => [stub, `stub-${index + 1}`]));
  const rows = runs.map((run) => ({ ...scoreRun(run, replies, moves), stub: aliases.get(run.stub) ?? 'stub-?' }));
  const open = scoreArm('open', rows);
  const expanded = scoreArm('expanded', rows);
  return { floor: M2_FLOOR_TEXT, verdict: open.verdict, open, expanded, runs: rows, stubs: aliases.size };
}
