import { REPLAY_PORT, type ReplayIdentity, type ReplayMode, type SessionStats } from './replayStore.mts';

export const REPLAY_URL_ENV = 'SO_REPLAY_URL';
export const REPLAY_SESSION_ENV = 'SO_REPLAY_SESSION';
export const DEFAULT_REPLAY_URL = `http://127.0.0.1:${REPLAY_PORT}`;

export interface ReplayTarget { url: string; session: string }

export interface ReplayStatus { mode: ReplayMode; store: string; upstream: string | null; identity: ReplayIdentity; normalise: string; entries: number; sessions: Array<{ session: string; row: string | null; line: string }> }

export const laneSession = (lane: number | string): string => `lane-${lane}`;

export const laneReplayUrl = (lane: number | string, base: string = DEFAULT_REPLAY_URL): string => `${base.replace(/\/+$/, '')}/lane/${lane}`;

export function replayTargetFromEnv(env: NodeJS.ProcessEnv = process.env): ReplayTarget | null {
  const url = env[REPLAY_URL_ENV];
  const session = env[REPLAY_SESSION_ENV];
  return url && session ? { url: url.replace(/\/+$/, ''), session } : null;
}

export const replayEnv = (target: ReplayTarget): Record<string, string> => ({ [REPLAY_URL_ENV]: target.url, [REPLAY_SESSION_ENV]: target.session });

async function call<T>(url: string, init: RequestInit | undefined, timeoutMs: number, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return await response.json() as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function replayStatus(base: string = DEFAULT_REPLAY_URL, fetchImpl: typeof fetch = fetch): Promise<ReplayStatus | null> {
  try {
    return await call<ReplayStatus>(`${base.replace(/\/+$/, '')}/__replay/status`, undefined, 2000, fetchImpl);
  } catch {
    return null;
  }
}

export const beginSession = (target: ReplayTarget, row: string, build: string | null, fetchImpl: typeof fetch = fetch): Promise<SessionStats> =>
  call<SessionStats>(`${target.url}/__replay/sessions/${target.session}/begin`, post({ row, build }), 5000, fetchImpl);

export const endSession = (target: ReplayTarget, fetchImpl: typeof fetch = fetch): Promise<SessionStats> =>
  call<SessionStats>(`${target.url}/__replay/sessions/${target.session}/end`, post({}), 5000, fetchImpl);

export async function sessionStats(target: ReplayTarget, fetchImpl: typeof fetch = fetch): Promise<SessionStats | null> {
  try {
    return await call<SessionStats>(`${target.url}/__replay/sessions/${target.session}`, undefined, 5000, fetchImpl);
  } catch {
    return null;
  }
}

export async function markStep(target: ReplayTarget | null, step: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!target) return false;
  try {
    await call(`${target.url}/__replay/sessions/${target.session}/mark`, post({ step }), 1500, fetchImpl);
    return true;
  } catch {
    return false;
  }
}

export interface ReplayRowVerdict { problems: string[]; line: string }

export function replayRowVerdict(stats: Pick<SessionStats, 'mode' | 'replayed' | 'static' | 'live' | 'recorded' | 'refused' | 'misses'> | null, mode: ReplayMode): ReplayRowVerdict {
  if (!stats) return { problems: ['replay: the row\'s session stats could not be read from the replay backend'], line: 'replay: stats unreadable' };
  const line = `replay (${stats.mode}): replayed ${stats.replayed}, static ${stats.static}, live ${stats.live}, recorded ${stats.recorded}, refused ${stats.refused}`;
  const problems: string[] = [];
  if (stats.mode !== mode) problems.push(`replay: the backend runs in ${stats.mode} mode, the batch asked ${mode}`);
  if (stats.refused > 0) problems.push(`replay: ${stats.refused} request(s) had no recording (first: ${stats.misses[0] ? `${stats.misses[0].path} at step ${stats.misses[0].step ?? '-'}, ${stats.misses[0].reason}` : '?'}); the row did not reproduce its recorded conditions`);
  if (mode === 'replay' && stats.live > 0) problems.push(`replay: ${stats.live} request(s) went live in a replay-only row`);
  return { problems, line };
}
