import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PAGE_CAPTURE_FILE, PAGE_SUMMARY_FILE } from './pageCapture.mts';
import { podDir, POD_FILES, readJsonl, requestStats, SAMPLE_INTERVAL_MS, windowRows } from './podCapture.mts';
import { tunnelWindow, type TunnelEvent } from './podTunnel.mts';

export const ROW_FILES = { runner: 'runner.log', record: 'record.json', failure: 'failure.json', server: 'server.log', tunnel: 'tunnel.json', pod: 'pod.json', evidence: 'evidence.json' } as const;
export const SERVER_SLICE_MAX = 4 * 1024 * 1024;
export const SAMPLE_STALE_MS = 4 * SAMPLE_INTERVAL_MS;

export interface RowLane { n: number; root: string; serverLog: string; lanesRoot: string; pod: number | null | undefined; noModel: boolean }
export interface RowExpect { record: boolean; page: boolean; pod: boolean }

export const fileSize = (path: string) => (existsSync(path) ? statSync(path).size : 0);

export function sliceServerLog(path: string, offset: number, out: string, cap = SERVER_SLICE_MAX) {
  const size = fileSize(path);
  if (!existsSync(path)) {
    writeFileSync(out, '', 'utf-8');
    return { bytes: 0, truncated: false, missing: true, from: offset, to: 0 };
  }
  const from = size < offset ? 0 : offset;
  const length = size - from;
  const start = length > cap ? size - cap : from;
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(path, 'r');
  try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
  writeFileSync(out, buffer);
  return { bytes: buffer.length, truncated: start > from, missing: false, from, to: size, rotated: size < offset };
}

export const usesPod = (lane: Pick<RowLane, 'pod' | 'noModel'>) => !lane.noModel && typeof lane.pod === 'number';

export function hasPulledLog(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((name) => /^llama-server\.\d+\.log$/.test(name) && fileSize(resolve(dir, name)) > 0);
}

export function podEvidence(dir: string, start: number, end: number) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const tunnelEvents = readJsonl(resolve(dir, POD_FILES.tunnel)) as TunnelEvent[];
  const tunnel = tunnelWindow(tunnelEvents, start, end);
  problems.push(...tunnel.problems);
  if (tunnel.stateAtStart === 'down') warnings.push('the tunnel was down when the row started');
  if (tunnel.drops.length) warnings.push(`the tunnel dropped ${tunnel.drops.length} time(s) during the row (${tunnel.drops.map((event) => event.at).join(', ')})`);
  const near = (rows: any[]) => rows.filter((row) => {
    const at = Date.parse(String(row.at ?? ''));
    return Number.isFinite(at) && at >= start - SAMPLE_STALE_MS && at <= end + 5_000;
  });
  const samples = near(readJsonl(resolve(dir, POD_FILES.samples)));
  const gpu = near(readJsonl(resolve(dir, POD_FILES.gpu)));
  const lastAt = (rows: any[]) => Math.max(...rows.map((row) => Date.parse(String(row.at))), -Infinity);
  if (!samples.length) problems.push('no /health /metrics sample in the row window: the pod capture (so-pod.mts up) was not running');
  else if (end - lastAt(samples) > SAMPLE_STALE_MS) problems.push('the pod capture stopped sampling before the row ended');
  if (!gpu.some((row) => Array.isArray(row.gpus))) problems.push('no nvidia-smi sample in the row window');
  const allEvents = readJsonl(resolve(dir, POD_FILES.events));
  const events = windowRows(allEvents, start - SAMPLE_STALE_MS, end + SAMPLE_STALE_MS);
  if (allEvents.some((event) => event.kind === 'log-missing' && Date.parse(event.at) <= end + 5_000) && !hasPulledLog(dir)) problems.push('the pod has no llama-server log (LLM_DEBUG_LOG=1 not set): per-request timings are lost');
  const requests = windowRows(readJsonl(resolve(dir, POD_FILES.requests)), start, end + SAMPLE_STALE_MS);
  if (!requests.length) warnings.push('no llama-server request finished in the row window (a mocked row, or the log lags one sample)');
  const notable = events.filter((event) => ['context-full', 'context-shift', 'truncated', 'error', 'http-error', 'log-reset'].includes(event.kind));
  return {
    problems,
    warnings,
    tunnel: { stateAtStart: tunnel.stateAtStart, drops: tunnel.drops, ups: tunnel.ups, events: tunnel.events },
    pod: { samples: samples.length, gpuSamples: gpu.length, requests: requestStats(requests), events: notable.slice(0, 50), eventCount: notable.length, gpuPeak: gpuPeak(gpu) },
  };
}

