import type { DecisionProvider } from "./providers";
import type { JudgeAnswer, JudgeOption, JudgeQuestion, JudgeRequest, JudgeResponse, JudgeTransport, JudgeUsage } from "./types";
import { isRecord } from "@utils/guards";

export const LLAMA_TOP_N = 20;
export const LLAMA_CHOICE_LABELS = "ABCDEFGHIJKLMNOPQRST".split("");
export const LLAMA_NOUL_LABELS = ["Yes", "No"] as const;

export interface LlamaCompletionBody {
  prompt: string;
  n_predict: number;
  n_probs: number;
  temperature: number;
  cache_prompt: boolean;
  post_sampling_probs: boolean;
}

export type LlamaComplete = (body: LlamaCompletionBody, options: { signal?: AbortSignal }) => Promise<unknown>;

export interface LlamaLogprobOptions {
  wrap?: (prompt: string) => string;
}

export interface LlamaCandidate {
  token: string;
  p: number;
}

const optionText = (key: string, option: JudgeOption): string => {
  if (option === null) return key;
  if (typeof option === "string") return `${key}: ${option}`;
  const notFor = option.not_for ? ` Not for: ${option.not_for}.` : "";
  const examples = option.examples?.length ? ` Examples: ${option.examples.join("; ")}.` : "";
  return `${key}: ${option.what}.${notFor}${examples}`;
};

export const questionLabels = (question: JudgeQuestion): string[] | null => {
  if (question.type === "noul") return [...LLAMA_NOUL_LABELS];
  if (question.type === "score") return question.criteria.length <= 10 ? question.criteria.map((_, index) => String(index)) : null;
  const count = Object.keys(question.criteria).length;
  return count <= LLAMA_CHOICE_LABELS.length ? LLAMA_CHOICE_LABELS.slice(0, count) : null;
};

const answerBlock = (question: JudgeQuestion): string => {
  if (question.type === "noul") {
    const criteria = question.criteria ? `Answer Yes if: ${question.criteria.true}.\nAnswer No if: ${question.criteria.false}.\n` : "";
    return `${criteria}Reply with one word, Yes or No.`;
  }
  if (question.type === "score") {
    return `Levels:\n${question.criteria.map((level, index) => `${index}. ${level}`).join("\n")}\nReply with the number of one level only.`;
  }
  const lines = Object.entries(question.criteria).map(([key, option], index) => `${LLAMA_CHOICE_LABELS[index]}. ${optionText(key, option)}`);
  return `Options:\n${lines.join("\n")}\nReply with the letter of one option only.`;
};

export const buildLlamaPrompt = (state: Record<string, unknown>, question: JudgeQuestion): string =>
  `You judge a story in progress. Answer only from the state below.\n\nState:\n${JSON.stringify(state)}\n\nQuestion: ${question.instructions}\n${answerBlock(question)}\nAnswer:`;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const fromLogprob = (entry: unknown): LlamaCandidate | null => {
  if (!isRecord(entry)) return null;
  const token = typeof entry.token === "string" ? entry.token : typeof entry.tok_str === "string" ? entry.tok_str : null;
  if (token === null) return null;
  if (finite(entry.logprob)) return { token, p: Math.exp(entry.logprob) };
  if (finite(entry.prob)) return { token, p: entry.prob };
  return null;
};

export function readTopCandidates(response: unknown): LlamaCandidate[] | null {
  if (!isRecord(response) || !Array.isArray(response.completion_probabilities)) return null;
  const first: unknown = response.completion_probabilities[0];
  if (!isRecord(first)) return null;
  const list = [first.top_logprobs, first.top_probs, first.probs].find(Array.isArray) as unknown[] | undefined;
  if (!list) return null;
  return list.map(fromLogprob).filter((candidate): candidate is LlamaCandidate => candidate !== null);
}

export function labelDistribution(candidates: LlamaCandidate[], labels: string[]): Record<string, number> | null {
  const mass: Record<string, number> = Object.fromEntries(labels.map((label) => [label, 0]));
  for (const candidate of candidates) {
    const normalized = candidate.token.trim().toLowerCase();
    const label = labels.find((entry) => entry.toLowerCase() === normalized);
    if (label !== undefined) mass[label] += candidate.p;
  }
  const total = labels.reduce((sum, label) => sum + mass[label], 0);
  if (!(total > 0)) return null;
  return Object.fromEntries(labels.map((label) => [label, mass[label] / total]));
}

const argmax = (probabilities: Record<string, number>): [string, number] =>
  Object.entries(probabilities).reduce((best, entry) => (entry[1] > best[1] ? entry : best));

export function answerFromDistribution(question: JudgeQuestion, distribution: Record<string, number>): JudgeAnswer {
  if (question.type === "noul") return { type: "noul", noul: distribution.Yes };
  if (question.type === "score") {
    const probabilities = Object.fromEntries(question.criteria.map((_, index) => [String(index), distribution[String(index)]]));
    const score = question.criteria.reduce((sum, _, index) => sum + index * distribution[String(index)], 0);
    return { type: "score", score, confidence: argmax(probabilities)[1], probabilities };
  }
  const keys = Object.keys(question.criteria);
  const probabilities = Object.fromEntries(keys.map((key, index) => [key, distribution[LLAMA_CHOICE_LABELS[index]]]));
  const [choice, confidence] = argmax(probabilities);
  return { type: "choice", choice, confidence, probabilities };
}

const modelOf = (response: unknown): string | null => {
  if (!isRecord(response)) return null;
  if (typeof response.model === "string" && response.model) return response.model;
  const settings = response.generation_settings;
  return isRecord(settings) && typeof settings.model === "string" && settings.model ? settings.model : null;
};

const addUsage = (usage: Required<Pick<JudgeUsage, "input_tokens" | "output_tokens">>, response: unknown) => {
  if (!isRecord(response)) return;
  if (finite(response.tokens_evaluated)) usage.input_tokens += response.tokens_evaluated;
  if (finite(response.tokens_predicted)) usage.output_tokens += response.tokens_predicted;
};

export const llamaCompletionBody = (prompt: string): LlamaCompletionBody => ({
  prompt,
  n_predict: 1,
  n_probs: LLAMA_TOP_N,
  temperature: 0,
  cache_prompt: true,
  post_sampling_probs: false,
});

export function createLlamaLogprobTransport(complete: LlamaComplete, options: LlamaLogprobOptions = {}): JudgeTransport {
  const wrap = options.wrap ?? ((prompt: string) => prompt);
  return async (request: JudgeRequest, call): Promise<JudgeResponse> => {
    const answers: Record<string, JudgeAnswer> = {};
    const usage = { input_tokens: 0, output_tokens: 0 };
    let model: string | null = null;
    for (const [id, question] of Object.entries(request.questions)) {
      const labels = questionLabels(question);
      if (!labels) continue;
      if (call.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const response = await complete(llamaCompletionBody(wrap(buildLlamaPrompt(request.state, question))), call.signal ? { signal: call.signal } : {});
      model = model ?? modelOf(response);
      addUsage(usage, response);
      const candidates = readTopCandidates(response);
      const distribution = candidates ? labelDistribution(candidates, labels) : null;
      if (distribution) answers[id] = answerFromDistribution(question, distribution);
    }
    return { model: `llama-server:${model ?? "unknown"}`, answers, usage };
  };
}

export const createLlamaLogprobProvider = (complete: LlamaComplete, options: LlamaLogprobOptions = {}): DecisionProvider => ({
  id: "llama-logprob",
  contract: "logprob",
  ask: createLlamaLogprobTransport(complete, options),
});
