import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BATCH_FORMAT = 'so-prompt-batch/1';
export const DEFAULT_BASE_URL = 'http://127.0.0.1:18888';
export const TEXT_GENERATE = '/api/backends/text-completions/generate';
export const VERBATIM_PATHS: Readonly<Record<string, string>> = {
  llamacpp: '/completion', ooba: '/v1/completions', tabby: '/v1/completions', koboldcpp: '/v1/completions', aphrodite: '/v1/completions', huggingface: '/v1/completions',
};
export const FILES = { manifest: 'manifest.json', bodies: 'bodies', responses: 'responses.jsonl', stop: 'stop.json', score: 'score.json' } as const;

export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export interface RecordedCall { url: string; body: string }
export interface FrozenRequest { path: string; body: string; sha: string; apiType: string }

export function freezeRequest(call: RecordedCall): FrozenRequest {
  if (!call.url.includes(TEXT_GENERATE)) throw new Error(`refused: ${call.url} is not a text-completion request; ST rewrites every other route server-side, so a batch would not send the same bytes`);
  const parsed = JSON.parse(call.body) as Record<string, unknown>;
  const apiType = typeof parsed.api_type === 'string' ? parsed.api_type : '';
  const path = VERBATIM_PATHS[apiType];
  if (!path) throw new Error(`refused: api_type ${apiType || '(none)'} is rewritten by ST before it reaches the backend; batchable: ${Object.keys(VERBATIM_PATHS).join(', ')}`);
  if (parsed.stream === true) throw new Error('refused: a streaming request cannot be replayed as one response');
  if (typeof parsed.api_server === 'string' && parsed.api_server.includes('localhost')) parsed.api_server = parsed.api_server.replace('localhost', '127.0.0.1');
  const body = JSON.stringify(parsed);
  return { path, body, sha: sha256(body), apiType };
}

export interface InstructSequences { stop_sequence?: string; input_sequence?: string; output_sequence?: string; last_output_sequence?: string }

export interface ReadRoute {
  profileId: string | null; name: string | null; api: string | null; apiUrl: string | null; preset: string | null; instructName: string | null; instruct: InstructSequences | null;
}

export interface BatchItem {
  id: string;
  sha: string | null;
  path: string | null;
  calls: number;
  builderInBody: boolean | null;
  selfCheck: { ok: boolean; detail?: string } | null;
  inPage: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  problem?: string;
}

export interface BatchManifest {
  format: typeof BATCH_FORMAT;
  measurement: string;
  createdAt: string;
  synthetic: boolean;
  source: { stUrl: string | null; bundleSha256: string | null };
  route: ReadRoute;
  args: Record<string, string>;
  items: BatchItem[];
  tokenizer: { calls: number; failed: number };
  problems: string[];
}

export const bodyFile = (dir: string, sha: string) => join(dir, FILES.bodies, `${sha}.json`);

export async function writeManifest(dir: string, manifest: BatchManifest, bodies: ReadonlyMap<string, string>): Promise<void> {
  await mkdir(join(dir, FILES.bodies), { recursive: true });
  for (const [sha, body] of bodies) {
    if (sha256(body) !== sha) throw new Error(`body ${sha} does not hash to its name`);
    await writeFile(bodyFile(dir, sha), body, 'utf-8');
  }
  await writeFile(join(dir, FILES.manifest), `${JSON.stringify(manifest, null, 1)}\n`, 'utf-8');
}

export async function readManifest(dir: string): Promise<BatchManifest> {
  const manifest = JSON.parse(await readFile(join(dir, FILES.manifest), 'utf-8')) as BatchManifest;
  if (manifest?.format !== BATCH_FORMAT) throw new Error(`${join(dir, FILES.manifest)} is not ${BATCH_FORMAT}`);
  return manifest;
}

