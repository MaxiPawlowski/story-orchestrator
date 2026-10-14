import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './lib/client.mts';

register('./lib/loader.mts', import.meta.url);

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/typed-kinds.mts <command>
  tune [--record]           one run of the tuning fixture (spike-typed-kinds-tune) against TypeSafe
  select                    fixes the per-kind floors from the tuning rows (typed.json golden + tune run 1), no call
  held --run <n> [--record] one run of the held-out fixture (spike-typed-kinds) at the frozen floors
  held --run <n> --replay   scores a recorded held-out run, no call
  verdict                   the held-out verdict over runs 1 and 2, no call
  replay <cases.json> [--replies <replies.json>] [--story <story.json>]
                            the J6d replay leg: which judge-answered keys each frozen floor keeps or hands back

v2.8 13 J7.6 Phase A (per-quality floors). Calls go through the production judge code and the real judge
plugin handler (key as the plugin finds it, never printed); at most ${150} upstream calls, counted in
test/measurements/v2.8/13-phase-a/j76-attempts.jsonl.`;

const floors = await import('@judge/typedKindFloors') as any;
const judge = { ...(await import('@judge/index')) } as any;

const FIXTURES = join(PROJECT_ROOT, 'test', 'fixtures', 'judge');
const GOLDENS = join(PROJECT_ROOT, 'test', 'goldens', 'judge');
const MEASURE = join(PROJECT_ROOT, 'test', 'measurements', 'v2.8', '13-phase-a');
const ATTEMPTS = join(MEASURE, 'j76-attempts.jsonl');
const FLOORS_FILE = join(FIXTURES, 'spike-typed-kinds.floors.json');

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));
const revisionOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const write = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

const answersFrom = (golden: any) => new Map<string, any>(golden.calls.map((call: any) => [call.id, call.answers]));
const answersByRequest = (golden: any, calls: Array<{ id: string; request: any }>) => {
  const byRequest = new Map(golden.calls.map((call: any) => [JSON.stringify([call.state, call.questions]), call.answers]));
  return new Map(calls.map((call) => [call.id, byRequest.get(JSON.stringify([call.request.state, call.request.questions])) ?? null]));
};

async function ask(calls: Array<{ id: string; request: any }>, label: string, revision: string) {
  const sent = existsSync(ATTEMPTS) ? readFileSync(ATTEMPTS, 'utf-8').trim().split(/\r?\n/).filter(Boolean).length : 0;
  if (sent + calls.length > floors.J76_CALL_BUDGET) throw new Error(`J7.6 call budget would be exceeded (${sent} used, ${calls.length} asked, cap ${floors.J76_CALL_BUDGET})`);
  mkdirSync(MEASURE, { recursive: true });
  let actual = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://api.typesafe.ai/') || !url.includes('/v1/systemone')) throw new Error('Only the protected TypeSafe upstream is allowed');
    if (sent + actual >= floors.J76_CALL_BUDGET) throw new Error('J7.6 call budget exhausted');
    actual += 1;
    appendFileSync(ATTEMPTS, `${JSON.stringify({ at: new Date().toISOString(), label, attempt: sent + actual, fixtureRevision: revision })}\n`);
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
  let model: string | null = null;
  const recorded: any[] = [];
  await Promise.all(calls.map(async (call) => {
    while (inFlight >= 2) await new Promise((done) => setTimeout(done, 100));
    inFlight += 1;
    const result = await judge.askJudge(transport, { ...call.request, model: judge.JUDGE_DEFAULT_MODEL }, { timeoutMs: 10_000 }).finally(() => { inFlight -= 1; });
    if (result.model) model = result.model;
    recorded.push({ id: call.id, state: call.request.state, questions: call.request.questions, answers: result.answers, latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) });
  }));
  globalThis.fetch = originalFetch;
  return { model, actual, calls: calls.map((call) => recorded.find((entry) => entry.id === call.id)) };
}

const p50 = (calls: any[]) => {
  const values = calls.filter((call) => call.answers).map((call) => call.latencyMs).sort((a: number, b: number) => a - b);
  return values.length ? values[Math.floor((values.length - 1) / 2)] : null;
};

const logTallies = (title: string, rows: any[]) => {
  const tallies = floors.tallyKinds(rows);
  for (const kind of floors.TYPED_KINDS) {
    const tally = tallies[kind];
    console.log(`${title.padEnd(10)} ${kind.padEnd(7)} rows ${tally.rows}, answered ${tally.answered}, right ${tally.right}, accuracy ${tally.accuracy}, coverage ${tally.coverage}`);
  }
};

const recordCalls = (label: string, revision: string, run: number, actual: number, model: string | null) =>
  appendFileSync(join(MEASURE, 'calls.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), idea: 'typedKinds', label, run, calls: actual, fixtureRevision: revision, model })}\n`);

