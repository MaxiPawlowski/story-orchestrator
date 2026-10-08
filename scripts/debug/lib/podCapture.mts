import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REMOTE_LOG = '/tmp/llama-server.log';
export const SAMPLE_INTERVAL_MS = 15_000;
export const TICK_MAX_BYTES = 8 * 1024 * 1024;
export const POD_FILES = {
  target: 'target.json',
  tunnel: 'tunnel.jsonl',
  samples: 'samples.jsonl',
  gpu: 'gpu.jsonl',
  requests: 'requests.jsonl',
  events: 'log-events.jsonl',
  state: 'capture-state.json',
  lock: 'capture.lock',
  pullRequest: 'pull.request',
  pull: 'pull.json',
  released: 'released.json',
  props: 'props.jsonl',
} as const;

export const podDir = (lanesRoot: string, pod: number) => resolve(lanesRoot, 'pods', String(pod));
export const segmentLog = (dir: string, segment: number) => resolve(dir, `llama-server.${segment}.log`);

export interface PodTarget { host: string; sshPort: number; localPort: number; podId: string | null; user: string; key: string; knownHosts: string | null; hostKeyAlias: string | null; remoteLog: string }

export function readTarget(dir: string): PodTarget | null {
  const path = resolve(dir, POD_FILES.target);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (typeof raw?.host !== 'string' || !Number.isInteger(raw?.sshPort) || !Number.isInteger(raw?.localPort)) return null;
    return { podId: null, user: 'root', key: '', knownHosts: null, hostKeyAlias: null, remoteLog: REMOTE_LOG, ...raw };
  } catch {
    return null;
  }
}

export function sshBaseArgs(target: PodTarget): string[] {
  return [
    '-p', String(target.sshPort),
    ...(target.key ? ['-i', target.key, '-o', 'IdentitiesOnly=yes'] : []),
    ...(target.hostKeyAlias ? ['-o', `HostKeyAlias=${target.hostKeyAlias}`] : []),
    ...(target.knownHosts ? ['-o', `UserKnownHostsFile=${target.knownHosts}`, '-o', 'StrictHostKeyChecking=yes'] : []),
    '-o', 'BatchMode=yes', '-o', 'PasswordAuthentication=no', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
  ];
}

export const tunnelArgs = (target: PodTarget, remotePort = 8080) => ['-N', '-T', '-L', `127.0.0.1:${target.localPort}:127.0.0.1:${remotePort}`, ...sshBaseArgs(target), '-o', 'ExitOnForwardFailure=yes', `${target.user}@${target.host}`];
export const execArgs = (target: PodTarget, command: string) => [...sshBaseArgs(target), `${target.user}@${target.host}`, command];

export const GPU_QUERY = 'index,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw';
export const MARK_GPU = '__SO_GPU_END__';
export const MARK_SIZE = '__SO_SIZE_END__';

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function tickCommand(remoteLog: string, offset: number, maxBytes: number | null): string {
  const log = shellQuote(remoteLog);
  const tail = `tail -c +${offset + 1} ${log} 2>/dev/null${maxBytes ? ` | head -c ${maxBytes}` : ''}`;
  return `nvidia-smi --query-gpu=${GPU_QUERY} --format=csv,noheader,nounits 2>&1; echo ${MARK_GPU}; stat -c %s ${log} 2>/dev/null || echo -1; echo ${MARK_SIZE}; ${tail}`;
}

export function splitTick(stdout: Buffer): { gpu: string; remoteSize: number | null; tail: Buffer } | null {
  const gpuMark = stdout.indexOf(`${MARK_GPU}\n`);
  if (gpuMark < 0) return null;
  const sizeMark = stdout.indexOf(`${MARK_SIZE}\n`, gpuMark);
  if (sizeMark < 0) return null;
  const sizeText = stdout.subarray(gpuMark + MARK_GPU.length + 1, sizeMark).toString('utf-8').trim();
  const size = Number(sizeText);
  return { gpu: stdout.subarray(0, gpuMark).toString('utf-8'), remoteSize: Number.isFinite(size) && size >= 0 ? size : null, tail: stdout.subarray(sizeMark + MARK_SIZE.length + 1) };
}

