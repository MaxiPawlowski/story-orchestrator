export type ChoiceCandidate = { messageId: number; text: string };
export type ChoiceQuestion = { id: string; query: string; candidates: ChoiceCandidate[] };
export type JudgeAnswer = {
  answers: Record<string, { type?: string; choice?: string; confidence?: number }> | null;
  latencyMs: number;
  usage?: { input_tokens?: number };
  fallback?: string;
  model?: string | null;
  cached?: boolean;
};
export type RecordedCall = { pick: number | null; latencyMs: number; inputTokens: number; model: string | null; fallback: string | null; confidence: number | null; options: number };
export type ChoiceKit = {
  E0_CHOICE_CALLS: number;
  E0_CHOICE_KEY: string;
  e0ChoiceRequest(query: string, remaining: ChoiceCandidate[]): unknown;
  e0ChoicePick(choice: string | null | undefined): number | null;
};

export const BUSY_RETRIES = 3;
export const BUSY_WAIT_MS = 61_000;

export class ChoiceRunRefused extends Error {}

export async function recordQuestion(question: ChoiceQuestion, ask: (request: unknown) => Promise<JudgeAnswer>, kit: ChoiceKit, wait: (ms: number) => Promise<void>): Promise<RecordedCall[]> {
  const remaining = [...question.candidates];
  const calls: RecordedCall[] = [];
  while (calls.length < kit.E0_CHOICE_CALLS) {
    let answer: JudgeAnswer | null = null;
    for (let attempt = 0; attempt <= BUSY_RETRIES; attempt += 1) {
      answer = await ask(kit.e0ChoiceRequest(question.query, remaining));
      if (answer.fallback !== 'busy') break;
      if (attempt === BUSY_RETRIES) throw new ChoiceRunRefused(`${question.id}: the plugin's rate limiter refused call ${calls.length + 1} ${BUSY_RETRIES + 1} times; a refused call is no measurement`);
      await wait(BUSY_WAIT_MS);
    }
    if (!answer) throw new ChoiceRunRefused(`${question.id}: no answer`);
    if (answer.cached) throw new ChoiceRunRefused(`${question.id}: call ${calls.length + 1} was a cache hit; a cached call has no latency`);
    const picked = answer.answers?.[kit.E0_CHOICE_KEY];
    const pick = kit.e0ChoicePick(picked?.choice);
    calls.push({
      pick,
      latencyMs: answer.latencyMs,
      inputTokens: answer.usage?.input_tokens ?? 0,
      model: answer.model ?? null,
      fallback: answer.fallback ?? null,
      confidence: typeof picked?.confidence === 'number' ? picked.confidence : null,
      options: remaining.length,
    });
    const at = remaining.findIndex((candidate) => candidate.messageId === pick);
    if (at >= 0) remaining.splice(at, 1);
  }
  return calls;
}

export async function recordChoices(
  questions: readonly ChoiceQuestion[],
  ask: (request: unknown) => Promise<JudgeAnswer>,
  kit: ChoiceKit,
  { done = {}, save = async () => undefined, wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) }: { done?: Record<string, RecordedCall[]>; save?: (calls: Record<string, RecordedCall[]>) => Promise<void>; wait?: (ms: number) => Promise<void> } = {},
): Promise<Record<string, RecordedCall[]>> {
  const calls: Record<string, RecordedCall[]> = { ...done };
  for (const question of questions) {
    if ((calls[question.id]?.length ?? 0) >= kit.E0_CHOICE_CALLS) continue;
    calls[question.id] = await recordQuestion(question, ask, kit, wait);
    await save(calls);
  }
  return calls;
}

export function choiceSummary(calls: Record<string, RecordedCall[]>) {
  const all = Object.values(calls).flat();
  return {
    questions: Object.keys(calls).length,
    calls: all.length,
    fallbacks: all.filter((call) => call.fallback).length,
    noPick: all.filter((call) => call.pick === null).length,
    missingTokens: all.filter((call) => call.inputTokens === 0).length,
    models: [...new Set(all.map((call) => call.model ?? 'none'))].sort(),
    inputTokens: all.reduce((sum, call) => sum + call.inputTokens, 0),
  };
}
