import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { refusePrivateOutput } from './lib/bundleEntry.mts';
import { scoreReads } from './lib/witness.mts';

const USAGE = `Usage:
  node scripts/debug/so-witness.mts score --labels <labels.json> --reads <reads.json> [--out <result.json>]

v2.8 plan 42 B, offline: replays recorded witness read responses (format so-witness-reads/1) through the witness
contract parser and record (no model, no ST), scores them against labels (format so-witness-labels/1; a private set
keeps only labels reviewed by two different writers who agreed) and scores the presence null control on the same set.
Prints every metric unrounded with its counts. Exit 0 pass, 1 fail (a floor or the null-control margin missed),
2 insufficient (fewer than 40 kept labels).
Private sets (synthetic: false) write only under test/sessions/ or outside this repo.`;

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
