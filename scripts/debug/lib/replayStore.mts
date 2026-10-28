import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const REPLAY_FORMAT = 'so-replay/1';
export const REPLAY_PORT = 18078;
export const KEY_IGNORED: readonly string[] = ['api_server'];
export const GENERATION_PATHS: ReadonlySet<string> = new Set(['/completion', '/completions', '/v1/completions', '/chat/completions', '/v1/chat/completions', '/infill']);
export const SAMPLER_KEYS: readonly string[] = [
  'temperature', 'temperature_last', 'dynatemp_range', 'dynatemp_exponent', 'top_p', 'top_k', 'top_a', 'min_p', 'typical_p', 'tfs_z', 'n_predict', 'max_tokens', 'repeat_penalty', 'repeat_last_n',
  'presence_penalty', 'frequency_penalty', 'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n', 'xtc_threshold', 'xtc_probability', 'mirostat', 'mirostat_tau', 'mirostat_eta',
  'samplers', 'seed', 'grammar', 'json_schema', 'n_probs', 'thinking_budget_tokens', 'reasoning_budget', 'chat_template_kwargs', 'ignore_eos', 'stop',
];
export const FILES = { manifest: 'manifest.json', entries: 'entries.jsonl', bodies: 'bodies' } as const;

export type RequestKind = 'generation' | 'static';
export type EntrySource = 'lane' | 'prompt-batch';

export interface NormaliseRule { id: string; source: string; flags?: string; replace: string }

export const ST_STAMP_RULES: readonly NormaliseRule[] = [
  { id: 'iso-time', source: '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z', flags: 'g', replace: '<iso>' },
  { id: 'st-chat-stamp', source: '\\d{4}-\\d{1,2}-\\d{1,2} ?@ ?\\d{1,2}h ?\\d{1,2}m ?\\d{1,2}s(?: ?\\d{1,3}ms)?', flags: 'g', replace: '<chat-stamp>' },
];

export const NORMALISE_SETS: Readonly<Record<string, readonly NormaliseRule[]>> = { exact: [], 'st-stamps': ST_STAMP_RULES };

export interface ReplayIdentity { model: string | null; build: string | null; ctx: number | null; upstream: string | null; origin: EntrySource; detail?: Record<string, unknown> }

export interface ReplayManifest { format: typeof REPLAY_FORMAT; createdAt: string; identity: ReplayIdentity; keyIgnored: string[]; normalise: { set: string; rules: NormaliseRule[] } }

export interface ReplayEntry {
  id: string;
  key: string;
  method: string;
  path: string;
  kind: RequestKind;
  row: string | null;
  step: string | null;
  ordinal: number;
  promptSha: string | null;
  sampler: Record<string, unknown>;
  stream: boolean;
  status: number;
  contentType: string | null;
  aborted: boolean;
  ms: number;
  at: string;
  build: string | null;
  source: EntrySource;
}

export interface ReplayChunk { t: number; data: string }
export interface ReplayBody { request: string; response: { body?: string; chunks?: ReplayChunk[] } }

export interface ReplayRequest { method: string; path: string; body: string }

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const requestKind = (method: string, path: string): RequestKind => (method.toUpperCase() === 'POST' && GENERATION_PATHS.has(path) ? 'generation' : 'static');

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export const parseJson = (body: string): unknown => {
  if (!body) return null;
  try { return JSON.parse(body); } catch { return undefined; }
};

export function canonicalBody(body: string, ignored: readonly string[] = KEY_IGNORED): string {
  const parsed = parseJson(body);
  if (parsed === undefined) return body;
  if (!isRecord(parsed)) return stableStringify(parsed);
  return stableStringify(Object.fromEntries(Object.entries(parsed).filter(([key]) => !ignored.includes(key))));
}

export const applyRules = (text: string, rules: readonly NormaliseRule[]): string => rules.reduce((out, rule) => out.replace(new RegExp(rule.source, rule.flags ?? 'g'), rule.replace), text);

export function requestKey(request: ReplayRequest, manifest: Pick<ReplayManifest, 'keyIgnored' | 'normalise'> = { keyIgnored: [...KEY_IGNORED], normalise: { set: 'exact', rules: [] } }): string {
  return sha256(`${request.method.toUpperCase()} ${request.path}\n${applyRules(canonicalBody(request.body, manifest.keyIgnored), manifest.normalise.rules)}`);
}

