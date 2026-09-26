import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { calibrationOk, type ModelVerdict } from './lib/calibrationVerdict.mts';
import { eventsFromJsonl, eventsFromRecord, timeoutReport, dedupe, type TimeoutEvent } from './lib/judgeTimeouts.mts';
import { costInputOf, costReport, costReportAcross, filterJudgeCalls, rescoreRates, withEstablished } from './lib/judgeHarness.mts';
import { classifyProbe, limitProbeCases, probeRequest, requestChars, JEV_USD_PER_MTOK_INPUT, type ProbeResult } from './lib/limitProbe.mts';

const USAGE = `Usage: node scripts/debug/so-judge.mts <command>

  status                              plugin reachability, key source (never the key), install settings
  ask <request.json>                  POST one System One request through the plugin from the page
  calibrate [--use director|memory-verify|memory-pairs|scene|lore|lore-relevance|curator-filter|continuity|backgrounds|typed|stall|critic|variants|agency|house-rules] [--fixture <name>] [--model <id>] [--min 0.85] [--record]
                                      run test/fixtures/judge/<fixture|use>.json page -> plugin -> TypeSafe;
                                      --model asks that model without changing install settings; the report records the model that answered
                                      and a modelVerdict (matched | resolved, with resolvedTo | mismatch | unknown; the last two exit 1);
                                      exit 1 below the fixture's family floors, or below --min when there are none;
                                      an explicit --min also binds the overall rate; --record writes test/goldens/judge/<use>.calibration.json;
                                      --use continuity --fixture continuity-combined asks the continuity rows inside the combined warden request (T22/T23 regression)
  calls [--last 20] [--use <use>] [--chat <chatId>]
                                      the open chat's judge call ring (extras.judge.calls), one use only with --use; --chat refuses
                                      unless that chat is the one open (a ring is read from the open chat, never guessed)
  cost [--chat <chatId>]              v2.4 plan 07 (X23): the open chat's judge METER (monotonic, not cut by rollback) beside the ring
                                      totals per use, what the ring no longer shows, and an estimate at the documented price
  rescore --use continuity|agency|house-rules --records <dir|record.json,...> [--model <id>] [--facts <facts.json>]
                                      the judge-off control column: re-ask the calibrated question over the replies each journey
                                      record captured (--judge-uses runs); prints the next-reply defect rate per arm; --facts (a JSON array)
                                      holds every arm to one declared fact set instead of each record's live facts at cleanup; agency reads each reply's
                                      captured player line and persona, house-rules the story's rules, and each result carries the raw agency score
  cost-report --records <dir|record.json,...>
                                      v2.4 plan 09 (CL), offline: totals and $ per 1000 boundaries from each journey record's
                                      judge METER (cleanup.judgeMeter, never the ring), per-use calls/latency p50/p90/max/fallback
                                      rate/answering model from the archived ring; director/lore against the 1500 ms budget.
                                      Every figure is over the METERED records; a record with no meter (a check that set the judge
                                      itself) is listed with its ring totals under unmeteredRing and enters nothing else.
                                      Reads every *.json with a cleanup block; writes .debug/so-judge-cost-report.json
  timeouts --records <dir|file,...>   v2.5 plan 06 J2, offline: the warden and scene timeout tables and the plan's predeclared close.
                                      Reads journey records (cleanup ring + J11.25 outcome) and journal-follow *.jsonl streams (every chat),
                                      walking directories. Warden: <= 1 timeout per 50 calls over >= 100 calls, else 'unmeasured (n = N)';
                                      each timeout says whether another warden call on the same message was in flight (the A8 shape);
                                      p99 of successful calls only past 100 of them. Scene: 0 bursts, <= 1 timeout per 20 calls,
                                      J11.25 green x2. Writes .debug/so-judge-timeouts.json; exit 0 only when both close
  limit-probe [--send]                T25: the documented token limit, probed. Without --send prints the plan and its cost; with it,
                                      six calls through the plugin (< $0.01), then refuses / truncates / answers past the limit and
                                      chars per token by language; writes .debug/so-judge-limit-probe.json

The plugin must be installed (npm run plugin:install) and ST started with enableServerPlugins: true.`;