function gpuPeak(rows: any[]) {
  const all = rows.flatMap((row) => (Array.isArray(row.gpus) ? row.gpus : []));
  if (!all.length) return null;
  const max = (key: string) => Math.max(...all.map((gpu: any) => (typeof gpu[key] === 'number' ? gpu[key] : -Infinity)));
  return { util: max('util'), memUsedMiB: max('memUsedMiB'), tempC: max('tempC') };
}

const ROLE_OUTAGE = /API returned error: 40[123]\b[^\r\n]*|Insufficient Balance|Payment Required/g;

export function roleOutageIn(serverLog: string): { count: number; sample: string } | null {
  const hits = serverLog.match(ROLE_OUTAGE);
  return hits?.length ? { count: hits.length, sample: hits[0].slice(0, 120) } : null;
}

export function rowEvidenceProblems(rowDir: string, expect: RowExpect): string[] {
  const problems: string[] = [];
  const at = (name: string) => resolve(rowDir, name);
  if (!fileSize(at(ROW_FILES.runner))) problems.push(`${ROW_FILES.runner} is missing or empty: the runner's output is lost`);
  if (expect.record) {
    if (!existsSync(at(ROW_FILES.record))) problems.push(`${ROW_FILES.record} is missing: the runner's result record was never copied into the row`);
    else {
      try { JSON.parse(readFileSync(at(ROW_FILES.record), 'utf-8')); } catch { problems.push(`${ROW_FILES.record} is not valid JSON`); }
    }
  }
  if (expect.page) {
    if (!fileSize(at(PAGE_CAPTURE_FILE))) problems.push(`${PAGE_CAPTURE_FILE} is missing or empty: the browser console / page errors / failed requests were not captured`);
    if (!existsSync(at(PAGE_SUMMARY_FILE))) problems.push(`${PAGE_SUMMARY_FILE} is missing: the runner ended without summarising its page capture`);
  }
  if (!existsSync(at(ROW_FILES.server))) problems.push(`${ROW_FILES.server} is missing: the lane server log slice was not taken`);
  else {
    const outage = roleOutageIn(readFileSync(at(ROW_FILES.server), 'utf-8'));
    if (outage) problems.push(`a model role was unavailable during the row (${outage.count} x "${outage.sample}"): the row ran through a provider outage, so it is not evidence`);
  }
  if (expect.pod) {
    if (!existsSync(at(ROW_FILES.tunnel))) problems.push(`${ROW_FILES.tunnel} is missing: the tunnel health for the row was not recorded`);
    if (!existsSync(at(ROW_FILES.pod))) problems.push(`${ROW_FILES.pod} is missing: the pod-side capture for the row was not recorded`);
  }
  return problems;
}

export interface RowCollect {
  rowDir: string;
  lane: RowLane;
  start: number;
  end: number;
  serverOffset: number;
  recordPath: string | null;
  failurePath?: string | null;
  notRunnable: string | null;
  expect: Omit<RowExpect, 'pod'>;
}

