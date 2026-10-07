import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JUDGE_ACCOUNT_RATE_PER_MIN, JUDGE_ACCOUNT_RATE_ENV } from './sessionLanes.mts';

export const POD_TUNNEL_BASE = 18080;
export const MAX_PODS = 10;
export const CLOUD_SINK_PORT = POD_TUNNEL_BASE - 1;
export const LANE_POD_FILE = 'pod.json';
export const JUDGE_ACCOUNT_TOKENS_PER_SEC = 250_000;
export const JUDGE_ACCOUNT_TOKENS_ENV = 'SO_JUDGE_ACCOUNT_TOKENS_PER_SEC';

export type LanePod = { pod: number | null; port: number; podId: string | null; at: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function parsePodArg(raw: string | undefined): number | null | undefined {
  if (raw === 'cloud') return null;
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const pod = Number(raw);
  return pod < MAX_PODS ? pod : undefined;
}

export const podTunnelPort = (pod: number | null) => (pod === null ? CLOUD_SINK_PORT : POD_TUNNEL_BASE + pod);

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function podPortOf(url: unknown): number | null {
  if (typeof url !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const port = Number(parsed.port);
  if (!LOOPBACK.has(parsed.hostname) || !Number.isInteger(port)) return null;
  return port === CLOUD_SINK_PORT || (port >= POD_TUNNEL_BASE && port < POD_TUNNEL_BASE + MAX_PODS) ? port : null;
}

export function retargetProfiles(settings: unknown, port: number): { next: Record<string, unknown>; changed: Array<{ name: string; from: string; to: string }> } {
  if (!isRecord(settings)) throw new Error('settings.json is not an object');
  const extensions = isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const manager = isRecord(extensions.connectionManager) ? extensions.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  const changed: Array<{ name: string; from: string; to: string }> = [];
  const next = profiles.map((profile) => {
    if (!isRecord(profile) || podPortOf(profile['api-url']) === null) return profile;
    const from = String(profile['api-url']);
    const url = new URL(from);
    url.port = String(port);
    const to = from.endsWith('/') ? url.toString() : url.toString().replace(/\/$/, '');
    if (to !== from) changed.push({ name: String(profile.name ?? profile.id ?? '(unnamed)'), from, to });
    return { ...profile, 'api-url': to };
  });
  return { next: { ...settings, extension_settings: { ...extensions, connectionManager: { ...manager, profiles: next } } }, changed };
}

export function podPortsIn(settings: unknown): number[] {
  const extensions = isRecord(settings) && isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const manager = isRecord(extensions.connectionManager) ? extensions.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  return [...new Set(profiles.map((profile) => (isRecord(profile) ? podPortOf(profile['api-url']) : null)).filter((port): port is number => port !== null))].sort((a, b) => a - b);
}

export function readLanePod(laneRoot: string): LanePod | null {
  const path = resolve(laneRoot, LANE_POD_FILE);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (!isRecord(raw) || !(raw.pod === null || Number.isInteger(raw.pod)) || !Number.isInteger(raw.port)) return null;
    return { pod: raw.pod as number | null, port: raw.port as number, podId: typeof raw.podId === 'string' ? raw.podId : null, at: String(raw.at ?? '') };
  } catch {
    return null;
  }
}

export const podKey = (pod: number | null | undefined) => (pod === undefined ? 0 : pod);

export function podLoadProblem(lanes: Array<{ lane: number; serverUp: boolean; noModel?: boolean; pod?: number | null }>, max: number): string | null {
  const byPod = new Map<number, number[]>();
  for (const entry of lanes) {
    const pod = podKey(entry.pod);
    if (!entry.serverUp || entry.noModel || pod === null) continue;
    byPod.set(pod, [...(byPod.get(pod) ?? []), entry.lane]);
  }
  const over = [...byPod.entries()].sort(([a], [b]) => a - b).find(([, list]) => list.length > max);
  if (!over) return null;
  const [pod, llm] = over;
  const where = byPod.size > 1 || pod !== 0 ? ` on pod ${pod}` : '';
  return `${llm.length} lanes with a model are up${where} (${llm.join(', ')}), more than ${max}: one pod serves LLM_PARALLEL requests and the rest queue, so backend latency would read as red runs (T7: a 4-token completion took 56 s under 5 lanes). Stop a lane, make it a no-model lane, move it to another pod (st-lanes.mts pod <n> <k>), or pass --allow-load`;
}

export function judgeShareEnv(lanes: number): Record<string, string> {
  const share = Math.max(1, Math.floor(lanes));
  return { [JUDGE_ACCOUNT_RATE_ENV]: String(Math.max(1, Math.floor(JUDGE_ACCOUNT_RATE_PER_MIN / share))), [JUDGE_ACCOUNT_TOKENS_ENV]: String(Math.max(1, Math.floor(JUDGE_ACCOUNT_TOKENS_PER_SEC / share))) };
}

export function laneHeaderField(lane: string | undefined, laneRoot: string): { n: number; pod: number | null; port: number | null; podId: string | null } | null {
  if (!lane || !/^\d+$/.test(lane)) return null;
  const pod = readLanePod(laneRoot);
  return { n: Number(lane), pod: pod ? pod.pod : 0, port: pod ? pod.port : null, podId: pod?.podId ?? null };
}