const PLUGIN_BASE = '/api/plugins/story-orchestrator-judge';

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function status(page: any) {
  const result = await evaluateInST(page, async (base: string) => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const response = await fetch(`${base}/status`, { headers }).catch(() => null);
    const plugin = response ? { http: response.status, body: response.ok ? await response.json() : null } : { http: 0, body: null };
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    return {
      plugin,
      judgeRuntime: Boolean((globalThis as any).storyOrchestratorJudge),
      settings: runtime?.getGlobalSettings?.().judge ?? null,
    };
  }, PLUGIN_BASE);
  console.log(JSON.stringify(result, null, 2));
  return { ok: result.plugin.http === 200 && result.plugin.body?.configured === true };
}

async function ask(page: any, file: string) {
  const request = JSON.parse(await readFile(file, 'utf-8'));
  const result = await evaluateInST(page, async ({ base, request }: { base: string; request: unknown }) => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const started = performance.now();
    const response = await fetch(`${base}/systemone`, { method: 'POST', headers, body: JSON.stringify(request) });
    return { http: response.status, ms: Math.round(performance.now() - started), body: await response.json().catch(() => null) };
  }, { base: PLUGIN_BASE, request });
  console.log(JSON.stringify(result, null, 2));
  return { ok: result.http === 200 };
}

// Scene rows are `<case>.<family>[:<item>]`, each family scored against the fixture's own floor.
function familyScores(rows: Array<{ id: string; right: boolean }>, floors: Record<string, number>) {
  return Object.entries(floors).flatMap(([family, floor]) => {
    const own = rows.filter((row) => row.id.slice(row.id.indexOf('.') + 1).split(':')[0] === family);
    if (!own.length) return [];
    const right = own.filter((row) => row.right).length;
    return [{ family, right, total: own.length, floor, ok: right / own.length >= floor }];
  });
}

