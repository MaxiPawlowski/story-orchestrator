import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { stableStringify } from "@runtime/hash";
import { callExtractionModel, type ExtractionClientOptions } from "./client";
import { getChatWindow } from "./chatWindow";
import { getCanonLite } from "./canonLite";
import { hashContract, renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { deriveScope } from "./scope";
import type { ParsedFact, SharedReadAudit, SharedReadResult, SharedReadWindow } from "./types";

export interface RunSharedReadOptions {
  story: NormalizedStoryV2;
  state: EngineState;
  priority: 0 | 1;
  reason: string;
  window?: SharedReadWindow;
  stabilityLag?: number;
  firedTransitions?: NormalizedTransition[];
  facts?: ParsedFact[];
  client: ExtractionClientOptions;
}

const createId = (parts: unknown) => {
  let hash = 2166136261;
  const text = stableStringify(parts);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export async function runSharedRead(options: RunSharedReadOptions): Promise<SharedReadResult> {
  const latestMessageId = options.state.lastMessageId - (options.priority === 1 ? Math.max(0, options.stabilityLag ?? 1) : 0);
  const window = options.window ?? getChatWindow(Math.max(0, latestMessageId - 7), latestMessageId);
  const scope = deriveScope(options.story, options.state.activeCheckpointId, options.state.blackboard);
  const contract = {
    storyTitle: options.story.title,
    activeCheckpointId: options.state.activeCheckpointId,
    qualities: scope,
    window,
    canon: getCanonLite(options.story, options.state.visitedAnchors, options.firedTransitions ?? [], options.facts ?? []),
  };
  const prompt = renderSharedReadPrompt(contract);
  const rawResponse = scope.length ? await callExtractionModel(prompt, options.client) : "NO_DELTA";
  const parsed = parseSharedReadResponse(rawResponse, options.story);
  const audit: SharedReadAudit = {
    id: createId({ prompt, rawResponse, at: Date.now() }),
    createdAt: new Date().toISOString(),
    priority: options.priority,
    reason: options.reason,
    contractHash: hashContract(contract),
    scope: scope.map((entry) => entry.key),
    window: { from: window.from, to: window.to },
    prompt,
    rawResponse,
    acceptedDeltas: parsed.deltas,
    rejected: parsed.rejected,
  };
  return { audit, facts: parsed.facts };
}
