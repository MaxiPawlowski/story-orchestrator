import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { stableStringify } from "@runtime/hash";
import { callExtractionModel, type ExtractionClientOptions } from "./client";
import { getChatWindow } from "./chatWindow";
import { getCanonLite } from "./canonLite";
import { hashContract, renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { deriveScope } from "./scope";
import type { ExtraGateSource, JudgedTypedRead, ParsedFact, ScopedQuality, SharedReadAudit, SharedReadResult, SharedReadWindow, TypedJudge } from "./types";

export interface RunSharedReadOptions {
  story: NormalizedStoryV2;
  state: EngineState;
  priority: 0 | 1;
  reason: string;
  window?: SharedReadWindow;
  stabilityLag?: number;
  firedTransitions?: NormalizedTransition[];
  facts?: ParsedFact[];
  extraGateSources?: ExtraGateSource[];
  scope?: ScopedQuality[];
  openArcs?: string[];
  epistemicLedgerCapable?: boolean;
  entities?: string[];
  judgeTyped?: TypedJudge | null;
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
  const scope = options.scope ?? deriveScope(options.story, options.state.activeCheckpointId, options.state.blackboard, options.extraGateSources ?? []);
  const hinted = scope.filter((entry) => entry.quality.read_as && entry.quality.source === "extractor");
  const judged: JudgedTypedRead | null = options.judgeTyped && hinted.length
    ? await options.judgeTyped({ story: options.story, state: options.state, qualities: hinted.map((entry) => entry.quality), window }).catch(() => null)
    : null;
  const answered = new Set(judged?.answered ?? []);
  const residual = scope.filter((entry) => !answered.has(entry.key));
  const contract = {
    storyTitle: options.story.title,
    activeCheckpointId: options.state.activeCheckpointId,
    qualities: residual,
    window,
    canon: getCanonLite(options.story, options.state.visitedAnchors, options.firedTransitions ?? [], options.facts ?? []),
    openArcs: options.openArcs ?? [],
    epistemicLedgerCapable: options.epistemicLedgerCapable ?? false,
    entities: options.entities ?? [],
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
    scope: residual.map((entry) => entry.key),
    window: { from: window.from, to: window.to },
    prompt,
    rawResponse,
    acceptedDeltas: [...(judged?.deltas ?? []), ...parsed.deltas.filter((entry) => !answered.has(entry.delta.q))],
    rejected: parsed.rejected,
    ...(parsed.sceneBreak ? { sceneBreak: parsed.sceneBreak } : {}),
    ...(judged ? { judged: { keys: judged.answered, model: judged.model, confidences: judged.confidences, ...(judged.fallback ? { fallback: judged.fallback } : {}) } } : {}),
  };
  return { audit, facts: parsed.facts, memory: parsed.memory, arcs: parsed.arcs, epistemic: parsed.epistemic, ledger: parsed.ledger };
}
