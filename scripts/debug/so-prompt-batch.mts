import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refusePrivateOutput } from './lib/bundleEntry.mts';
import {
  BATCH_FORMAT, DEFAULT_BASE_URL, diffShas, FILES, freezeRequest, loadStopCallback, readManifest, readResponses, sendBatch,
  type BatchItem, type BatchManifest,
} from './lib/promptBatch.mts';
import { loadBatchKit, measurementFor, type MeasureArgs } from './lib/promptBatchMeasures.mts';

const USAGE = `Usage:
  node scripts/debug/so-prompt-batch.mts capture --measurement w4|t8 --out <dir> [measurement options] [--profile <name|id>] [--limit <n>] [--verify <prior dir>]
  node scripts/debug/so-prompt-batch.mts send --out <dir> [--base-url ${DEFAULT_BASE_URL}] [--stop <module.mts>] [--timeout-ms 600000] [--limit <n>]
  node scripts/debug/so-prompt-batch.mts score --out <dir> [measurement options]

v2.9 plan 11 B2, class M: freeze the shipped prompt builders' exact request bodies on a no-model lane, send them to the
model without a browser, and score the answers with the existing offline scorers.

capture (lane page, no model): installs a fetch recorder in the page, runs each frozen item through the shipped in-page path
  (storyOrchestratorLiveSuite.runWitnessRead / runFixture) with the read role routed as on the lane, and answers the one
  text-completion request with a canned backend reply instead of sending it; any other model route is refused. Each body is
  frozen as ST would forward it (text-completions.js: verbatim for llamacpp and the /v1/completions types) under
  <dir>/bodies/<sha256>.json; <dir>/manifest.json (${BATCH_FORMAT}) records per item the sha, backend path, whether the
  builder's prompt is inside the body, and a self-check that the offline reply processing and parse of the canned answer
  equal what the page produced. Exit 1 on any item problem. --verify <prior dir> re-captures and diffs every sha against a
  prior manifest (golden diff, exit 1 on a moved, added or removed item). --profile pins the read role for the capture
  (restored and read back after).
send (no ST): POSTs each frozen body, byte for byte, to <base-url><path>, sequentially; appends {sha, raw response, finish,
  tokens, ms} to <dir>/${FILES.responses}; resumes by skipping answered items; a transport error, non-2xx or non-JSON answer
  is retried once, then the row stops as S5 NOT A MEASUREMENT (<dir>/${FILES.stop}; a stopped row is never resumed).
  --stop <module> loads a stop callback (export stop or default: (progress) => {stop, rule, verdict, detail} | null),
  called after every answered item with {index, total, item, record, records, outcome}; outcome is the item's own pass
  when the measurement can score one item offline (t8), else null.
score (no ST): replays every answer through the same reply processing as the page (ST's text extraction, instruct
  cleanup, reasoning strip) and the measurement's shipped parser, then the existing scorer; writes <dir>/${FILES.score}.

Measurements:
  w4  plan 42 W4 witness reads (private): --sessions <root> [--lab-rows <f> --lab-story <f>] [--arm on|off|both] [--only <key,...>].
      score writes so-witness record files under <dir>/witness/reads/{on,off}/ and reads/files/ (so-witness-reads/1), then
      with --labels-from <witness dir> --freeze <freeze.json> [--adjudicated] runs so-witness score-real on copied labels;
      both arms add Wc (token counts are the backend's). A first answer the page would retry (refusal) is scored as an
      outage and listed under retryOwed. Output must be under test/sessions/ or outside the repo.
  t8  live-suite time windows (test/fixtures/timewindow*): [--filter <s>]; score [--min 0.9] [--min-tier ...] [--expect-count <n>]
      uses the so-live-suite scorer (scoreLiveFixture, tierTotals, suiteVerdict).`;

const VALUE_FLAGS = ['--measurement', '--out', '--sessions', '--lab-rows', '--lab-story', '--arm', '--only', '--filter', '--profile', '--limit', '--verify', '--base-url', '--stop', '--timeout-ms', '--labels-from', '--freeze', '--min', '--min-tier', '--expect-count'];
const BOOLEAN_FLAGS = ['--adjudicated'];
const MEASURE_KEYS = ['sessions', 'lab-rows', 'lab-story', 'arm', 'only', 'filter'];

