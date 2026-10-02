export const RUNTIME_REFRESHERS: Record<string, string> = {
  extraction: 'setExtractionSettings',
  pacing: 'setPacingSettings',
  memory: 'setMemorySettings',
  copilot: 'setCopilotSettings',
  stagecraft: 'setStagecraftSettings',
  display: 'setUiSettings',
};

export const refresherFor = (path: string): string | null => RUNTIME_REFRESHERS[path.split('.')[0]] ?? null;

export const settingLanded = (value: unknown, after: unknown): boolean =>
  JSON.stringify(after) === JSON.stringify(value) || (value === false && (after === null || after === undefined));
