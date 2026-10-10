import type { PrimitiveValue, Quality } from "@engine/index";

export interface GateReplaySource {
  storyId: string;
  history: ReplayHistory;
  declared: string[];
  qualitySignature: string;
  jump?: (messageId: number) => void;
}

type SignedQuality = Pick<Quality, "key" | "type"> & Partial<Pick<Quality, "values" | "latching" | "monotonic">>;

export const qualitySignature = (qualities: readonly SignedQuality[]): string =>
  JSON.stringify(qualities.map((quality) => [quality.key, quality.type, quality.values ?? [], Boolean(quality.latching), Boolean(quality.monotonic)]));

export function buildReplaySource(storyId: string | null, story: { qualities: readonly SignedQuality[] } | null, history: ReplayHistory | null): GateReplaySource | null {
  if (!storyId || !story || !history) return null;
  return { storyId, history, declared: story.qualities.map((quality) => quality.key), qualitySignature: qualitySignature(story.qualities) };
}

export interface ReplayLogEntry {
  boundary: number;
  before: { activeCheckpointId: string };
  fired: { from: string; to: string; declarationIndex?: number } | null;
  source: "gate" | "manual";
  context: { lastMessageId: number };
  evaluated: Record<string, PrimitiveValue> | null;
}

export interface ReplayHistory {
  from: { boundary: number; messageId: number };
  log: ReplayLogEntry[];
}