export interface GpuRow { index: number; util: number | null; memUtil: number | null; memUsedMiB: number | null; memTotalMiB: number | null; tempC: number | null; powerW: number | null }

const num = (raw: string | undefined) => {
  const value = Number(String(raw ?? '').trim());
  return Number.isFinite(value) && String(raw ?? '').trim() !== '' ? value : null;
};

export function parseNvidiaSmi(text: string): { gpus: GpuRow[]; error: string | null } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const gpus: GpuRow[] = [];
  const other: string[] = [];
  for (const line of lines) {
    const cells = line.split(',').map((cell) => cell.trim());
    if (cells.length === 7 && num(cells[0]) !== null) {
      gpus.push({ index: num(cells[0]) as number, util: num(cells[1]), memUtil: num(cells[2]), memUsedMiB: num(cells[3]), memTotalMiB: num(cells[4]), tempC: num(cells[5]), powerW: num(cells[6]) });
    } else other.push(line);
  }
  return { gpus, error: gpus.length ? null : (other.join(' ').slice(0, 300) || 'no nvidia-smi output') };
}

export const METRIC_KEYS = ['prompt_tokens_total', 'prompt_seconds_total', 'tokens_predicted_total', 'tokens_predicted_seconds_total', 'n_decode_total', 'n_busy_slots_per_decode', 'prompt_tokens_seconds', 'predicted_tokens_seconds', 'kv_cache_usage_ratio', 'kv_cache_tokens', 'requests_processing', 'requests_deferred', 'n_tokens_max'];

export function parseMetrics(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^llamacpp:([a-z_]+)(?:\{[^}]*\})?\s+(\S+)/.exec(line.trim());
    if (!match) continue;
    const value = Number(match[2]);
    if (Number.isFinite(value)) out[match[1]] = value;
  }
  return out;
}

export function scrubNumbers(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => scrubNumbers(item, depth + 1)).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const kept = scrubNumbers(item, depth + 1);
      if (kept !== undefined && !(kept && typeof kept === 'object' && !Array.isArray(kept) && !Object.keys(kept).length)) out[key] = kept;
    }
    return out;
  }
  return undefined;
}

export interface RequestRow {
  segment: number;
  task: number;
  slot: number | null;
  nCtxSlot: number | null;
  promptTokens: number | null;
  promptEvalTokens: number | null;
  promptMs: number | null;
  promptTps: number | null;
  predictedTokens: number | null;
  predictedMs: number | null;
  predictedTps: number | null;
  totalMs: number | null;
  truncated: boolean | null;
  contextShift: boolean;
  contextFull: boolean;
  firstSeenAt: string;
  finishedAt: string | null;
}

export type LogEventKind = 'context-full' | 'context-shift' | 'truncated' | 'error' | 'http-error' | 'server-start' | 'log-reset' | 'log-missing';
export interface LogEvent { at: string; segment: number; kind: LogEventKind; task: number | null; slot: number | null; text: string }

const SLOT_TASK = /id\s+(\d+)\s*\|\s*task\s+(-?\d+)/;
const CONTEXT_FULL = /exceeds the available context size|context size (?:has been )?exceeded|failed to find (?:a )?free space in the KV cache|kv cache is full|context is full/i;
const CONTEXT_SHIFT = /context shift/i;
const TRUNCATED = /truncated\s*=\s*(?:1|true)\b|input truncated|prompt (?:is )?too long/i;
const ERROR = /\berror\b|\bfailed\b|exception|\babort(?:ed)?\b|SIGSEGV|SIGILL|out of memory|\bOOM\b|CUDA error|^\S*\s*E\s/i;
const HTTP_LINE = /request:\s+(GET|POST|PUT|DELETE|OPTIONS)\s+(\S+)\s+\S+\s+(\d{3})/;
const SERVER_START = /server is listening|model loaded|main: loading model|starting the main loop/i;
const timing = (label: string) => new RegExp(`^\\s*(?:\\S+\\s+[IWED]\\s+)?${label}\\s*=\\s*([\\d.]+)\\s*ms\\s*/\\s*(\\d+)\\s*(?:tokens|runs)(?:.*?([\\d.]+)\\s*tokens per second)?`, 'i');
const PROMPT_TIMING = timing('prompt eval time');
const EVAL_TIMING = timing('eval time');
const TOTAL_TIMING = timing('total time');

