import { runSharedRead } from "@extraction/sharedRead";
import type { ModelCall } from "@extraction/modelRoute";
import type { ReadPromptOptions } from "@extraction/types";
import type { RequestBudget } from "@extraction/tokenMeter";
import { windowOf } from "@extraction/chatRows";
import { parseStoryOrThrow, StoryEngine } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { applyReadLines, seedPromises, seededRefs, type PromiseReadOutcome, type PromiseSeed } from "@memory/promises/readCase";
import type { OpenPromiseRef } from "@memory/promises/types";
import { namesForRosterId } from "./roster";

export interface PromiseReadSpec {
  story: unknown;
  chat: Array<{ name: string; mes: string; is_user?: boolean; is_system?: boolean }>;
  from: number;
  to: number;
  playerName: string;
  chatId?: string;
  seed?: PromiseSeed[];
  promises?: boolean;
  debugResponse?: string;
}

export interface PromiseReadResult extends PromiseReadOutcome {
  prompt: string;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  window: { from: number; to: number };
  promiseSection: boolean;
  promiseLines: string[];
  openPromises: OpenPromiseRef[];
  seeded: Record<string, string>;
  seedRefused: Array<{ key: string; reason: string }>;
  calls: Array<{ finish: string; ms: number; model: string | null }>;
}

export interface PromiseReadDeps {
  model: ModelCall;
  budget: () => RequestBudget;
  readPrompt?: ReadPromptOptions;
}

export async function runPromiseReadCase(spec: PromiseReadSpec, { model, budget: budgetFor, readPrompt }: PromiseReadDeps): Promise<PromiseReadResult> {
  await loadGameLayer();
  const story = parseStoryOrThrow(spec.story);
  const engine = new StoryEngine();
  engine.loadStory(story);
  const chatId = spec.chatId ?? "p47-suite";
  const cast = story.roster.map((member) => ({ id: member.id, names: namesForRosterId(story, member.id) }));
  const ctx = { chatId, storyId: story.id, messages: windowOf(spec.chat, 0, spec.to).messages, cast, playerNames: [spec.playerName].filter(Boolean) };
  const seeded = seedPromises(spec.seed ?? [], ctx);
  const on = spec.promises !== false;
  const openPromises = on ? seededRefs(seeded, cast) : [];
  const calls: PromiseReadResult["calls"] = [];
  const tracked: ModelCall = async (prompt, ask) => {
    const started = performance.now();
    const reply = await model(prompt, ask);
    calls.push({ finish: reply.finish, ms: performance.now() - started, model: reply.model ?? null });
    return reply;
  };
  const budget = budgetFor();
  const { audit } = await runSharedRead({
    story, state: engine.serialize(), priority: 0, reason: "p47-suite", window: windowOf(spec.chat, spec.from, spec.to), openPromises: on ? openPromises : null,
    ...(readPrompt ? { readPrompt } : {}),
    model: tracked, ask: { role: "read", pass: "read", budget, ...(spec.debugResponse !== undefined ? { debugResponse: spec.debugResponse } : {}) },
  });
  const promiseLines = audit.promiseLines ?? [];
  await budget.meter.prime([audit.prompt, audit.rawResponse]);
  return {
    prompt: audit.prompt, rawResponse: audit.rawResponse, inputTokens: budget.meter.count(audit.prompt), outputTokens: budget.meter.count(audit.rawResponse),
    window: audit.window, promiseSection: on, promiseLines, openPromises, seeded: seeded.ids, seedRefused: seeded.refused, calls,
    ...applyReadLines(seeded.state, promiseLines, ctx, audit.window, seeded.ids),
  };
}
