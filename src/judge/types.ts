export const JUDGE_MAX_CHOICE_OPTIONS = 255;
export const JUDGE_MAX_REQUEST_CHARS = 140_000;

export interface JudgeCriterion {
  what: string;
  not_for?: string;
  examples?: string[];
}

export type JudgeOption = string | JudgeCriterion | null;

export interface JudgeNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface JudgeChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, JudgeOption>;
}

export interface JudgeScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type JudgeQuestion = JudgeNoulQuestion | JudgeChoiceQuestion | JudgeScoreQuestion;

export interface JudgeRequest {
  state: Record<string, unknown>;
  questions: Record<string, JudgeQuestion>;
  model?: string;
}

export interface JudgeNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JudgeChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JudgeScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type JudgeAnswer = JudgeNoulAnswer | JudgeChoiceAnswer | JudgeScoreAnswer;

export interface JudgeResponse {
  model: string;
  answers: Record<string, JudgeAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export type JudgeTransport = (request: JudgeRequest, options: { timeoutMs: number }) => Promise<JudgeResponse>;

export type JudgeFallback = "disabled" | "unavailable" | "timeout" | "error" | "invalid" | "no-roles" | "no-seam";

export interface JudgeCallRecord {
  at: string;
  boundary: number;
  messageId: number;
  use: string;
  model: string | null;
  latencyMs: number;
  stateChars: number;
  questionCount: number;
  fallback?: JudgeFallback;
  p?: Record<string, number | string>;
}

export interface JudgeResult {
  answers: Record<string, JudgeAnswer> | null;
  model: string | null;
  latencyMs: number;
  stateChars: number;
  questionCount: number;
  fallback?: JudgeFallback;
  cached: boolean;
}
