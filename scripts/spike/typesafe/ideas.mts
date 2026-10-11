import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/ideas.mts <idea> --run <n> [--record]
       node --no-warnings --experimental-transform-types scripts/spike/typesafe/ideas.mts <idea> --replay

v2.8 13 Phase A: runs test/fixtures/judge/<fixture>.json for one J7/N idea through src/judge/ideaSpikes.ts
and the real judge plugin handler against TypeSafe (key as the plugin finds it, never printed).
--record writes test/goldens/judge/<fixture>.run<n>.json and appends the call count to
test/measurements/v2.8/13-phase-a/calls.jsonl. --replay scores a recorded run with no call.`;

const spikes = await import('@judge/ideaSpikes') as any;
const judge = { ...(await import('@judge/index')), ...(await import('@judge/calibration')) } as any;

const [idea, ...rest] = process.argv.slice(2);
if (!spikes.SPIKE_IDEAS.includes(idea)) {
  console.log(USAGE);
  process.exit(idea ? 1 : 0);
}
const runIndex = rest.indexOf('--run');
const run = runIndex >= 0 ? Number(rest[runIndex + 1]) : 1;
const replayOnly = rest.includes('--replay');
const fixtureName = spikes.SPIKE_FIXTURE[idea];
const fixtureFile = join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${fixtureName}.json`);
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf-8'));
const revision = createHash('sha256').update(JSON.stringify(fixture)).digest('hex').slice(0, 12);
const goldenFile = join(PROJECT_ROOT, 'test', 'goldens', 'judge', `${fixtureName}.run${run}.json`);
const calls = spikes.spikeCalls(idea, fixture) as Array<{ id: string; request: any }>;
const attemptFile = join(PROJECT_ROOT, 'test/measurements/v2.8/13-phase-a/b4-attempts.jsonl');
let actualCalls = 0;