async function tune(args: string[]) {
  const fixture = readJson(join(FIXTURES, 'spike-typed-kinds-tune.json'));
  const revision = revisionOf(fixture);
  const calls = floors.typedKindCalls(fixture.rows);
  const result = await ask(calls, 'tune', revision);
  const rows = floors.kindRows(fixture.rows, answersFrom(result), floors.SINGLE_FLOORS);
  logTallies('tune@0.8', rows);
  console.log(`tune: ${calls.length} requests, ${result.actual} upstream calls, unanswered ${result.calls.filter((call: any) => !call.answers).length}, p50 ${p50(result.calls)} ms, model ${result.model}, rev ${revision}`);
  if (args.includes('--record')) {
    write(join(GOLDENS, 'spike-typed-kinds-tune.run1.json'), {
      source: 'typed-kinds.mts tune over test/fixtures/judge/spike-typed-kinds-tune.json (v2.8 13 J7.6 tuning split): real answers, replayed by jest keyed on state + questions',
      recordedAt: new Date().toISOString(), model: result.model, fixtureRevision: revision, run: 1, latencyP50Ms: p50(result.calls), actualCalls: result.actual, calls: result.calls,
    });
    recordCalls('tune', revision, 1, result.actual, result.model);
  }
}

function tuningRows() {
  const typed = readJson(join(FIXTURES, 'typed.json'));
  const typedCalls = floors.typedKindCalls(typed.rows);
  const typedAnswers = answersByRequest(readJson(join(GOLDENS, 'typed.json')), typedCalls);
  const tuneFixture = readJson(join(FIXTURES, 'spike-typed-kinds-tune.json'));
  const tuneGolden = readJson(join(GOLDENS, 'spike-typed-kinds-tune.run1.json'));
  if (tuneGolden.fixtureRevision !== revisionOf(tuneFixture)) throw new Error('tuning golden is stale against its fixture');
  const tuneAnswers = answersFrom(tuneGolden);
  return {
    typedMissing: [...typedAnswers.values()].filter((value) => value === null).length,
    rowsAt: (at: any) => [...floors.kindRows(typed.rows, typedAnswers, at), ...floors.kindRows(tuneFixture.rows, tuneAnswers, at)],
    tuneRevision: tuneGolden.fixtureRevision,
  };
}

function select() {
  const tuning = tuningRows();
  const selection = floors.selectKindFloors(tuning.rowsAt);
  for (const kind of floors.TYPED_KINDS) {
    const entry = selection.kinds[kind];
    console.log(`${kind.padEnd(7)} floor ${entry.floor}${entry.moved ? ' (moved)' : ''}: ${entry.reason}`);
    for (const point of entry.curve) console.log(`         @${point.at.toFixed(2)} answered ${point.answered}/${point.asked}, accuracy ${point.accuracy}`);
  }
  console.log(`typed.json requests without a recorded answer: ${tuning.typedMissing}`);
  const held = readJson(join(FIXTURES, 'spike-typed-kinds.json'));
  write(FLOORS_FILE, {
    idea: 'J7.6', frozenAt: new Date().toISOString(), rule: `per kind, the lowest of ${floors.J76_GRID.join(', ')} whose tuning answered accuracy is >= ${floors.J76_ANSWERED_FLOOR} on >= ${floors.J76_MIN_TUNE_ANSWERED} answered rows, else the single floor ${floors.SINGLE_FLOORS.choice}; the latching bump stays on top`,
    tuning: { typed: 'test/goldens/judge/typed.json', tune: 'test/goldens/judge/spike-typed-kinds-tune.run1.json', tuneRevision: tuning.tuneRevision, typedMissing: tuning.typedMissing },
    heldOutRevision: revisionOf(held), floors: selection.floors,
    kinds: Object.fromEntries(floors.TYPED_KINDS.map((kind: string) => [kind, { floor: selection.kinds[kind].floor, moved: selection.kinds[kind].moved, reason: selection.kinds[kind].reason,
      curve: selection.kinds[kind].curve.map((point: any) => ({ at: point.at, answered: point.answered, asked: point.asked, accuracy: point.accuracy })) }])),
  });
  console.log(`frozen to ${FLOORS_FILE}`);
}

const frozen = (held: any) => {
  const file = readJson(FLOORS_FILE);
  if (file.heldOutRevision !== revisionOf(held)) throw new Error('frozen floors name another held-out revision');
  return file.floors;
};

function scoreHeld(held: any, answers: Map<string, any>, at: any) {
  const candidate = floors.kindRows(held.rows, answers, at);
  const single = floors.kindRows(held.rows, answers, floors.SINGLE_FLOORS);
  return { candidate, single };
}

