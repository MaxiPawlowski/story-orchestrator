import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import {
  argValue, b1Problems, labDirOf, labProblems, liveRead, readB1Facts, readJsonFile, recordRef, refuse, runNumber, withReadProfile, writeB1Record, type LiveRead, type RunNumber,
} from './lib/b1Runs.mts';
import { AXES_ARMS, LIFE_ARMS, scoreLifeM1, scoreLifeM2, windowSpec, type LifeArm, type RelationshipWindow } from './lib/lifeReads.mts';

const USAGE = `Usage: node scripts/debug/so-b1-life-reads.mts m1|m2 --lab <campaign lab/life dir> --profile <read profile> --run 1|2
       node scripts/debug/so-b1-life-reads.mts score-m1|score-m2 --raw <run-n.raw.json>

v2.7 37 character life (39 rows 37-M1, 37-M1-C5 with --row, 37-M2), on the DeepSeek read profile (--profile, restored after).
  m1  relationship-windows.json over esha-life.story.json, three arms per window through storyOrchestratorLiveSuite.runFixture:
      (a) value hidden (the shipped prompt), (b) value shown (the measurement-only "Current values" block), (c) the typed judge
      read (TypeSafe, extractor fallback). The labelled axis is uncapped so it is always asked. Scored on the value that lands
      after the rating guard: direction accuracy >= 0.80, stuck <= 0.10, step-clamp violations 0, arm (a) within 5 points
      of arm (b); the arm that passes decides the default (judge first only if (c) passes).
  m2  the cost arms N in {2, 4, 8, 16} relationship axes per read against N = 0, every member present, over the same windows:
      extraction prompt tokens <= +12 % and p50 latency <= +15 % per arm (the largest passing N sets REL_AXES_PER_READ);
      the drafted member's relationship + mood + agenda block <= 350 tokens at p95 and <= 600 at max.
The lab directory is the campaign checkout (--lab or SO_ADOLION_LAB), read in place. Labels need their second-model check
(lab/life README) before B1; the record notes the lab file's labelledBy. Public summary: test/phase-c/records/<row>/run-<n>.json;
prompts and replies: SO_DEBUG_DIR/b1/<row>/ (private). Refuses (exit 2) without the lab files, a live read model, the judge
plugin with a key (m1), the page handles or --profile.`;

const STORY_FILE = 'esha-life.story.json';
const WINDOWS_FILE = 'relationship-windows.json';

const rosterOf = (story: any) => (Array.isArray(story?.roster) ? story.roster : []);
const playerTest = (story: any) => {
  const names = new Set(rosterOf(story).flatMap((member) => [member?.name, member?.id, ...(Array.isArray(member?.aliases) ? member.aliases : [])]).filter((value) => typeof value === 'string').map((value) => value.toLowerCase()));
  return (speaker: string) => !names.has(speaker.toLowerCase());
};

async function blockTokens(page, story: unknown, windows: RelationshipWindow[]): Promise<number[]> {
  const out: number[] = [];
  for (const window of windows) {
    const reading = await evaluateInST(page, ({ story, values, member }) => globalThis.storyOrchestratorLiveSuite.lifeBlock(story, values, member), { story, values: { [window.expected.q]: window.start }, member: window.holder });
    out.push(reading.tokens);
  }
  return out;
}

async function measure(page, mode: 'm1' | 'm2', { lab, profile, run, row }: { lab: string; profile: string; run: RunNumber; row: string }) {
  const needs = { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime', ...(mode === 'm1' ? ['storyOrchestratorJudge'] : [])], model: true, judge: mode === 'm1', profiles: [profile] };
  const problems = b1Problems(needs, await readB1Facts(page, needs));
  if (problems.length) return refuse(problems);
  const story = await readJsonFile(join(lab, STORY_FILE));
  const doc = await readJsonFile(join(lab, WINDOWS_FILE));
  const windows: RelationshipWindow[] = doc.windows ?? [];
  const isPlayer = playerTest(story);
  const { result, profile: pinned } = await withReadProfile(page, profile, async () => {
    if (mode === 'm1') {
      const reads = {} as Record<LifeArm, LiveRead[]>;
      for (const arm of LIFE_ARMS) {
        reads[arm] = [];
        for (const window of windows) reads[arm].push(await liveRead(page, windowSpec(story, window, isPlayer, arm), { judge: arm === 'c' }));
      }
      return { reads, scored: scoreLifeM1(windows, reads) };
    }
    const everyone = rosterOf(story).map((member) => String(member.id));
    const armReads = async (axes: number) => {
      const reads: LiveRead[] = [];
      for (const window of windows) reads.push(await liveRead(page, windowSpec(story, window, isPlayer, null, { relationship: axes }, everyone)));
      return { axes, reads };
    };
    const base = await armReads(0);
    const arms = [];
    for (const axes of AXES_ARMS) arms.push(await armReads(axes));
    const blocks = await blockTokens(page, story, windows);
    return { reads: { base, arms, blocks }, scored: scoreLifeM2(windows.length, base, arms, blocks) };
  });
  const summary = { source: mode === 'm1' ? 'v2.7 37 §Measurement M1' : 'v2.7 37 §M2 + §Floors (2026-10-07)', readProfile: pinned?.name ?? profile, windows: windows.length, labelledBy: doc.labelledBy ? 'recorded in the lab file (second-model check owed before B1, lab/life README)' : 'missing', ...result.scored };
  const written = await writeB1Record({ rowId: row, run, summary, raw: { mode, windows, reads: result.reads, scored: result.scored }, privateText: [windows, story] });
  console.log(JSON.stringify({ row, run, verdict: result.scored.verdict, incomplete: result.scored.incomplete, record: recordRef(row, run), raw: written.raw }, null, 2));
  return { ok: result.scored.verdict === 'PASS' };
}

export async function rescore(mode: 'm1' | 'm2', rawPath: string) {
  const raw = await readJsonFile(rawPath);
  return mode === 'm1' ? scoreLifeM1(raw.windows, raw.reads) : scoreLifeM2(raw.windows.length, raw.reads.base, raw.reads.arms, raw.reads.blocks);
}

const ROWS = { m1: ['37-M1', '37-M1-C5'], m2: ['37-M2'] };

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
  const row = argValue(args, '--row', ROWS[mode][0]);
  const lab = labDirOf(args);
  const profile = argValue(args, '--profile');
  let run: RunNumber;
  try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
  const problems = [
    ...(ROWS[mode].includes(row) ? [] : [`--row for ${mode} must be one of ${ROWS[mode].join(', ')}`]),
    ...labProblems(lab, [STORY_FILE, WINDOWS_FILE]),
    ...(profile ? [] : ['needs --profile <read profile> (the row runs on the DeepSeek read profile, named in the record)']),
  ];
  if (problems.length) { refuse(problems); process.exit(2); }
  runCli((page) => measure(page, mode, { lab, profile, run, row }), { pageCapture: 'b1' });
}
