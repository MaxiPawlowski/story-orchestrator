import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntry } from './lib/bundleEntry.mts';
import {
  gbnfParityVerdict, gbnfRequest, renderSurvivalVerdict, reserveSampleFromStatus, reserveVerdict, sendLatencyVerdict, SETTLED, turnsInRecord,
  type GbnfCapture, type RenderPoll, type ReserveSample,
} from './lib/controllerChecks.mts';
import { ComfyJobs } from '../../server-plugin/story-orchestrator-media/jobs.mjs';

const USAGE = `Usage:
  node scripts/debug/so-controller-checks.mts gbnf-parity capture --base-url <llama-server> --out <a.json>
  node scripts/debug/so-controller-checks.mts gbnf-parity compare <a.json> <b.json>
  node scripts/debug/so-controller-checks.mts render-survival run --comfy http://127.0.0.1:8188 --graph <api workflow.json> --via media|direct --event "<command>" --out <polls.json> [--event-after running|submitted] [--max-min 20]
  node scripts/debug/so-controller-checks.mts render-survival score <polls.json>
  node scripts/debug/so-controller-checks.mts reserve sample --url http://127.0.0.1:18888/status --seconds 600 [--interval 2] --out <samples.jsonl>
  node scripts/debug/so-controller-checks.mts reserve score <samples.jsonl>
  node scripts/debug/so-controller-checks.mts send-latency score <prefill-off record.json> <prefill-on record.json> --bound-ms <predeclared>

v3.0 F3: the checks the controller audit (docs/plans/v3.0/research/feature-impact-controller.md) says are missing. Every
capture/run/sample needs the GPU (a live llama-server, ComfyUI or the controller); every compare/score is offline. Exit 1 on a
failed verdict.

gbnf-parity: the sprite expression grammar (src/sprites/classify.ts expressionGrammar over 4 replies) and the pose-pick grammar
  (src/sprites/poses/pick.ts over 6 replies, shipped poses) sent as raw /completion requests at temperature 0, top_k 1, seed 1, no
  prompt cache. Capture once per server (A = b11888+MTP, B = the same binary without speculation); compare passes only if every
  reply parses with the shipped parser in both arms and every pair is byte-identical (audit: greedy MTP keeps the target
  sampler's pick and enforces the grammar in the target chain).
render-survival: submits the graph to ComfyUI (via media = the media plugin's ComfyJobs, as story illustrations do; via direct =
  POST /prompt with no lease, as Image Director and ST's /sd do), runs --event once the job is running (e.g. the command that
  forces a text reload, or one that kills ComfyUI), polls every 2 s and records {at, status}; a direct render ComfyUI no longer
  lists is failed (dropped). Pass: the render completed, or failed within 60 s of the event; never hung.
reserve: samples the controller /status (fitCorrectionMiB, gpuReclaims, lastError, crashed, spill) while you drive turns with the
  live head open in the lane browser (or SO_JUDGE_LOCAL_GPU_LAYERS set, or the landmark service up). Pass: fitCorrection stays 0,
  no spill, no crash, no new reserve error.
send-latency: reads the kept {turns} of two test/scenarios/v30-f3-send-latency.json records (idle prefill off, then on) and
  fails when the first-token p50 rises more than the predeclared --bound-ms.`;

const argValue = (args: string[], name: string, fallback: string | null = null): string | null => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const positional = (args: string[], valueFlags: string[]) => args.filter((arg, index) => !arg.startsWith('--') && !valueFlags.includes(args[index - 1] ?? ''));

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface GbnfKit { gbnfCases(): Promise<Array<{ id: string; kind: string; system: string; user: string; grammar: string; valid: (text: string) => boolean }>> }

