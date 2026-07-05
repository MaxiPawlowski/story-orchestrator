import type { BlackboardSnapshot, GateNode, NormalizedTransition, PrimitiveValue, ScaffoldingBeat, ScaffoldingDelta, ScaffoldingOutcome, TensionLevel } from "@engine/index";

export type ExpansionStatus = "idle" | "queued" | "generating" | "cached" | "stale" | "needs_review" | "failed" | "inserted";

export interface QualityDeltaPlan {
  q: string;
  current: PrimitiveValue | undefined;
  target: PrimitiveValue;
  distance: number | null;
}

export interface StubExpansionCandidate {
  sourceCheckpointId: string;
  stubId: string;
  targetAnchorId: string;
  transition: NormalizedTransition;
}

export interface PlannedExpansionInput {
  candidate: StubExpansionCandidate;
  beats: number;
  deltas: QualityDeltaPlan[];
  tensionTrajectory: number[];
  generationBias: { direction: string; magnitude: number } | null;
  canon: string;
  facts: string[];
}

export interface GeneratedBeat extends ScaffoldingBeat {
  objective: string;
  guidance: string;
  tension_target: TensionLevel;
  outcomes: GeneratedOutcome[];
}

export interface GeneratedOutcome extends ScaffoldingOutcome {
  label: string;
  gate: GateNode;
  deltas?: ScaffoldingDelta[];
}

export interface CodeCheckResult {
  ok: boolean;
  issues: string[];
  progressTotal: number;
}

export interface CriticVerdict {
  pass: boolean;
  issues: string[];
  raw: string;
}

export interface ExpansionCacheEntry {
  key: string;
  status: ExpansionStatus;
  sourceCheckpointId: string;
  stubId: string;
  targetAnchorId: string;
  basis: Record<string, PrimitiveValue>;
  blackboardVersionSum: number;
  beats: GeneratedBeat[];
  needsReview: boolean;
  verdicts: CriticVerdict[];
  codeCheck: CodeCheckResult | null;
  insertedCheckpointIds: string[];
  lastError: string | null;
  attempts: number;
  updatedAt: string;
}

export interface ExpansionRuntimeState {
  entries: Record<string, ExpansionCacheEntry>;
  scheduler: { queueDepth: number; inFlight: boolean; lastError: string | null };
}

export interface RevalidationResult {
  status: "pass" | "partial" | "fail";
  validBeatCount: number;
  issues: string[];
}

export type ExpansionStoryState = Pick<BlackboardSnapshot, "values" | "versions">;