export function promptOf(body: string): string | null {
  const parsed = parseJson(body);
  if (!isRecord(parsed)) return null;
  if (typeof parsed.prompt === 'string') return parsed.prompt;
  if (Array.isArray(parsed.messages)) return stableStringify(parsed.messages);
  return null;
}

export function samplerOf(body: string): Record<string, unknown> {
  const parsed = parseJson(body);
  if (!isRecord(parsed)) return {};
  return Object.fromEntries(SAMPLER_KEYS.filter((key) => parsed[key] !== undefined).map((key) => [key, parsed[key]]));
}

export const isStreamRequest = (body: string): boolean => {
  const parsed = parseJson(body);
  return isRecord(parsed) && parsed.stream === true;
};

export interface FirstDiff { offset: number; was: string; now: string }

export function firstDiff(was: string, now: string, context = 40): FirstDiff | null {
  if (was === now) return null;
  let offset = 0;
  while (offset < was.length && offset < now.length && was[offset] === now[offset]) offset += 1;
  const from = Math.max(0, offset - context);
  return { offset, was: was.slice(from, offset + context), now: now.slice(from, offset + context) };
}

export function changedKeys(was: string, now: string, ignored: readonly string[] = KEY_IGNORED): string[] {
  const a = parseJson(was);
  const b = parseJson(now);
  if (!isRecord(a) || !isRecord(b)) return was === now ? [] : ['(body)'];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !ignored.includes(key) && stableStringify(a[key]) !== stableStringify(b[key])).sort();
}

export const sameIdentity = (a: ReplayIdentity, b: ReplayIdentity): boolean => a.model === b.model && a.build === b.build;

export const identityLabel = (identity: ReplayIdentity): string => `${identity.model ?? 'model ?'} / ${identity.build ?? 'build ?'}${identity.ctx ? ` / ctx ${identity.ctx}` : ''} (${identity.origin})`;

export class ReplayStore {
  readonly dir: string;
  readonly manifest: ReplayManifest;
  readonly entries: ReplayEntry[];
  private readonly byKey = new Map<string, ReplayEntry[]>();
  private writing: Promise<void> = Promise.resolve();

  private constructor(dir: string, manifest: ReplayManifest, entries: ReplayEntry[]) {
    this.dir = dir;
    this.manifest = manifest;
    this.entries = [];
    for (const entry of entries) this.index(entry);
  }

  static exists(dir: string): boolean {
    return existsSync(join(dir, FILES.manifest));
  }

