import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { refusePrivateOutput } from './lib/bundleEntry.mts';
import { scoreReads } from './lib/witness.mts';

const USAGE = `Usage:
  node scripts/debug/so-witness.mts score --labels <labels.json> --reads <reads.json> [--out <result.json>]
  node scripts/debug/so-witness.mts label-write --sessions <root> --out <dir> [--width 3]
  node scripts/debug/so-witness.mts label-check --sessions <root> --out <dir> [--width 3]
  node scripts/debug/so-witness.mts label-merge --sessions <root> --out <dir>
  node scripts/debug/so-witness.mts lab --source <lab-rows.json> --out <dir>
  node scripts/debug/so-witness.mts adjudicate --sessions <root> --out <dir> [--width 2]
  node scripts/debug/so-witness.mts record --sessions <root> --out <dir> --arm on|off|both [--lab-rows <f> --lab-story <f>] [--only <key,...>] [--plumbing] [--adjudicated] [--no-stop]
  node scripts/debug/so-witness.mts reads --sessions <root> --out <dir> [--lab-rows <f> --lab-story <f>]
  node scripts/debug/so-witness.mts wc --out <dir>
  node scripts/debug/so-witness.mts score-real --out <dir> --freeze <freeze.json> [--adjudicated]
  node scripts/debug/so-witness.mts freeze --out <dir> --record <freeze.json> [--adjudicated]
  node scripts/debug/so-witness.mts presence --out <dir> --freeze <freeze.json> [--adjudicated]
  node scripts/debug/so-witness.mts derive-score --out <dir> --sessions <root> --freeze <freeze-adjudicated.json> [--lab-story <f>] [--speaker-own] [--write <result.json>]

v2.8 plan 42 B, offline: replays recorded witness read responses (format so-witness-reads/1) through the witness
contract parser and record (no model, no ST), scores them against labels (format so-witness-labels/1; a private set
keeps only labels reviewed by two different writers who agreed) and scores the presence null control on the same set.
Prints every metric unrounded with its counts. Exit 0 pass, 1 fail (a floor or the null-control margin missed),
2 insufficient (fewer than 40 kept labels).
Private sets (synthetic: false) write only under test/sessions/ or outside this repo.

Real-label run (plan 42 W4 declarations, 2026-10-17): label-write asks Sol (opencode, openai/gpt-6.1-sol, tools off) to label
one 12-message window per real session (plan 21 §6.2 session rule) per (message, member) and span; label-check asks claude -p
the same prompt blind; label-merge keeps the writer's labels with review {agreed} (disagreements stay agreed:false so the
scorer drops and counts them), one so-witness-labels/1 file per session under <dir>/labels/. lab converts the campaign lab's
40 authored labels (rows extracted privately) and has claude -p check them blind (heard only). freeze hashes every label
file; presence scores the presence null control (W4n, labelled present as witness) on the frozen sets.
adjudicate (2026-10-17 declarations): Astra (codex exec -m gpt-6-astra) decides every disagreed label, blind to who wrote
which; its verdict wins, undecided or unparsed answers become heard "unknown"; writes <dir>/adjudicated/. --adjudicated makes
freeze and presence use that set.
derive-score (v3.0 plan 12, offline, no model): derives witness claims in code (memory/witness/derive.ts) over the recorded read windows
(<dir>/reads/files) with each session's cast ledger as the enabled set, scores every design variant against the adjudicated labels
with the W4 scorer, plus the labelled-presence diagnostic and the presence null control; counts only. --speaker-own (owner 2026-10-26,
new runs only, off when re-scoring a result recorded before it): the speaker of an "unknown"-labelled message is not a false inclusion.
record (GPU, the read model): on the lane page st-lanes env names, runs the shipped shared read through
storyOrchestratorLiveSuite.runWitnessRead over each labelled window (real: first and last 8 of 12; lab: 5 x 8), witness lines on
and/or off, interleaved per read (on, off, on, off) so any stop leaves balanced pairs; resumes; writes <dir>/reads/<arm>/. Plan 11 stop
rules (scripts/debug/lib/stopRule.mts) score each on-arm read against the frozen labels in <dir> (--adjudicated: the adjudicated set)
with the W4 floors (exact set >= 0.9, W4fi <= 0.02, W4fe <= 0.10, W4cov >= 0.85; aside kept-out inclusion zero) and stop on S1-S3;
Wc needs every pair, so no S4; a read that throws twice stops the run as S5 (not a measurement). A stopped run writes
<dir>/reads/stop.json {stopped, verdict, at, reason, counts} and is never resumed; --no-stop runs every read (S5 still stops). reads turns the on arm into so-witness-reads/1 files (<dir>/reads/files/);
--plumbing answers every read with a canned all-present witness reply (no model call) and marks the records; plumbing output is
never a measurement. wc computes Wc against the off arm; score-real scores W4 per set against the frozen labels (real combined, lab apart).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};

const EXIT = { pass: 0, fail: 1, insufficient: 2 } as const;

async function labelCommand(command: string, args: string[]): Promise<number> {
  const lib = await import('./lib/witnessLabel.mts');
  const out = need(args, '--out');
  refusePrivateOutput(false, `${out}/labels.json`, 'witness label');
  const width = Number(option(args, '--width') ?? 3);
  let result: unknown;
  if (command === 'label-write') result = await lib.writeWitnessLabels({ root: need(args, '--sessions'), out, width });
  else if (command === 'label-check') result = await lib.checkWitnessLabels({ root: need(args, '--sessions'), out, width });
  else if (command === 'label-merge') result = await lib.mergeWitnessLabels({ root: need(args, '--sessions'), out });
  else if (command === 'lab') result = await lib.labWitness({ source: need(args, '--source'), out });
  else if (command === 'record' || command === 'reads') {
    const rec = await import('./lib/witnessRecord.mts');
    const sets = (await rec.planAll(need(args, '--sessions'), option(args, '--lab-rows'), option(args, '--lab-story')))
      .filter((set) => !option(args, '--only') || (option(args, '--only') as string).split(',').includes(set.key));
    if (command === 'reads') result = await rec.writeReadsFiles(sets, out, args.includes('--plumbing'));
    else {
      const arm = need(args, '--arm');
      const arms = (arm === 'both' ? ['off', 'on'] : [arm]) as Array<'on' | 'off'>;
      const { withST } = await import('./lib/cli.mts');
      const noStop = args.includes('--no-stop');
      const plumbing = args.includes('--plumbing') ? rec.plumbingReply : undefined;
      const score = await rec.witnessReadScorer(await lib.labelFiles(out, args.includes('--adjudicated')));
      result = await withST(async (page) => {
        const run: import('./lib/witnessRecord.mts').Runner = (spec) => page.evaluate(async (payload) => {
          const suite = (globalThis as unknown as { storyOrchestratorLiveSuite?: { runWitnessRead(spec: unknown): Promise<unknown> } }).storyOrchestratorLiveSuite;
          if (!suite) throw new Error('storyOrchestratorLiveSuite not registered (extension not loaded?)');
          return suite.runWitnessRead(payload);
        }, spec) as ReturnType<import('./lib/witnessRecord.mts').Runner>;
        return rec.recordAll(sets, arms, run, out, { plumbing, score, noStop });
      });
    }
  } else if (command === 'wc') result = await (await import('./lib/witnessRecord.mts')).wcAll(out);
  else if (command === 'score-real') {
    const adjudicated = args.includes('--adjudicated');
    const refused = await lib.checkWitnessFreeze(out, need(args, '--freeze'), adjudicated);
    if (refused) {
      console.error(refused);
      return 3;
    }
    result = await lib.scoreRealReads(out, adjudicated);
  } else if (command === 'adjudicate') result = await lib.adjudicateWitness({ root: need(args, '--sessions'), out, width: Number(option(args, '--width') ?? 2) });
  else if (command === 'freeze') {
    const record = await lib.freezeWitnessLabels(out, args.includes('--adjudicated'));
    await writeFile(need(args, '--record'), `${JSON.stringify(record, null, 1)}