export function collectRowEvidence(input: RowCollect) {
  const { rowDir, lane, start, end } = input;
  mkdirSync(rowDir, { recursive: true });
  const problems: string[] = [];
  const warnings: string[] = [];
  const copied: Record<string, string> = {};
  if (input.recordPath && existsSync(input.recordPath)) {
    copyFileSync(input.recordPath, resolve(rowDir, ROW_FILES.record));
    copied.record = input.recordPath;
  }
  if (input.failurePath && existsSync(input.failurePath)) {
    copyFileSync(input.failurePath, resolve(rowDir, ROW_FILES.failure));
    copied.failure = input.failurePath;
  }
  const server = sliceServerLog(lane.serverLog, input.serverOffset, resolve(rowDir, ROW_FILES.server));
  if (server.missing) warnings.push(`the lane server log ${lane.serverLog} does not exist`);
  if (server.truncated) warnings.push(`the lane server log slice was cut to its last ${SERVER_SLICE_MAX} bytes`);
  const pd = usesPod(lane) ? podDir(lane.lanesRoot, lane.pod as number) : null;
  const pod = pd ? podEvidence(pd, start, end) : null;
  if (pod) {
    writeFileSync(resolve(rowDir, ROW_FILES.tunnel), JSON.stringify({ pod: lane.pod, dir: pd, ...pod.tunnel }, null, 2), 'utf-8');
    writeFileSync(resolve(rowDir, ROW_FILES.pod), JSON.stringify({ pod: lane.pod, dir: pd, ...pod.pod, note: 'pod-wide: every lane on this pod shares these numbers for the window' }, null, 2), 'utf-8');
    problems.push(...pod.problems);
    warnings.push(...pod.warnings);
  }
  const expect: RowExpect = { record: input.expect.record && !input.notRunnable, page: input.expect.page, pod: Boolean(pod) };
  problems.unshift(...rowEvidenceProblems(rowDir, expect));
  let page: any = null;
  try { page = JSON.parse(readFileSync(resolve(rowDir, PAGE_SUMMARY_FILE), 'utf-8')); } catch {}
  const attention: string[] = [];
  if (page?.pageErrorCount) attention.push(`${page.pageErrorCount} page error(s): ${page.pageErrors.slice(0, 3).map((error: any) => error.text.split('\n')[0]).join(' | ')}`);
  const failedRequests = (page?.failedRequests ?? []).filter((request: any) => !request.aborted);
  if (failedRequests.length) attention.push(`${failedRequests.length} failed request(s): ${failedRequests.slice(0, 3).map((request: any) => `${request.method} ${request.url} ${request.status ?? request.failure}`).join(' | ')}`);
  if (pod?.tunnel.drops.length) attention.push(`tunnel dropped ${pod.tunnel.drops.length} time(s)`);
  if (pod?.pod.eventCount) attention.push(`${pod.pod.eventCount} llama-server event(s): ${[...new Set(pod.pod.events.map((event: any) => event.kind))].join(', ')}`);
  const evidence = {
    dir: rowDir,
    lane: lane.n,
    pod: lane.pod ?? null,
    window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    complete: problems.length === 0,
    problems,
    warnings,
    attention,
    copied,
    server,
    page: page ? { pageErrors: page.pageErrorCount, consoleErrors: page.consoleErrors, failedRequests: page.failedRequestCount, httpErrors: page.httpErrorCount } : null,
    podSummary: pod ? { tunnelAtStart: pod.tunnel.stateAtStart, drops: pod.tunnel.drops.length, requests: pod.pod.requests.requests, predictedTpsP50: pod.pod.requests.predictedTps.p50, events: pod.pod.eventCount } : null,
  };
  writeFileSync(resolve(rowDir, ROW_FILES.evidence), JSON.stringify(evidence, null, 2), 'utf-8');
  return evidence;
}

export const rowDirName = (item: string, run: number) => `${basename(item).replace(/\.json$/, '').replace(/[^a-zA-Z0-9_.-]/g, '_')}-run${run}`;

export function recordPathsIn(output: string): { record: string | null; failure: string | null } {
  const wrote = [...output.matchAll(/Wrote JSON: (.+\.json)\s*$/gm)].map((match) => match[1].trim());
  const record = [...wrote].reverse().find((path) => /journey-J\d+[^/\\]*\.json$|so-scenario-result\.json$/.test(path)) ?? null;
  const failure = [...wrote].reverse().find((path) => /so-scenario-failure\.json$/.test(path)) ?? null;
  return { record, failure };
}