  static async open(dir: string): Promise<ReplayStore> {
    const manifest = JSON.parse(await readFile(join(dir, FILES.manifest), 'utf-8')) as ReplayManifest;
    if (manifest?.format !== REPLAY_FORMAT) throw new Error(`${join(dir, FILES.manifest)} is not ${REPLAY_FORMAT}`);
    const file = join(dir, FILES.entries);
    const entries = existsSync(file) ? (await readFile(file, 'utf-8')).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as ReplayEntry) : [];
    return new ReplayStore(dir, manifest, entries);
  }

  static async create(dir: string, identity: ReplayIdentity, normaliseSet = 'exact'): Promise<ReplayStore> {
    const rules = NORMALISE_SETS[normaliseSet];
    if (!rules) throw new Error(`unknown normalise set ${normaliseSet}; known: ${Object.keys(NORMALISE_SETS).join(', ')}`);
    if (ReplayStore.exists(dir)) throw new Error(`${dir} already holds a replay store`);
    await mkdir(join(dir, FILES.bodies), { recursive: true });
    const manifest: ReplayManifest = { format: REPLAY_FORMAT, createdAt: new Date().toISOString(), identity, keyIgnored: [...KEY_IGNORED], normalise: { set: normaliseSet, rules: [...rules] } };
    await writeFile(join(dir, FILES.manifest), `${JSON.stringify(manifest, null, 1)}\n`, 'utf-8');
    return new ReplayStore(dir, manifest, []);
  }

  static async openOrCreate(dir: string, identity: ReplayIdentity, normaliseSet = 'exact'): Promise<ReplayStore> {
    if (!ReplayStore.exists(dir)) return ReplayStore.create(dir, identity, normaliseSet);
    const store = await ReplayStore.open(dir);
    if (!sameIdentity(store.manifest.identity, identity)) throw new Error(`refused: ${dir} was recorded on ${identityLabel(store.manifest.identity)}, this source is ${identityLabel(identity)}; a store holds one model and build, start a new store`);
    if (store.manifest.normalise.set !== normaliseSet) throw new Error(`refused: ${dir} keys requests with normalise set ${store.manifest.normalise.set}, asked ${normaliseSet}`);
    return store;
  }

  private index(entry: ReplayEntry): void {
    this.entries.push(entry);
    const list = this.byKey.get(entry.key) ?? [];
    list.push(entry);
    this.byKey.set(entry.key, list);
  }

  key(request: ReplayRequest): string {
    return requestKey(request, this.manifest);
  }

  recorded(key: string): readonly ReplayEntry[] {
    return this.byKey.get(key) ?? [];
  }

  async append(entry: Omit<ReplayEntry, 'id'>, body: ReplayBody): Promise<ReplayEntry> {
    const full: ReplayEntry = { id: `${String(this.entries.length + 1).padStart(6, '0')}-${entry.key.slice(0, 12)}`, ...entry };
    this.index(full);
    const write = this.writing.then(async () => {
      await writeFile(join(this.dir, FILES.bodies, `${full.id}.json`), JSON.stringify(body), 'utf-8');
      await appendFile(join(this.dir, FILES.entries), `${JSON.stringify(full)}\n`, 'utf-8');
    });
    this.writing = write.catch(() => undefined);
    await write;
    return full;
  }

  async flush(): Promise<void> {
    await this.writing;
  }

  async body(entry: ReplayEntry): Promise<ReplayBody> {
    return JSON.parse(await readFile(join(this.dir, FILES.bodies, `${entry.id}.json`), 'utf-8')) as ReplayBody;
  }
}

export interface StepCounts { replayed: number; static: number; live: number; refused: number }

export interface ReplayMiss { at: string; step: string | null; method: string; path: string; key: string; ordinal: number; reason: 'unrecorded' | 'exhausted'; recorded: number; promptSha: string | null; nearest: { entry: string; row: string | null; step: string | null; changedKeys: string[]; prompt: FirstDiff | null } | null }

export interface SessionStats {
  session: string;
  row: string | null;
  build: string | null;
  began: string;
  mode: ReplayMode;
  store: string;
  identity: ReplayIdentity;
  replayed: number;
  static: number;
  live: number;
  recorded: number;
  refused: number;
  steps: Record<string, StepCounts>;
  misses: ReplayMiss[];
}

export type ReplayMode = 'replay' | 'record' | 'mixed';

export const MISS_LIMIT = 50;

export class ReplaySession {
  readonly stats: SessionStats;
  step: string | null = null;
  private readonly seen = new Map<string, number>();
  private readonly paths = new Map<string, number>();

  constructor(session: string, store: ReplayStore, mode: ReplayMode, row: string | null = null, build: string | null = null) {
    this.stats = { session, row, build, began: new Date().toISOString(), mode, store: store.dir, identity: store.manifest.identity, replayed: 0, static: 0, live: 0, recorded: 0, refused: 0, steps: {}, misses: [] };
  }

  mark(step: string | null): void {
    this.step = step;
  }

  count(field: keyof StepCounts): void {
    this.stats[field] += 1;
    const key = this.step ?? '(none)';
    const step = this.stats.steps[key] ??= { replayed: 0, static: 0, live: 0, refused: 0 };
    step[field] += 1;
  }

  occurrence(key: string): number {
    const next = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, next);
    return next;
  }

  pathOrdinal(path: string): number {
    const next = (this.paths.get(path) ?? 0) + 1;
    this.paths.set(path, next);
    return next;
  }
}

export type Lookup = { hit: ReplayEntry } | { miss: 'unrecorded' | 'exhausted'; recorded: number };

