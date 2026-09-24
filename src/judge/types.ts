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

/**
 * v2.3 plan 03: `signal` lets an epoch bump abort a call that is still in flight. It is optional
 * because extraction does not pass one yet — `ConnectionManagerRequestService.sendRequest` does take
 * `custom.signal` (shared.js:423-424, pass-through :463/:483; 1.18.0 :420), so extraction is
 * abortable at the host but not wired (v2.4 plan 03). Corrected in v2.4 plan 01.
 */
export type JudgeTransport = (request: JudgeRequest, options: { timeoutMs: number; signal?: AbortSignal }) => Promise<JudgeResponse>;

/**
 * `cancelled` is distinct from `timeout` on purpose (v2.3 plan 03). Both arrive as an AbortError,
 * but one means the model was too slow and the other means WE stopped asking because the chat,
 * story or session moved. Plan 11 builds its cost and latency report from these rings, and counting
 * a cancellation as a timeout makes the model look slower and less reliable than it is.
 */
export type JudgeFallback = "disabled" | "unavailable" | "timeout" | "cancelled" | "error" | "invalid" | "no-roles" | "no-seam";

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
  /** v2.3 plan 03 (C1): the call outlived the chat or session it was asked in, so it was not recorded. */
  discarded?: "chat" | "story" | "version" | "epoch" | "window";
  answers: Record<string, JudgeAnswer> | null;
  model: string | null;
  latencyMs: number;
  stateChars: number;
  questionCount: number;
  fallback?: JudgeFallback;
  cached: boolean;
}
