import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { lanesRootFor } from '../../lib/stRoot.mjs';
import { parseModelFilter } from './modelClass.mts';
import { laneReplayUrl } from './replayClient.mts';
import { REPLAY_PORT, type ReplayMode } from './replayStore.mts';

export const LANE_REPLAY_FILE = 'replay.json';

export function replayStorePath(value: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isAbsolute(value) || /[\\/]/.test(value)) return resolve(value);
  return resolve(lanesRootFor(env), 'replay', value);
}

export interface LaneReplay { url: string; port: number; at: string; previous: { profiles: Record<string, string>; serverUrl: string | null } }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isLoopbackUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return LOOPBACK.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

const isLlamaProfile = (profile: unknown): profile is Record<string, unknown> => isRecord(profile) && profile.api === 'llamacpp' && isLoopbackUrl(profile['api-url']);

const profileKey = (profile: Record<string, unknown>) => String(profile.id ?? profile.name ?? '');

export function replayProfiles(settings: unknown, lane: number, base?: string): { next: Record<string, unknown>; replay: Omit<LaneReplay, 'at'>; changed: string[] } {
  if (!isRecord(settings)) throw new Error('settings.json is not an object');
  const url = laneReplayUrl(lane, base);
  const extensions = isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const manager = isRecord(extensions.connectionManager) ? extensions.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  const previous: Record<string, string> = {};
  const changed: string[] = [];
  const nextProfiles = profiles.map((profile) => {
    if (!isLlamaProfile(profile)) return profile;
    previous[profileKey(profile)] = String(profile['api-url']);
    changed.push(String(profile.name ?? profileKey(profile)));
    return { ...profile, 'api-url': url };
  });
  const textgen = isRecord(settings.textgenerationwebui_settings) ? settings.textgenerationwebui_settings : null;
  const urls = textgen && isRecord(textgen.server_urls) ? textgen.server_urls : null;
  const serverUrl = urls && isLoopbackUrl(urls.llamacpp) ? urls.llamacpp : null;
  const nextTextgen = textgen && urls && serverUrl ? { ...textgen, server_urls: { ...urls, llamacpp: url } } : textgen;
  const next = { ...settings, extension_settings: { ...extensions, connectionManager: { ...manager, profiles: nextProfiles } }, ...(nextTextgen ? { textgenerationwebui_settings: nextTextgen } : {}) };
  return { next, replay: { url, port: REPLAY_PORT, previous: { profiles: previous, serverUrl } }, changed };
}

export function restoreProfiles(settings: unknown, replay: Pick<LaneReplay, 'previous' | 'url'>): { next: Record<string, unknown>; restored: string[] } {
  if (!isRecord(settings)) throw new Error('settings.json is not an object');
  const extensions = isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const manager = isRecord(extensions.connectionManager) ? extensions.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  const restored: string[] = [];
  const nextProfiles = profiles.map((profile) => {
    if (!isRecord(profile) || profile['api-url'] !== replay.url) return profile;
    const was = replay.previous.profiles[profileKey(profile)];
    if (!was) return profile;
    restored.push(String(profile.name ?? profileKey(profile)));
    return { ...profile, 'api-url': was };
  });
  const textgen = isRecord(settings.textgenerationwebui_settings) ? settings.textgenerationwebui_settings : null;
  const urls = textgen && isRecord(textgen.server_urls) ? textgen.server_urls : null;
  const nextTextgen = textgen && urls && urls.llamacpp === replay.url && replay.previous.serverUrl ? { ...textgen, server_urls: { ...urls, llamacpp: replay.previous.serverUrl } } : textgen;
  return { next: { ...settings, extension_settings: { ...extensions, connectionManager: { ...manager, profiles: nextProfiles } }, ...(nextTextgen ? { textgenerationwebui_settings: nextTextgen } : {}) }, restored };
}

export function replayUrlsIn(settings: unknown): string[] {
  const extensions = isRecord(settings) && isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const manager = isRecord(extensions.connectionManager) ? extensions.connectionManager : {};
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  return [...new Set(profiles.filter((profile) => isRecord(profile) && profile.api === 'llamacpp').map((profile) => String((profile as Record<string, unknown>)['api-url'])))].sort();
}

export function readLaneReplay(laneRoot: string): LaneReplay | null {
  const path = resolve(laneRoot, LANE_REPLAY_FILE);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return isRecord(raw) && typeof raw.url === 'string' && isRecord(raw.previous) ? raw as unknown as LaneReplay : null;
  } catch {
    return null;
  }
}

export interface BatchReplayArgs { replay: string | null; record: string | null; liveMisses: boolean; model: string | null; upstream: string | null }

export interface BatchReplayPlan { mode: ReplayMode; store: string; model: string; upstream: string | null; usesModel: boolean }

export const DEFAULT_RECORD_UPSTREAM = 'http://127.0.0.1:18888';

export function batchReplayPlan(args: BatchReplayArgs, lanes: Array<{ lane: number; replay: boolean; noModel: boolean }>): BatchReplayPlan | null {
  if (!args.replay && !args.record) {
    if (args.liveMisses) throw new Error('--live-misses needs --replay <store>');
    return null;
  }
  if (args.replay && args.record) throw new Error('pass --replay or --record, not both');
  const missing = lanes.filter((entry) => !entry.replay).map((entry) => entry.lane);
  if (missing.length) throw new Error(`lane(s) ${missing.join(', ')} are not pointed at the replay backend: stop them and run st-lanes.mts replay <n> on`);
  const mode: ReplayMode = args.record ? 'record' : args.liveMisses ? 'mixed' : 'replay';
  const usesModel = mode !== 'replay';
  if (usesModel) {
    const offline = lanes.filter((entry) => entry.noModel).map((entry) => entry.lane);
    if (offline.length) throw new Error(`--${mode === 'record' ? 'record' : 'live-misses'} forwards to a live model, and lane(s) ${offline.join(', ')} are no-model lanes; record on a model lane`);
  }
  const model = args.model ?? (mode === 'replay' ? 'none,any' : 'any,judged');
  const classes = parseModelFilter(model) ?? [];
  if (mode === 'replay' && classes.includes('judged')) throw new Error('--replay cannot run judged rows: their verdict depends on what a model writes now, and a replay only repeats what it wrote then; run them live (or --live-misses / --record)');
  return { mode, store: (args.record ?? args.replay) as string, model, upstream: usesModel ? args.upstream ?? DEFAULT_RECORD_UPSTREAM : null, usesModel };
}