export function createLlamaLogParser(segment = 0) {
  const open = new Map<number, RequestRow>();
  let timingTask: number | null = null;
  let current = segment;
  const ensure = (task: number, slot: number | null, at: string) => {
    let row = open.get(task);
    if (!row) {
      row = { segment: current, task, slot, nCtxSlot: null, promptTokens: null, promptEvalTokens: null, promptMs: null, promptTps: null, predictedTokens: null, predictedMs: null, predictedTps: null, totalMs: null, truncated: null, contextShift: false, contextFull: false, firstSeenAt: at, finishedAt: null };
      open.set(task, row);
    }
    if (slot !== null && row.slot === null) row.slot = slot;
    return row;
  };
  return {
    setSegment(next: number) { current = next; },
    push(line: string, at: string): { rows: RequestRow[]; events: LogEvent[] } {
      const rows: RequestRow[] = [];
      const events: LogEvent[] = [];
      const text = line.replace(/\s+$/, '');
      if (!text.trim()) return { rows, events };
      const ids = SLOT_TASK.exec(text);
      const slot = ids ? Number(ids[1]) : null;
      const task = ids ? Number(ids[2]) : null;
      const event = (kind: LogEventKind) => events.push({ at, segment: current, kind, task, slot, text: text.trim().slice(0, 300) });
      if (task !== null && task >= 0) {
        const row = ensure(task, slot, at);
        const prompt = /(?:n_prompt_tokens|task\.n_tokens)\s*=\s*(\d+)/.exec(text);
        if (/new prompt/i.test(text) && prompt) row.promptTokens = Number(prompt[1]);
        const ctx = /n_ctx_slot\s*=\s*(\d+)/.exec(text);
        if (ctx) row.nCtxSlot = Number(ctx[1]);
        if (/print_timing/.test(text)) timingTask = task;
        const after = ids ? text.slice((ids.index ?? 0) + ids[0].length).replace(/^\s*\|/, '') : '';
        const promptInline = PROMPT_TIMING.exec(after);
        const evalInline = promptInline ? null : EVAL_TIMING.exec(after);
        const totalInline = promptInline || evalInline ? null : TOTAL_TIMING.exec(after);
        if (promptInline) { row.promptMs = Number(promptInline[1]); row.promptEvalTokens = Number(promptInline[2]); row.promptTps = promptInline[3] ? Number(promptInline[3]) : null; }
        if (evalInline) { row.predictedMs = Number(evalInline[1]); row.predictedTokens = Number(evalInline[2]); row.predictedTps = evalInline[3] ? Number(evalInline[3]) : null; }
        if (totalInline) row.totalMs = Number(totalInline[1]);
        const truncated = /truncated\s*=\s*(\d+|true|false)/.exec(text);
        if (truncated) row.truncated = truncated[1] === '1' || truncated[1] === 'true';
        if (CONTEXT_SHIFT.test(text)) { row.contextShift = true; event('context-shift'); }
        if (CONTEXT_FULL.test(text)) { row.contextFull = true; event('context-full'); }
        else if (TRUNCATED.test(text)) event('truncated');
        else if (ERROR.test(text) && !/truncated\s*=/.test(text)) event('error');
        if (/stop processing|slot\s+release/i.test(text)) {
          const held = /stop processing:\s*n_tokens\s*=\s*(\d+)/.exec(text);
          if (held && row.promptTokens === null) row.promptTokens = Math.max(0, Number(held[1]) - (row.predictedTokens ?? 0));
          row.finishedAt = at;
          open.delete(task);
          if (timingTask === task) timingTask = null;
          rows.push(row);
        }
        return { rows, events };
      }
      const promptTiming = PROMPT_TIMING.exec(text);
      const evalTiming = promptTiming ? null : EVAL_TIMING.exec(text);
      const totalTiming = promptTiming || evalTiming ? null : TOTAL_TIMING.exec(text);
      if ((promptTiming || evalTiming || totalTiming) && timingTask !== null) {
        const row = open.get(timingTask);
        if (row && promptTiming) { row.promptMs = Number(promptTiming[1]); row.promptEvalTokens = Number(promptTiming[2]); row.promptTps = promptTiming[3] ? Number(promptTiming[3]) : null; }
        if (row && evalTiming) { row.predictedMs = Number(evalTiming[1]); row.predictedTokens = Number(evalTiming[2]); row.predictedTps = evalTiming[3] ? Number(evalTiming[3]) : null; }
        if (row && totalTiming) row.totalMs = Number(totalTiming[1]);
        return { rows, events };
      }
      const http = HTTP_LINE.exec(text);
      if (http) {
        if (Number(http[3]) >= 400) event('http-error');
        return { rows, events };
      }
      if (CONTEXT_FULL.test(text)) event('context-full');
      else if (SERVER_START.test(text)) event('server-start');
      else if (ERROR.test(text)) event('error');
      return { rows, events };
    },
    flush(): RequestRow[] {
      const rows = [...open.values()].filter((row) => row.totalMs !== null || row.predictedMs !== null);
      open.clear();
      timingTask = null;
      return rows;
    },
    openCount: () => open.size,
  };
}

