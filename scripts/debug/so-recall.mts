import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { refusePrivateOutput } from './lib/bundleEntry.mts';
import { replayFixture } from './lib/recall.mts';

const USAGE = `Usage:
  node scripts/debug/so-recall.mts replay --fixture <dir> [--out <result.json>]

v2.8 plan 43, offline only (plan 43 is gated; nothing here runs in play): replays <dir>/fixture.json
(format so-recall-fixture/1) through the recall modules in src/memory/recall: witness reads replayed into a witness
record, eligibility over the whole recorded pool (32) before ranking, attribution, top 4 within 250 tokens
(chars / 4). No model, no vectors, no ST; the recorded pool order is a stub, so the result is a tooling check, not
R-Gate evidence. Reports VR1, VR2, VR2s (provenance vs keptFrom-only refusals), VR2t, VR2k, VR3, VR8 unrounded with
counts. Exit 0 pass, 1 fail, 2 insufficient (fixture below the 21 §6.2 minimum shape).
Private fixtures (synthetic: false) write only under test/sessions/ or outside this repo.`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const EXIT = { pass: 0, fail: 1, insufficient: 2 } as const;

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command !== 'replay') throw new Error(`unknown command ${command}\n${USAGE}`);
  const fixture = option(args, '--fixture');
  if (!fixture) throw new Error(`missing --fixture\n${USAGE}`);
  const result = await replayFixture(fixture);
  const out = option(args, '--out');
  if (out) {
    refusePrivateOutput(result.synthetic, out, 'recall');
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
