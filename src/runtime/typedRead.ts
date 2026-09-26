import type { ParsedDelta, TypedJudge } from "@extraction/types";
import { buildTypedPlan, readTypedDeltas, TYPED_TIMEOUT_MS } from "@judge/index";
import type { JudgeRuntime } from "./judge";

// The judged typed read shared by the cadence read (inside runSharedRead) and the
// every-boundary read. Null means "not asked": the flag is off, nothing is hinted, or no answer came.
export const createTypedJudge = (getJudge: () => JudgeRuntime | null): TypedJudge => async ({ story, state, qualities, window }) => {
  const judge = getJudge();
  const checkpoint = story.checkpointById[state.activeCheckpointId];
  if (!judge?.active("typedExtraction") || !checkpoint) return null;
  const messages = window.messages.map((message) => ({ id: message.index, speaker: message.speaker, text: message.text, isUser: message.isUser }));
  const plan = buildTypedPlan(qualities, messages, { title: story.title, checkpointName: checkpoint.name, objective: checkpoint.objective });
  if (!plan) return null;
  const result = await judge.ask("typed", plan.request, { timeoutMs: TYPED_TIMEOUT_MS });
  if (!result.answers) return { deltas: [], answered: [], model: result.model, confidences: {}, ...(result.fallback ? { fallback: result.fallback } : {}) };
  const read = readTypedDeltas(result.answers, plan, qualities, messages);
  const deltas: ParsedDelta[] = read.deltas.map((delta) => ({
    delta: { q: delta.q, v: delta.v, source: "extractor" },
    evidence: delta.evidence,
    judge: delta.confidence,
    ...(delta.messageId !== undefined ? { messageId: delta.messageId } : {})
  }));
  return { deltas, answered: read.answered, model: result.model, confidences: Object.fromEntries(read.deltas.map((delta) => [delta.q, delta.confidence])) };
};
