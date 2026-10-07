import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { argValue, b1Problems, insideRepo, readB1Facts, readJsonFile, recordRef, refuse, runNumber, withLabeller, writeB1Record, type RunNumber } from './lib/b1Runs.mts';
import { hookRunFromTurns, moveLabelPrompt, parseMoveLabel, parseReplyLabel, replyLabelPrompt, scoreM2, type HookRun, type HookRunSpec, type MoveLabel, type ReplyLabel } from './lib/hookScore.mts';

const USAGE = `Usage: node scripts/debug/so-b1-hooks.mts label --runs <runs.json> --labeller <profile> --run 1|2 [--row 35-M2|35-M2-C5]
       node scripts/debug/so-b1-hooks.mts score --raw <run-n.raw.json>

v2.7 35 M2 (39 rows 35-M2, 35-M2-C5): the open-stretch pull A/B, labelled by a second model and scored offline.
<runs.json> lives in the private so-sessions evidence (it names campaign checkpoints), never in this repo:
  { "replyProfile": "<the profile that wrote the replies>",
    "runs": [{ "dir": "<so-session dir with turns.jsonl>", "stub": "<stub checkpoint id>", "arm": "open"|"expanded", "run": 1|2,
               "startCheckpoint": "<id>", "arriveCheckpoints": ["<id>"], "pullAfter": <n>, "maxTurns"?: <n>, "destination": "<one line>" }] }
Each record scores one full set: 3 stubs x 2 arms x 2 runs. The floors bind the open arm; the expanded arm is recorded.
Window: the 6 player turns after pull_after; a run ends at arrival or pull_after + 12 player turns (max_turns when lower);
a capped run counts as not by own move; OOC player lines are no turn. Every reply up to the run end and every arrival is
labelled by --labeller (pinned to the synthesis role for the run, restored after), which must not be the reply profile.
Public summary: test/phase-c/records/<row>/run-<n>.json (counts only); labels and replies: SO_DEBUG_DIR/b1/<row>/ (private).
Refuses (exit 2, writes nothing) without the runs file, a session's turns.jsonl, the page handles or the labeller.`;

const ROWS = ['35-M2', '35-M2-C5'];

async function readTurns(dir: string): Promise<unknown[]> {
  const text = await readFile(join(dir, 'turns.jsonl'), 'utf-8');
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

export function runsFileProblems(path: string | null, doc: any): string[] {
  if (!path) return ['needs --runs <runs.json> (private: it names campaign checkpoints)'];
  if (insideRepo(path)) return [`the runs file ${path} is inside this public repo: keep it in the private so-sessions evidence`];
  if (!doc) return [`cannot read ${path}`];
  const problems: string[] = [];
  if (typeof doc.replyProfile !== 'string' || !doc.replyProfile) problems.push('the runs file names no replyProfile (the labeller must be a second model)');
  if (!Array.isArray(doc.runs) || !doc.runs.length) problems.push('the runs file lists no runs');
  for (const [index, run] of (doc.runs ?? []).entries()) {
    if (run?.arm !== 'open' && run?.arm !== 'expanded') problems.push(`run ${index}: arm must be open or expanded`);
    if (!Number.isInteger(run?.pullAfter) || run.pullAfter < 1) problems.push(`run ${index}: pullAfter must be a whole number of player turns`);
    if (!run?.startCheckpoint || !Array.isArray(run?.arriveCheckpoints) || !run.arriveCheckpoints.length) problems.push(`run ${index}: needs startCheckpoint and arriveCheckpoints`);
    if (!run?.destination) problems.push(`run ${index}: needs a destination line for the labeller`);
    if (!run?.dir || !existsSync(join(String(run.dir), 'turns.jsonl'))) problems.push(`run ${index}: no turns.jsonl in ${run?.dir ?? '(no dir)'}`);
  }
  return problems;
}

async function label(page, { runsPath, labeller, run, row }: { runsPath: string; labeller: string; run: RunNumber; row: string }) {
  const doc = await readJsonFile(runsPath);
  const facts = await readB1Facts(page, { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime'], profiles: [labeller] });
  const problems = b1Problems({ handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime'], profiles: [labeller] }, facts);
  if (problems.length) return refuse(problems);
  const runs: HookRun[] = [];
  for (const spec of doc.runs as HookRunSpec[]) runs.push(hookRunFromTurns(await readTurns(resolve(spec.dir)), spec));
  return withLabeller(page, labeller, [], async (ask) => {
    const replies: Array<ReplyLabel & { raw: string }> = [];
    const moves: Array<MoveLabel & { raw: string }> = [];
    for (const entry of runs) {
      for (const turn of entry.turns.filter((item) => item.turn <= entry.endTurn)) {
        for (const [index, reply] of turn.replies.entries()) {
          const raw = await ask(replyLabelPrompt(entry, turn, reply), 32);
          replies.push({ stub: entry.stub, arm: entry.arm, run: entry.run, turn: turn.turn, reply: index, ...parseReplyLabel(raw), raw });
        }
      }
      if (!entry.capped) {
        const raw = await ask(moveLabelPrompt(entry), 16);
        moves.push({ stub: entry.stub, arm: entry.arm, run: entry.run, move: parseMoveLabel(raw), raw });
      }
    }
    const scored = scoreM2(runs, replies, moves);
    const summary = { source: 'v2.7 35 §Phase 2 Floors (M2)', labeller, replyProfile: doc.replyProfile, verdict: scored.verdict, floor: scored.floor, open: scored.open, expanded: scored.expanded, runs: scored.runs, stubs: scored.stubs };
    const written = await writeB1Record({ rowId: row, run, summary, raw: { runs, replies, moves, scored }, privateText: [runs, doc] });
    console.log(JSON.stringify({ row, run, verdict: scored.verdict, open: scored.open.floors, incomplete: scored.open.incomplete, record: recordRef(row, run), raw: written.raw }, null, 2));
    return { ok: scored.verdict === 'PASS' };
  }, [{ role: 'reply model', profileId: doc.replyProfile }]);
}

export async function rescore(rawPath: string) {
  const raw = await readJsonFile(rawPath);
  return scoreM2(raw.runs, raw.replies, raw.moves);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args) || !['label', 'score'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command === 'score') {
    const path = argValue(args, '--raw');
    if (!path) { console.log(USAGE); process.exit(1); }
    const scored = await rescore(path);
    console.log(JSON.stringify({ verdict: scored.verdict, open: scored.open, expanded: scored.expanded }, null, 2));
    process.exit(scored.verdict === 'PASS' ? 0 : 1);
  }
  const row = argValue(args, '--row', '35-M2');
  const runsPath = argValue(args, '--runs');
  const labeller = argValue(args, '--labeller');
  let run: RunNumber;
  try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
  const doc = runsPath && existsSync(runsPath) ? await readJsonFile(runsPath).catch(() => null) : null;
  const problems = [
    ...(ROWS.includes(row) ? [] : [`--row must be one of ${ROWS.join(', ')}`]),
    ...runsFileProblems(runsPath ? resolve(runsPath) : null, doc),
    ...(labeller ? [] : ['needs --labeller <Connection Manager profile> (a second model, never the user)']),
  ];
  if (problems.length) { refuse(problems); process.exit(2); }
  runCli((page) => label(page, { runsPath: resolve(runsPath), labeller, run, row }), { pageCapture: 'b1' });
}
