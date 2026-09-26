import type { BlackboardDelta, EngineState, GateNode, NormalizedStoryV2, Quality, TensionLevel } from "@engine/index";
import type { ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal, ParsedMemoryLine, SceneBreakSignal } from "@memory/index";
import type { ContextLimit } from "./inputBudget";
import type { WindowForm } from "./windowHygiene";

export interface ScopedQuality {
  key: string;
  quality: Quality;
  hints: string[];
}

export interface ScopePull {
  kind: "gate" | "snapshot" | "builtin";
  checkpointId: string;
  detail: string;
}

export interface ScopedQualityExplained extends ScopedQuality {
  pulledBy: ScopePull[];
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
  isUser: boolean;
}

export type ChatWindowReader = (from: number, to?: number) => SharedReadWindow;

export interface SharedReadWindow {
  from: number;
  to: number;
  messages: ChatMessageWindowEntry[];
  form?: WindowForm;
}

export interface SharedReadContract {
  storyTitle: string;
  activeCheckpointId: string;
  qualities: ScopedQuality[];
  window: SharedReadWindow;
  canon: string;
  openArcs?: string[];
  epistemicLedgerCapable?: boolean;
  entities?: string[];
}

export interface ParsedDelta {
  delta: BlackboardDelta;
  evidence: string;
  rawLevel?: TensionLevel;
  judge?: number;
  /** The line the model wrote, when a parser read it. The audit shows this back. */
  line?: string;
  messageId?: number;
}

// What the judged typed read hands back. `answered` are the hinted qualities it
// settled over the floor (with or without a change); the LLM read never asks about those.
export interface JudgedTypedRead {
  deltas: ParsedDelta[];
  answered: string[];
  model: string | null;
  confidences: Record<string, number>;
  fallback?: string;
}

export type TypedJudge = (input: { story: NormalizedStoryV2; state: EngineState; qualities: Quality[]; window: SharedReadWindow }) => Promise<JudgedTypedRead | null>;

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
  arcs: ParsedArcSignal[];
  epistemic: ParsedEpistemicSignal[];
  ledger: ParsedLedgerSignal[];
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
  judged?: { keys: string[]; model: string | null; confidences: Record<string, number>; fallback?: string; error?: string };
  budget?: ReadBudgetRecord;
  trimmedFrom?: number;
  truncated?: number[];
  windowForm?: WindowForm;
}

export interface ReadBudgetRecord {
  contextLimit: ContextLimit;
  inputBudget: number;
  maxTokens: number;
  tokens: number;
  overBudget?: string;
}

export interface SharedReadResult {
  audit: SharedReadAudit;
  facts: ParsedFact[];
  memory: ParsedMemoryLine[];
  arcs: ParsedArcSignal[];
  epistemic: ParsedEpistemicSignal[];
  ledger: ParsedLedgerSignal[];
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

