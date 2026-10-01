import { register } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/calibrate-node.mts director|memory-verify|memory-pairs|scene|lore|curator-filter|continuity|backgrounds|typed|stall|critic|variants|agency|house-rules [--min 0.85] [--fixture <name>] [--record]

Runs test/fixtures/judge/<use>.json through the production judge code (src/judge) and the real
server plugin handler (server-plugin/story-orchestrator-judge), against the live TypeSafe API, with
the key the plugin would find (env, then ~/.typesafe/api-key/.env). No SillyTavern needed: this is
the off-page half of plan 01's calibration; so-judge calibrate is the in-page half.`;

const [use, ...rest] = process.argv.slice(2);
const minIndex = rest.indexOf('--min');
const min = minIndex >= 0 ? Number(rest[minIndex + 1]) : 0.85;
const fixtureIndex = rest.indexOf('--fixture');
const fixtureName = fixtureIndex >= 0 ? rest[fixtureIndex + 1] : use;
if (!['director', 'memory-verify', 'memory-pairs', 'scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants', 'agency', 'house-rules'].includes(use)) {
  console.log(USAGE);
  process.exit(use ? 1 : 0);
}

const judge = { ...(await import('@judge/index')), ...(await import('@judge/calibration')) } as any;
const plugin = await import(pathToFileURL(resolve(PROJECT_ROOT, 'server-plugin', 'story-orchestrator-judge', 'index.mjs')).href);
const handlers = plugin.createHandlers({ accountsEnabled: false });

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
const stamps: number[] = [];
let inFlight = 0;
const pace = async () => {
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0] >= 61_000) stamps.shift();
    if (inFlight < 2 && stamps.length < 60) break;
    await new Promise((done) => setTimeout(done, 250));
  }
  inFlight += 1;
  stamps.push(Date.now());
};
const ask = async (request: any) => {
  await pace();
  const result = await judge.askJudge(transport as any, { ...request, model: judge.JUDGE_DEFAULT_MODEL }, { timeoutMs: 10_000 }).finally(() => { inFlight -= 1; });
  if (result.fallback === 'busy') throw new Error('plugin limiter refused a call (busy): nothing recorded');
  if (result.answers) calls.push({ state: request.state, questions: request.questions, answers: result.answers });
  return result;
};
const report = use === 'director' ? await judge.runJudgeDirectorSelfTest(ask, fixture.rows) : use === 'memory-verify' ? await judge.runMemoryVerifyCalibration(ask, fixture.rows) : use === 'memory-pairs' ? await judge.runMemoryPairsCalibration(ask, fixture.rows) : use === 'scene' ? await judge.runSceneCalibration(ask, fixture.rows) : use === 'lore' ? await judge.runLoreCalibration(ask, judge.resolveLoreCases(fixture)) : use === 'curator-filter' ? await judge.runCuratorFilterCalibration(ask, fixture.rows) : use === 'continuity' ? (fixture.rows.some(judge.isCombinedCase) ? await judge.runCombinedContinuityCalibration(ask, fixture.rows) : await judge.runContinuityCalibration(ask, fixture.rows)) : use === 'agency' ? await judge.runAgencyCalibration(ask, fixture.rows) : use === 'house-rules' ? await judge.runHouseRuleCalibration(ask, fixture.rows) : use === 'backgrounds' ? await judge.runBackgroundCalibration(ask, fixture.rows, fixture.installed) : use === 'typed' ? await judge.runTypedCalibration(ask, fixture.rows) : use === 'stall' ? await judge.runStallCalibration(ask, fixture.rows) : use === 'critic' ? await judge.runCriticCalibration(ask, fixture.rows) : await judge.runVariantCalibration(ask, fixture.rows);
const labelOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.label]));
const caseTags = Object.fromEntries(fixture.rows.map((row: any) => [row.id, (row.tags as string[] | undefined) ?? []]));
const tagOf = new Proxy(caseTags, { get: (target, id: string) => target[id] ?? target[id.split('.')[0]] });
for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(4)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${(tagOf[row.id] ?? []).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}${(row as any).detail ? `  [${labelOf[row.id]}] ${(row as any).detail}` : ''}`);
const harmful = use === 'memory-pairs' ? report.rows.filter((row: any) => ['duplicate', 'update'].includes(row.picked) && ['distinct', 'unrelated'].includes(labelOf[row.id])).length : 0;
const families = ['scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants', 'agency', 'house-rules'].includes(use) ? judge.judgeFamilyScores(report, fixture.floors ?? {}) : [];
families.forEach((row: any) => console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.family.padEnd(9)} ${row.right}/${row.total} (${((row.right / row.total) * 100).toFixed(0)}%) floor ${row.floor}`));
const rate = families.length ? (families.every((row: any) => row.ok) ? 1 : 0) : report.right / report.total;
console.log(`\n${use}: ${report.right}/${report.total} (${(rate * 100).toFixed(0)}%), p50 ${report.p50LatencyMs} ms, model ${report.model}, floor ${min}${use === 'memory-pairs' ? `, harmful ${harmful}` : ''}`);
if (rest.includes('--record') && use !== 'director' && calls.length === 0) {
  console.log('nothing answered: not recording an empty golden');
  process.exit(1);
}
if (rest.includes('--record') && use !== 'director') {
  const out = join(PROJECT_ROOT, 'test', 'goldens', 'judge');
  mkdirSync(out, { recursive: true });
  const file = join(out, `${fixtureName}.json`);
  writeFileSync(file, `${JSON.stringify({ source: `calibrate-node ${use} over test/fixtures/judge/${fixtureName}.json: the production question shape, real answers, replayed by jest keyed on state + questions, so a wording change must re-record`, recordedAt: new Date().toISOString(), model: report.model, right: report.right, total: report.total, calls }, null, 2)}
`);
  console.log(`recorded ${calls.length} calls to ${file}`);
}
process.exit(rate >= min ? 0 : 2);