export function createLineSplitter() {
  let rest = Buffer.alloc(0);
  return {
    push(chunk: Buffer): string[] {
      const joined = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const last = joined.lastIndexOf(0x0a);
      if (last < 0) { rest = joined; return []; }
      rest = joined.subarray(last + 1);
      return joined.subarray(0, last).toString('utf-8').split(/\r?\n/);
    },
    reset() { rest = Buffer.alloc(0); },
    pending: () => rest.length,
  };
}

export const percentile = (values: number[], p: number): number | null => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};

export function requestStats(rows: RequestRow[]) {
  const pick = (key: keyof RequestRow) => rows.map((row) => row[key]).filter((value): value is number => typeof value === 'number');
  const tps = pick('predictedTps');
  const prompt = pick('promptTokens');
  const promptMs = pick('promptMs');
  const evaluated = pick('promptEvalTokens');
  return {
    requests: rows.length,
    predictedTps: { p50: percentile(tps, 50), min: tps.length ? Math.min(...tps) : null, p95: percentile(tps, 95) },
    promptTokens: { p50: percentile(prompt, 50), p95: percentile(prompt, 95), max: prompt.length ? Math.max(...prompt) : null },
    promptMs: { p50: percentile(promptMs, 50), p95: percentile(promptMs, 95) },
    promptEvalTokens: { p50: percentile(evaluated, 50), p95: percentile(evaluated, 95), max: evaluated.length ? Math.max(...evaluated) : null },
    truncated: rows.filter((row) => row.truncated).length,
    contextShift: rows.filter((row) => row.contextShift).length,
    contextFull: rows.filter((row) => row.contextFull).length,
    slots: [...new Set(rows.map((row) => row.slot).filter((slot): slot is number => slot !== null))].sort((a, b) => a - b),
  };
}

export interface CaptureState { segment: number; offset: number; ticks: number; lastTickAt: string | null; logMissing: boolean }

export interface HttpAnswer { status: number; body: string }
export interface PodDeps {
  http(path: string): Promise<HttpAnswer>;
  ssh(command: string): Promise<{ code: number; stdout: Buffer; stderr: string }>;
  now(): Date;
}

const appendJsonl = (path: string, row: unknown) => appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf-8');

export function readState(dir: string): CaptureState {
  try {
    const raw = JSON.parse(readFileSync(resolve(dir, POD_FILES.state), 'utf-8'));
    return { segment: Number(raw.segment) || 0, offset: Number(raw.offset) || 0, ticks: Number(raw.ticks) || 0, lastTickAt: raw.lastTickAt ?? null, logMissing: Boolean(raw.logMissing) };
  } catch {
    return { segment: 0, offset: 0, ticks: 0, lastTickAt: null, logMissing: false };
  }
}

const writeState = (dir: string, state: CaptureState) => writeFileSync(resolve(dir, POD_FILES.state), JSON.stringify(state, null, 2), 'utf-8');

