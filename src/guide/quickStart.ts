import type { RuntimeSnapshot } from "@runtime/types";
import type { GlobalSettings } from "@runtime/settingsModel";

export type QuickStartCheck = "memory" | "group" | "story" | "reply";

export const QUICK_START_CHECKS: readonly QuickStartCheck[] = ["memory", "group", "story", "reply"];

export interface QuickStartInput {
  snapshot: Pick<RuntimeSnapshot, "ready" | "boundary" | "noChat">;
  settings: Pick<GlobalSettings, "extraction">;
  groupOpen: boolean;
}

export const quickStartState = ({ snapshot, settings, groupOpen }: QuickStartInput): Record<QuickStartCheck, boolean> => ({
  memory: settings.extraction.enabled && Boolean(settings.extraction.profileId),
  group: groupOpen && !snapshot.noChat,
  story: groupOpen && snapshot.ready,
  reply: groupOpen && snapshot.ready && snapshot.boundary > 0,
});