export async function readBody(dir: string, sha: string): Promise<string> {
  const body = await readFile(bodyFile(dir, sha), 'utf-8');
  if (sha256(body) !== sha) throw new Error(`refused: ${bodyFile(dir, sha)} no longer hashes to ${sha} (a frozen body was edited)`);
  return body;
}

export interface ShaDiff { same: string[]; changed: Array<{ id: string; was: string | null; now: string | null }>; added: string[]; removed: string[] }

export function diffShas(was: Pick<BatchManifest, 'items'>, now: Pick<BatchManifest, 'items'>): ShaDiff {
  const before = new Map(was.items.map((item) => [item.id, item.sha]));
  const after = new Map(now.items.map((item) => [item.id, item.sha]));
  const diff: ShaDiff = { same: [], changed: [], added: [], removed: [] };
  for (const [id, sha] of after) {
    if (!before.has(id)) diff.added.push(id);
    else if (before.get(id) === sha) diff.same.push(id);
    else diff.changed.push({ id, was: before.get(id) ?? null, now: sha });
  }
  for (const id of before.keys()) if (!after.has(id)) diff.removed.push(id);
  return diff;
}

export type Finish = 'stop' | 'length' | 'unknown';

export interface ResponseRecord {
  itemId: string;
  sha: string;
  ok: boolean;
  attempt: number;
  status: number | null;
  raw: string;
  finish: Finish;
  tokens: { prompt: number | null; predicted: number | null };
  ms: number;
  at: string;
  error?: string;
}

export interface StopProgress {
  index: number;
  total: number;
  item: BatchItem;
  record: ResponseRecord;
  records: ResponseRecord[];
  outcome: boolean | null;
}

export interface StopDecision { stop: boolean; rule?: string; verdict?: string; detail?: string }
export type StopCallback = (progress: StopProgress) => StopDecision | null | undefined | Promise<StopDecision | null | undefined>;

export interface StopRecord { stopped: string; verdict: string; at: string; counts: { sent: number; ok: number; failed: number; planned: number }; detail?: string }

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

export function backendTokens(json: unknown): { prompt: number | null; predicted: number | null } {
  const data = (json ?? {}) as Record<string, any>;
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const timings = (data.timings ?? {}) as Record<string, unknown>;
  return {
    prompt: count(usage.prompt_tokens) ?? count(data.tokens_evaluated) ?? count(timings.prompt_n),
    predicted: count(usage.completion_tokens) ?? count(data.tokens_predicted) ?? count(timings.predicted_n),
  };
}

export async function readResponses(dir: string): Promise<ResponseRecord[]> {
  const file = join(dir, FILES.responses);
  if (!existsSync(file)) return [];
  return (await readFile(file, 'utf-8')).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as ResponseRecord);
}

export const latestOk = (records: readonly ResponseRecord[]): Map<string, ResponseRecord> => {
  const out = new Map<string, ResponseRecord>();
  for (const record of records) if (record.ok) out.set(record.itemId, record);
  return out;
};

export interface SendOptions {
  dir: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  finishOf: (json: unknown) => Finish;
  stop?: StopCallback;
  outcome?: (item: BatchItem, record: ResponseRecord) => boolean | null | Promise<boolean | null>;
  log?: (line: string) => void;
  timeoutMs?: number;
  limit?: number;
  now?: () => number;
}

export interface SendResult { planned: number; skipped: number; sent: number; ok: number; failed: number; unsendable: number; stopped: StopRecord | null }

