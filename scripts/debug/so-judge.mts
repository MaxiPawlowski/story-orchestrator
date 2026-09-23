import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-judge.mts <command>

  status                              plugin reachability, key source (never the key), install settings
  ask <request.json>                  POST one System One request through the plugin from the page
  calibrate [--use director|memory-verify|memory-pairs|scene|lore|lore-relevance|curator-filter|continuity|backgrounds|typed|stall|critic|variants] [--fixture <name>] [--model <id>] [--min 0.85] [--record]
                                      run test/fixtures/judge/<fixture|use>.json page -> plugin -> TypeSafe;
                                      --model asks that model without changing install settings; the report records the model that answered;
                                      exit 1 below --min; --record writes test/goldens/judge/<use>.calibration.json
  calls [--last 20]                   the current chat's judge call ring (extras.judge.calls)

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
    return judge.calibrateLoreRelevance(cases, model);
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
    modelMatched: requestedModel ? report.model === requestedModel : null,
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
  return { ok: summary.arms.every((arm: any) => arm.ok) };
}

async function calibrate(page: any, use: string, fixtureName: string, min: number, record: boolean, requestedModel?: string) {
  const fixture = JSON.parse(await readFile(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${fixtureName}.json`), 'utf-8'));
  const report = await evaluateInST(page, async ({ use, rows, model }: { use: string; rows: unknown[]; model?: string }) => {
    const judge = (globalThis as any).storyOrchestratorJudge;
    if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
    return judge.calibrate(use, rows, model);
  }, { use, model: requestedModel, rows: use === 'lore' ? fixture.rows.map((row: any) => ({ ...row, candidates: row.candidates ?? fixture.pools?.[row.pool] ?? [] })) : use === 'backgrounds' ? fixture.rows.map((row: any) => ({ ...row, installed: fixture.installed })) : fixture.rows });
  const labelOf: Record<string, string> = Object.fromEntries(fixture.rows.filter((row: any) => row.label).map((row: any) => [row.id, row.label]));
  const tagOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.tags ?? (row.lang === 'es' ? ['spanish'] : [])]));
  const tagsOf = (id: string): string[] => tagOf[id] ?? tagOf[id.split('.')[0]] ?? [];
  for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(5)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${tagsOf(row.id).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}${row.detail ? `  [${row.id in labelOf ? labelOf[row.id] : ''}] ${row.detail}` : ''}`);
  const rate = report.total ? report.right / report.total : 0;
  const spanish = report.rows.filter((row: any) => tagsOf(row.id).includes('spanish'));
  const families = ['scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants'].includes(use) ? familyScores(report.rows, fixture.floors ?? {}) : [];
  families.forEach((row) => console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.family.padEnd(9)} ${row.right}/${row.total} floor ${row.floor}`));
  const summary = { use, fixture: fixtureName, right: report.right, total: report.total, rate: Number(rate.toFixed(4)), ...(families.length ? { families } : {}), spanish: `${spanish.filter((row: any) => row.right).length}/${spanish.length}`, p50LatencyMs: report.p50LatencyMs, requestedModel: requestedModel ?? null, model: report.model, modelMatched: requestedModel ? report.model === requestedModel : null, min, ok: (requestedModel ? report.model === requestedModel : true) && (families.length ? families.every((row) => row.ok) : rate >= min) };
  console.log(JSON.stringify(summary, null, 2));
  await writeJSON({ summary, report }, `so-judge-calibrate-${fixtureName}`);
  if (record) {
    await mkdir(join(PROJECT_ROOT, 'test', 'goldens', 'judge'), { recursive: true });
    await writeFile(join(PROJECT_ROOT, 'test', 'goldens', 'judge', `${fixtureName}.calibration.json`), `${JSON.stringify({ recordedAt: new Date().toISOString(), summary, rows: report.rows }, null, 2)}\n`);
  }
  return { ok: summary.ok };
}

async function calls(page: any, last: number) {
  const result = await evaluateInST(page, (count: number) => {
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    const events = runtime?.getSessionJournal?.() ?? [];
    return events.filter((event: any) => event.kind === 'judge').slice(-count);
  }, last);
  console.log(JSON.stringify(result, null, 2));
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (!command || hasHelpFlag() || !['status', 'ask', 'calibrate', 'calls'].includes(command) || (command === 'ask' && !arg)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => {
    if (command === 'status') return status(page);
    if (command === 'ask') return ask(page, arg);
    if (command === 'calls') return calls(page, Number(argValue('--last', '20')));
    const requestedModel = process.argv.includes('--model') ? argValue('--model', '') : undefined;
    if (argValue('--use', 'director') === 'lore-relevance') return calibrateRelevance(page, argValue('--fixture', 'lore-relevance'), requestedModel);
    return calibrate(page, argValue('--use', 'director'), argValue('--fixture', argValue('--use', 'director')), Number(argValue('--min', '0.85')), process.argv.includes('--record'), requestedModel);
  });
}
