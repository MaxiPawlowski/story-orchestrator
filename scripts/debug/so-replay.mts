import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayStorePath as storePath } from './lib/laneReplay.mts';
import { DEFAULT_REPLAY_URL, replayStatus } from './lib/replayClient.mts';
import { importBatch } from './lib/replayImport.mts';
import { ReplayServer, upstreamIdentity, DEFAULT_PACE } from './lib/replayServer.mts';
import { driftReport, identityLabel, REPLAY_PORT, ReplayStore, type ReplayMode, type SessionStats } from './lib/replayStore.mts';

const USAGE = `Usage:
  node scripts/debug/so-replay.mts serve --store <name|dir> --mode replay|record|mixed [--upstream http://127.0.0.1:18888] [--port ${REPLAY_PORT}] [--pace ${DEFAULT_PACE}] [--normalise exact|st-stamps]
  node scripts/debug/so-replay.mts status [--url ${DEFAULT_REPLAY_URL}]
  node scripts/debug/so-replay.mts ls --store <name|dir>
  node scripts/debug/so-replay.mts import-batch <prompt-batch dir> --store <name|dir> [--row <label>] [--normalise exact|st-stamps]
  node scripts/debug/so-replay.mts drift <replay.json|batch summary json>...

v3.0 F1 (v2.9 plan 11 B3), class R: a loopback model backend on 127.0.0.1:${REPLAY_PORT} that answers recorded responses so
plumbing rows (model: any) rerun without the GPU.

serve: replay answers each request from the store by an exact key: sha256 of method, path and the JSON body with sorted keys,
  minus routing-only keys (api_server); the normalise set (default exact) is fixed when the store is created. A generation
  request (POST /completion, /v1/completions, /v1/chat/completions, /infill) takes the n-th recording of its key for its n-th
  occurrence in the session (same row first), so a swipe of the same prompt gets the next recorded reply; a static request
  (GET, /tokenize, /props) takes the latest. A request with no recording is refused with 503 and counted, never invented.
  Streams replay their recorded chunks at --pace x the recorded gaps (each gap capped at 2 s; --pace 0 = at once); a stream
  the client stopped is replayed up to its stop and then held open until the client closes. record forwards every request to
  --upstream, answers the client as it streams and stores {request, response, row, step, ordinal, sampler keys, SO build};
  the store's identity (model, llama.cpp build, ctx) is read from the upstream's /props when the store is created, and a store
  never mixes two models or builds. mixed replays what is recorded and records the rest live.
  Sessions: a path /lane/<n>/... is session lane-<n> (st-lanes.mts replay <n> on points the lane's llama.cpp profiles there);
  /__replay/sessions/<id>/begin|mark|end (POST) and /__replay/sessions/<id> (GET) give the per-row counts
  {replayed, static, live, recorded, refused, steps, misses}; every miss names its step and the nearest recording's changed
  body keys and first prompt difference (the drift report).
import-batch: adds a so-prompt-batch send's answered items (class M) to a store, keyed by their frozen bodies; the identity is
  the model the answers name.
drift: aggregates the misses of replay row reports into one list per step and path: the steps whose prompt moved since recording
  (re-record them at the next GPU window; their replay results stay plumbing-only until then).

A bare --store name lives at <so-lanes>/replay/<name> (outside the repo: recordings hold chat text).`;

const argValue = (args: string[], name: string, fallback: string | null = null): string | null => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

export const parseMode = (value: string | null): ReplayMode => {
  if (value === 'replay' || value === 'record' || value === 'mixed') return value;
  throw new Error(`--mode must be replay, record or mixed, got ${value ?? '(none)'}`);
};

async function serve(args: string[]) {
  const mode = parseMode(argValue(args, '--mode'));
  if (!argValue(args, '--store')) throw new Error('--store is required');
  const store = storePath(argValue(args, '--store') as string);
  const port = Number(argValue(args, '--port', String(REPLAY_PORT)));
  const upstream = mode === 'replay' ? null : argValue(args, '--upstream');
  if (mode !== 'replay' && !upstream) throw new Error(`--mode ${mode} needs --upstream (the model server to record, e.g. http://127.0.0.1:18888)`);
  if (upstream && new URL(upstream).port === String(port)) throw new Error('refused: --upstream points at the replay port itself');
  const normalise = argValue(args, '--normalise', 'exact') as string;
  const opened = mode === 'replay' ? await ReplayStore.open(store) : await ReplayStore.openOrCreate(store, await upstreamIdentity(upstream as string), normalise);
  if (mode !== 'replay' && opened.manifest.identity.model === null) throw new Error(`refused: the upstream ${upstream} did not name its model (/props, /v1/models); a recording needs a model identity`);
  const server = new ReplayServer({ store: opened, mode, upstream, pace: Number(argValue(args, '--pace', String(DEFAULT_PACE))), log: (line) => console.log(`${new Date().toISOString()} ${line}`) });
  const bound = await server.listen(port);
  console.log(`replay backend (${mode}) on http://127.0.0.1:${bound}, store ${store} (${opened.entries.length} recordings, ${identityLabel(opened.manifest.identity)})${upstream ? `, upstream ${upstream}` : ''}`);
  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function ls(args: string[]) {
  if (!argValue(args, '--store')) throw new Error('--store is required');
  const store = await ReplayStore.open(storePath(argValue(args, '--store') as string));
  const byRow = new Map<string, { generation: number; static: number; aborted: number }>();
  for (const entry of store.entries) {
    const row = byRow.get(entry.row ?? '(none)') ?? { generation: 0, static: 0, aborted: 0 };
    row[entry.kind] += 1;
    if (entry.aborted) row.aborted += 1;
    byRow.set(entry.row ?? '(none)', row);
  }
  return { store: store.dir, identity: store.manifest.identity, normalise: store.manifest.normalise.set, entries: store.entries.length, rows: Object.fromEntries(byRow) };
}

export function sessionsIn(value: unknown): Array<Pick<SessionStats, 'row' | 'misses'>> {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, any>;
  if (Array.isArray(record.misses)) return [{ row: record.row ?? null, misses: record.misses }];
  if (Array.isArray(record.results)) return record.results.flatMap((row: Record<string, any>) => (row.replay ? sessionsIn(row.replay) : []));
  if (record.replay) return sessionsIn(record.replay);
  return [];
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  let out: unknown;
  if (command === 'serve') { await serve(rest); return; }
  if (command === 'status') out = await replayStatus(argValue(rest, '--url', DEFAULT_REPLAY_URL) as string) ?? { up: false };
  else if (command === 'ls') out = await ls(rest);
  else if (command === 'import-batch') {
    const dir = rest.find((arg, index) => !arg.startsWith('--') && !['--store', '--row', '--normalise'].includes(rest[index - 1] ?? ''));
    if (!dir || !argValue(rest, '--store')) { console.log(USAGE); process.exitCode = 2; return; }
    out = await importBatch(resolve(dir), storePath(argValue(rest, '--store') as string), { row: argValue(rest, '--row'), normalise: argValue(rest, '--normalise', 'exact') as string });
  } else if (command === 'drift') {
    const sessions = [];
    for (const file of rest.filter((arg) => !arg.startsWith('--'))) sessions.push(...sessionsIn(JSON.parse(await readFile(file, 'utf-8'))));
    out = { sessions: sessions.length, misses: sessions.reduce((sum, session) => sum + session.misses.length, 0), steps: driftReport(sessions) };
  } else { console.log(USAGE); process.exitCode = 2; return; }
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