export function createCapture(dir: string, deps: PodDeps, { remoteLog = REMOTE_LOG, maxBytes = TICK_MAX_BYTES } = {}) {
  mkdirSync(dir, { recursive: true });
  const state = readState(dir);
  const parser = createLlamaLogParser(state.segment);
  const splitter = createLineSplitter();
  let propsTaken = false;
  const files = Object.fromEntries(Object.entries(POD_FILES).map(([key, name]) => [key, resolve(dir, name)])) as Record<keyof typeof POD_FILES, string>;
  const emit = (out: { rows: RequestRow[]; events: LogEvent[] }) => {
    for (const row of out.rows) appendJsonl(files.requests, row);
    for (const event of out.events) appendJsonl(files.events, event);
  };
  const logEvent = (kind: LogEventKind, text: string, at: string) => appendJsonl(files.events, { at, segment: state.segment, kind, task: null, slot: null, text });

  async function sampleHttp(at: string) {
    const take = async (path: string) => {
      try { return await deps.http(path); } catch (error) { return { status: 0, body: '', error: error instanceof Error ? error.message : String(error) }; }
    };
    const [health, metrics, slots] = await Promise.all([take('/health'), take('/metrics'), take('/slots')]);
    let slotsOut: unknown;
    if (slots.status === 200) {
      try { slotsOut = scrubNumbers(JSON.parse(slots.body)); } catch { slotsOut = 'unparsed'; }
    } else slotsOut = slots.status === 501 || slots.status === 404 ? 'disabled' : `status ${slots.status}`;
    const row = {
      at,
      tunnel: health.status > 0,
      health: health.status,
      metrics: metrics.status === 200 ? parseMetrics(metrics.body) : `status ${metrics.status}`,
      slots: slotsOut,
    };
    appendJsonl(files.samples, row);
    if (!propsTaken && health.status === 200) {
      const props = await take('/props');
      if (props.status === 200) {
        try {
          const parsed = JSON.parse(props.body);
          appendJsonl(files.props, { at, segment: state.segment, model: typeof parsed?.model_path === 'string' ? parsed.model_path.split(/[\\/]/).pop() : null, totalSlots: parsed?.total_slots ?? null, nCtx: parsed?.default_generation_settings?.n_ctx ?? null, build: typeof parsed?.build_info === 'string' ? parsed.build_info : null });
          propsTaken = true;
        } catch {}
      }
    }
    return row;
  }

  async function pullLog(at: string, limit: number | null) {
    const answer = await deps.ssh(tickCommand(remoteLog, state.offset, limit));
    const split = answer.code === 0 || answer.stdout.length ? splitTick(answer.stdout) : null;
    if (!split) {
      appendJsonl(files.gpu, { at, error: `ssh exit ${answer.code}: ${answer.stderr.trim().slice(0, 200)}` });
      return { ok: false as const, error: `ssh exit ${answer.code}: ${answer.stderr.trim().slice(0, 200)}`, remoteSize: null, bytes: 0 };
    }
    const gpu = parseNvidiaSmi(split.gpu);
    appendJsonl(files.gpu, gpu.error ? { at, error: gpu.error } : { at, gpus: gpu.gpus });
    if (split.remoteSize === null) {
      if (!state.logMissing) logEvent('log-missing', `${remoteLog} not found on the pod (LLM_DEBUG_LOG=1 not set?)`, at);
      state.logMissing = true;
      return { ok: true as const, remoteSize: null, bytes: 0 };
    }
    state.logMissing = false;
    if (split.remoteSize < state.offset) {
      const flushed = parser.flush();
      for (const row of flushed) appendJsonl(files.requests, row);
      logEvent('log-reset', `remote log shrank from ${state.offset} to ${split.remoteSize} bytes (llama-server restarted); segment ${state.segment + 1} starts`, at);
      state.segment += 1;
      state.offset = 0;
      parser.setSegment(state.segment);
      splitter.reset();
      return { ok: true as const, remoteSize: split.remoteSize, bytes: 0, reset: true };
    }
    if (split.tail.length) {
      appendFileSync(segmentLog(dir, state.segment), split.tail);
      state.offset += split.tail.length;
      for (const line of splitter.push(split.tail)) emit(parser.push(line, at));
    }
    return { ok: true as const, remoteSize: split.remoteSize, bytes: split.tail.length };
  }

  async function tick() {
    const at = deps.now().toISOString();
    const sample = await sampleHttp(at);
    const log = await pullLog(at, maxBytes);
    state.ticks += 1;
    state.lastTickAt = at;
    writeState(dir, state);
    return { at, sample, log };
  }

  async function finalPull({ expectLog = true, maxRounds = 64 } = {}) {
    const at = deps.now().toISOString();
    const problems: string[] = [];
    await sampleHttp(at);
    let log = await pullLog(at, null);
    for (let round = 0; log.ok && ('reset' in log && log.reset) && round < maxRounds; round += 1) log = await pullLog(at, null);
    for (let round = 0; log.ok && log.remoteSize !== null && state.offset < log.remoteSize && round < maxRounds; round += 1) log = await pullLog(at, null);
    if (!log.ok) problems.push(`the final log pull failed: ${'error' in log ? log.error : 'unknown'}`);
    for (const row of parser.flush()) appendJsonl(files.requests, row);
    let shaMatch: boolean | null = null;
    const local = segmentLog(dir, state.segment);
    const localBytes = existsSync(local) ? statSync(local).size : 0;
    if (log.ok && log.remoteSize !== null) {
      const sha = await deps.ssh(`sha256sum ${shellQuote(remoteLog)} | cut -c1-64`);
      const remoteSha = sha.stdout.toString('utf-8').trim();
      const localSha = existsSync(local) ? createHash('sha256').update(readFileSync(local)).digest('hex') : createHash('sha256').digest('hex');
      shaMatch = sha.code === 0 && remoteSha === localSha && localBytes === log.remoteSize;
      if (!shaMatch) problems.push(`the local copy of segment ${state.segment} (${localBytes} bytes) does not match the pod's log (${log.remoteSize} bytes, sha ${remoteSha.slice(0, 12) || 'unread'})`);
    }
    if (expectLog && (state.logMissing || log.remoteSize === null)) problems.push(`no llama-server log on the pod (${remoteLog}): the per-request timings are lost; start the pod with LLM_DEBUG_LOG=1`);
    if (expectLog && !localBytes && !state.logMissing && log.ok) problems.push('the pulled llama-server log is empty');
    const samples = countLines(files.samples);
    const gpuSamples = countGpuSamples(files.gpu);
    if (!samples) problems.push('no /health /metrics sample was ever taken');
    if (!gpuSamples) problems.push('no nvidia-smi sample was ever taken');
    state.ticks += 1;
    state.lastTickAt = at;
    writeState(dir, state);
    const record = { at, ok: problems.length === 0, problems, segment: state.segment, logBytes: localBytes, remoteSize: log.remoteSize ?? null, shaMatch, requests: countLines(files.requests), samples, gpuSamples };
    writeFileSync(files.pull, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  }

  return { tick, finalPull, state, files };
}

export function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf-8').split('\n').filter((line) => line.trim()).length;
}

