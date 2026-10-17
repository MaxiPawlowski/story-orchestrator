import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkFrontierSet, FRONTIERS_FILE, freezeRecord, frozenRefusal, LOCK_FILE, OUTCOMES, replayAll, type Outcome } from './lib/sceneReplay.mts';
import { ratePacks, writeRatePacks } from './lib/sceneRate.mts';
import { scoreScene } from './lib/sceneScore.mts';

const USAGE = `Usage:
  node scripts/debug/so-scene-test-replay.mts check [--frontiers <f>] [--lock <f>]
  node scripts/debug/so-scene-test-replay.mts freeze [--frontiers <f>] [--lock <f>]
  node scripts/debug/so-scene-test-replay.mts replay --out <dir> --run 1|2 [--plumbing] [--only f01,f02] [--outcomes expected,altered,interrupt]
  node scripts/debug/so-scene-test-replay.mts pack --out <dir> --run 1|2 [--seed <s>]
  node scripts/debug/so-scene-test-replay.mts rate --out <dir> --run 1|2 [--plumbing]
  node scripts/debug/so-scene-test-replay.mts score --out <dir> [--runs 1,2] [--result <file>]

v2.8 plan 48 S7, S8, S9, S11 (CL), offline, no ST. The frontier set (test/measurements/v2.8/48-scene-test/frontiers.json,
20 synthetic English frontiers) is frozen by sha256 in frontiers.lock.json; every command refuses a set that drifted.
replay: for each frontier x forced outcome (expected, altered, interrupt) builds the director input and prompt with the
shipped code (livingUnit.directorInput, prompt.ts, sceneTest.ts) and runs the shipped runDirector (parse, ops + scene check,
guard, critic, one retry) on the authoring route: opencode openai/gpt-6.1-sol for the director and its critic (never
-fast, never DeepSeek). Writes <dir>/run<k>/drafts/<frontier>-<outcome>.json: every raw answer, the parse, ops, scene, guard
and critic refusals per attempt, the narrated-player detector, the changed kind and the delivered anchor. Resumable.
--plumbing answers with canned drafts and verdicts, no model call; plumbing output is never a measurement.
pack: seeded shuffle of the delivered anchors into a blind pack (S8 agency flag, S11 surprising + coherent: name and
objective only, no arm, no signal) and an honour pack (S7: the signal is shown, as the floor asks); keys kept apart.
rate: claude -p rates each item (resumable). score: S7/S8/S9/S11 per run exactly as the floors table states, every
metric unrounded with its counts. Exit 0 pass, 1 fail, 2 insufficient (missing drafts, ratings, a second run or plumbing).
Floors are informational: a miss is recorded, the feature stays on.`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};

const list = (value: string | undefined) => (value ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : undefined);

const EXIT = { pass: 0, fail: 1, insufficient: 2 } as const;

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const frontiersFile = option(args, '--frontiers') ?? FRONTIERS_FILE;
  const lockFile = option(args, '--lock') ?? LOCK_FILE;
  if (command === 'check' || command === 'freeze') {
    const set = checkFrontierSet(JSON.parse(await readFile(frontiersFile, 'utf-8')));
    if (command === 'freeze') {
      const record = freezeRecord(set, frontiersFile);
      await writeFile(lockFile, `${JSON.stringify(record, null, 1)}\n`, 'utf-8');
      console.log(JSON.stringify(record, null, 1));
      return 0;
    }
    const refused = frozenRefusal(set, JSON.parse(await readFile(lockFile, 'utf-8')));
    console.log(refused ?? `frozen: ${set.frontiers.length} frontiers match the lock`);
    return refused ? 3 : 0;
  }
  const out = need(args, '--out');
  if (command === 'score') {
    const result = await scoreScene(out, (list(option(args, '--runs')) ?? ['1', '2']).map(Number));
    const file = option(args, '--result');
    if (file) await writeFile(file, `${JSON.stringify(result, null, 1)}\n`, 'utf-8');
    console.log(JSON.stringify(result, null, 2));
    return EXIT[result.verdict];
  }
  const run = Number(need(args, '--run'));
  const plumbing = args.includes('--plumbing');
  let result: unknown;
  if (command === 'replay') {
    const outcomes = list(option(args, '--outcomes')) as Outcome[] | undefined;
    if (outcomes?.some((outcome) => !OUTCOMES.includes(outcome))) throw new Error(`--outcomes takes ${OUTCOMES.join(', ')}`);
    result = await replayAll({ out, run, plumbing, only: list(option(args, '--only')), outcomes, frontiersFile, lockFile });
  } else if (command === 'pack') result = await writeRatePacks({ out, run, seed: option(args, '--seed'), frontiersFile, lockFile });
  else if (command === 'rate') result = await ratePacks({ out, run, plumbing });
  else throw new Error(`unknown command ${command}\n${USAGE}`);
  console.log(JSON.stringify(result, null, 1));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
