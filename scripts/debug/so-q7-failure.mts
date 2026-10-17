import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLabels, rateItems, type BlindKey, type BlindPack } from './lib/blindRater.mts';
import { castOf, pageScenarioRunner, readJson, recordJobs, writeJson, type ScenarioRunner } from './lib/replyCapture.mts';
import { readRecords } from './lib/rumorVoicing.mts';
import {
  parseS8Label, plumbingS8Label, s8HashOf, s8Jobs, s8Pack, s8Problems, s8Prompt, scoreS8, S8_CASES, S8_FREEZE,
  type S8Fixture, type S8Label, type S8Payload, type S8Record, type S8Secret,
} from './lib/q7Failure.mts';

const USAGE = `Usage:
  node scripts/debug/so-q7-failure.mts verify
  node scripts/debug/so-q7-failure.mts freeze
  node scripts/debug/so-q7-failure.mts record --out <dir> [--plumbing] [--only s01,s02] [--group <name>] [--receiver <card>] [--narrator <card>]
  node scripts/debug/so-q7-failure.mts pack --out <dir> --seed <seed>
  node scripts/debug/so-q7-failure.mts rate --out <dir> [--plumbing] [--width 3]
  node scripts/debug/so-q7-failure.mts score --out <dir> [--json <file>]

v2.8 plan 18 Q7 S8: 10 scripted failure outcomes (test/measurements/v2.8/18-s8/cases.json, hash frozen in freeze.json).
verify (no ST): checks the fixture and the freeze, parses every case story with the shipped parser, proves each check cannot
succeed, and that the shipped outcome block reads "<label>: fails." under a header carrying the S8 clause.
record (lane page from st-lanes env): per case a generated sandbox scenario imports the case story into the pinned group, posts
the scene and the attempt, sets the attempt flag (the check records its failure; five cases also fail a quest), waits for the
outcome block with the clause (and the quest row in the narrator's block), and drafts the omniscient narrator through ST's own
Generate (force_chid); the drafted request, the outcome block, the narrator's private block and the reply go to
<dir>/records/<case>.json. --plumbing answers with a canned reply on a no-model lane (never a measurement).
pack: blind pack (seeded order, opaque ids; listed outcomes and consequences are taken from what the narrator was given), key
apart. rate: claude -p labels each item (added unlisted consequence yes/no, failure shown yes/no) in an empty temp dir with tools
off; --plumbing writes canned labels. score: unlisted-consequence rate unrounded with counts (bare and with a listed quest
failure), failure-shown rate; floor recorded (exit 0 RECORDED or PLUMBING, 2 INCOMPLETE).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};
const EXIT: Record<string, number> = { RECORDED: 0, PLUMBING: 0, INCOMPLETE: 2 };

export const loadS8 = () => readJson<S8Fixture>(S8_CASES);
const frozen = async () => (existsSync(S8_FREEZE) ? readJson<{ files: Record<string, string> }>(S8_FREEZE) : null);
const castFrom = (args: string[]) => castOf({ group: option(args, '--group'), receiver: option(args, '--receiver'), narrator: option(args, '--narrator') });

export interface Deps { runner?: (fn: (run: ScenarioRunner) => Promise<unknown>) => Promise<unknown>; log?: (line: string) => void }

const liveRunner: NonNullable<Deps['runner']> = async (fn) => {
  const { withST } = await import('./lib/cli.mts');
  return withST((page) => fn(pageScenarioRunner(page)));
};

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const [command, ...args] = argv;
  const log = deps.log ?? console.log;
  const runner = deps.runner ?? liveRunner;
  if (!command || command === '--help' || args.includes('--help')) {
    log(USAGE);
    return command ? 0 : 1;
  }
  const print = (value: unknown) => log(JSON.stringify(value, null, 1));
  if (command === 'verify' || command === 'freeze') {
    const fixture = await loadS8();
    const cast = castOf();
    const { loadFixtureKit, simulateS8 } = await import('./lib/fixtureSim.mts');
    const simulated = await simulateS8(await loadFixtureKit(), fixture, cast);
    const problems = [...s8Problems(fixture, cast), ...simulated.problems];
    const files = { 'cases.json': s8HashOf(fixture) };
    if (command === 'freeze') {
      if (problems.length) { print({ refused: 'fixture problems', problems }); return 1; }
      await writeJson(S8_FREEZE, { format: 'so-v18-s8-freeze/1', hash: 'sha256 of JSON.stringify(JSON.parse(file))', files });
      print({ frozen: files });
      return 0;
    }
    const drift = (await frozen())?.files?.['cases.json'] === files['cases.json'] ? [] : ['cases.json differs from freeze.json'];
    print({ cases: fixture.cases.length, files, problems: [...problems, ...drift] });
    return problems.length || drift.length ? 1 : 0;
  }
  if (command === 'record') {
    const fixture = await loadS8();
    const hash = s8HashOf(fixture);
    if ((await frozen())?.files?.['cases.json'] !== hash) throw new Error(`refused: cases.json hash ${hash.slice(0, 12)} differs from freeze.json`);
    const cast = castFrom(args);
    const jobs = s8Jobs(fixture, cast, args.includes('--plumbing'), option(args, '--only')?.split(',') ?? null);
    print(await runner((run) => recordJobs(jobs, need(args, '--out'), cast.group, run, log)));
    return 0;
  }
  if (command === 'pack') {
    const out = need(args, '--out');
    const { pack, key } = s8Pack(await loadS8(), [...(await readRecords<S8Record>(out)).values()], need(args, '--seed'));
    await mkdir(join(out, 'pack'), { recursive: true });
    await mkdir(join(out, 'key'), { recursive: true });
    await writeJson(join(out, 'pack', 'pack.json'), pack);
    await writeJson(join(out, 'key', 'key.json'), key);
    print({ items: pack.items.length, pack: join(out, 'pack', 'pack.json'), key: join(out, 'key', 'key.json') });
    return 0;
  }
  if (command === 'rate') {
    const out = need(args, '--out');
    const pack = await readJson<BlindPack<S8Payload>>(join(out, 'pack', 'pack.json'));
    print(await rateItems<(typeof pack.items)[number], S8Label>({ items: pack.items, dir: join(out, 'labels'), prompt: s8Prompt, parse: parseS8Label, plumbing: args.includes('--plumbing') ? plumbingS8Label : undefined, width: Number(option(args, '--width') ?? 3), log }));
    return 0;
  }
  if (command === 'score') {
    const out = need(args, '--out');
    const fixture = await loadS8();
    const result = scoreS8({
      fixture, fixtureHash: s8HashOf(fixture), frozenHash: (await frozen())?.files?.['cases.json'] ?? null,
      records: [...(await readRecords<S8Record>(out)).values()], key: await readJson<BlindKey<S8Secret>>(join(out, 'key', 'key.json')),
      labels: await readLabels<S8Label>(join(out, 'labels')),
    });
    const json = option(args, '--json');
    if (json) await writeJson(json, result);
    print(result);
    return EXIT[result.verdict];
  }
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