export function lookup(store: ReplayStore, session: ReplaySession, request: ReplayRequest, key: string = store.key(request)): Lookup {
  const recorded = store.recorded(key);
  if (requestKind(request.method, request.path) === 'static') return recorded.length ? { hit: recorded[recorded.length - 1] } : { miss: 'unrecorded', recorded: 0 };
  const occurrence = session.occurrence(key);
  const row = session.stats.row;
  const ordered = [...recorded.filter((entry) => entry.row === row), ...recorded.filter((entry) => entry.row !== row)];
  const entry = ordered[occurrence - 1];
  return entry ? { hit: entry } : { miss: recorded.length ? 'exhausted' : 'unrecorded', recorded: recorded.length };
}

const commonPrefix = (a: string, b: string): number => {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
  return at;
};

export const NEAREST_SCAN = 200;

export async function nearestEntry(store: ReplayStore, request: ReplayRequest, row: string | null, ordinal: number): Promise<{ entry: ReplayEntry; body: ReplayBody } | null> {
  const same = store.entries.filter((entry) => entry.method === request.method.toUpperCase() && entry.path === request.path);
  const own = same.filter((entry) => entry.row === row);
  const pool = (own.length ? own : same).slice(-NEAREST_SCAN);
  const text = promptOf(request.body) ?? request.body;
  let best: { entry: ReplayEntry; body: ReplayBody; score: number; distance: number } | null = null;
  for (const entry of pool) {
    const body = await store.body(entry).catch(() => null);
    if (!body) continue;
    const score = commonPrefix(promptOf(body.request) ?? body.request, text);
    const distance = Math.abs(entry.ordinal - ordinal);
    if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { entry, body, score, distance };
  }
  return best ? { entry: best.entry, body: best.body } : null;
}

export async function describeMiss(store: ReplayStore, session: ReplaySession, request: ReplayRequest, key: string, ordinal: number, found: Extract<Lookup, { miss: string }>): Promise<ReplayMiss> {
  const exhausted = found.miss === 'exhausted' ? store.recorded(key).at(-1) ?? null : null;
  const near = exhausted ? { entry: exhausted, body: await store.body(exhausted).catch(() => null) } : await nearestEntry(store, request, session.stats.row, ordinal);
  let nearest: ReplayMiss['nearest'] = null;
  if (near) {
    const was = near.body?.request ?? '';
    nearest = { entry: near.entry.id, row: near.entry.row, step: near.entry.step, changedKeys: near.body ? changedKeys(was, request.body, store.manifest.keyIgnored) : [], prompt: near.body ? firstDiff(promptOf(was) ?? was, promptOf(request.body) ?? request.body) : null };
  }
  const prompt = promptOf(request.body);
  return { at: new Date().toISOString(), step: session.step, method: request.method.toUpperCase(), path: request.path, key, ordinal, reason: found.miss, recorded: found.recorded, promptSha: prompt === null ? null : sha256(prompt), nearest };
}

export interface DriftRow { step: string | null; path: string; misses: number; rows: string[]; reasons: string[]; changedKeys: string[] }

export function driftReport(sessions: readonly Pick<SessionStats, 'row' | 'misses'>[]): DriftRow[] {
  const byStep = new Map<string, DriftRow>();
  for (const session of sessions) {
    for (const miss of session.misses) {
      const id = `${miss.step ?? '(none)'}|${miss.path}`;
      const row = byStep.get(id) ?? { step: miss.step, path: miss.path, misses: 0, rows: [], reasons: [], changedKeys: [] };
      row.misses += 1;
      if (session.row && !row.rows.includes(session.row)) row.rows.push(session.row);
      if (!row.reasons.includes(miss.reason)) row.reasons.push(miss.reason);
      for (const key of miss.nearest?.changedKeys ?? []) if (!row.changedKeys.includes(key)) row.changedKeys.push(key);
      byStep.set(id, row);
    }
  }
  return [...byStep.values()].sort((a, b) => b.misses - a.misses || String(a.step).localeCompare(String(b.step)));
}

export const summaryLine = (stats: Pick<SessionStats, 'mode' | 'replayed' | 'static' | 'live' | 'recorded' | 'refused'>): string => `replay (${stats.mode}): replayed ${stats.replayed}, static ${stats.static}, live ${stats.live}, recorded ${stats.recorded}, refused ${stats.refused}`;
