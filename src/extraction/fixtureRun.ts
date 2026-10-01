import { parseStoryV2OrThrow, type BlackboardSnapshot, type NormalizedStoryV2 } from "@engine/index";
import { readContext, renderSharedReadPrompt } from "./contract";
import { deriveScope } from "./scope";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";
import type { ScopedQuality } from "./types";

export interface FixtureTranscriptEntry {
  index: number;
  speaker: string;
  text: string;
  is_user?: boolean;
}

export interface ExtractionFixtureSpec {
  story: unknown;
  transcript: FixtureTranscriptEntry[];
  activeCheckpointId?: string;
  window?: { from: number; to: number };
  canon?: string;
  blackboard?: BlackboardSnapshot;
  openArcs?: string[];
  epistemicLedgerCapable?: boolean;
  entities?: string[];
  excludeKeys?: string[];
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
  const scope = deriveScope(story, activeCheckpointId, spec.blackboard ?? emptyBlackboard()).filter((entry) => !spec.excludeKeys?.includes(entry.key));
  const from = spec.window?.from ?? spec.transcript[0]?.index ?? 0;
  const to = spec.window?.to ?? spec.transcript[spec.transcript.length - 1]?.index ?? 0;
  const messages = spec.transcript.flatMap((entry) => {
    const cleaned = cleanWindowMessage({ name: entry.speaker, mes: entry.text, is_user: entry.is_user === true });
    return cleaned.keep ? [{ index: entry.index, messageId: entry.index, speaker: entry.speaker, text: cleaned.text, isUser: cleaned.isUser }] : [];
  });
  const canon = spec.canon ?? `Anchor ${activeCheckpointId}: ${story.checkpointById[activeCheckpointId]?.objective ?? ""}`;
  const prompt = renderSharedReadPrompt({
    storyTitle: story.title,
    activeCheckpointId,
    qualities: scope,
    window: { from, to, messages, form: CLEANED_FORM },
    canon,
    ...(spec.openArcs ? { openArcs: spec.openArcs } : {}),
    ...(spec.epistemicLedgerCapable ? { epistemicLedgerCapable: true } : {}),
    ...(spec.entities ? { entities: spec.entities } : {}),
    ...readContext(story, activeCheckpointId),
  });
  return { story, activeCheckpointId, scope, prompt };
}
