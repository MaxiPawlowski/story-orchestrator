import { register } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/calibrate-node.mts director|memory-verify|memory-pairs [--min 0.85] [--fixture <name>] [--record]

Runs test/fixtures/judge/<use>.json through the production judge code (src/judge) and the real
server plugin handler (server-plugin/story-orchestrator-judge), against the live TypeSafe API, with
the key the plugin would find (env, then ~/.typesafe/api-key/.env). No SillyTavern needed: this is
the off-page half of plan 01's calibration; so-judge calibrate is the in-page half.`;

const [use, ...rest] = process.argv.slice(2);
const minIndex = rest.indexOf('--min');
const min = minIndex >= 0 ? Number(rest[minIndex + 1]) : 0.85;
const fixtureIndex = rest.indexOf('--fixture');
const fixtureName = fixtureIndex >= 0 ? rest[fixtureIndex + 1] : use;
if (!['director', 'memory-verify', 'memory-pairs'].includes(use)) {
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

const fixture = JSON.parse(readFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${fixtureName}.json`), 'utf-8'));
const calls: Array<{ state: unknown; questions: unknown; answers: unknown }> = [];
const ask = async (request: any) => {
  const result = await judge.askJudge(transport as any, { ...request, model: judge.JUDGE_DEFAULT_MODEL }, { timeoutMs: 10_000 });
  if (result.answers) calls.push({ state: request.state, questions: request.questions, answers: result.answers });
  return result;
};
const report = use === 'director' ? await judge.runJudgeDirectorSelfTest(ask, fixture.rows) : use === 'memory-verify' ? await judge.runMemoryVerifyCalibration(ask, fixture.rows) : await judge.runMemoryPairsCalibration(ask, fixture.rows);
const labelOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.label]));
const tagOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, (row.tags as string[] | undefined) ?? (row.lang === 'es' ? ['spanish'] : [])]));
for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(4)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${(tagOf[row.id] ?? []).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}${(row as any).detail ? `  [${labelOf[row.id]}] ${(row as any).detail}` : ''}`);
const spanish = report.rows.filter((row: any) => tagOf[row.id]?.includes('spanish'));
const harmful = use === 'memory-pairs' ? report.rows.filter((row: any) => ['duplicate', 'update'].includes(row.picked) && ['distinct', 'unrelated'].includes(labelOf[row.id])).length : 0;
const rate = report.right / report.total;
console.log(`\n${use}: ${report.right}/${report.total} (${(rate * 100).toFixed(0)}%), spanish ${spanish.filter((row: any) => row.right).length}/${spanish.length}, p50 ${report.p50LatencyMs} ms, model ${report.model}, floor ${min}${use === 'memory-pairs' ? `, harmful ${harmful}` : ''}`);
if (rest.includes('--record') && use !== 'director') {
  const out = join(PROJECT_ROOT, 'test', 'goldens', 'judge');
  mkdirSync(out, { recursive: true });
  const file = join(out, `${fixtureName}.json`);
  writeFileSync(file, `${JSON.stringify({ source: `calibrate-node ${use} over test/fixtures/judge/${fixtureName}.json: the production question shape, real answers, replayed by jest keyed on state + questions, so a wording change must re-record`, recordedAt: new Date().toISOString(), model: report.model, right: report.right, total: report.total, calls }, null, 2)}
`);
  console.log(`recorded ${calls.length} calls to ${file}`);
}
process.exit(rate >= min ? 0 : 2);
