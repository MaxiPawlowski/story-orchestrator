import { pathToFileURL } from 'node:url';

export const NO_MODEL_BACKUP = 'secrets.json.no-model-backup';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isModelSecret = (key: string) => key.startsWith('api_key_') || key === 'typesafe_api_key';

export function stripModelSecrets(secrets: unknown): { next: Record<string, unknown>; removed: string[] } {
  if (!isRecord(secrets)) return { next: {}, removed: [] };
  const removed = Object.keys(secrets).filter(isModelSecret);
  return { next: Object.fromEntries(Object.entries(secrets).filter(([key]) => !isModelSecret(key))), removed };
}

export function withJudgeEnabled(settings: unknown, enabled: boolean): Record<string, unknown> {
  if (!isRecord(settings)) throw new Error('settings.json is not an object');
  const extensions = isRecord(settings.extension_settings) ? settings.extension_settings : {};
  const root = isRecord(extensions['story-orchestrator']) ? extensions['story-orchestrator'] : {};
  const ours = isRecord(root.settings) ? root.settings : {};
  const judge = isRecord(ours.judge) ? ours.judge : {};
  return { ...settings, extension_settings: { ...extensions, 'story-orchestrator': { ...root, settings: { ...ours, judge: { ...judge, enabled } } } } };
}

export const judgeEnabledIn = (settings: unknown): boolean | null => {
  const value = isRecord(settings) && isRecord(settings.extension_settings) && isRecord(settings.extension_settings['story-orchestrator'])
    ? (settings.extension_settings['story-orchestrator'] as Record<string, unknown>).settings
    : null;
  return isRecord(value) && isRecord(value.judge) && typeof value.judge.enabled === 'boolean' ? value.judge.enabled : null;
};

export const OFFLINE_PORT = 18079;
export const OFFLINE_ENV = 'SO_LANE_OFFLINE';
export const OFFLINE_PERSONA = 'user-default.png';
const LOOPBACK_URL = /\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?/gi;

const rewire = (value: unknown, lanePort: number, seen: Set<string>, allow: readonly number[] = []): unknown => {
  if (typeof value === 'string') return value.replace(LOOPBACK_URL, (url, port: string | undefined) => {
    if (Number(port) === lanePort || Number(port) === OFFLINE_PORT || allow.includes(Number(port))) return url;
    seen.add(url);
    return `http://127.0.0.1:${OFFLINE_PORT}`;
  });
  if (Array.isArray(value)) return value.map((item) => rewire(item, lanePort, seen, allow));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewire(item, lanePort, seen, allow)]));
  return value;
};

export function offlineSettings(settings: unknown, lanePort: number): { next: Record<string, unknown>; rewired: string[] } {
  if (!isRecord(settings)) throw new Error('settings.json is not an object');
  const seen = new Set<string>();
  const wired = rewire(withJudgeEnabled(settings, false), lanePort, seen) as Record<string, any>;
  const extensions = wired.extension_settings;
  const ours = extensions['story-orchestrator'].settings;
  ours.image = { ...(isRecord(ours.image) ? ours.image : {}), enabled: false };
  ours.sprites = { ...(isRecord(ours.sprites) ? ours.sprites : {}), enabled: false };
  const disabled = Array.isArray(extensions.disabledExtensions) ? extensions.disabledExtensions : [];
  extensions.disabledExtensions = [...disabled.filter((name: unknown) => name !== 'stable-diffusion'), 'stable-diffusion'];
  if (isRecord(wired.power_user)) wired.power_user = { ...wired.power_user, default_persona: null };
  wired.user_avatar = OFFLINE_PERSONA;
  return { next: wired, rewired: [...seen].sort() };
}

export type OfflinePodLane = { podPort: number | null };

export function offlineProblems(settings: unknown, lanePort: number, podLane: OfflinePodLane | null = null): string[] {
  const seen = new Set<string>();
  rewire(settings, lanePort, seen, podLane?.podPort ? [podLane.podPort] : []);
  const ours = isRecord(settings) && isRecord(settings.extension_settings) && isRecord(settings.extension_settings['story-orchestrator'])
    ? (settings.extension_settings['story-orchestrator'] as Record<string, any>).settings : null;
  const disabled = isRecord(settings) && isRecord(settings.extension_settings) ? settings.extension_settings.disabledExtensions : null;
  return [
    ...[...seen].map((url) => `settings.json still names ${url}`),
    ...(ours?.image?.enabled === false ? [] : ['image.enabled is not false']),
    ...(ours?.sprites?.enabled === false ? [] : ['sprites.enabled is not false']),
    ...(Array.isArray(disabled) && disabled.includes('stable-diffusion') ? [] : ['stable-diffusion is not disabled']),
    ...(podLane || judgeEnabledIn(settings) === false ? [] : ['judge.enabled is not false']),
    ...(isRecord(settings) && (settings.power_user as Record<string, unknown> | undefined)?.default_persona == null && settings.user_avatar === OFFLINE_PERSONA ? [] : [`the persona is not the install's first (${OFFLINE_PERSONA}, no default persona)`]),
  ];
}

export const FIREWALL_ALLOW_ENV = 'SO_LANE_FIREWALL_ALLOW';

export function firewalledServerEnv(preload: string, lanePort: number, podPort: number | null, parent: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const importFlag = `--import=${pathToFileURL(preload).href}`;
  const options = [parent.NODE_OPTIONS, importFlag].filter(Boolean).join(' ');
  return { NODE_OPTIONS: options, [FIREWALL_ALLOW_ENV]: [lanePort, ...(podPort ? [podPort] : [])].join(',') };
}
