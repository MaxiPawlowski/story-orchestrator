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
  node scripts/debug/so-witness.mts freeze --out <dir> --record <freeze.json>
  node scripts/debug/so-witness.mts presence --out <dir> --freeze <freeze.json>

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
file; presence scores the presence null control (W4n, labelled present as witness) on the frozen sets.`;

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
  else if (command === 'freeze') {
    const record = await lib.freezeWitnessLabels(out);
    await writeFile(need(args, '--record'), `${JSON.stringify(record, null, 1)}
`, 'utf-8');
    result = record;
  } else if (command === 'presence') {
    const refused = await lib.checkWitnessFreeze(out, need(args, '--freeze'));
    if (refused) {
      console.error(refused);
      return 3;
    }
    result = await lib.presenceControl(out);
  } else throw new Error(`unknown command ${command}
${USAGE}`);
  console.log(JSON.stringify(result, null, 1));
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command !== 'score') throw new Error(`unknown command ${command}\n${USAGE}`);
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
