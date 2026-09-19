import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/calibrate-node.mts director [--min 0.85]

Runs test/fixtures/judge/<use>.json through the production judge code (src/judge) and the real
server plugin handler (server-plugin/story-orchestrator-judge), against the live TypeSafe API, with
the key the plugin would find (env, then ~/.typesafe/api-key/.env). No SillyTavern needed: this is
the off-page half of plan 01's calibration; so-judge calibrate is the in-page half.`;

const [use, ...rest] = process.argv.slice(2);
const minIndex = rest.indexOf('--min');
const min = minIndex >= 0 ? Number(rest[minIndex + 1]) : 0.85;
if (use !== 'director') {
  console.log(USAGE);
  process.exit(use ? 1 : 0);
}

const judge = await import('@judge/index');
const plugin = await import(pathToFileURL(resolve(PROJECT_ROOT, 'server-plugin', 'story-orchestrator-judge', 'index.mjs')).href);
const handlers = plugin.createHandlers();

const transport = async (request: unknown) => {
  const out: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status(code: number) { out.status = code; return res; },
    type() { return res; },
    json(value: unknown) { out.body = value; return res; },
    send(value: string) { out.body = JSON.parse(value); return res; },
  };
  await handlers.systemone({ body: request }, res);
  if (out.status !== 200) throw new Error(`plugin ${out.status}: ${JSON.stringify(out.body)}`);
  return out.body;
};

const fixture = JSON.parse(readFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${use}.json`), 'utf-8'));
const report = await judge.runJudgeDirectorSelfTest((request: any) => judge.askJudge(transport as any, { ...request, model: judge.JUDGE_DEFAULT_MODEL }, { timeoutMs: 10_000 }), fixture.rows);
const tagOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.tags as string[]]));
for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(4)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${(tagOf[row.id] ?? []).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}`);
const spanish = report.rows.filter((row: any) => tagOf[row.id]?.includes('spanish'));
const rate = report.right / report.total;
console.log(`\n${use}: ${report.right}/${report.total} (${(rate * 100).toFixed(0)}%), spanish ${spanish.filter((row: any) => row.right).length}/${spanish.length}, p50 ${report.p50LatencyMs} ms, model ${report.model}, floor ${min}`);
process.exit(rate >= min ? 0 : 2);
