import { parseSharedReadResponse, stripReasoningBlocks } from "../../../src/extraction/parse";
import { buildFixtureRun } from "../../../src/extraction/fixtureRun";
import { liveReadTiers } from "../../../src/extraction/liveTiers";
import { refusal } from "../../../src/extraction/sharedRead";
import { cleanTextCompletionReply, readFinish, readModel, readUsage, type InstructSequences } from "../../../src/services/stHost/modelReply";
import { readReasoning } from "../../../src/services/stHost/reasoningPayload";
import { isReasoningExhausted, reasoningExhaustedMessage } from "../../../src/utils/reasoningEffort";
import { parseStoryOrThrow, StoryEngine, type EngineState } from "../../../src/engine/index";
import { loadGameLayer } from "../../../src/engine/validate/gameLayer";

export { readFinish, readUsage, readModel };

const textOf = (data: unknown): string => {
  if (typeof data === "string") return data;
  const json = (data ?? {}) as Record<string, any>;
  const result = json.choices?.[0]?.text ?? json.choices?.[0]?.message?.content ?? json.content ?? json.response ?? json[0]?.content ?? "";
  return Array.isArray(result) ? result.map((part) => part?.text).filter((part) => part).join("") : result;
};

export interface BatchReply { ok: boolean; text: string; finish: "stop" | "length" | "unknown"; kind?: string; message?: string }

export function textCompletionReply(json: unknown, instruct: InstructSequences | null): BatchReply {
  const extracted = textOf(json);
  const text = cleanTextCompletionReply(typeof extracted === "string" ? extracted : String(extracted ?? ""), instruct);
  const finish = readFinish(json);
  const read = readReasoning(json);
  const meter = { effort: "default" as const, applied: false, collapsed: false, unsupported: null, budget: 0, chars: read.chars, tokens: read.tokens, observed: read.chars > 0 || (read.tokens ?? 0) > 0 };
  if (isReasoningExhausted(text, finish, meter)) return { ok: false, text: "", finish, kind: "reasoning-exhausted", message: reasoningExhaustedMessage(meter, finish) };
  const stripped = stripReasoningBlocks(text);
  if (!stripped.trim() && text.trim()) return { ok: false, text: "", finish, kind: "reasoning-exhausted", message: reasoningExhaustedMessage({ chars: text.length, tokens: null }, finish) };
  return { ok: true, text: stripped, finish };
}

export async function witnessReadStatus(spec: { story: unknown; state?: EngineState | null; activeCheckpointId?: string }, text: string, finish: "stop" | "length" | "unknown", maxTokens: number | null) {
  await loadGameLayer();
  const story = parseStoryOrThrow(spec.story);
  const engine = new StoryEngine();
  engine.loadStory(story);
  const state = { ...(spec.state ?? engine.serialize()), ...(spec.activeCheckpointId ? { activeCheckpointId: spec.activeCheckpointId } : {}) } as EngineState;
  const parsed = parseSharedReadResponse(text, story, state.blackboard.values);
  const refused = refusal({ text, finish }, parsed, maxTokens ?? undefined);
  return { refused, rejected: parsed.rejected.length, witnessLines: (parsed.witness ?? []).length };
}

export async function fixtureLive(spec: { story: unknown; transcript: unknown; overrides?: Record<string, unknown> }, text: string) {
  await loadGameLayer();
  const run = buildFixtureRun({ story: spec.story, transcript: spec.transcript, ...(spec.overrides ?? {}) } as Parameters<typeof buildFixtureRun>[0]);
  const values = ((spec.overrides as { blackboard?: { values?: Record<string, unknown> } } | undefined)?.blackboard?.values ?? {}) as Parameters<typeof parseSharedReadResponse>[2];
  const parsed = parseSharedReadResponse(text, run.story, values);
  return {
    prompt: run.prompt,
    deltas: parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v, evidence: entry.evidence })),
    ...liveReadTiers(parsed),
  };
}