function countGpuSamples(path: string): number {
  return readJsonl(path).filter((row) => Array.isArray(row?.gpus) && row.gpus.length).length;
}

export function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  const out: any[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

export function teardownProblems(dir: string): string[] {
  const pullPath = resolve(dir, POD_FILES.pull);
  if (!existsSync(pullPath)) return [`no final pull landed (${POD_FILES.pull} missing): run so-pod.mts release before stopping the pod`];
  let pull: any;
  try { pull = JSON.parse(readFileSync(pullPath, 'utf-8')); } catch { return [`${POD_FILES.pull} is not readable`]; }
  const problems: string[] = [];
  if (!pull.ok) problems.push(...(Array.isArray(pull.problems) && pull.problems.length ? pull.problems : ['the final pull did not finish ok']));
  const state = readState(dir);
  if (state.lastTickAt && pull.at && Date.parse(state.lastTickAt) > Date.parse(pull.at)) problems.push(`the capture ticked after the final pull (${state.lastTickAt} > ${pull.at}): pull again`);
  return problems;
}

export function windowRows<T extends { at?: string; firstSeenAt?: string; finishedAt?: string | null }>(rows: T[], start: number, end: number): T[] {
  return rows.filter((row) => {
    const at = Date.parse(String(row.finishedAt ?? row.at ?? row.firstSeenAt ?? ''));
    return Number.isFinite(at) && at >= start && at <= end;
  });
}
