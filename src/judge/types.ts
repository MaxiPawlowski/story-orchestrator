export const JUDGE_MAX_CHOICE_OPTIONS = 255;
// TypeSafe documents 32,000 tokens for `state` + the longest question and 64,000 for the whole request;
// the live probe found the API refuses past its limit (400 max_tokens_exceeded), never truncates.
// The ratio is the lowest natural-language one it measured (Spanish 3.488, English 4.525 chars per token).
export const JUDGE_TOKEN_LIMIT = 32_000;
export const JUDGE_TOTAL_TOKEN_LIMIT = 64_000;
export const JUDGE_TOKEN_MARGIN = 0.1;
export const JUDGE_MAX_ESTIMATED_TOKENS = Math.floor(JUDGE_TOKEN_LIMIT * (1 - JUDGE_TOKEN_MARGIN));
export const JUDGE_MAX_ESTIMATED_TOTAL_TOKENS = Math.floor(JUDGE_TOTAL_TOKEN_LIMIT * (1 - JUDGE_TOKEN_MARGIN));
export const JUDGE_CHARS_PER_TOKEN = 3.488;
export const JUDGE_MAX_REQUEST_CHARS = Math.floor(JUDGE_MAX_ESTIMATED_TOTAL_TOKENS * JUDGE_CHARS_PER_TOKEN);

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

export interface JudgeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
}

export interface JudgeResponse {
  model: string;
  answers: Record<string, JudgeAnswer>;
  usage?: JudgeUsage;
}

/**
 * `signal` lets an epoch bump abort a call that is still in flight. It is optional
 * because extraction does not pass one yet — `ConnectionManagerRequestService.sendRequest` does take
 * `custom.signal` (shared.js:423-424, pass-through :463/:483; 1.18.0 :420), so extraction is
 * abortable at the host but not wired. Corrected
 */
export type JudgeTransport = (request: JudgeRequest, options: { timeoutMs: number; signal?: AbortSignal }) => Promise<JudgeResponse>;

/**
 * `cancelled` is distinct from `timeout` on purpose. Both arrive as an AbortError,
 * but one means the model was too slow and the other means WE stopped asking because the chat,
 * story or session moved. builds its cost and latency report from these rings, and counting
 * a cancellation as a timeout makes the model look slower and less reliable than it is.
 */
export type JudgeFallback =
  | "disabled" | "unavailable" | "timeout" | "cancelled" | "error" | "invalid" | "no-roles" | "no-seam" | "busy" | "uncalibrated" | "auth"
  | "model-mismatch" | "too-large";

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
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  cached?: boolean;
  provider?: string;
  /** Metered, never ringed — the call was paid for but belongs to a world that moved. */
  discarded?: JudgeDiscard;
}

export type JudgeDiscard = "chat" | "story" | "version" | "epoch" | "window";

export interface JudgeResult {
  /** The call outlived the chat or session it was asked in, so it was not recorded. */
  discarded?: JudgeDiscard;
  answers: Record<string, JudgeAnswer> | null;
  model: string | null;
  latencyMs: number;
  stateChars: number;
  questionCount: number;
  fallback?: JudgeFallback;
  cached: boolean;
  usage?: JudgeUsage;
}
