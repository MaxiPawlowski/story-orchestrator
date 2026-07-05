import type { NormalizedStoryV2 } from "@engine/index";
import { getLastMessageText } from "./chatWindow";
import type { ExtractionScheduler } from "./scheduler";

export function scheduleForcedCues(story: NormalizedStoryV2 | null, activeCheckpointId: string | null, scheduler: ExtractionScheduler) {
  if (!story || !activeCheckpointId) return;
  const text = getLastMessageText();
  if (!text) return;
  for (const transition of story.outgoingByCheckpoint[activeCheckpointId] ?? []) {
    if (!transition.extractor_trigger) continue;
    try {
      if (new RegExp(transition.extractor_trigger, "i").test(text)) {
        scheduler.schedule({ priority: 0, reason: `cue:${transition.from}->${transition.to}` });
      }
    } catch {
      continue;
    }
  }
}
