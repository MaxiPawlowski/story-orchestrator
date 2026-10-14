import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPool, checkFrozen, freeze, refusePublicPrivate, runE0 } from './lib/e0.mts';

const USAGE = `Usage:
  node scripts/debug/so-e0.mts pool --labels <labels.json> --sessions <root> --out <pool.json> [--provider stub]
  node scripts/debug/so-e0.mts freeze --labels <labels.json> --pool <pool.json> --out <freeze.json>
  node scripts/debug/so-e0.mts run --labels <labels.json> --pool <pool.json> --freeze <freeze.json> [--choices <calls.json>] [--out <result.json>]

v2.8 plan 21 E0, offline: ranking within the retrieved set. Never touches ST and never calls a model.
pool    builds one 8-id candidate pool per labelled question (collection = messages before the asking turn minus the
        last 5; query = the previous message + the question) plus band membership at 0.82/0.7/0.55/0.4. Only the stub
        provider runs here; the st-vectors pool from a lane is owed. <root>/<session>/chat-*.json per label session.
freeze  hashes the labels and pool files (sha256) and every pooled question. Commit it before any arm runs.
run     ranks every pool with arms e, c, a, b, d (cost order) and scores hit@1, hit@4, MRR@4, pool recall, tie rate,
        calls, latency and input tokens against the floors fixed in src/memory/e0Ranking.ts. Refuses an unfrozen pool.
        Arm d reads recorded Choice calls ({"<question id>": [{"pick": <message id|null>, "latencyMs", "inputTokens"}] x4});
        without them it is owed and the verdict is "incomplete".
Private labels (source "private") write only under test/sessions/e0/ or outside this repo; output is counts and scores.`;

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const need = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing ${name}\n${USAGE}`);
  return value;
};

const write = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || args.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command === 'pool') {
    const out = need(args, '--out');
    const { labels, pool } = await buildPool(need(args, '--labels'), need(args, '--sessions'), option(args, '--provider') ?? 'stub');
    refusePublicPrivate(pool.source, out);
    await write(out, pool);
    console.log(JSON.stringify({ source: pool.source, provider: pool.provider, labels: labels.questions.length, droppedDisagreed: labels.dropped.disagreed, droppedInvalid: labels.dropped.invalid.length, pooled: pool.questions.length, refused: pool.refused.length }));
    return 0;
  }
  if (command === 'freeze') {
    const out = need(args, '--out');
    const record = await freeze(need(args, '--labels'), need(args, '--pool'));
    await write(out, record);
    console.log(JSON.stringify({ labels: record.labels, pool: record.pool, questions: record.questions }));
    return 0;
  }
  if (command === 'run') {
    const labels = need(args, '--labels');
    const pool = need(args, '--pool');
    const refused = await checkFrozen(option(args, '--freeze'), labels, pool);
    if (refused) {
      console.error(refused);
      return 3;
    }
    const result = await runE0(labels, pool, option(args, '--choices'));
    const out = option(args, '--out');
    if (out) {
      refusePublicPrivate(result.source, out);
      await write(out, result);
    }
    console.log(JSON.stringify(result, null, 2));
    return result.verdict.status === 'winner' || result.verdict.status === 'no-winner' ? 0 : 2;
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
