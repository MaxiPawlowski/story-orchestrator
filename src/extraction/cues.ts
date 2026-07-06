import type { NormalizedStoryV2 } from "@engine/index";
import type { ExtractionScheduler } from "./scheduler";
import type { SharedReadWindow } from "./types";

export function scheduleForcedCues(story: NormalizedStoryV2 | null, activeCheckpointId: string | null, scheduler: ExtractionScheduler, window: SharedReadWindow) {
  if (!story || !activeCheckpointId || !window.messages.length) return;
  for (const transition of story.outgoingByCheckpoint[activeCheckpointId] ?? []) {
    if (!transition.extractor_trigger) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(transition.extractor_trigger, "i");
    } catch {
      continue;
    }
    if (window.messages.some((message) => regex.test(message.text))) {
      scheduler.schedule({ priority: 0, reason: `cue:${transition.from}->${transition.to}` });
    }
  }
}
