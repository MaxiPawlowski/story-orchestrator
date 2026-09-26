import { maxTokensCap, maxTokensFor } from "@extraction/callBudget";
import { chunkMessages } from "@extraction/chunker";
import { inputBudget, tailFit, type BudgetMessage, type FitOptions } from "@extraction/inputBudget";
import type { RequestBudget } from "@extraction/tokenMeter";
import { buildSceneReducePrompt, buildSceneSummaryPrompt, buildShortTermSummaryPrompt } from "./contract";
import type { DerivedRecord } from "./derived";

export const REDUCE_DEPTH_LIMIT = 4;

export interface SpokenMessage {
  messageId: number;
  speaker: string;
  text: string;
}

export interface SceneSummaryRun {
  messages: readonly SpokenMessage[];
  budget: RequestBudget;
  stillOwns: () => boolean;
  summarize: (prompt: string, maxTokens: number) => Promise<string>;
}

export interface SceneSummaryOutcome {
  summary: string;
  requests: number;
  chunks: number;
}

const spoken = (messages: readonly SpokenMessage[]): BudgetMessage[] =>
  messages.map((message) => ({ messageId: message.messageId, text: `${message.speaker}: ${message.text}` }));

const joined = (messages: readonly BudgetMessage[]) => messages.map((message) => message.text).join("\n");

const fitOptions = async (budget: RequestBudget, input: number, overheadPrompt: string, parts: readonly BudgetMessage[]): Promise<FitOptions> => {
  await budget.meter.prime([overheadPrompt, ...parts.map((part) => part.text)]);
  return { budget: input, promptOverhead: budget.meter.count(overheadPrompt), count: budget.meter.count, perMessage: 1 };
};

const windowOf = (parts: BudgetMessage[]) => ({ from: parts[0]?.messageId ?? 0, to: parts[parts.length - 1]?.messageId ?? 0, messages: parts });

export function sceneRangeFrom(derived: readonly DerivedRecord[], to: number, storyStart: number): number {
  const ends = derived.flatMap((record) => (record.kind === "scene_summary" && record.range ? [record.range.to + 1] : []));
  return Math.max(0, Math.min(Math.max(storyStart, ...ends), to));
}

// v2.4 plan 03 D5. A scene is summarized whole: map each chunk that fits, then reduce the chunk
// summaries (again, if they do not fit either). Chunk summaries are intermediates and are never
// returned. A refused chunk yields no summary rather than one that silently skips part of the scene.
export async function summarizeScene(run: SceneSummaryRun): Promise<SceneSummaryOutcome | null> {
  const { input } = inputBudget(run.budget.contextLimit, maxTokensCap("sceneSummary"));
  let parts = spoken(run.messages);
  let prompt = buildSceneSummaryPrompt;
  let requests = 0;
  let chunks = 0;
  for (let depth = 0; ; depth += 1) {
    const options = await fitOptions(run.budget, input, prompt(""), parts);
    const plan = chunkMessages(parts, options);
    if (depth === 0) chunks = plan.ok ? Math.max(1, plan.windows.length) : 1;
    if (!plan.ok || plan.windows.length <= 1 || depth >= REDUCE_DEPTH_LIMIT) {
      const fit = tailFit(windowOf(parts), options);
      const kept = fit.ok ? fit.messages : parts;
      if (!run.stillOwns()) return null;
      requests += 1;
      const summary = await run.summarize(prompt(joined(kept) || "(empty)"), maxTokensFor("sceneSummary", fit.ok ? fit.tokens : 0));
      return { summary, requests, chunks };
    }
    const next: BudgetMessage[] = [];
    for (const window of plan.windows) {
      if (!run.stillOwns()) return null;
      requests += 1;
      const part = await run.summarize(prompt(joined(window.messages)), maxTokensFor("sceneSummary", window.tokens));
      if (!part) return { summary: "", requests, chunks };
      next.push({ messageId: next.length, text: `Part ${next.length + 1}: ${part}` });
    }
    parts = next;
    prompt = buildSceneReducePrompt;
  }
}

export interface ShortTermFit {
  from: number;
  to: number;
  text: string;
  tokens: number;
  trimmedFrom: number | null;
}

export async function fitShortTerm(messages: readonly SpokenMessage[], previous: string | null, budget: RequestBudget): Promise<ShortTermFit> {
  const { input } = inputBudget(budget.contextLimit, maxTokensCap("shortTerm"));
  const parts = spoken(messages);
  const options = await fitOptions(budget, input, buildShortTermSummaryPrompt(previous, ""), parts);
  const window = windowOf(parts);
  const fit = tailFit(window, options);
  if (!fit.ok) return { from: window.from, to: window.to, text: joined(parts), tokens: parts.reduce((sum, part) => sum + options.count(part.text) + 1, 0), trimmedFrom: null };
  return { from: fit.from, to: fit.to, text: joined(fit.messages), tokens: fit.tokens, trimmedFrom: fit.trimmedFrom };
}
