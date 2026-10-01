import { pluginVersionIssue } from "@utils/pluginVersions";

export interface PluginVersionDeps {
  judgeVersion: () => Promise<string | null>;
  harnessVersion: () => Promise<string | null>;
  warn: (text: string) => void;
  journal: (summary: string, detail: string) => void;
}

export const PLUGIN_VERSION_SUMMARY = "Server plugin version mismatch";

export async function checkPluginVersions(deps: PluginVersionDeps): Promise<string[]> {
  const [judge, harness] = await Promise.all([deps.judgeVersion().catch(() => null), deps.harnessVersion().catch(() => null)]);
  const issues = [pluginVersionIssue("judge", judge), pluginVersionIssue("harness", harness)].filter((issue): issue is string => issue !== null);
  for (const issue of issues) {
    deps.warn(issue);
    deps.journal(PLUGIN_VERSION_SUMMARY, issue);
  }
  return issues;
}
