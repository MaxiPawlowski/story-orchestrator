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
  calibrate [--use director|memory-verify|memory-pairs|scene|lore|curator-filter|continuity|backgrounds|typed|stall] [--fixture <name>] [--min 0.85] [--record]
                                      run test/fixtures/judge/<fixture|use>.json page -> plugin -> TypeSafe;
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

async function calibrate(page: any, use: string, fixtureName: string, min: number, record: boolean) {
  const fixture = JSON.parse(await readFile(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', `${fixtureName}.json`), 'utf-8'));
  const report = await evaluateInST(page, async ({ use, rows }: { use: string; rows: unknown[] }) => {
    const judge = (globalThis as any).storyOrchestratorJudge;
    if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
    return judge.calibrate(use, rows);
  }, { use, rows: use === 'lore' ? fixture.rows.map((row: any) => ({ ...row, candidates: row.candidates ?? fixture.pools?.[row.pool] ?? [] })) : use === 'backgrounds' ? fixture.rows.map((row: any) => ({ ...row, installed: fixture.installed })) : fixture.rows });
  const labelOf: Record<string, string> = Object.fromEntries(fixture.rows.filter((row: any) => row.label).map((row: any) => [row.id, row.label]));
  const tagOf = Object.fromEntries(fixture.rows.map((row: any) => [row.id, row.tags ?? (row.lang === 'es' ? ['spanish'] : [])]));
  const tagsOf = (id: string): string[] => tagOf[id] ?? tagOf[id.split('.')[0]] ?? [];
  for (const row of report.rows) console.log(`${row.right ? 'ok  ' : 'MISS'} ${row.id.padEnd(5)} ${String(row.picked).padEnd(16)} ${String(row.latencyMs).padStart(5)} ms  ${tagsOf(row.id).join(',')}${row.fallback ? `  fallback=${row.fallback}` : ''}${row.detail ? `  [${row.id in labelOf ? labelOf[row.id] : ''}] ${row.detail}` : ''}`);
  const rate = report.total ? report.right / report.total : 0;
  const spanish = report.rows.filter((row: any) => tagsOf(row.id).includes('spanish'));
  const families = ['scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall'].includes(use) ? familyScores(report.rows, fixture.floors ?? {}) : [];
  families.forEach((row) => console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.family.padEnd(9)} ${row.right}/${row.total} floor ${row.floor}`));
  const summary = { use, fixture: fixtureName, right: report.right, total: report.total, rate: Number(rate.toFixed(4)), ...(families.length ? { families } : {}), spanish: `${spanish.filter((row: any) => row.right).length}/${spanish.length}`, p50LatencyMs: report.p50LatencyMs, model: report.model, min, ok: families.length ? families.every((row) => row.ok) : rate >= min };
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
    return calibrate(page, argValue('--use', 'director'), argValue('--fixture', argValue('--use', 'director')), Number(argValue('--min', '0.85')), process.argv.includes('--record'));
  });
}
