import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLabels, rateItems, type BlindKey, type BlindPack } from './lib/blindRater.mts';
import { askSol } from './lib/e0LabelRun.mts';
import { castOf, pageScenarioRunner, readJson, recordJobs, writeJson, type ScenarioRunner } from './lib/replyCapture.mts';
import { readRecords } from './lib/rumorVoicing.mts';
import {
  ARM_GATES, ARMS_DIR, ARMS_FREEZE, GATES, PROMPT_ARMS, armJobs, armPack, armPrompt, armResetEval, buildCases, caseProblems, fixtureHashOf, parseArmLabel,
  plumbingArmLabel, scoreArms, type ArmFixture, type ArmGate, type ArmLabel, type ArmPayload, type ArmRecord, type ArmSecret, type PromptArm,
} from './lib/promptArms.mts';

const USAGE = `Usage:
  node scripts/debug/so-prompt-arms.mts build [--gate outward|swipe|notes|all]
  node scripts/debug/so-prompt-arms.mts verify
  node scripts/debug/so-prompt-arms.mts freeze
  node scripts/debug/so-prompt-arms.mts record --gate <g> --out <dir> --arm on|off|both [--plumbing] [--only o01,o02] [--group <name>] [--receiver <card>] [--narrator <card>]
  node scripts/debug/so-prompt-arms.mts pack --gate <g> --out <dir> --seed <seed>
  node scripts/debug/so-prompt-arms.mts rate --gate <g> --out <dir> [--plumbing] [--width 3]
  node scripts/debug/so-prompt-arms.mts score --gate <g> --out <dir> [--json <file>]

Blind rating arms for the v3.0 prompt-layout trials that ship off: outward (31 S1, memory.outwardNarration), swipe (31 S2,
talk.swipeContrast) and notes (34 S1, memory.historyNotes). Synthetic fixtures (25 cases a gate, invented text only):
test/measurements/v3.0/prompt-arms/<gate>.cases.json, hashes frozen in freeze.json; record and score refuse a drifted fixture.
build writes the fixtures from the pools in lib/promptArms.mts. record (a model lane page from st-lanes env, Artemis): per case
and arm, a generated sandbox scenario imports the case story into the pinned group, posts the transcript, switches the gate's
install setting on or off (read back, reset in the scenario's last step and again after the run), and drafts the measured
speaker through ST's own Generate (swipe: swipes the posted rejected reply instead); the drafted request, the raw and visible reply
and the reasoning length go to <dir>/records/<case>-<arm>.json. Resumes. --plumbing answers with a canned reply on a no-model
lane (never a measurement). pack: pairwise blind pack (the two arms of a case, sides shuffled with the seed, opaque ids), key
apart. rate: Sol (opencode openai/gpt-6.1-sol, never -fast) scores both replies of each pair blind in an empty temp dir.
score: the predeclared floors of the gate (exit 0 PASS or PLUMBING, 1 FAIL, 2 INCOMPLETE).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};
const EXIT: Record<string, number> = { PASS: 0, PLUMBING: 0, FAIL: 1, INCOMPLETE: 2 };

const gateOf = (args: string[]): ArmGate => {
  const gate = need(args, '--gate');
  if (!ARM_GATES.includes(gate as ArmGate)) throw new Error(`--gate ${gate}: ${ARM_GATES.join(', ')}`);
  return gate as ArmGate;
};
const fixtureFile = (gate: ArmGate) => join(ARMS_DIR, GATES[gate].file);
export const loadFixture = (gate: ArmGate) => readJson<ArmFixture>(fixtureFile(gate));
const frozen = async () => (existsSync(ARMS_FREEZE) ? readJson<{ files: Record<string, string> }>(ARMS_FREEZE) : null);

async function refuseUnfrozen(gate: ArmGate, fixture: ArmFixture) {
  const hash = fixtureHashOf(fixture);
  const record = await frozen();
  if (record?.files?.[GATES[gate].file] !== hash) throw new Error(`refused: ${GATES[gate].file} hash ${hash.slice(0, 12)} differs from freeze.json; run verify, then freeze only for a deliberate fixture change`);
}

export interface Deps { runner?: (fn: (run: ScenarioRunner) => Promise<unknown>, after: string) => Promise<unknown>; log?: (line: string) => void; ask?: typeof askSol }

const liveRunner: NonNullable<Deps['runner']> = async (fn, after) => {
  const { withST } = await import('./lib/cli.mts');
  return withST(async (page) => {
    try {
      return await fn(pageScenarioRunner(page));
    } finally {
      await page.evaluate((code: string) => new Function(`return (async () => { ${code} })()`)(), after).catch(() => undefined);
    }
  });
};

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const [command, ...args] = argv;
  const log = deps.log ?? console.log;
  const print = (value: unknown) => log(JSON.stringify(value, null, 1));
  if (!command || command === '--help' || args.includes('--help')) {
    log(USAGE);
    return command ? 0 : 1;
  }
  if (command === 'build') {
    const which = option(args, '--gate') ?? 'all';
    const gates = which === 'all' ? ARM_GATES : [which as ArmGate];
    await mkdir(ARMS_DIR, { recursive: true });
    for (const gate of gates) await writeJson(fixtureFile(gate), buildCases(gate));
    print({ built: gates.map((gate) => fixtureFile(gate)) });
    return 0;
  }
  if (command === 'verify' || command === 'freeze') {
    const cast = castOf();
    const files: Record<string, string> = {};
    const problems: string[] = [];
    for (const gate of ARM_GATES) {
      const fixture = await loadFixture(gate);
      if (fixture.gate !== gate) problems.push(`${GATES[gate].file}: gate ${fixture.gate}`);
      problems.push(...caseProblems(fixture, cast).map((problem) => `${gate}: ${problem}`));
      files[GATES[gate].file] = fixtureHashOf(fixture);
    }
    if (command === 'freeze') {
      if (problems.length) { print({ refused: 'fixture problems', problems }); return 1; }
      await writeJson(ARMS_FREEZE, { format: 'so-v30-prompt-arms-freeze/1', hash: 'sha256 of JSON.stringify(JSON.parse(file))', files });
      print({ frozen: files });
      return 0;
    }
    const record = await frozen();
    const drift = Object.entries(files).filter(([name, hash]) => record?.files?.[name] !== hash).map(([name]) => `${name} differs from freeze.json`);
    print({ files, problems: [...problems, ...drift] });
    return problems.length || drift.length ? 1 : 0;
  }
  const gate = gateOf(args);
  const out = need(args, '--out');
  if (command === 'record') {
    const fixture = await loadFixture(gate);
    await refuseUnfrozen(gate, fixture);
    const cast = castOf({ group: option(args, '--group'), receiver: option(args, '--receiver'), narrator: option(args, '--narrator') });
    const arm = need(args, '--arm');
    const arms: PromptArm[] = arm === 'both' ? [...PROMPT_ARMS] : PROMPT_ARMS.includes(arm as PromptArm) ? [arm as PromptArm] : (() => { throw new Error(`--arm ${arm}: on, off or both`); })();
    const jobs = armJobs(fixture, arms, cast, args.includes('--plumbing'), option(args, '--only')?.split(',') ?? null);
    print(await (deps.runner ?? liveRunner)((run) => recordJobs(jobs, out, cast.group, run, log), armResetEval()));
    return 0;
  }
  if (command === 'pack') {
    const fixture = await loadFixture(gate);
    const { pack, key } = armPack(fixture, [...(await readRecords<ArmRecord>(out)).values()], need(args, '--seed'));
    await mkdir(join(out, 'pack'), { recursive: true });
    await mkdir(join(out, 'key'), { recursive: true });
    await writeJson(join(out, 'pack', 'pack.json'), pack);
    await writeJson(join(out, 'key', 'key.json'), key);
    print({ items: pack.items.length, pack: join(out, 'pack', 'pack.json'), key: join(out, 'key', 'key.json') });
    return 0;
  }
  if (command === 'rate') {
    const pack = await readJson<BlindPack<ArmPayload>>(join(out, 'pack', 'pack.json'));
    const plumbing = args.includes('--plumbing') ? plumbingArmLabel(await readJson<BlindKey<ArmSecret>>(join(out, 'key', 'key.json'))) : undefined;
    const ask = deps.ask ?? askSol;
    print(await rateItems<(typeof pack.items)[number], ArmLabel>({
      items: pack.items, dir: join(out, 'labels'), prompt: armPrompt, parse: parseArmLabel, plumbing, ask: (prompt, dir) => ask(prompt, dir), width: Number(option(args, '--width') ?? 3), log,
    }));
    return 0;
  }
  if (command === 'score') {
    const fixture = await loadFixture(gate);
    const result = scoreArms({
      fixture, fixtureHash: fixtureHashOf(fixture), frozenHash: (await frozen())?.files?.[GATES[gate].file] ?? null,
      records: [...(await readRecords<ArmRecord>(out)).values()], key: await readJson<BlindKey<ArmSecret>>(join(out, 'key', 'key.json')),
      labels: await readLabels<ArmLabel>(join(out, 'labels')),
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
