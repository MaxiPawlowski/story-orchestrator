import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { argValue, b1Problems, readB1Facts, readJsonFile, recordRef, refuse, runNumber, withLabeller, writeB1Record, type RunNumber } from './lib/b1Runs.mts';
import { pinRoleProfile, restoreRoleProfiles } from './lib/roleEffort.mts';
import { goalOf, parseProposalLabel, proposalLabelPrompt, scoreL3, type CaseReplay, type MeanwhileCase, type ProposalLabel } from './lib/meanwhileReplay.mts';

const USAGE = `Usage: node scripts/debug/so-b1-meanwhile.mts run --profile <curator profile> --labeller <profile> --run 1|2
       node scripts/debug/so-b1-meanwhile.mts score --raw <run-n.raw.json>

v2.7 37 L3 (39 row 37-L3): the 20 cases of test/fixtures/meanwhile-proposals.cases.json replayed offline on the CL route.
Each case goes through storyOrchestratorLiveSuite.runMeanwhileCase: the shipped meanwhile prompt and parser
(buildMeanwhilePrompt / parseMeanwhile, the same ones AgendaProposalCoordinator.propose() uses, which reads the open chat
instead of a case) over the fixture's story with the case's agenda step done, on the curator role pinned to --profile.
Every parsed proposal is labelled in-goal / narrates-the-player by --labeller (a second model, pinned to the synthesis role,
never the curator's profile, never the user); unreached references are counted in code over the spoiler subset.
Floors (37 §L3, frozen): in-goal >= 0.85, 0 narrated player actions, 0 unreached references; x2 runs.
Record: test/phase-c/records/37-L3/run-<n>.json; prompts and replies: SO_DEBUG_DIR/b1/37-L3/.
Refuses (exit 2) without the page handles, a live model, --profile or --labeller.`;

const CASES = join(PROJECT_ROOT, 'test', 'fixtures', 'meanwhile-proposals.cases.json');

async function replayAll(page, story: unknown, cases: MeanwhileCase[]): Promise<Array<CaseReplay & { prompt?: string; rawResponse?: string }>> {
  const out: Array<CaseReplay & { prompt?: string; rawResponse?: string }> = [];
  for (const entry of cases) {
    out.push(await evaluateInST(page, async ({ story, entry }) => {
      try {
        return await globalThis.storyOrchestratorLiveSuite.runMeanwhileCase({ story, member: entry.member, agenda: entry.agenda, done: entry.done, window: entry.window });
      } catch (error) {
        return { proposals: [], refused: [], error: String(error?.message ?? error).slice(0, 300) };
      }
    }, { story, entry }));
  }
  return out;
}

async function measure(page, { profile, labeller, run }: { profile: string; labeller: string; run: RunNumber }) {
  const needs = { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime'], model: true, profiles: [profile, labeller] };
  const problems = b1Problems(needs, await readB1Facts(page, needs));
  if (problems.length) return refuse(problems);
  const fixture = await readJsonFile(CASES);
  const story = await readJsonFile(join(PROJECT_ROOT, fixture.story));
  const cases: MeanwhileCase[] = fixture.cases ?? [];
  const pinned = await pinRoleProfile(page, 'curator', profile);
  try {
    return await withLabeller(page, labeller, ['curator'], async (ask) => {
      const replays = await replayAll(page, story, cases);
      const labels: Array<ProposalLabel & { raw: string }> = [];
      for (const [index, replay] of replays.entries()) {
        const goal = goalOf(story, cases[index].member, cases[index].agenda) ?? '(no goal found)';
        for (const [at, proposal] of replay.proposals.entries()) {
          const raw = await ask(proposalLabelPrompt(goal, proposal), 32);
          labels.push({ case: index + 1, proposal: at, ...parseProposalLabel(raw), raw });
        }
      }
      const scored = scoreL3(cases, replays, labels);
      const summary = { source: 'v2.7 37 §L3 curator proposals gate', curatorProfile: pinned.profile.name, labeller, ...scored };
      const written = await writeB1Record({ rowId: '37-L3', run, summary, raw: { replays, labels, scored }, privateText: [replays.map((replay) => replay.proposals)] });
      console.log(JSON.stringify({ row: '37-L3', run, verdict: scored.verdict, floors: scored.floors, incomplete: scored.incomplete, record: recordRef('37-L3', run), raw: written.raw }, null, 2));
      return { ok: scored.verdict === 'PASS' };
    });
  } finally {
    await restoreRoleProfiles(page, pinned.before);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || hasHelpFlag(args) || !['run', 'score'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command === 'score') {
    const path = argValue(args, '--raw');
    if (!path) { console.log(USAGE); process.exit(1); }
    const raw = await readJsonFile(path);
    const scored = scoreL3((await readJsonFile(CASES)).cases, raw.replays, raw.labels);
    console.log(JSON.stringify(scored, null, 2));
    process.exit(scored.verdict === 'PASS' ? 0 : 1);
  }
  const profile = argValue(args, '--profile');
  const labeller = argValue(args, '--labeller');
  let run: RunNumber;
  try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
  const problems = [
    ...(profile ? [] : ['needs --profile <curator profile> (the CL route the proposals are measured on)']),
    ...(labeller ? [] : ['needs --labeller <profile> (a second model labels in-goal; never the user)']),
  ];
  if (problems.length) { refuse(problems); process.exit(2); }
  runCli((page) => measure(page, { profile, labeller, run }));
}