// v2.3 plan 10 (A). Its report is two metric sets, not one pass/fail list, so it prints its own way:
// the floors bind precision@4 and the tie rate, and nDCG is reported for both arms.
async function calibrateRelevance(page: any, fixtureName: string, requestedModel?: string) {
  const loadFixture = async (name: string) => JSON.parse(await readFile(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', name.replace(/\.json$/, '') + '.json'), 'utf-8'));
  const fixture = await loadFixture(fixtureName);
  const pools: Record<string, unknown[]> = { ...(fixture.pools ?? {}) };
  if (fixture.poolsFrom) Object.assign(pools, (await loadFixture(fixture.poolsFrom)).pools ?? {});
  const rows = fixture.rows.map((row: any) => ({ ...row, candidates: row.candidates ?? pools[row.pool] ?? [] }));
  const report = await evaluateInST(page, async ({ rows: cases, model }: { rows: unknown[]; model?: string }) => {
    const judge = (globalThis as any).storyOrchestratorJudge;
    if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
    const out = await judge.calibrateLoreRelevance(cases, model);
    return { ...out, verdict: judge.modelVerdict(model ?? null, out.model) };
  }, { rows, model: requestedModel });
  const floor = fixture.floor ?? {};
  const verdict = (arm: any) => ({
    precisionAt4: arm.precisionAt4 !== null && arm.precisionAt4 >= (floor.precisionAt4 ?? 0),
    tieRate: arm.tieRate !== null && arm.tieRate <= (floor.tieRate ?? 1),
  });
  for (const arm of [report.noul, report.score]) {
    console.log(`\n${arm.arm}: ${arm.turns} rows, ${arm.disagreements ?? ''}`);
    for (const row of arm.top) {
      console.log(`  ${row.id.padEnd(4)} ${row.picks.map((pick: any) => `${pick.key.replace('SO-J11 Adolion World.', '#')}@${pick.score}${pick.label ? `/${pick.label.slice(0, 4)}` : ''}`).join('  ')}`);
    }
  }
  const summary = {
    use: 'lore-relevance',
    fixture: fixtureName,
    rows: rows.length,
    labelled: rows.filter((row: any) => row.labels && Object.keys(row.labels).length).length,
    requestedModel: requestedModel ?? null,
    model: report.model,
    modelVerdict: report.verdict.verdict as ModelVerdict,
    ...(report.verdict.resolvedTo ? { resolvedTo: report.verdict.resolvedTo } : {}),
    disagreements: report.disagreements,
    floor,
    arms: [report.noul, report.score].map((arm) => ({ arm: arm.arm, precisionAt4: arm.precisionAt4, ndcgAt4: arm.ndcgAt4, tieRate: arm.tieRate, boundaryTieRate: arm.boundaryTieRate, meanStateChars: arm.meanStateChars, floorChecks: verdict(arm), ok: verdict(arm).precisionAt4 && verdict(arm).tieRate })),
  };
  console.log(JSON.stringify(summary, null, 2));
  await writeJSON({ summary, report }, `so-judge-calibrate-${fixtureName}`);
  if (process.argv.includes('--record')) {
    await mkdir(join(PROJECT_ROOT, 'test', 'goldens', 'judge'), { recursive: true });
    // The exchanges travel with the golden: the measurement then replays in jest with no judge, and a
    // later question-shape change is measured against these answers rather than against a new run.
    await writeFile(join(PROJECT_ROOT, 'test', 'goldens', 'judge', `${fixtureName}.json`), `${JSON.stringify({ recordedAt: new Date().toISOString(), model: report.model, summary, calls: report.exchanges, rows: report.noul.top.map((row: any) => row.id) }, null, 2)}\n`);
  }
  return { ok: summary.arms.every((arm: any) => arm.ok) && summary.modelVerdict !== 'mismatch' && summary.modelVerdict !== 'unknown' };
}

async function calibrate(page: any, use: string, fixtureName: string, min: number, record: boolean, requestedModel?: string) {
  const fixture = JSON.parse(await readFile(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${fixtureName}.json`), 'utf-8'));
  const report = await evaluateInST(page, async ({ use, rows, model }: { use: string; rows: unknown[]; model?: string }) => {
    const judge = (globalThis as any).storyOrchestratorJudge;
    if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
    const out = await judge.calibrate(use, rows, model);
    return { ...out, verdict: judge.modelVerdict(model ?? null, out.model) };
  }, { use, model: requestedModel, rows: use === 'lore' ? fixture.rows.map((row: any) => ({ ...row, candidates: row.candidates ?? fixture.pools?.[row.pool] ?? [] })) : use === 'backgrounds' ? fixture.rows.map((row: any) => ({ ...row, installed: fixture.installed })) : fixture.rows });
  const labelOf: Record<string, string> = Object.fromEntries(fixture.rows.filter((row: any) => row.label).map((row: any) => [row.id, row.label]));
  const tagOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.tags ?? (row.lang === 'es' ? ['spanish'] : [])]));
  const tagsOf = (id: string): string[] => tagOf[id] ?? tagOf[id.split('.')[0]] ?? [];
  for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(5)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${tagsOf(row.id).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}${row.detail ? `  [${row.id in labelOf ? labelOf[row.id] : ''}] ${row.detail}` : ''}`);
  const rate = report.total ? report.right / report.total : 0;
  const spanish = report.rows.filter((row: any) => tagsOf(row.id).includes('spanish'));
  const families = ['scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants', 'agency', 'house-rules'].includes(use) ? familyScores(report.rows, fixture.floors ?? {}) : [];
  families.forEach((row) => console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.family.padEnd(9)} ${row.right}/${row.total} floor ${row.floor}`));
  const summary = { use, fixture: fixtureName, right: report.right, total: report.total, rate: Number(rate.toFixed(4)), ...(families.length ? { families } : {}), spanish: `${spanish.filter((row: any) => row.right).length}/${spanish.length}`, p50LatencyMs: report.p50LatencyMs, requestedModel: requestedModel ?? null, model: report.model, modelVerdict: report.verdict.verdict as ModelVerdict, ...(report.verdict.resolvedTo ? { resolvedTo: report.verdict.resolvedTo } : {}), min, minGiven: process.argv.includes('--min'), ok: calibrationOk({ rate, min, minGiven: process.argv.includes('--min'), families, modelVerdict: report.verdict.verdict }) };
  console.log(JSON.stringify(summary, null, 2));
  await writeJSON({ summary, report }, `so-judge-calibrate-${fixtureName}`);
  if (record) {
    await mkdir(join(PROJECT_ROOT, 'test', 'goldens', 'judge'), { recursive: true });
    await writeFile(join(PROJECT_ROOT, 'test', 'goldens', 'judge', `${fixtureName}.calibration.json`), `${JSON.stringify({ recordedAt: new Date().toISOString(), summary, rows: report.rows }, null, 2)}\n`);
  }
  return { ok: summary.ok };
}

// The ring and the meter live in the OPEN chat's metadata. --chat names the chat the caller means, and
// a mismatch refuses rather than reading another chat's ring as if it were the one asked for.
async function readJudgeLedger(page: any, chat: string | null) {
  const ledger = await evaluateInST(page, () => {
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    return {
      chatId: (globalThis as any).SillyTavern.getContext().chatId ?? null,
      events: (runtime?.getSessionJournal?.() ?? []).filter((event: any) => event.kind === 'judge'),
      meter: runtime?.getSnapshot?.()?.judgeMeter ?? null,
    };
  });
  if (chat && ledger.chatId !== chat) throw new Error(`--chat ${chat} is not the open chat (${ledger.chatId}); open it first — a ring is only read from the chat it belongs to`);
  return ledger;
}

async function calls(page: any, last: number, use: string | null, chat: string | null) {
  const ledger = await readJudgeLedger(page, chat);
  const rows = filterJudgeCalls(ledger.events, { use }).slice(-last);
  console.log(JSON.stringify({ chatId: ledger.chatId, use, count: rows.length, calls: rows }, null, 2));
  return { ok: true };
}

async function cost(page: any, chat: string | null) {
  const ledger = await readJudgeLedger(page, chat);
  const report = { chatId: ledger.chatId, ...costReport(ledger.meter, ledger.events) };
  console.log(JSON.stringify(report, null, 2));
  await writeJSON(report, `so-judge-cost-${ledger.chatId ?? 'none'}`);
  return { ok: ledger.meter !== null };
}

async function readRecords(spec: string): Promise<Array<{ file: string; record: any }>> {
  const paths = spec.split(',').map((entry) => entry.trim()).filter(Boolean);
  const files: string[] = [];
  for (const path of paths) {
    if (path.endsWith('.json')) files.push(path);
    else files.push(...(await readdir(path)).filter((name) => /^journey-.*\.json$/.test(name)).map((name) => join(path, name)));
  }
  return Promise.all(files.map(async (file) => ({ file, record: JSON.parse(await readFile(file, 'utf-8')) })));
}

async function rescore(page: any, use: string, spec: string, requestedModel?: string, factsFile?: string) {
  const records = await readRecords(spec);
  const facts = factsFile ? JSON.parse(await readFile(factsFile, 'utf-8')) : null;
  if (facts !== null && (!Array.isArray(facts) || facts.some((fact) => typeof fact !== 'string'))) throw new Error(`--facts ${factsFile}: expected a JSON array of fact strings`);
  const rows = withEstablished(records.flatMap(({ record }) => record?.cleanup?.rescore?.rows ?? []), facts);
  if (!rows.length) throw new Error(`no captured replies in ${spec}: run the journey with --judge-uses (on) and --judge-uses off (control) first`);
  const results = await evaluateInST(page, async ({ use, rows, model }: { use: string; rows: unknown[]; model?: string }) => {
    const judge = (globalThis as any).storyOrchestratorJudge;
    if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
    return judge.rescore(use, rows, model);
  }, { use, rows, model: requestedModel });
  const rates = rescoreRates(results);
  const summary = { use, records: records.map(({ file }) => file), ...(facts ? { factsOverride: { file: factsFile, facts } } : {}), model: results.find((row: any) => row.model)?.model ?? null, rates };
  console.log(JSON.stringify(summary, null, 2));
  await writeJSON({ summary, results }, `so-judge-rescore-${use}`);
  return { ok: rates.every((rate) => rate.answered > 0) };
}

async function limitProbe(page: any, send: boolean) {
  const cases = limitProbeCases();
  const plan = cases.map((probe) => ({ id: probe.id, lang: probe.lang, aimTokens: probe.aimTokens, chars: requestChars(probe) }));
  const aim = plan.reduce((sum, row) => sum + row.aimTokens, 0);
  console.log(JSON.stringify({ plan, estimatedUsd: Number(((aim / 1_000_000) * JEV_USD_PER_MTOK_INPUT).toFixed(4)) }, null, 2));
  if (!send) {
    console.log('Dry run: nothing was sent. Re-run with --send to spend it.');
    return { ok: true };
  }
  const results: ProbeResult[] = [];
  for (const probe of cases) {
    const answer = await evaluateInST(page, async ({ base, request }: { base: string; request: unknown }) => {
      const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
      const response = await fetch(`${base}/systemone`, { method: 'POST', headers, body: JSON.stringify(request) });
      return { http: response.status, body: await response.json().catch(() => null) };
    }, { base: PLUGIN_BASE, request: probeRequest(probe) });
    const inputTokens = typeof answer.body?.usage?.input_tokens === 'number' ? answer.body.usage.input_tokens : null;
    results.push({ id: probe.id, lang: probe.lang, chars: requestChars(probe), http: answer.http, inputTokens, answered: answer.http === 200 && Boolean(answer.body?.answers), ...(answer.http === 200 ? {} : { error: JSON.stringify(answer.body).slice(0, 300) }) });
    console.log(`${probe.id.padEnd(10)} http ${answer.http} input_tokens ${inputTokens ?? '—'}`);
  }
  const verdict = classifyProbe(results);
  console.log(JSON.stringify(verdict, null, 2));
  await writeJSON({ ranAt: new Date().toISOString(), results, verdict }, 'so-judge-limit-probe');
  return { ok: verdict.conclusive };
}

async function walk(path: string): Promise<string[]> {
  if (/\.jsonl?$/.test(path)) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(join(path, entry.name)) : Promise.resolve(/\.jsonl?$/.test(entry.name) ? [join(path, entry.name)] : []))));
  return nested.flat();
}

export async function readTimeoutSources(spec: string) {
  const files = (await Promise.all(spec.split(',').map((entry) => entry.trim()).filter(Boolean).map(walk))).flat();
  const events: TimeoutEvent[] = [];
  const records: unknown[] = [];
  const used: string[] = [];
  for (const file of files) {
    const text = await readFile(file, 'utf-8');
    if (file.endsWith('.jsonl')) {
      const own = eventsFromJsonl(text);
      if (own.length) used.push(file);
      events.push(...own);
      continue;
    }
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      continue;
    }
    if (!record || typeof record !== 'object' || !Array.isArray(record.results) || !record.cleanup) continue;
    used.push(file);
    records.push(record);
    events.push(...eventsFromRecord(record));
  }
  return { files: used, events: dedupe(events), records };
}

export async function readCostRecords(spec: string) {
  const files: string[] = [];
  for (const path of spec.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    if (path.endsWith('.json')) files.push(path);
    else files.push(...(await readdir(path)).filter((name) => name.endsWith('.json')).map((name) => join(path, name)));
  }
  const records = await Promise.all(files.map(async (file) => ({ file, record: JSON.parse(await readFile(file, 'utf-8')) })));
  return records.filter(({ record }) => record && typeof record === 'object' && record.cleanup).map(({ file, record }) => costInputOf(record, file));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'cost-report') {
  if (!process.argv.includes('--records')) {
    console.log(USAGE);
    process.exit(1);
  }
  const inputs = await readCostRecords(argValue('--records', ''));
  const report = costReportAcross(inputs);
  console.log(JSON.stringify(report, null, 2));
  await writeJSON(report, 'so-judge-cost-report');
  process.exit(report.metered > 0 ? 0 : 1);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'timeouts') {
  if (!process.argv.includes('--records')) {
    console.log(USAGE);
    process.exit(1);
  }
  const report = timeoutReport(await readTimeoutSources(argValue('--records', '')));
  console.log(JSON.stringify({ files: report.files.length, records: report.records, warden: { calls: report.warden.calls, timeouts: report.warden.timeouts.length, wardenLoreCalls: report.warden.wardenLoreCalls, close: report.warden.close }, scene: { calls: report.scene.calls, timeouts: report.scene.timeouts.length, bursts: report.scene.bursts.length, close: report.scene.close } }, null, 2));
  await writeJSON(report, 'so-judge-timeouts');
  process.exit(report.warden.close.closed && report.scene.close.closed ? 0 : 1);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (!command || hasHelpFlag() || !['status', 'ask', 'calibrate', 'calls', 'cost', 'rescore', 'limit-probe'].includes(command) || (command === 'ask' && !arg) || (command === 'rescore' && !process.argv.includes('--records'))) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => {
    if (command === 'status') return status(page);
    if (command === 'ask') return ask(page, arg);
    const chat = process.argv.includes('--chat') ? argValue('--chat', '') || null : null;
    if (command === 'calls') return calls(page, Number(argValue('--last', '20')), process.argv.includes('--use') ? argValue('--use', '') || null : null, chat);
    if (command === 'cost') return cost(page, chat);
    if (command === 'limit-probe') return limitProbe(page, process.argv.includes('--send'));
    if (command === 'rescore') return rescore(page, argValue('--use', 'continuity'), argValue('--records', ''), process.argv.includes('--model') ? argValue('--model', '') : undefined, process.argv.includes('--facts') ? argValue('--facts', '') : undefined);
    const requestedModel = process.argv.includes('--model') ? argValue('--model', '') : undefined;
    if (argValue('--use', 'director') === 'lore-relevance') return calibrateRelevance(page, argValue('--fixture', 'lore-relevance'), requestedModel);
    return calibrate(page, argValue('--use', 'director'), argValue('--fixture', argValue('--use', 'director')), Number(argValue('--min', '0.85')), process.argv.includes('--record'), requestedModel);
  });
}
