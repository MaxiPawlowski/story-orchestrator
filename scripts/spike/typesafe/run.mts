import { register } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

register('./lib/loader.mts', import.meta.url);
process.removeAllListeners('warning');

const USAGE = `Usage: node --experimental-transform-types scripts/spike/typesafe/run.mts [options]

Runs the TypeSafe (Jev) spike experiments against labelled cases and writes
.debug/typesafe-spike/<stamp>/report.md + results.json (and .debug/typesafe-spike/latest/).

  --only a,b        run only these experiment ids
  --dry-run         validate and exercise everything without calling the API
  --baseline        also run today's memory model through the shared ST page (needs st-session + a free backend)
  --no-cache        ignore cached TypeSafe answers
  --repeat <n>      repeats for the self-consistency experiment (default 5)
  --concurrency <n> parallel TypeSafe calls (default 4)
  --list            list experiment ids

The API key is read from TYPESAFE_API_KEY or ~/.typesafe/api-key/.env (TYPESAFE_API_KEY=...).
Baseline answers are cached, so a later run without --baseline still reports them.`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const client = await import('./lib/client.mts');
const baseline = await import('./lib/baseline.mts');
const { table, ms, percentile, fixed } = await import('./lib/stats.mts');
const { experiments } = await import('./experiments/index.mts');

if (flag('--list')) {
  for (const experiment of experiments) console.log(`${experiment.id.padEnd(16)} ${experiment.title}`);
  process.exit(0);
}

const dry = flag('--dry-run');
client.configureClient({ dry, noCache: flag('--no-cache'), concurrency: Number(option('--concurrency') ?? 4) });
baseline.enableBaseline(flag('--baseline'));
if (!dry && !client.hasKey()) {
  console.error(`No API key found. Put TYPESAFE_API_KEY=... in ${client.KEY_FILE}, or run with --dry-run.`);
  process.exit(2);
}

const only = option('--only')?.split(',').map((item) => item.trim()).filter(Boolean);
const selected = only ? experiments.filter((experiment) => only.includes(experiment.id)) : experiments;
if (only && selected.length !== only.length) {
  console.error(`Unknown experiment in --only. Known: ${experiments.map((experiment) => experiment.id).join(', ')}`);
  process.exit(2);
}

const ctx = { shared: new Map<string, unknown>(), log: (message: string) => console.log(message), repeat: Number(option('--repeat') ?? 5) };
const results = [];
const failures: string[] = [];
const started = Date.now();

for (const experiment of selected) {
  const before = client.ledger.length;
  const beforeBase = baseline.baselineLedger.length;
  const t0 = Date.now();
  console.log(`\n▶ ${experiment.id}: ${experiment.title}`);
  try {
    const result = await experiment.run(ctx);
    const calls = client.ledger.slice(before);
    const baseCalls = baseline.baselineLedger.slice(beforeBase);
    results.push({ ...result, calls: calls.length, fresh: calls.filter((call) => !call.cached).length, baselineCalls: baseCalls.length, seconds: (Date.now() - t0) / 1000 });
    for (const line of result.summary) console.log(`  • ${line}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    failures.push(`${experiment.id}: ${message}`);
    console.error(`  ✗ ${experiment.id} failed: ${message}`);
  }
}

await baseline.closeBaseline();

const live = client.ledger.filter((call) => !call.dry);
const fresh = live.filter((call) => !call.cached);
const inputTokens = live.reduce((sum, call) => sum + (call.usage?.input_tokens ?? 0), 0);
const baseCalls = baseline.baselineLedger;
const profile = baseline.baselineProfile();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(client.OUT_ROOT, dry ? `dry-${stamp}` : stamp);
const latestDir = join(client.OUT_ROOT, dry ? 'latest-dry' : 'latest');

const header = [
  `# TypeSafe spike report${dry ? ' (DRY RUN: synthetic answers, numbers are meaningless)' : ''}`,
  '',
  `Generated ${new Date().toISOString()} in ${fixed((Date.now() - started) / 1000, 0)} s. Model: ${live[0]?.model ?? client.MODEL}. Endpoint: ${client.API_URL}.`,
  '',
  table(['metric', 'value'], [
    ['TypeSafe calls (fresh / from cache)', `${fresh.length} / ${live.length - fresh.length}`],
    ['TypeSafe input tokens across all calls', inputTokens],
    ['TypeSafe cost of those tokens', `$${fixed((inputTokens / 1e6) * client.USD_PER_M_INPUT, 5)}`],
    ['TypeSafe latency p50 / p90 / max (fresh calls, includes network from this machine)', fresh.length ? `${ms(percentile(fresh.map((c) => c.latencyMs), 50))} / ${ms(percentile(fresh.map((c) => c.latencyMs), 90))} / ${ms(Math.max(...fresh.map((c) => c.latencyMs)))}` : 'n/a (all cached)'],
    ['Current-model baseline calls', baseCalls.length ? `${baseCalls.length} (${baseCalls.filter((c) => !c.cached).length} fresh), profile "${profile?.name ?? '?'}" ${profile?.model ?? ''}` : 'not run (pass --baseline)'],
    ['Current-model latency p50 / p90 / max', baseCalls.length ? `${ms(percentile(baseCalls.map((c) => c.latencyMs), 50))} / ${ms(percentile(baseCalls.map((c) => c.latencyMs), 90))} / ${ms(Math.max(...baseCalls.map((c) => c.latencyMs)))}` : 'n/a'],
  ]),
  '',
  ...(failures.length ? ['## Failed experiments', '', ...failures.map((failure) => `- ${failure.split('\n')[0]}`), ''] : []),
].join('\n');

const body = results.map((result) => [
  `## ${result.title}`,
  '',
  `\`${result.id}\`: ${result.calls} TypeSafe calls (${result.fresh} fresh), ${result.baselineCalls} baseline calls, ${fixed(result.seconds, 0)} s.`,
  '',
  ...result.summary.map((line: string) => `- ${line}`),
  '',
  ...result.sections.flatMap((section: { title: string; body: string }) => [`### ${section.title}`, '', section.body, '']),
].join('\n')).join('\n');

for (const dir of [outDir, latestDir]) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.md'), `${header}\n${body}\n`);
  await writeFile(join(dir, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), dry, profile, results, failures, ledger: client.ledger.map(({ answers, request, ...rest }) => rest), baseline: baseCalls.map(({ raw, ...rest }) => rest) }, null, 1));
}
console.log(`\nReport: ${join(latestDir, 'report.md')}`);
process.exit(failures.length ? 1 : 0);
