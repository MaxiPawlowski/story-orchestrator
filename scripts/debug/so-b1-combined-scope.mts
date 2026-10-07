import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import {
  argValue, b1Problems, insideRepo, labDirOf, labProblems, liveRead, readB1Facts, readJsonFile, recordRef, refuse, runNumber, withReadProfile, writeB1Record, type LiveRead, type RunNumber,
} from './lib/b1Runs.mts';
import { BASELINE_CAPS, COMBINED_ROWS, scoreCombined, type CombinedRow } from './lib/combinedScope.mts';
import type { RelationshipWindow } from './lib/lifeReads.mts';

const USAGE = `Usage: node scripts/debug/so-b1-combined-scope.mts run --row S-17|37-S17 --lab <campaign lab/life dir> --profile <read profile> --run 1|2 [--values <values.json>]
       node scripts/debug/so-b1-combined-scope.mts score --row S-17|37-S17 --raw <run-n.raw.json>

The combined scope budget (39 S-17, 37 §Combined scope budget 37-S17): esha-life.story.json (7-member cast, side quests,
relationships, card fields) read window after window (relationship-windows.json, in order) with every scope source at its
shipped cap, against a baseline with the quest and relationship sources at 0 (card pulls and gate keys as shipped). Each read
gets the window's present members, its holder as the drafted member and the read index as the card cursor; --values (outside
this repo) seeds the blackboard, e.g. the quest activations. Scored: tokens <= +15 % and p50 <= +20 % (36 M1) and <= +12 % /
<= +15 % (37 M2), the drafted member's life block <= 350 p95 / <= 600 max, no active quest key (37-S17: and no relationship axis)
left out of scope for more than 3 consecutive reads; the overflow order is recorded for B2, not judged. A cast under 7, fewer
than 3 active quest keys, no card pull or no axis in the reads is INCOMPLETE.
Public summary: test/phase-c/records/<row>/run-<n>.json; prompts and replies: SO_DEBUG_DIR/b1/<row>/ (private).
Refuses (exit 2) without the lab files, a live read model, the page handles or --profile.`;

const STORY_FILE = 'esha-life.story.json';
const WINDOWS_FILE = 'relationship-windows.json';

const rosterOf = (story: any) => (Array.isArray(story?.roster) ? story.roster : []);

export function combinedSpec(story: any, window: RelationshipWindow, index: number, values: Record<string, unknown>, caps: Record<string, number | null> | null) {
  const names = new Set(rosterOf(story).flatMap((member) => [member?.name, member?.id, ...(Array.isArray(member?.aliases) ? member.aliases : [])]).filter((value) => typeof value === 'string').map((value) => value.toLowerCase()));
  return {
    story,
    transcript: window.messages.map((message, at) => ({ index: at, speaker: message.speaker, text: message.text, ...(names.has(message.speaker.toLowerCase()) ? {} : { is_user: true }) })),
    ...(window.checkpoint ? { activeCheckpointId: window.checkpoint } : {}),
    blackboard: { values, versions: {}, latched: {} },
    scopeContext: { present: window.present, drafted: window.holder, cursor: index },
    ...(caps ? { scopeCaps: caps } : {}),
  };
}

async function measure(page, { lab, profile, run, row, values }: { lab: string; profile: string; run: RunNumber; row: CombinedRow; values: Record<string, unknown> }) {
  const needs = { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorRuntime'], model: true, profiles: [profile] };
  const problems = b1Problems(needs, await readB1Facts(page, needs));
  if (problems.length) return refuse(problems);
  const story = await readJsonFile(join(lab, STORY_FILE));
  const windows: RelationshipWindow[] = (await readJsonFile(join(lab, WINDOWS_FILE))).windows ?? [];
  const { result, profile: pinned } = await withReadProfile(page, profile, async () => {
    const baseline: LiveRead[] = [];
    const combined: LiveRead[] = [];
    const blocks: number[] = [];
    for (const [index, window] of windows.entries()) {
      combined.push(await liveRead(page, combinedSpec(story, window, index, values, null)));
      baseline.push(await liveRead(page, combinedSpec(story, window, index, values, { ...BASELINE_CAPS })));
      const reading = await evaluateInST(page, ({ story, values, member }) => globalThis.storyOrchestratorLiveSuite.lifeBlock(story, values, member), { story, values, member: window.holder });
      blocks.push(reading.tokens);
    }
    const reads = { baseline, combined, blocks };
    return { reads, scored: scoreCombined(row, { members: rosterOf(story).length, ...reads }) };
  });
  const summary = { source: row === 'S-17' ? '39 §Rows added (S-17); v2.7 37 §Combined scope budget' : 'v2.7 37 §Combined scope budget', readProfile: pinned?.name ?? profile, ...result.scored };
  const written = await writeB1Record({ rowId: row, run, summary, raw: { windows, values, members: rosterOf(story).length, reads: result.reads, scored: result.scored }, privateText: [windows, story] });
  console.log(JSON.stringify({ row, run, verdict: result.scored.verdict, incomplete: result.scored.incomplete, record: recordRef(row, run), raw: written.raw }, null, 2));
  return { ok: result.scored.verdict === 'PASS' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const command = args[0];
  const row = argValue(args, '--row') as CombinedRow;
  if (!command || hasHelpFlag(args) || !['run', 'score'].includes(command) || !(COMBINED_ROWS as readonly string[]).includes(row)) {
    console.log(USAGE);
    process.exit(hasHelpFlag(args) ? 0 : 1);
  }
  if (command === 'score') {
    const path = argValue(args, '--raw');
    if (!path) { console.log(USAGE); process.exit(1); }
    const raw = await readJsonFile(path);
    const scored = scoreCombined(row, { members: Number(raw.members ?? 0), ...raw.reads });
    console.log(JSON.stringify(scored, null, 2));
    process.exit(scored.verdict === 'PASS' ? 0 : 1);
  }
  const lab = labDirOf(args);
  const profile = argValue(args, '--profile');
  const valuesPath = argValue(args, '--values');
  let run: RunNumber;
  try { run = runNumber(argValue(args, '--run')); } catch (error) { console.error(String((error as Error).message)); process.exit(1); }
  const problems = [
    ...labProblems(lab, [STORY_FILE, WINDOWS_FILE]),
    ...(profile ? [] : ['needs --profile <read profile> (the row runs on the DeepSeek read profile, named in the record)']),
    ...(valuesPath && insideRepo(resolve(valuesPath)) ? [`--values ${valuesPath} is inside this public repo: keep campaign state in the private evidence`] : []),
  ];
  if (problems.length) { refuse(problems); process.exit(2); }
  const values = valuesPath ? await readJsonFile(resolve(valuesPath)) : {};
  runCli((page) => measure(page, { lab, profile, run, row, values }), { pageCapture: 'b1' });
}
