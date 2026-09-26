import type { BlackboardSnapshot, GateNode, NormalizedTransition, PrimitiveValue, ScaffoldingBeat, ScaffoldingDelta, ScaffoldingOutcome, TensionLevel } from "@engine/index";

export type ExpansionStatus = "idle" | "queued" | "generating" | "cached" | "stale" | "needs_review" | "failed" | "validated" | "inserted";

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
  latched?: Record<string, PrimitiveValue>;
}

export interface GeneratedBeat extends ScaffoldingBeat {
  /** v2.3 plan 07: the beat's index in the response it was parsed from. Never renumbered. */
  id: string;
  objective: string;
  guidance: string;
  tension_target: TensionLevel;
  outcomes: GeneratedOutcome[];
}

export interface GeneratedOutcome extends ScaffoldingOutcome {
  /** v2.3 plan 07 (R9): stable `<beatId>:<outcomeIndex>` at parse, preserved through the cache, so a
   *  transition and its gate can be attributed back to the outcome that produced them. */
  id: string;
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
  judge?: { contradicts: number; advances: number; newCharacter: number; shape: number | null };
}

// v2.2 plan 07: what a variant expansion did, for the author card and the gate record.
export interface VariantRecord {
  generated: number;
  survivors: number;
  scores: Array<number | null>;
  picked: number | null;
  picker: "code" | "llm";
  pickFallback?: "llm" | "judge";
  timesMs: number[];
}

/**
 * v2.3 plan 07: the contract a cached chain was built under. Bumped when the shape of a beat or the
 * meaning of its outcomes changes, because a cache does not survive that change — `mergeExpansions`
 * read `outcomes[0]` before this revision, so a chain from that era has no outcome ids and would keep
 * the single-route behaviour R9 removed.
 */
export const EXPANSION_CONTRACT = 2;

export interface ExpansionCacheEntry {
  key: string;
  status: ExpansionStatus;
  /** The contract this chain was generated under; anything else is discarded on hydrate. */
  contract: number;
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
  origin: "active" | "lookahead";
  headingP?: number;
  variants?: VariantRecord;
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
