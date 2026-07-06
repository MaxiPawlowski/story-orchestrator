import { parseStoryV2OrThrow, type BlackboardSnapshot, type NormalizedStoryV2 } from "@engine/index";
import { renderSharedReadPrompt } from "./contract";
import { deriveScope } from "./scope";
import type { ScopedQuality } from "./types";

export interface FixtureTranscriptEntry {
  index: number;
  speaker: string;
  text: string;
}

export interface ExtractionFixtureSpec {
  story: unknown;
  transcript: FixtureTranscriptEntry[];
  activeCheckpointId?: string;
  window?: { from: number; to: number };
  canon?: string;
  blackboard?: BlackboardSnapshot;
}

export interface FixtureRun {
  story: NormalizedStoryV2;
  activeCheckpointId: string;
  scope: ScopedQuality[];
  prompt: string;
}

const emptyBlackboard = (): BlackboardSnapshot => ({ values: {}, versions: {}, latched: {} });

export function buildFixtureRun(spec: ExtractionFixtureSpec): FixtureRun {
  const story = parseStoryV2OrThrow(spec.story);
  const startId = story.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? story.checkpoints[0]?.id ?? "";
  const activeCheckpointId = spec.activeCheckpointId ?? startId;
  const scope = deriveScope(story, activeCheckpointId, spec.blackboard ?? emptyBlackboard());
  const messages = spec.transcript.map((entry) => ({ ...entry, messageId: entry.index }));
  const from = spec.window?.from ?? messages[0]?.index ?? 0;
  const to = spec.window?.to ?? messages[messages.length - 1]?.index ?? 0;
  const canon = spec.canon ?? `Anchor ${activeCheckpointId}: ${story.checkpointById[activeCheckpointId]?.objective ?? ""}`;
  const prompt = renderSharedReadPrompt({
    storyTitle: story.title,
    activeCheckpointId,
    qualities: scope,
    window: { from, to, messages },
    canon,
  });
  return { story, activeCheckpointId, scope, prompt };
}
