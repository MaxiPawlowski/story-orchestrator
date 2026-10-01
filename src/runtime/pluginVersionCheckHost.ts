import { judgeStatus, refreshHarnessStatus } from "@services/STAPI";
import type { PluginVersionDeps } from "./pluginVersionCheck";

export const pluginVersionHostDeps = (journal: PluginVersionDeps["journal"]): PluginVersionDeps => ({
  judgeVersion: async () => (await judgeStatus())?.pluginVersion ?? null,
  harnessVersion: async () => (await refreshHarnessStatus())?.pluginVersion ?? null,
  warn: (text) => { window.toastr?.warning?.(text, "Story Orchestrator"); },
  journal,
});