export function parseArgs(argv: string[]): MeasureArgs {
  const args: MeasureArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (BOOLEAN_FLAGS.includes(flag)) args[flag.slice(2)] = true;
    else if (VALUE_FLAGS.includes(flag)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      args[flag.slice(2)] = value;
      index += 1;
    } else throw new Error(`unknown argument ${flag}\n${USAGE}`);
  }
  return args;
}

const need = (args: MeasureArgs, name: string): string => {
  const value = args[name];
  if (typeof value !== 'string' || !value) throw new Error(`missing --${name}\n${USAGE}`);
  return value;
};

const measureArgs = (args: MeasureArgs): Record<string, string> => Object.fromEntries(MEASURE_KEYS.flatMap((key) => (typeof args[key] === 'string' ? [[key, args[key] as string]] : [])));

const promptOf = (body: string): string => {
  const parsed = JSON.parse(body) as { prompt?: unknown; messages?: Array<{ content?: unknown }> };
  if (typeof parsed.prompt === 'string') return parsed.prompt;
  return Array.isArray(parsed.messages) ? parsed.messages.map((message) => (typeof message?.content === 'string' ? message.content : '')).join('\n') : '';
};

async function capture(args: MeasureArgs): Promise<number> {
  const measurement = measurementFor(args.measurement as string | undefined);
  const out = resolve(need(args, 'out'));
  refusePrivateOutput(measurement.synthetic, join(out, FILES.manifest), `prompt batch ${measurement.id}`);
  const prior = typeof args.verify === 'string' ? await readManifest(resolve(args.verify)) : null;
  const items = await measurement.plan(args);
  const limited = typeof args.limit === 'string' ? items.slice(0, Number(args.limit)) : items;
  if (!limited.length) throw new Error('no items planned');
  const kit = await loadBatchKit();
  const { withST } = await import('./lib/cli.mts');
  const { assertRuntimeOnPage } = await import('./lib/servedBundle.mts');
  const recorder = await import('./lib/promptBatchRecorder.mts');
  const bodies = new Map<string, string>();
  const manifest = await withST(async (page) => {
    await assertRuntimeOnPage(page);
    const effort = await import('./lib/roleEffort.mts');
    const pinned = typeof args.profile === 'string' ? await effort.pinRoleProfile(page, 'read', args.profile) : null;
    try {
      await recorder.installRecorder(page);
      const route = await recorder.readRoute(page);
      const rows: BatchItem[] = [];
      const tokenizer = { calls: 0, failed: 0 };
      for (const item of limited) {
        const run = await recorder.runPageItem(page, { kind: item.kind, spec: item.spec, canned: item.canned });
        tokenizer.calls += run.tokenizer.length;
        tokenizer.failed += run.tokenizer.filter((call) => call.status >= 400).length;
        const row: BatchItem = { id: item.id, sha: null, path: null, calls: run.calls.length, builderInBody: null, selfCheck: null, inPage: run.result ? measurement.keep(run.result) : null, meta: item.meta };
        const problems: string[] = [];
        if (!run.ok) problems.push(`page: ${run.error}`);
        if (run.refused.length) problems.push(`refused model route(s): ${run.refused.map((call) => call.url).join(', ')}`);
        if (run.calls.length > 1) problems.push(`${run.calls.length} model calls: a chained call depends on the first answer and cannot be frozen`);
        if (run.calls.length === 1) {
          try {
            const frozen = freezeRequest(run.calls[0]);
            row.sha = frozen.sha;
            row.path = frozen.path;
            bodies.set(frozen.sha, frozen.body);
            const builder = typeof run.result?.prompt === 'string' ? run.result.prompt as string : '';
            row.builderInBody = Boolean(builder) && promptOf(frozen.body).includes(builder);
            if (!row.builderInBody) problems.push("the builder's prompt is not inside the request body");
          } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (run.ok && run.result) {
          row.selfCheck = await measurement.selfCheck(item, run.result, run.calls.length, item.canned, kit, route.instruct);
          if (!row.selfCheck.ok) problems.push(`self-check: ${row.selfCheck.detail}`);
        }
        if (problems.length) row.problem = problems.join('; ');
        rows.push(row);
        console.log(`${row.problem ? 'FAIL' : 'ok  '} ${item.id} ${row.sha ? row.sha.slice(0, 12) : '(no call)'}${row.problem ? ` ${row.problem}` : ''}`);
      }
      const { stUrl, bundleSha256, ...readRoute } = route;
      const built: BatchManifest = {
        format: BATCH_FORMAT, measurement: measurement.id, createdAt: new Date().toISOString(), synthetic: measurement.synthetic, source: { stUrl, bundleSha256 }, route: readRoute,
        args: { ...measureArgs(args), ...(typeof args.limit === 'string' ? { limit: args.limit } : {}), ...(pinned ? { profile: pinned.profile.name } : {}) }, items: rows, tokenizer,
        problems: rows.filter((row) => row.problem).map((row) => `${row.id}: ${row.problem}`),
      };
      return built;
    } finally {
      if (pinned) await effort.restoreRoleProfiles(page, pinned.before);
    }
  });
  const { writeManifest } = await import('./lib/promptBatch.mts');
  await writeManifest(out, manifest, bodies);
  const summary = {
    out, measurement: manifest.measurement, items: manifest.items.length, bodies: bodies.size, noCall: manifest.items.filter((item) => item.calls === 0).length,
    problems: manifest.problems.length, route: { name: manifest.route.name, api: manifest.route.api, apiUrl: manifest.route.apiUrl }, tokenizer: manifest.tokenizer, bundleSha256: manifest.source.bundleSha256,
  };
  console.log(JSON.stringify(summary, null, 1));
  let code = manifest.problems.length ? 1 : 0;
  if (prior) {
    const diff = diffShas(prior, manifest);
    console.log(JSON.stringify({ verify: { same: diff.same.length, changed: diff.changed, added: diff.added, removed: diff.removed } }, null, 1));
    if (diff.changed.length || diff.added.length || diff.removed.length) code = 1;
  }
  return code;
}

async function send(args: MeasureArgs): Promise<number> {
  const dir = resolve(need(args, 'out'));
  const manifest = await readManifest(dir);
  const measurement = measurementFor(manifest.measurement);
  const kit = await loadBatchKit();
  const stop = typeof args.stop === 'string' ? await loadStopCallback(args.stop) : undefined;
  const result = await sendBatch({
    dir, baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : DEFAULT_BASE_URL, finishOf: kit.readFinish, stop,
    outcome: measurement.outcome ? (item, record) => measurement.outcome!(manifest, item, record, kit) : undefined,
    log: console.log, timeoutMs: typeof args['timeout-ms'] === 'string' ? Number(args['timeout-ms']) : undefined, limit: typeof args.limit === 'string' ? Number(args.limit) : undefined,
  });
  console.log(JSON.stringify(result, null, 1));
  return result.stopped?.stopped === 'S5' ? 2 : 0;
}

async function score(args: MeasureArgs): Promise<number> {
  const dir = resolve(need(args, 'out'));
  const manifest = await readManifest(dir);
  const measurement = measurementFor(manifest.measurement);
  refusePrivateOutput(manifest.synthetic, join(dir, FILES.score), `prompt batch ${measurement.id}`);
  const kit = await loadBatchKit();
  const records = await readResponses(dir);
  const { ok, report } = await measurement.score(dir, manifest, records, kit, args);
  const stopped = existsSync(join(dir, FILES.stop)) ? JSON.parse(await readFile(join(dir, FILES.stop), 'utf-8')) : null;
  await writeFile(join(dir, FILES.score), `${JSON.stringify({ format: `${BATCH_FORMAT}-score`, ok, stopped, ...report }, null, 1)}\n`, 'utf-8');
  const { results: _results, ...headline } = report;
  console.log(JSON.stringify({ ok, stopped, ...headline }, null, 1));
  return ok === false ? 1 : 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || rest.includes('--help')) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const args = parseArgs(rest);
  if (command === 'capture') return capture(args);
  if (command === 'send') return send(args);
  if (command === 'score') return score(args);
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
