import type { Quest } from "@engine/schema";

export const authoredEndingIds = (quest: Partial<Quest> | undefined): string[] => {
  if (!quest) return ["done", "failed"];
  const resolutions = (quest.resolutions ?? []).map((resolution) => resolution.id);
  const done = quest.done_when || (!resolutions.length && (quest.steps?.length || quest.progress)) ? ["done"] : [];
  return [...done, ...(quest.failed_when ? ["failed"] : []), ...resolutions];
};