async function heldRun(args: string[]) {
  const run = Number(option(args, '--run') ?? 1);
  const held = readJson(join(FIXTURES, 'spike-typed-kinds.json'));
  const revision = revisionOf(held);
  const at = frozen(held);
  const calls = floors.typedKindCalls(held.rows);
  const goldenFile = join(GOLDENS, `spike-typed-kinds.run${run}.json`);
  let answers: Map<string, any>;
  let meta: any;
  if (args.includes('--replay')) {
    const golden = readJson(goldenFile);
    if (golden.fixtureRevision !== revision) throw new Error('recorded held-out run is stale against its fixture');
    answers = answersByRequest(golden, calls);
    meta = { model: golden.model, actual: 0, calls: golden.calls };
  } else {
    meta = await ask(calls, `held-run${run}`, revision);
    answers = answersFrom(meta);
  }
  const scored = scoreHeld(held, answers, at);
  logTallies('candidate', scored.candidate);
  logTallies('single0.8', scored.single);
  const perKind = Object.fromEntries(floors.TYPED_KINDS.map((kind: string) => [kind, floors.scoreKindRun(scored.candidate, scored.single, kind)]));
  for (const kind of floors.TYPED_KINDS) console.log(`${kind.padEnd(7)} at ${at[kind]}: ${perKind[kind].status}`);
  console.log(`held run ${run}: ${calls.length} requests, ${meta.actual} upstream calls, unanswered ${meta.calls.filter((call: any) => !call.answers).length}, p50 ${p50(meta.calls)} ms, model ${meta.model}, rev ${revision}`);
  if (!args.includes('--replay') && args.includes('--record')) {
    write(goldenFile, {
      source: `typed-kinds.mts held run ${run} over test/fixtures/judge/spike-typed-kinds.json (v2.8 13 J7.6 held-out split) at the frozen floors: real answers, replayed by jest keyed on state + questions`,
      recordedAt: new Date().toISOString(), model: meta.model, fixtureRevision: revision, run, floors: at,
      verdict: Object.fromEntries(floors.TYPED_KINDS.map((kind: string) => [kind, { status: perKind[kind].status, candidate: perKind[kind].candidate, single: perKind[kind].single }])),
      latencyP50Ms: p50(meta.calls), actualCalls: meta.actual, calls: meta.calls,
    });
    recordCalls('held', revision, run, meta.actual, meta.model);
  }
}

function verdict() {
  const held = readJson(join(FIXTURES, 'spike-typed-kinds.json'));
  const at = frozen(held);
  const calls = floors.typedKindCalls(held.rows);
  const runs = [1, 2].map((run) => {
    const golden = readJson(join(GOLDENS, `spike-typed-kinds.run${run}.json`));
    if (golden.fixtureRevision !== revisionOf(held)) throw new Error(`run ${run} is stale`);
    return scoreHeld(held, answersByRequest(golden, calls), at);
  });
  const result = floors.heldOutVerdict(at, runs);
  console.log(JSON.stringify(result, null, 1));
}

async function replay(args: string[]) {
  const [file] = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
  if (!file) throw new Error('replay needs <cases.json>');
  const { compare } = await import(pathToFileURL(resolve(PROJECT_ROOT, 'scripts', 'debug', 'lib', 'j6dReplay.mts')).href);
  const reconstruction = readJson(file);
  const repliesFile = option(args, '--replies');
  const result = await compare(reconstruction, repliesFile ? readJson(repliesFile) : {});
  const latching = new Map<string, boolean>();
  for (const session of reconstruction.sessions) for (const quality of session.story.qualities ?? []) latching.set(quality.key, Boolean(quality.latching));
  const keys = reconstruction.sessions.flatMap((session: any) => session.cases.flatMap((entry: any) => entry.answered.map((answered: any) => ({
    readAs: answered.readAs, confidence: answered.confidence, latching: latching.get(answered.key) ?? false, class: 'unknown',
  }))));
  const rows = result.rows.map((row: any) => ({ readAs: row.readAs, confidence: row.confidence, latching: latching.get(row.key) ?? false, class: row.class }));
  const at = frozen(readJson(join(FIXTURES, 'spike-typed-kinds.json')));
  console.log(JSON.stringify({
    rebuiltCases: reconstruction.sessions.reduce((sum: number, session: any) => sum + session.cases.length, 0),
    refusedCases: reconstruction.sessions.reduce((sum: number, session: any) => sum + session.refusals.length, 0),
    judgeAnsweredKeys: floors.replayKindLeg(keys, at),
    comparedRows: rows.length, verdict: result.summary.verdict,
    compared: { single: floors.replayKindLeg(rows, floors.SINGLE_FLOORS), candidate: floors.replayKindLeg(rows, at) },
  }, null, 1));
}

const [command, ...args] = process.argv.slice(2);
if (command === 'tune') await tune(args);
else if (command === 'select') select();
else if (command === 'held') await heldRun(args);
else if (command === 'verdict') verdict();
else if (command === 'replay') await replay(args);
else {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
