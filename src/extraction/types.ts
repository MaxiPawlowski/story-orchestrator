import type { BlackboardDelta, GateNode, NormalizedStoryV2, PrimitiveValue, Quality, TensionLevel } from "@engine/index";
import type { ParsedMemoryLine, SceneBreakSignal } from "@memory/index";

export interface ScopedQuality {
  key: string;
  quality: Quality;
  hints: string[];
}

export interface ExtraGateSource {
  checkpointId: string;
  gate: GateNode;
  extractionHint?: string;
}

export interface ChatMessageWindowEntry {
  index: number;
  messageId: number;
  speaker: string;
  text: string;
}

export interface SharedReadWindow {
  from: number;
  to: number;
  messages: ChatMessageWindowEntry[];
}

export interface SharedReadContract {
  storyTitle: string;
  activeCheckpointId: string;
  qualities: ScopedQuality[];
  window: SharedReadWindow;
  canon: string;
}

export interface ParsedDelta {
  delta: BlackboardDelta;
  evidence: string;
  rawLevel?: TensionLevel;
}

export interface ParsedFact {
  text: string;
  evidence: string;
  importance: 1 | 2 | 3;
  boundary?: number;
  messageId?: number;
}

export interface ParsedSharedRead {
  deltas: ParsedDelta[];
  facts: ParsedFact[];
  memory: ParsedMemoryLine[];
  sceneBreak?: SceneBreakSignal;
  rejected: Array<{ line: string; reason: string }>;
}

export interface SharedReadAudit {
  id: string;
  createdAt: string;
  priority: 0 | 1;
  reason: string;
  contractHash: string;
  scope: string[];
  window: { from: number; to: number };
  prompt: string;
  rawResponse: string;
  acceptedDeltas: ParsedDelta[];
  rejected: Array<{ line: string; reason: string }>;
  sceneBreak?: SceneBreakSignal;
}

export interface SharedReadResult {
  audit: SharedReadAudit;
  facts: ParsedFact[];
  memory: ParsedMemoryLine[];
}

export interface ReconciliationDescriptor {
  checkpointId: string;
  boundary: number;
  targetedKeys: string[];
}

export interface ReconciliationEvent {
  id: string;
  boundary: number;
  checkpointId: string;
  targetedKeys: string[];
  scheduledAt: string;
  resolvedAt: string | null;
  evidence: string[];
}

export type ValueParser = (quality: Quality, raw: string) => PrimitiveValue | undefined;

export type StoryForExtraction = Pick<NormalizedStoryV2, "title" | "checkpointById" | "outgoingByCheckpoint" | "reachableByCheckpoint" | "qualityByKey">;
