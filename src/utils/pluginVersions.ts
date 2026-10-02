export const EXPECTED_PLUGIN_VERSIONS = { judge: "1.6.0", harness: "1.1.0" } as const;

export type ServerPluginId = keyof typeof EXPECTED_PLUGIN_VERSIONS;

export const SERVER_PLUGIN_DIRS: Readonly<Record<ServerPluginId, string>> = { judge: "story-orchestrator-judge", harness: "story-orchestrator-harness" };

export const pluginVersionIssue = (id: ServerPluginId, version: string | null | undefined): string | null => {
  const expected = EXPECTED_PLUGIN_VERSIONS[id];
  if (!version || version === expected) return null;
  return `the ${SERVER_PLUGIN_DIRS[id]} plugin on the server is ${version}, and this build expects ${expected}: run npm run plugins:install in the extension's repo, then restart SillyTavern`;
};