async function gbnfCapture(baseUrl: string, out: string) {
  const kit = await loadEntry<GbnfKit>('scripts/debug/lib/gbnfParityEntry.ts');
  const base = baseUrl.replace(/\/+$/, '');
  const props = await fetch(`${base}/props`, { signal: AbortSignal.timeout(5000) }).then((response) => (response.ok ? response.json() : null)).catch(() => null) as Record<string, unknown> | null;
  const capture: GbnfCapture = { format: 'so-gbnf-parity/1', baseUrl: base, props: props ? { model_path: props.model_path ?? null, build_info: props.build_info ?? null, speculative: (props as any).default_generation_settings?.speculative ?? null } : null, at: new Date().toISOString(), rows: [] };
  for (const item of await kit.gbnfCases()) {
    try {
      const response = await fetch(`${base}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gbnfRequest(item.system, item.user, item.grammar)), signal: AbortSignal.timeout(120_000) });
      const json = await response.json() as { content?: unknown; error?: unknown };
      const text = typeof json.content === 'string' ? json.content : null;
      capture.rows.push({ id: item.id, kind: item.kind, text, parsed: text !== null && item.valid(text), ...(response.ok ? {} : { error: `HTTP ${response.status}` }) });
    } catch (error) {
      capture.rows.push({ id: item.id, kind: item.kind, text: null, parsed: false, error: error instanceof Error ? error.message : String(error) });
    }
    console.log(`${capture.rows.at(-1)?.parsed ? 'ok  ' : 'FAIL'} ${item.id}`);
  }
  await writeFile(out, `${JSON.stringify(capture, null, 1)}\n`, 'utf-8');
  return { out, rows: capture.rows.length, parsed: capture.rows.filter((row) => row.parsed).length, props: capture.props };
}

async function directSubmit(comfy: string, graph: unknown): Promise<{ poll: () => Promise<string> }> {
  const response = await fetch(`${comfy}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: randomUUID() }) });
  const data = await response.json() as { prompt_id?: string };
  if (!response.ok || !data.prompt_id) throw new Error(`ComfyUI refused the graph: ${JSON.stringify(data).slice(0, 300)}`);
  const id = data.prompt_id;
  return {
    poll: async () => {
      const history = await (await fetch(`${comfy}/history/${encodeURIComponent(id)}`)).json() as Record<string, any>;
      if (history[id]) return history[id].status?.status_str === 'error' ? 'failed' : 'complete';
      const queue = await (await fetch(`${comfy}/queue`)).json() as Record<string, any[]>;
      if (queue.queue_running?.some((entry) => entry[1] === id)) return 'running';
      if (queue.queue_pending?.some((entry) => entry[1] === id)) return 'queued';
      return 'failed';
    },
  };
}