`, 'utf-8');
    result = record;
  } else if (command === 'derive-score') {
    const refused = await lib.checkWitnessFreeze(out, need(args, '--freeze'), true);
    if (refused) {
      console.error(refused);
      return 3;
    }
    result = await (await import('./lib/witnessDerive.mts')).deriveScoreAll(out, need(args, '--sessions'), option(args, '--lab-story'), args.includes('--speaker-own'));
    const write = option(args, '--write');
    if (write) {
      refusePrivateOutput(false, write, 'witness derive score');
      await writeFile(write, `${JSON.stringify(result, null, 1)}
`, 'utf-8');
    }
  } else if (command === 'presence') {
    const refused = await lib.checkWitnessFreeze(out, need(args, '--freeze'), args.includes('--adjudicated'));
    if (refused) {
      console.error(refused);
      return 3;
    }
    result = await lib.presenceControl(out, args.includes('--adjudicated'));
  } else throw new Error(`unknown command ${command}
${USAGE}`);
  console.log(JSON.stringify(result, null, 1));
  const stopped = (result as { stopped?: { verdict: string } | null } | null)?.stopped;
  return stopped && stopped.verdict !== 'pass' ? 1 : 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command !== 'score') return labelCommand(command, args);
  const result = await scoreReads(need(args, '--labels'), need(args, '--reads'));
  const out = option(args, '--out');
  if (out) {
    refusePrivateOutput(result.synthetic, out, 'witness');
    await writeFile(out, `${JSON.stringify(result, null, 1)}\n`, 'utf-8');
  }
  console.log(JSON.stringify(result, null, 2));
  return EXIT[result.verdict];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
