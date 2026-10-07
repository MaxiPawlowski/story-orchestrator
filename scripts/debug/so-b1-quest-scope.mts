import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import {
  argValue, b1Problems, labDirOf, labProblems, liveRead, readB1Facts, readJsonFile, recordRef, refuse, runNumber, withReadProfile, writeB1Record, type RunNumber,
} from './lib/b1Runs.mts';
import { applyGuarded, caseProblems, caseSpec, QUEST_ARMS, scoreM1, scoreM2, caseOutcome, type CaseRead, type CompletionCase, type ArmRun } from './lib/questScope.mts';

const USAGE = `Usage: node scripts/debug/so-b1-quest-scope.mts m1|m2 --lab <campaign lab/quests dir> --profile <read profile> --run 1|2
       node scripts/debug/so-b1-quest-scope.mts score-m1|score-m2 --raw <run-n.raw.json>

v2.7 36 Q1 (39 rows 36-Q1-M1, 36-Q1-M2), on the DeepSeek read profile (--profile pins the read role for the run, restored after).
  m1  the scope arms: academy-quests.arm-{0,5,10,20}.story.json, each with the quest source uncapped so arm n carries n extra
      quest keys; every completion case is replayed turn by turn through storyOrchestratorLiveSuite.runFixture. Per arm:
      tier accuracy (deltas from each case's expected write; facts / rejected only where a case states them), mean prompt
      tokens per read (measureBudget), p50 read latency. Floors (36 §Q1): no tier more than 3 points under arm 0, tokens
      <= +15 %, p50 latency <= +20 %; the highest passing arm sets QUEST_SCOPE_CAP, arm 5 failing means no discovered side quests.
      A tier no case states is INCOMPLETE, never a pass.
  m2  completion recall on academy-quests.story.json (shipped scope caps): 20 cases, done_when latched within 3 player turns
      in >= 0.80 of the latching cases, false latches <= 1 of 20.
The lab directory is the campaign checkout (--lab or SO_ADOLION_LAB), read in place, never copied here.
Public summary: test/phase-c/records/<row>/run-<n>.json; prompts and replies: SO_DEBUG_DIR/b1/<row>/ (private).
Refuses (exit 2, writes nothing) without the lab files, a live read model, the page handles or --profile.`;

const ARM_FILE = (arm: number) => `academy-quests.arm-${arm}.story.json`;
const LAB_FILE = 'academy-quests.story.json';
const CASES_FILE = 'completion-cases.json';

async function replayCase(page, story: unknown, entry: CompletionCase, caps: Record<string, number | null>): Promise<CaseRead[]> {
  let values: Record<string, unknown> = { ...(entry.before ?? {}) };
  const reads: CaseRead[] = [];
  for (let turn = 1; turn <= entry.turns.length; turn += 1) {
    const read = await liveRead(page, caseSpec(story, entry, turn, values, caps));
    reads.push({ turn, read });
    values = applyGuarded(values, read);
  }
  return reads;
}

async function measure(page, mode: 'm1' | 'm2', { lab, profile, run }: { lab: string; profile: string; run: RunNumber }) {
  const needs = { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime'], model: true, profiles: [profile] };
  const problems = b1Problems(needs, await readB1Facts(page, needs));
  if (problems.length) return refuse(problems);
  const casesDoc = await readJsonFile(join(lab, CASES_FILE));
  const cases: CompletionCase[] = casesDoc.cases ?? [];
  const shape = caseProblems(cases);
  const row = mode === 'm1' ? '36-Q1-M1' : '36-Q1-M2';
  const { result, profile: pinned } = await withReadProfile(page, profile, async () => {
    if (mode === 'm2') {
      const story = await readJsonFile(join(lab, LAB_FILE));
      const reads: CaseRead[][] = [];
      for (const entry of cases) reads.push(await replayCase(page, story, entry, {}));
      return { reads, scored: scoreM2(cases.map((entry, index) => caseOutcome(index + 1, entry, reads[index])), shape) };
    }
    const runs: ArmRun[] = [];
    for (const arm of QUEST_ARMS) {
      const story = await readJsonFile(join(lab, ARM_FILE(arm)));
      const reads: CaseRead[][] = [];
      for (const entry of cases) reads.push(await replayCase(page, story, entry, { quest: null }));
      runs.push({ arm, cases, reads });
    }
    return { reads: runs, scored: scoreM1(runs, shape) };
  });
  const summary = { source: mode === 'm1' ? 'v2.7 36 §Q1 Floors (M1)' : 'v2.7 36 §Q1 Floors (M2)', readProfile: pinned?.name ?? profile, labelledBy: casesDoc.labelledBy ? 'recorded in the lab file' : 'missing', ...result.scored };
  const written = await writeB1Record({ rowId: row, run, summary, raw: { mode, cases, reads: result.reads, scored: result.scored }, privateText: [cases] });
  console.log(JSON.stringify({ row, run, verdict: result.scored.verdict, incomplete: result.scored.incomplete, record: recordRef(row, run), raw: written.raw }, null, 2));
  return { ok: result.scored.verdict === 'PASS' };
}

export async function rescore(mode: 'm1' | 'm2', rawPath: string) {
  const raw = await readJsonFile(rawPath);
  if (mode === 'm2') return scoreM2(raw.cases.map((entry, index) => caseOutcome(index + 1, entry, raw.reads[index])), caseProblems(raw.cases));
  return scoreM1(raw.reads, caseProblems(raw.cases));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args) || !['m1', 'm2', 'score-m1', 'score-m2'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command.startsWith('score-')) {
    const path = argValue(args, '--raw');
    if (!path) { console.log(USAGE); process.exit(1); }
    const scored = await rescore(command === 'score-m1' ? 'm1' : 'm2', path);
    console.log(JSON.stringify(scored, null, 2));
    process.exit(scored.verdict === 'PASS' ? 0 : 1);
  }
  const mode = command as 'm1' | 'm2';
  const lab = labDirOf(args);
  const profile = argValue(args, '--profile');
  let run: RunNumber;
  try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
  const problems = [
    ...labProblems(lab, mode === 'm1' ? [CASES_FILE, ...QUEST_ARMS.map(ARM_FILE)] : [CASES_FILE, LAB_FILE]),
    ...(profile ? [] : ['needs --profile <read profile> (the row runs on the DeepSeek read profile, named in the record)']),
  ];
  if (problems.length) { refuse(problems); process.exit(2); }
  runCli((page) => measure(page, mode, { lab, profile, run }));
}
