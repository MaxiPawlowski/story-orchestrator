import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, publicSummary, reconstruct, type Reconstruction } from './lib/j6dReplay.mts';

const USAGE = `Usage:
  node scripts/debug/so-j6d-replay.mts reconstruct <session-dir...> --out <cases.json>
  node scripts/debug/so-j6d-replay.mts prompts <cases.json> --out <dir>
  node scripts/debug/so-j6d-replay.mts compare <cases.json> [--replies <replies.json>] [--out <record.json>]

v2.8 plan 12 J6d option C, offline. Never touches ST and never calls a model.
reconstruct  rebuilds each judged read of each session dir (journal.jsonl audit rows, transcripts.jsonl /
             chat-full-*.json, runtime-*.json) and keeps only reads whose residual prompt re-renders byte for byte;
             every other read is refused with a reason. Each kept case carries the full-scope prompt (residual +
             judge-answered keys).
prompts      writes one <case>.txt per kept case: the input for the deferred extractor leg (the read model, x2).
compare      classifies each judge-answered key against recorded extractor replies
             ({"<case id>": [{"text": "...", "finish": "stop"}, ...]}, two runs per case). Without --replies the
             verdict is "deferred". Prints counts only; --out keeps the per-key rows (private evidence).`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const positional = (args: string[]) => args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command === 'reconstruct') {
    const out = option(args, '--out');
    const dirs = positional(args);
    if (!out || !dirs.length) throw new Error('reconstruct needs <session-dir...> --out <cases.json>');
    const result = await reconstruct(dirs);
    await writeFile(out, `${JSON.stringify(result, null, 1)}\n`, 'utf-8');
    console.log(JSON.stringify(result.sessions.map((session) => ({
      dir: session.dir, audits: session.audits, cases: session.cases.length, rebuiltKeys: session.rebuiltKeys, skipped: session.skipped,
      refused: session.refusals.map((entry) => `${entry.code}: ${entry.reason}`),
    })), null, 2));
    return 0;
  }
  const [file] = positional(args);
  if (!file) throw new Error(`${command} needs <cases.json>`);
  const reconstruction = JSON.parse(await readFile(file, 'utf-8')) as Reconstruction;
  if (command === 'prompts') {
    const out = option(args, '--out');
    if (!out) throw new Error('prompts needs --out <dir>');
    await mkdir(out, { recursive: true });
    const cases = reconstruction.sessions.flatMap((session) => session.cases);
    for (const entry of cases) await writeFile(join(out, `${entry.id}.txt`), entry.fullPrompt, 'utf-8');
    console.log(JSON.stringify({ written: cases.length, dir: out }));
    return 0;
  }
  if (command === 'compare') {
    const repliesFile = option(args, '--replies');
    const replies = repliesFile ? JSON.parse(await readFile(repliesFile, 'utf-8')) : {};
    const result = await compare(reconstruction, replies);
    const out = option(args, '--out');
    if (out) await writeFile(out, `${JSON.stringify(result, null, 1)}\n`, 'utf-8');
    console.log(JSON.stringify(publicSummary(result), null, 2));
    return result.summary.verdict === 'rate' ? 0 : 2;
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
