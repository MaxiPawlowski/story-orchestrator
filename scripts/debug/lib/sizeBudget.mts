export interface DataRootSizes {
  root: string;
  settingsBytes: number;
  extensionBytes: number;
  libraryBytes: number;
  libraryStories: number;
  wizardBytes: number;
  chats: number;
  chatsWithStory: number;
  maxChatBytes: number;
  maxBlobBytes: number;
  blobBytes: number[];
}

export const jsonBytes = (value: unknown): number => (value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8'));

export function settingsSizes(settings: unknown): Pick<DataRootSizes, 'extensionBytes' | 'libraryBytes' | 'libraryStories' | 'wizardBytes'> {
  const extensions = (settings as { extension_settings?: Record<string, unknown> } | null)?.extension_settings;
  const root = extensions?.['story-orchestrator'] as Record<string, unknown> | undefined;
  const stories = Array.isArray(root?.stories) ? root.stories : [];
  return { extensionBytes: jsonBytes(root), libraryBytes: jsonBytes(root?.stories), libraryStories: stories.length, wizardBytes: jsonBytes(root?.wizardSessions) };
}

export const blobBytesOf = (chatHeader: unknown): number => jsonBytes((chatHeader as { chat_metadata?: Record<string, unknown> } | null)?.chat_metadata?.story_orchestrator);

export const summarize = (rows: readonly DataRootSizes[]) => ({
  roots: rows.length,
  maxSettingsBytes: Math.max(0, ...rows.map((row) => row.settingsBytes)),
  maxLibraryBytes: Math.max(0, ...rows.map((row) => row.libraryBytes)),
  maxLibraryStories: Math.max(0, ...rows.map((row) => row.libraryStories)),
  maxWizardBytes: Math.max(0, ...rows.map((row) => row.wizardBytes)),
  maxExtensionBytes: Math.max(0, ...rows.map((row) => row.extensionBytes)),
  chatsWithStory: rows.reduce((sum, row) => sum + row.chatsWithStory, 0),
  maxBlobBytes: Math.max(0, ...rows.map((row) => row.maxBlobBytes)),
  maxChatBytes: Math.max(0, ...rows.map((row) => row.maxChatBytes)),
  p95BlobBytes: percentile(rows.flatMap((row) => row.blobBytes), 0.95),
});

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}