export async function sendBatch(options: SendOptions): Promise<SendResult> {
  const { dir, finishOf, stop, outcome, log = () => undefined } = options;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());
  const timeoutMs = options.timeoutMs ?? 600_000;
  if (existsSync(join(dir, FILES.stop))) throw new Error(`refused: ${join(dir, FILES.stop)} exists; a stopped row is never resumed (a new batch is a new row)`);
  const manifest = await readManifest(dir);
  const records = await readResponses(dir);
  for (const record of records) {
    const item = manifest.items.find((entry) => entry.id === record.itemId);
    if (!item || item.sha !== record.sha) throw new Error(`refused: response for ${record.itemId} was recorded against sha ${record.sha}, the manifest now says ${item?.sha ?? 'nothing'}`);
  }
  const done = latestOk(records);
  const sendable = manifest.items.filter((item) => item.sha && item.path && !item.problem);
  const result: SendResult = { planned: sendable.length, skipped: 0, sent: 0, ok: 0, failed: 0, unsendable: manifest.items.length - sendable.length, stopped: null };
  const append = async (record: ResponseRecord) => {
    records.push(record);
    await appendFile(join(dir, FILES.responses), `${JSON.stringify(record)}\n`, 'utf-8');
  };
  const halt = async (stopped: StopRecord) => {
    await writeFile(join(dir, FILES.stop), `${JSON.stringify(stopped, null, 1)}\n`, 'utf-8');
    result.stopped = stopped;
    log(`stopped ${stopped.stopped} (${stopped.verdict}) at ${stopped.at}${stopped.detail ? `: ${stopped.detail}` : ''}`);
    return result;
  };
  const counts = () => ({ sent: result.sent, ok: result.ok, failed: result.failed, planned: sendable.length });
  for (const [index, item] of sendable.entries()) {
    if (done.has(item.id)) {
      result.skipped += 1;
      continue;
    }
    if (options.limit !== undefined && result.sent >= options.limit) break;
    const body = await readBody(dir, item.sha as string);
    let record: ResponseRecord | null = null;
    for (const attempt of [1, 2]) {
      const started = now();
      const at = new Date().toISOString();
      try {
        const response = await fetchImpl(`${baseUrl}${item.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
        const raw = await response.text();
        const ms = now() - started;
        const json = (() => { try { return JSON.parse(raw); } catch { return null; } })();
        const ok = response.ok && json !== null && !(json as { error?: unknown }).error;
        record = {
          itemId: item.id, sha: item.sha as string, ok, attempt, status: response.status, raw, finish: json === null ? 'unknown' : finishOf(json), tokens: backendTokens(json), ms, at,
          ...(ok ? {} : { error: json === null ? 'the response is not JSON' : `HTTP ${response.status}` }),
        };
      } catch (error) {
        record = { itemId: item.id, sha: item.sha as string, ok: false, attempt, status: null, raw: '', finish: 'unknown', tokens: { prompt: null, predicted: null }, ms: now() - started, at, error: error instanceof Error ? error.message : String(error) };
      }
      result.sent += 1;
      await append(record);
      log(`${record.ok ? 'ok  ' : 'FAIL'} ${item.id} ${record.finish} ${Math.round(record.ms)} ms${record.error ? ` ${record.error}` : ''}`);
      if (record.ok) break;
    }
    if (!record?.ok) {
      result.failed += 1;
      return halt({ stopped: 'S5', verdict: 'NOT A MEASUREMENT', at: `${index + 1}/${sendable.length}`, counts: counts(), detail: `${item.id}: ${record?.error ?? 'no response'} after one retry` });
    }
    result.ok += 1;
    if (!stop) continue;
    const decision = await stop({ index, total: sendable.length, item, record, records: [...records], outcome: outcome ? await outcome(item, record) : null });
    if (decision?.stop) return halt({ stopped: decision.rule ?? 'stop', verdict: decision.verdict ?? 'stopped', at: `${index + 1}/${sendable.length}`, counts: counts(), ...(decision.detail ? { detail: decision.detail } : {}) });
  }
  return result;
}

export async function loadStopCallback(file: string): Promise<StopCallback> {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const module = await import(pathToFileURL(resolve(file)).href) as { default?: unknown; stop?: unknown };
  const callback = typeof module.stop === 'function' ? module.stop : module.default;
  if (typeof callback !== 'function') throw new Error(`${file} exports neither stop nor a default function`);
  return callback as StopCallback;
}