async function renderSurvival(args: string[]) {
  const comfy = (argValue(args, '--comfy', 'http://127.0.0.1:8188') as string).replace(/\/+$/, '');
  const graphFile = argValue(args, '--graph');
  const event = argValue(args, '--event');
  const out = argValue(args, '--out');
  const via = argValue(args, '--via', 'media');
  if (!graphFile || !event || !out || (via !== 'media' && via !== 'direct')) throw new Error('render-survival run needs --graph, --event, --out and --via media|direct');
  const graph = JSON.parse(await readFile(graphFile, 'utf-8'));
  const eventAfter = argValue(args, '--event-after', 'running');
  const deadline = Date.now() + Number(argValue(args, '--max-min', '20')) * 60_000;
  const polls: RenderPoll[] = [];
  let poll: () => Promise<{ status: string; error?: string | null }>;
  if (via === 'media') {
    const jobs = new ComfyJobs({ url: comfy });
    const id = randomUUID();
    const submitted = await jobs.submit('f3', id, graph);
    if (submitted.status === 'failed') throw new Error(`submit failed: ${submitted.error}`);
    poll = async () => { const view = await jobs.poll('f3', id); return { status: view.status, error: view.error }; };
  } else {
    const direct = await directSubmit(comfy, graph);
    poll = async () => ({ status: await direct.poll() });
  }
  let eventAt: number | null = null;
  let eventResult: { code: number | null; output: string } | null = null;
  while (Date.now() < deadline) {
    const at = Date.now();
    const row = await poll().catch((error) => ({ status: 'unreadable', error: error instanceof Error ? error.message : String(error) }));
    polls.push({ at, status: row.status, error: row.error ?? null });
    if (SETTLED.has(row.status)) break;
    if (eventAt === null && (eventAfter === 'submitted' || row.status === 'running')) {
      eventAt = Date.now();
      console.log(`event at ${new Date(eventAt).toISOString()}: ${event}`);
      eventResult = await new Promise((done) => exec(event, { windowsHide: true }, (error, stdout, stderr) => done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}`.slice(-2000) })));
    }
    await sleep(2000);
  }
  const verdict = renderSurvivalVerdict(polls, eventAt);
  await writeFile(out, `${JSON.stringify({ format: 'so-render-survival/1', via, comfy, event, eventAt, eventResult, polls, verdict }, null, 1)}\n`, 'utf-8');
  return verdict;
}

async function reserveSample(args: string[]) {
  const url = argValue(args, '--url', 'http://127.0.0.1:18888/status') as string;
  const out = argValue(args, '--out');
  if (!out) throw new Error('reserve sample needs --out');
  const until = Date.now() + Number(argValue(args, '--seconds', '600')) * 1000;
  const interval = Number(argValue(args, '--interval', '2')) * 1000;
  let count = 0;
  while (Date.now() < until) {
    const at = Date.now();
    const status = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((response) => response.json()).catch(() => null);
    if (status) { await appendFile(out, `${JSON.stringify(reserveSampleFromStatus(status, at))}\n`, 'utf-8'); count += 1; }
    await sleep(Math.max(0, interval - (Date.now() - at)));
  }
  return { out, samples: count };
}

const readJsonl = async (file: string) => (await readFile(file, 'utf-8')).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));

async function main() {
  const [check, verb, ...rest] = process.argv.slice(2);
  if (!check || check === '--help' || !verb) { console.log(USAGE); return; }
  let out: unknown;
  let pass: boolean | null = null;
  if (check === 'gbnf-parity' && verb === 'capture') {
    const base = argValue(rest, '--base-url');
    const file = argValue(rest, '--out');
    if (!base || !file) throw new Error('gbnf-parity capture needs --base-url and --out');
    out = await gbnfCapture(base, resolve(file));
  } else if (check === 'gbnf-parity' && verb === 'compare') {
    const [a, b] = positional(rest, []);
    if (!a || !b) throw new Error('gbnf-parity compare <a.json> <b.json>');
    const verdict = gbnfParityVerdict(JSON.parse(await readFile(a, 'utf-8')), JSON.parse(await readFile(b, 'utf-8')));
    out = verdict;
    pass = verdict.pass;
  } else if (check === 'render-survival' && verb === 'run') {
    const verdict = await renderSurvival(rest);
    out = verdict;
    pass = verdict.pass;
  } else if (check === 'render-survival' && verb === 'score') {
    const [file] = positional(rest, []);
    const record = JSON.parse(await readFile(file, 'utf-8'));
    const verdict = renderSurvivalVerdict(record.polls ?? [], record.eventAt ?? null);
    out = verdict;
    pass = verdict.pass;
  } else if (check === 'reserve' && verb === 'sample') out = await reserveSample(rest);
  else if (check === 'reserve' && verb === 'score') {
    const [file] = positional(rest, []);
    const verdict = reserveVerdict(await readJsonl(file) as ReserveSample[]);
    out = verdict;
    pass = verdict.pass;
  } else if (check === 'send-latency' && verb === 'score') {
    const [off, on] = positional(rest, ['--bound-ms']);
    if (!off || !on) throw new Error('send-latency score <off record> <on record> --bound-ms <n>');
    const bound = argValue(rest, '--bound-ms');
    const verdict = sendLatencyVerdict(turnsInRecord(JSON.parse(await readFile(off, 'utf-8'))), turnsInRecord(JSON.parse(await readFile(on, 'utf-8'))), bound === null ? null : Number(bound));
    out = verdict;
    pass = verdict.pass;
  } else { console.log(USAGE); process.exitCode = 2; return; }
  console.log(JSON.stringify(out, null, 2));
  if (pass === false) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
