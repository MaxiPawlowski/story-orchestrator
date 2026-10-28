import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  describeMiss, isStreamRequest, lookup, MISS_LIMIT, promptOf, ReplaySession, requestKind, samplerOf, sha256, summaryLine,
  type ReplayBody, type ReplayChunk, type ReplayEntry, type ReplayIdentity, type ReplayMode, type ReplayRequest, type ReplayStore, type SessionStats,
} from './replayStore.mts';

export const CONTROL_PREFIX = '/__replay';
export const DEFAULT_SESSION = 'default';
export const LANE_PREFIX = /^\/lane\/([A-Za-z0-9_-]{1,40})(\/.*)?$/;
export const DEFAULT_PACE = 1;
export const DEFAULT_GAP_CAP_MS = 2000;
export const ABORTED_HOLD_MS = 30_000;

export interface ServerOptions {
  store: ReplayStore;
  mode: ReplayMode;
  upstream?: string | null;
  fetchImpl?: typeof fetch;
  pace?: number;
  gapCapMs?: number;
  abortedHoldMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface RoutedPath { session: string; path: string }

export function routePath(url: string): RoutedPath {
  const pathOnly = url.split('?')[0] || '/';
  const match = LANE_PREFIX.exec(pathOnly);
  if (match) return { session: `lane-${match[1]}`, path: match[2] || '/' };
  return { session: DEFAULT_SESSION, path: pathOnly };
}

const readBody = (req: IncomingMessage): Promise<string> => new Promise((done, fail) => {
  const parts: Buffer[] = [];
  req.on('data', (chunk: Buffer) => parts.push(chunk));
  req.on('end', () => done(Buffer.concat(parts).toString('utf-8')));
  req.on('error', fail);
});

const parseControl = (body: string): Record<string, unknown> => {
  try {
    const parsed = body ? JSON.parse(body) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

export class ReplayServer {
  readonly options: Required<Omit<ServerOptions, 'upstream'>> & { upstream: string | null };
  readonly sessions = new Map<string, ReplaySession>();
  private server: Server | null = null;

  constructor(options: ServerOptions) {
    if (options.mode !== 'replay' && !options.upstream) throw new Error(`mode ${options.mode} needs an upstream (the model server to record)`);
    this.options = {
      store: options.store, mode: options.mode, upstream: options.upstream ? options.upstream.replace(/\/+$/, '') : null, fetchImpl: options.fetchImpl ?? fetch,
      pace: options.pace ?? DEFAULT_PACE, gapCapMs: options.gapCapMs ?? DEFAULT_GAP_CAP_MS, abortedHoldMs: options.abortedHoldMs ?? ABORTED_HOLD_MS,
      log: options.log ?? (() => undefined), sleep: options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
    };
  }

  session(id: string): ReplaySession {
    let session = this.sessions.get(id);
    if (!session) {
      session = new ReplaySession(id, this.options.store, this.options.mode);
      this.sessions.set(id, session);
    }
    return session;
  }

  begin(id: string, row: string | null, build: string | null): SessionStats {
    const session = new ReplaySession(id, this.options.store, this.options.mode, row, build);
    this.sessions.set(id, session);
    return session.stats;
  }

  status() {
    const { store, mode, upstream } = this.options;
    return { mode, store: store.dir, upstream, identity: store.manifest.identity, normalise: store.manifest.normalise.set, entries: store.entries.length, sessions: [...this.sessions.values()].map((session) => ({ session: session.stats.session, row: session.stats.row, line: summaryLine(session.stats) })) };
  }

  listen(port: number, host = '127.0.0.1'): Promise<number> {
    this.server = createServer((req, res) => { this.handle(req, res).catch((error) => { this.options.log(`replay: handler error ${error instanceof Error ? error.message : String(error)}`); if (!res.headersSent) json(res, 500, { error: 'replay handler error' }); else res.end(); }); });
    return new Promise((done, fail) => {
      this.server?.once('error', fail);
      this.server?.listen(port, host, () => {
        const address = this.server?.address();
        done(typeof address === 'object' && address ? address.port : port);
      });
    });
  }

  async close(): Promise<void> {
    await this.options.store.flush();
    await new Promise<void>((done) => {
      if (!this.server) { done(); return; }
      this.server.close(() => done());
      this.server.closeAllConnections();
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    if (url.startsWith(CONTROL_PREFIX)) return this.control(req, res, url.slice(CONTROL_PREFIX.length).split('?')[0]);
    const { session: id, path } = routePath(url);
    const body = await readBody(req);
    const request: ReplayRequest = { method: (req.method ?? 'GET').toUpperCase(), path, body };
    const session = this.session(id);
    const store = this.options.store;
    const key = store.key(request);
    const ordinal = session.pathOrdinal(path);
    if (this.options.mode !== 'record') {
      const found = lookup(store, session, request, key);
      if ('hit' in found) {
        session.count(found.hit.kind === 'generation' ? 'replayed' : 'static');
        return this.serve(found.hit, res);
      }
      if (this.options.mode === 'replay') {
        session.count('refused');
        const miss = await describeMiss(store, session, request, key, ordinal, found);
        if (session.stats.misses.length < MISS_LIMIT) session.stats.misses.push(miss);
        this.options.log(`replay: refused ${request.method} ${path} (${found.miss}, session ${id}, step ${session.step ?? '-'})`);
        return json(res, 503, { error: `replay: no recording for this request (${found.miss}); the replay backend never invents a response`, key, reason: found.miss });
      }
    }
    return this.forward(request, key, ordinal, session, req, res);
  }

  private async control(req: IncomingMessage, res: ServerResponse, route: string): Promise<void> {
    if (route === '/status' || route === '' || route === '/') return json(res, 200, this.status());
    const match = /^\/sessions\/([A-Za-z0-9_-]{1,60})(?:\/(begin|mark|end))?$/.exec(route);
    if (!match) return json(res, 404, { error: `unknown control route ${route}` });
    const [, id, verb] = match;
    const body = req.method === 'POST' ? await readBody(req) : '';
    const data = parseControl(body);
    if (verb === 'begin') return json(res, 200, this.begin(id, typeof data.row === 'string' ? data.row : null, typeof data.build === 'string' ? data.build : null));
    if (verb === 'mark') {
      this.session(id).mark(typeof data.step === 'string' ? data.step.slice(0, 200) : null);
      return json(res, 200, { ok: true });
    }
    if (verb === 'end') {
      const stats = this.session(id).stats;
      this.sessions.delete(id);
      return json(res, 200, stats);
    }
    return json(res, 200, this.session(id).stats);
  }

  private async serve(entry: ReplayEntry, res: ServerResponse): Promise<void> {
    const body = await this.options.store.body(entry);
    res.writeHead(entry.status, entry.contentType ? { 'Content-Type': entry.contentType } : {});
    if (!body.response.chunks) {
      res.end(body.response.body ?? '');
      return;
    }
    let closed = false;
    res.on('close', () => { closed = true; });
    let last = 0;
    for (const chunk of body.response.chunks) {
      const gap = Math.min(Math.max(0, chunk.t - last) * this.options.pace, this.options.gapCapMs);
      last = chunk.t;
      if (gap > 0) await this.options.sleep(gap);
      if (closed) return;
      res.write(chunk.data);
    }
    if (entry.aborted) {
      const until = Date.now() + this.options.abortedHoldMs;
      while (!closed && Date.now() < until) await this.options.sleep(Math.min(250, this.options.abortedHoldMs));
    }
    if (!closed) res.end();
  }

  private async forward(request: ReplayRequest, key: string, ordinal: number, session: ReplaySession, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const controller = new AbortController();
    let clientGone = false;
    res.on('close', () => { if (!res.writableFinished) { clientGone = true; controller.abort(); } });
    const started = Date.now();
    const chunks: ReplayChunk[] = [];
    let status = 502;
    let contentType: string | null = 'application/json';
    try {
      const response = await this.options.fetchImpl(`${this.options.upstream}${request.path}`, {
        method: request.method, headers: request.body ? { 'Content-Type': String(req.headers['content-type'] ?? 'application/json') } : undefined,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body, signal: controller.signal,
      });
      status = response.status;
      contentType = response.headers.get('content-type');
      res.writeHead(status, contentType ? { 'Content-Type': contentType } : {});
      session.count('live');
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const data = decoder.decode(value, { stream: true });
          if (!data) continue;
          chunks.push({ t: Date.now() - started, data });
          if (!clientGone) res.write(data);
        }
        const tail = decoder.decode();
        if (tail) { chunks.push({ t: Date.now() - started, data: tail }); if (!clientGone) res.write(tail); }
      }
    } catch (error) {
      if (!clientGone) {
        if (!res.headersSent) {
          session.count('refused');
          json(res, 502, { error: `replay recorder: upstream failed: ${error instanceof Error ? error.message : String(error)}` });
          return;
        }
        res.end();
        return;
      }
    }
    try {
      await this.record(request, key, ordinal, session, { started, chunks, status, contentType, aborted: clientGone });
    } finally {
      if (!clientGone) res.end();
    }
  }

  private async record(request: ReplayRequest, key: string, ordinal: number, session: ReplaySession, got: { started: number; chunks: ReplayChunk[]; status: number; contentType: string | null; aborted: boolean }): Promise<void> {
    const { started, chunks, status, contentType, aborted } = got;
    if (status >= 500 && !chunks.length) return;
    if (requestKind(request.method, request.path) === 'static' && this.options.store.recorded(key).length) return;
    const stream = isStreamRequest(request.body) || /event-stream/.test(contentType ?? '');
    const prompt = promptOf(request.body);
    const payload: ReplayBody = { request: request.body, response: stream ? { chunks } : { body: chunks.map((chunk) => chunk.data).join('') } };
    await this.options.store.append({
      key, method: request.method, path: request.path, kind: requestKind(request.method, request.path), row: session.stats.row, step: session.step, ordinal, promptSha: prompt === null ? null : sha256(prompt),
      sampler: samplerOf(request.body), stream, status, contentType, aborted, ms: Date.now() - started, at: new Date().toISOString(), build: session.stats.build, source: 'lane',
    }, payload);
    session.stats.recorded += 1;
  }
}

export async function upstreamIdentity(upstream: string, fetchImpl: typeof fetch = fetch): Promise<ReplayIdentity> {
  const base = upstream.replace(/\/+$/, '');
  const read = async (path: string) => {
    try {
      const response = await fetchImpl(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
      return response.ok ? await response.json() as Record<string, any> : null;
    } catch {
      return null;
    }
  };
  const props = await read('/props');
  const models = props ? null : await read('/v1/models');
  const model = typeof props?.model_alias === 'string' && props.model_alias ? props.model_alias : typeof props?.model_path === 'string' ? props.model_path : typeof models?.data?.[0]?.id === 'string' ? models.data[0].id : null;
  const build = typeof props?.build_info === 'string' ? props.build_info : null;
  const ctx = Number(props?.default_generation_settings?.n_ctx ?? props?.n_ctx) || null;
  return { model, build, ctx, upstream: base, origin: 'lane', detail: props ? { modelPath: props.model_path ?? null, totalSlots: props.total_slots ?? null } : {} };
}
