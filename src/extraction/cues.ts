import type { NormalizedStoryV2 } from "@engine/index";
import type { ExtractionScheduler } from "./scheduler";
import type { SharedReadWindow } from "./types";
import { log } from "@utils/log";

export const CUE_REASON_PREFIX = "cue:";

const cuePairs = (reason: string): string[] => reason.slice(CUE_REASON_PREFIX.length).split(",").filter(Boolean);

export const isCueReason = (reason: string): boolean => reason.startsWith(CUE_REASON_PREFIX);

export const cueReason = (pairs: string[]): string => `${CUE_REASON_PREFIX}${[...new Set(pairs)].join(",")}`;

export const mergeCueReasons = (left: string, right: string): string => cueReason([...cuePairs(left), ...cuePairs(right)]);

export function scheduleForcedCues(story: NormalizedStoryV2 | null, activeCheckpointId: string | null, scheduler: ExtractionScheduler, window: SharedReadWindow) {
  if (!story || !activeCheckpointId || !window.messages.length) return;
  const matched: string[] = [];
  for (const transition of story.outgoingByCheckpoint[activeCheckpointId] ?? []) {
    if (!transition.extractor_trigger) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(transition.extractor_trigger, "i");
    } catch (error) {
      log.warn(`the extractor_trigger on ${transition.from} -> ${transition.to} is not a valid pattern; it is skipped`, error);
      continue;
    }
    if (window.messages.some((message) => regex.test(message.text))) matched.push(`${transition.from}->${transition.to}`);
  }
  if (matched.length) scheduler.schedule({ priority: 0, reason: cueReason(matched) });
}
