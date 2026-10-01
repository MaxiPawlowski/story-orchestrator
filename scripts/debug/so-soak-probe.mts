import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';
import { armSoakProbe, disarmSoakProbe, parseBudgets, parseSoakJsonl, sampleSoak, soakVerdict, type CdpLike, type SoakBudgets, type SoakSample } from './lib/soakProbe.mts';

const USAGE = `Usage: node scripts/debug/so-soak-probe.mts <arm|sample|verdict|disarm> [options]

v2.5 plan 10 H-j: soak/chaos probes over CDP that need no runtime handle (they run on the prod
artifact as well as the dev bundle). Nothing here reads storyOrchestrator*.

  arm        install PerformanceObservers (longtask, event timing >= 16 ms) in the page; idempotent.
             A reload drops them: the next sample reports armed:false and the verdict fails.
  sample [--count <n>] [--every <seconds>] [--out <file.jsonl>] [--budget k=v,...] [--no-gc]
             arm if needed, then take <n> samples (default 10) every <seconds> (default 30): forced GC
             (HeapProfiler.collectGarbage), Runtime.getHeapUsage, DOM node count, JS listener count
             (Performance.getMetrics), and the long tasks / event timings since the last sample.
             Appends one JSON line per sample to --out (default <debug dir>/soak-<timestamp>.jsonl),
             then prints the verdict over the whole file. Exit 1 when a budget is exceeded.
  verdict <file.jsonl> [--budget k=v,...]
             score a recorded file offline (no browser).
  disarm     disconnect the observers.

Budgets (un-calibrated defaults; the first soak run sets them): maxHeapGrowthBytes, maxHeapGrowthRatio,
maxNodeGrowth, maxLongTaskMs, maxLongTaskTotalMsPerSample, maxEventDurationMs, minSamples.
Heap growth compares the minimum of the first and the last few samples, each taken after a forced GC.`;

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : null;
}

export async function runSamples(cdp: CdpLike, { count, everyMs, out, gc = true, sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)), append = (path: string, line: string) => appendFile(path, line) }: { count: number; everyMs: number; out: string; gc?: boolean; sleep?: (ms: number) => Promise<void>; append?: (path: string, line: string) => Promise<void> }): Promise<SoakSample[]> {
  await armSoakProbe(cdp);
  await cdp.send('Performance.enable').catch(() => undefined);
  const samples: SoakSample[] = [];
  for (let seq = 0; seq < count; seq += 1) {
    if (seq > 0) await sleep(everyMs);
    const sample = await sampleSoak(cdp, seq, { gc });
    samples.push(sample);
    await append(out, `${JSON.stringify(sample)}\n`);
  }
  return samples;
}

function budgetsFrom(args: string[]): SoakBudgets {
  const { budgets, errors } = parseBudgets(argValue(args, '--budget'));
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  return budgets;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  const command = args[0];
  if (!command || hasHelpFlag() || !['arm', 'sample', 'verdict', 'disarm'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  if (command === 'verdict') {
    const file = args[1];
    if (!file) { console.log(USAGE); process.exit(1); }
    const budgets = budgetsFrom(args);
    const verdict = soakVerdict(parseSoakJsonl(await readFile(resolve(file), 'utf-8')), budgets);
    console.log(JSON.stringify({ file: resolve(file), budgets, ...verdict }, null, 2));
    process.exit(verdict.ok ? 0 : 1);
  }
  const budgets = command === 'sample' ? budgetsFrom(args) : null;
  runCli(async (page: Page) => {
    const cdp = await page.context().newCDPSession(page) as unknown as CdpLike;
    if (command === 'arm') { console.log(JSON.stringify(await armSoakProbe(cdp), null, 2)); return; }
    if (command === 'disarm') { console.log(JSON.stringify(await disarmSoakProbe(cdp), null, 2)); return; }
    const out = resolve(argValue(args, '--out') ?? resolve(DEBUG_DIR, `soak-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
    await mkdir(dirname(out), { recursive: true });
    const count = Number(argValue(args, '--count') ?? 10);
    const everyMs = Number(argValue(args, '--every') ?? 30) * 1000;
    await runSamples(cdp, { count, everyMs, out, gc: !args.includes('--no-gc') });
    const verdict = soakVerdict(parseSoakJsonl(await readFile(out, 'utf-8')), budgets as SoakBudgets);
    console.log(JSON.stringify({ out, budgets, ...verdict }, null, 2));
    return { ok: verdict.ok };
  });
}
