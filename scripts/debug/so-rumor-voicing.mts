import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLabels, rateItems } from './lib/blindRater.mts';
import { castOf, pageScenarioRunner, readJson, recordJobs, writeJson, type ScenarioRunner } from './lib/replyCapture.mts';
import {
  ARMS, fixtureHashOf, parseVoicingLabel, plumbingVoicingLabel, readRecords, scoreVoicing, VOICING_CASES, VOICING_FREEZE, VOICING_G14,
  voicingJobs, voicingPack, voicingProblems, voicingPrompt, type Arm, type VoicingFixture, type VoicingLabel, type VoicingPayload, type VoicingRecord, type VoicingSecret,
} from './lib/rumorVoicing.mts';
import { checkG14, G14_ARTIFACTS, g14Job, g14Problems, readStateFile, type G14Fixture } from './lib/g14Promotion.mts';
import type { BlindKey, BlindPack } from './lib/blindRater.mts';

const USAGE = `Usage:
  node scripts/debug/so-rumor-voicing.mts verify
  node scripts/debug/so-rumor-voicing.mts freeze
  node scripts/debug/so-rumor-voicing.mts record --out <dir> --arm on|off|both [--plumbing] [--only v01,v02] [--group <name>] [--receiver <card>] [--narrator <card>]
  node scripts/debug/so-rumor-voicing.mts pack --out <dir> --seed <seed>
  node scripts/debug/so-rumor-voicing.mts rate --out <dir> [--plumbing] [--width 3]
  node scripts/debug/so-rumor-voicing.mts score --out <dir> [--json <file>]
  node scripts/debug/so-rumor-voicing.mts g14-record --out <dir> [--plumbing] [--group <name>] [--receiver <card>] [--narrator <card>]
  node scripts/debug/so-rumor-voicing.mts g14-check --state <file> [--json <file>]

v2.8 plan 44 G7/G8 (voicing) and G14 (no promotion). Fixtures: test/measurements/v2.8/44-voicing/{cases.json,g14-fixture.json},
hashes frozen in freeze.json (canonical JSON sha256); record and score refuse a fixture that differs from the freeze.
verify (no ST): checks both fixtures, the freeze, and replays each case's rumor through the shipped parser and spread core
(the hearsay line must land before the invite; G14's four rumors must all land).
record (lane page from st-lanes env): per case and arm, a generated sandbox scenario (so-scenario runScenario) imports the
case story into the pinned group, posts the transcript, waits for the hearsay line (on) or switches the rumors feature off for
the chat (off, setFeatureOverride), posts the invite and drafts the receiver through ST's own Generate (force_chid); the drafted
request (GENERATE_AFTER_DATA) and the reply are written to <dir>/records/<case>-<arm>.json. Resumes. --plumbing answers the
generation with a canned reply on a no-model lane (never a measurement; the scorer says PLUMBING).
pack: blind pack <dir>/pack/pack.json (both arms shuffled with the seed, versions A/B shuffled per item, opaque ids); the key
stays apart in <dir>/key/key.json. rate: claude -p labels each item blind (uses A/B/both/neither, framing heard/fact/none) in an
empty temp dir with tools off; --plumbing writes needle labels instead. score: G7 on, off, on-minus-off and G8 on/off, unrounded
with counts; informational floors (exit 0 PASS or PLUMBING, 1 FAIL, 2 INCOMPLETE).
g14-record: plays the 30 scripted turns with real reads (the read model on the lane), seals a chapter if none sealed, regenerates
the canon, and writes the chat's story blob to <dir>/records/g14.json. g14-check reads that record, a chat .jsonl (first line
chat_metadata) or a saved blob, and counts promoted hearsay (exit 0 PASS or PLUMBING, 1 FAIL, 2 INCOMPLETE).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};
const EXIT: Record<string, number> = { PASS: 0, PLUMBING: 0, RECORDED: 0, FAIL: 1, INCOMPLETE: 2 };

export const loadVoicing = () => readJson<VoicingFixture>(VOICING_CASES);
export const loadG14 = () => readJson<G14Fixture>(VOICING_G14);
const frozen = async () => (existsSync(VOICING_FREEZE) ? readJson<{ files: Record<string, string> }>(VOICING_FREEZE) : null);

async function refuseUnfrozen(name: 'cases.json' | 'g14-fixture.json', value: unknown) {
  const record = await frozen();
  const hash = fixtureHashOf(value);
  if (record?.files?.[name] !== hash) throw new Error(`refused: ${name} hash ${hash.slice(0, 12)} differs from freeze.json (${String(record?.files?.[name]).slice(0, 12)}); run verify, then freeze only for a deliberate fixture change`);
  return hash;
}

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
    const voicing = await loadVoicing();
    const g14 = await loadG14();
    const cast = castOf();
    const problems = [...voicingProblems(voicing, cast), ...g14Problems(g14, cast).map((problem) => `g14: ${problem}`)];
    const { loadFixtureKit, simulateG14, simulateVoicing } = await import('./lib/fixtureSim.mts');
    const kit = await loadFixtureKit();
    const simulated = await simulateVoicing(kit, voicing, cast);
    const g14Sim = await simulateG14(kit, g14, cast);
    problems.push(...simulated.problems, ...g14Sim.problems.map((problem) => `g14: ${problem}`));
    const files = { 'cases.json': fixtureHashOf(voicing), 'g14-fixture.json': fixtureHashOf(g14) };
    if (command === 'freeze') {
      if (problems.length) { print({ refused: 'fixture problems', problems }); return 1; }
      await writeJson(VOICING_FREEZE, { format: 'so-v44-voicing-freeze/1', hash: 'sha256 of JSON.stringify(JSON.parse(file))', files });
      print({ frozen: files });
      return 0;
    }
    const record = await frozen();
    const drift = Object.entries(files).filter(([name, hash]) => record?.files?.[name] !== hash).map(([name]) => `${name} differs from freeze.json`);
    print({ cases: voicing.cases.length, g14Turns: g14.turns.length, files, problems: [...problems, ...drift], g14Simulation: g14Sim });
    return problems.length || drift.length ? 1 : 0;
  }
  if (command === 'record') {
    const fixture = await loadVoicing();
    await refuseUnfrozen('cases.json', fixture);
    const cast = castFrom(args);
    const arm = need(args, '--arm');
    const arms: Arm[] = arm === 'both' ? [...ARMS] : ARMS.includes(arm as Arm) ? [arm as Arm] : (() => { throw new Error(`--arm ${arm}: on, off or both`); })();
    const only = option(args, '--only')?.split(',') ?? null;
    const jobs = voicingJobs(fixture, arms, cast, args.includes('--plumbing'), only);
    print(await runner((run) => recordJobs(jobs, need(args, '--out'), cast.group, run, log)));
    return 0;
  }
  if (command === 'pack') {
    const out = need(args, '--out');
    const fixture = await loadVoicing();
    const records = [...(await readRecords<VoicingRecord>(out)).values()];
    const { pack, key } = voicingPack(fixture, records, need(args, '--seed'));
    await mkdir(join(out, 'pack'), { recursive: true });
    await mkdir(join(out, 'key'), { recursive: true });
    await writeJson(join(out, 'pack', 'pack.json'), pack);
    await writeJson(join(out, 'key', 'key.json'), key);
    print({ items: pack.items.length, pack: join(out, 'pack', 'pack.json'), key: join(out, 'key', 'key.json') });
    return 0;
  }
  if (command === 'rate') {
    const out = need(args, '--out');
    const pack = await readJson<BlindPack<VoicingPayload>>(join(out, 'pack', 'pack.json'));
    const plumbing = args.includes('--plumbing') ? plumbingVoicingLabel(await loadVoicing(), await readJson<BlindKey<VoicingSecret>>(join(out, 'key', 'key.json'))) : undefined;
    print(await rateItems<(typeof pack.items)[number], VoicingLabel>({ items: pack.items, dir: join(out, 'labels'), prompt: voicingPrompt, parse: parseVoicingLabel, plumbing, width: Number(option(args, '--width') ?? 3), log }));
    return 0;
  }
  if (command === 'score') {
    const out = need(args, '--out');
    const fixture = await loadVoicing();
    const result = scoreVoicing({
      fixture, fixtureHash: fixtureHashOf(fixture), frozenHash: (await frozen())?.files?.['cases.json'] ?? null,
      records: [...(await readRecords<VoicingRecord>(out)).values()], key: await readJson<BlindKey<VoicingSecret>>(join(out, 'key', 'key.json')),
      labels: await readLabels<VoicingLabel>(join(out, 'labels')),
    });
    const json = option(args, '--json');
    if (json) await writeJson(json, result);
    print(result);
    return EXIT[result.verdict];
  }
  if (command === 'g14-record') {
    const fixture = await loadG14();
    await refuseUnfrozen('g14-fixture.json', fixture);
    const cast = castFrom(args);
    print(await runner((run) => recordJobs([g14Job(fixture, cast, args.includes('--plumbing'))], need(args, '--out'), cast.group, run, log)));
    return 0;
  }
  if (command === 'g14-check') {
    const fixture = await loadG14();
    const state = await readStateFile(need(args, '--state'));
    const plumbing = Boolean((state as { plumbing?: boolean; capture?: { plumbing?: boolean } })?.plumbing || (state as { capture?: { plumbing?: boolean } })?.capture?.plumbing);
    const result = { ...checkG14(fixture, state, { plumbing }), artifacts: G14_ARTIFACTS };
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