const goldenOf = (name: string) => JSON.parse(readFileSync(join(PROJECT_ROOT, 'test', 'goldens', 'judge', name), 'utf-8'));
const replayAsk = (name: string) => {
  const golden = goldenOf(name);
  const byRequest = new Map(golden.calls.map((call: any) => [JSON.stringify([call.state, call.questions]), call.answers]));
  return async (request: any) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
};
const sceneWhole = async () => {
  const totals = { breakRight: 0, breakTotal: 0, nobreakRight: 0, nobreakTotal: 0 };
  for (const name of ['scene', 'scene-holdout']) {
    const rows = JSON.parse(readFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${name}.json`), 'utf-8')).rows.filter((row: any) => row.labels.sceneBreak !== undefined);
    const report = await judge.runSceneCalibration(replayAsk(`${name}.json`), rows);
    for (const row of report.rows) {
      if (row.picked === null) continue;
      if (row.id.endsWith('.break')) { totals.breakTotal += 1; if (row.right) totals.breakRight += 1; }
      if (row.id.endsWith('.nobreak')) { totals.nobreakTotal += 1; if (row.right) totals.nobreakRight += 1; }
    }
  }
  return totals;
};

let answers = new Map<string, { answers: any; latencyMs: number }>();
let model: string | null = null;
let recorded: any[] = [];
if (replayOnly) {
  const golden = JSON.parse(readFileSync(goldenFile, 'utf-8'));
  if (golden.fixtureRevision !== revision) throw new Error('Recorded fixture revision is stale');
  if (golden.calls.length !== calls.length || calls.some((call) => !golden.calls.some((entry: any) => entry.id === call.id && JSON.stringify([entry.state, entry.questions]) === JSON.stringify([call.request.state, call.request.questions])))) throw new Error('Recorded request census differs from the fixture');
  model = golden.model;
  answers = new Map(golden.calls.map((call: any) => [call.id, { answers: call.answers, latencyMs: call.latencyMs }]));
} else {
  const sent = existsSync(attemptFile) ? readFileSync(attemptFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).length : 0;
  if (sent + calls.length > 300) throw new Error('B4 TypeSafe call budget would be exceeded');
  mkdirSync(join(PROJECT_ROOT, 'test/measurements/v2.8/13-phase-a'), { recursive: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes('/v1/systemone') || !url.startsWith('https://api.typesafe.ai/')) throw new Error('Only the protected TypeSafe upstream is allowed');
    if (sent + actualCalls >= 300) throw new Error('B4 TypeSafe call budget exhausted');
    actualCalls += 1;
    appendFileSync(attemptFile, `${JSON.stringify({ at: new Date().toISOString(), idea, run, attempt: sent + actualCalls, fixtureRevision: revision })}\n`);
    return originalFetch(input, init);
  };
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
    if (out.status !== 200) throw new Error(`Protected judge handler returned HTTP ${out.status}`);
    return out.body;
  };
  let inFlight = 0;
  const pace = async () => {
    while (inFlight >= 2) await new Promise((done) => setTimeout(done, 100));
    inFlight += 1;
  };
  await Promise.all(calls.map(async (call) => {
    await pace();
    const result = await judge.askJudge(transport, { ...call.request, model: judge.JUDGE_DEFAULT_MODEL }, { timeoutMs: 10_000 }).finally(() => { inFlight -= 1; });
    if (result.model) model = result.model;
    answers.set(call.id, { answers: result.answers, latencyMs: result.latencyMs });
    recorded.push({ id: call.id, state: call.request.state, questions: call.request.questions, answers: result.answers, latencyMs: result.latencyMs, inputTokens: result.usage?.input_tokens ?? null, ...(result.fallback ? { fallback: result.fallback } : {}) });
  }));
  recorded = calls.map((call) => recorded.find((entry) => entry.id === call.id));
}

const whole = idea === 'sceneConfirm' ? await sceneWhole() : null;
const result = idea === 'sceneConfirm' ? spikes.scoreSceneConfirm(fixture.rows, answers, whole) : spikes.scoreSpike(idea, fixture, answers);
const extraFloors = idea === 'canonVerify' ? spikes.draftModeFloors(result) : [];
for (const row of result.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(28)} ${String(row.label).padEnd(12)} ${String(row.read).padEnd(32)} ${row.family ?? ''}`);
console.log('');
for (const entry of [...result.floors, ...extraFloors]) console.log(`${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name.padEnd(28)} ${String(entry.value).padEnd(8)} ${entry.op} ${entry.floor}`);
console.log(`metrics ${JSON.stringify(result.metrics)}`);
const latencies = [...answers.values()].filter((entry) => entry.answers).map((entry) => entry.latencyMs).sort((a, b) => a - b);
const p50 = latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null;
const tokens = recorded.map((entry) => entry.inputTokens).filter((value) => typeof value === 'number');
console.log(`\n${idea} run ${run}: ${result.passed ? 'PASS' : 'FAIL'}, actual upstream calls ${actualCalls}, unanswered ${result.unanswered}, p50 ${p50} ms, model ${model}, fixture ${fixtureName} rev ${revision}${tokens.length ? `, input tokens/call ${Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)}` : ''}`);

if (!replayOnly && rest.includes('--record')) {
  mkdirSync(join(PROJECT_ROOT, 'test', 'goldens', 'judge'), { recursive: true });
  writeFileSync(goldenFile, `${JSON.stringify({
    source: `ideas.mts ${idea} run ${run} over test/fixtures/judge/${fixtureName}.json (v2.8 13 Phase A): real answers, replayed by jest keyed on state + questions`,
    recordedAt: new Date().toISOString(), model, fixtureRevision: revision, run,
    verdict: { passed: result.passed, metrics: result.metrics, floors: [...result.floors, ...extraFloors] },
    latencyP50Ms: p50, actualCalls, calls: recorded,
  }, null, 2)}\n`);
  const dir = join(PROJECT_ROOT, 'test', 'measurements', 'v2.8', '13-phase-a');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), idea, run, calls: actualCalls, passed: result.passed, fixtureRevision: revision, model })}\n`);
  console.log(`recorded ${recorded.length} calls to ${goldenFile}`);
}
process.exit(result.passed ? 0 : 2);
