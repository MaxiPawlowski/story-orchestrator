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
