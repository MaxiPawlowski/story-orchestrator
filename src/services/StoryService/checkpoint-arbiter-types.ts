export type ArbiterReason = 'win' | 'fail' | 'interval';

export interface CheckpointEvalRequest {
  cpName: string;
  objective?: string;
  latestText: string;
  reason: ArbiterReason;
  matched?: string;
  turn: number;
  intervalTurns: number;
}

export type EvaluationOutcome = 'win' | 'fail' | 'continue';

export interface ModelEval {
  completed: boolean;
  failed: boolean;
  reason?: string;
  confidence?: number;
}

export interface CheckpointEvalPayload {
  request: CheckpointEvalRequest;
  raw: string;
  parsed: ModelEval | null;
  outcome: EvaluationOutcome;
}

export interface CheckpointArbiterApi {
  evaluate: (request: CheckpointEvalRequest) => Promise<CheckpointEvalPayload>;
  clear: () => void;
}
