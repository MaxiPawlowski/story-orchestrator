import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { stableStringify } from "@runtime/hash";
import { callExtractionReply, type ExtractionClientOptions, type ExtractionReply } from "./client";
import { getChatWindow } from "./chatWindow";
import { getCanonLite } from "./canonLite";
import { hashContract, renderSharedReadPrompt } from "./contract";
import { detectDegenerate } from "./degenerate";
import { evidenceInWindow } from "./evidence";
import { parseSharedReadResponse } from "./parse";
import { deriveScope } from "./scope";
import type { ExtraGateSource, JudgedTypedRead, ParsedDelta, ParsedFact, ParsedSharedRead, ScopedQuality, SharedReadAudit, SharedReadResult, SharedReadWindow, TypedJudge } from "./types";

// v2.3 plan 02 (R6). A response is a bounded answer to a bounded question. Past either bound the
// whole read is refused rather than partly believed: the lines that survived a truncation are not
// more trustworthy than the ones that did not.
export const MAX_DELTAS_PER_READ = 24;

const CHARS_PER_TOKEN = 4;
const DEFAULT_RESPONSE_TOKENS = 512;

const describeDelta = (entry: ParsedDelta) => `DELTA ${entry.delta.q} value=${String(entry.delta.v)} evidence="${entry.evidence}"`;

const refusal = (reply: ExtractionReply, parsed: ParsedSharedRead, maxTokens?: number): string | null => {
  if (reply.finish === "length") return "truncated response";
  if (parsed.deltas.length > MAX_DELTAS_PER_READ) return "oversized response";
  if (reply.finish === "unknown" && reply.text.length > (maxTokens ?? DEFAULT_RESPONSE_TOKENS) * CHARS_PER_TOKEN) return "oversized response";
  if (detectDegenerate(reply.text).degenerate) return "degenerate response";
  return null;
};

/**
 * Which of the parsed deltas this read may keep.
 *
 * The prompt asks about a residual; the model can answer about anything. An answer to a question
 * nobody asked is not an answer, and accepting it made the prompt's scope advisory — a delta for a
 * quality outside the request landed in the apply queue because it parsed and the judge had not
 * settled it. Evidence is checked for the same reason: a quote that is not in the window the read
 * was given is a claim about a transcript the read never saw.
 */
const screenDeltas = (parsed: ParsedSharedRead, residualKeys: Set<string>, answered: Set<string>, window: SharedReadWindow) => {
  const texts = window.messages.map((message) => message.text);
  const accepted: ParsedDelta[] = [];
  const rejected: Array<{ line: string; reason: string }> = [];
  for (const entry of parsed.deltas) {
    if (answered.has(entry.delta.q)) continue;
    const line = entry.line ?? describeDelta(entry);
    if (!residualKeys.has(entry.delta.q)) {
      rejected.push({ line, reason: "outside requested scope" });
      continue;
    }
    if (!evidenceInWindow(entry.evidence, texts)) {
      rejected.push({ line, reason: "evidence not in window" });
      continue;
    }
    accepted.push(entry);
  }
  return { accepted, rejected };
};

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

export function sharedReadWindow(options: Pick<RunSharedReadOptions, "state" | "priority" | "window" | "stabilityLag">): SharedReadWindow {
  const latestMessageId = options.state.lastMessageId - (options.priority === 1 ? Math.max(0, options.stabilityLag ?? 1) : 0);
  return options.window ?? getChatWindow(Math.max(0, latestMessageId - 7), latestMessageId);
}

export async function runSharedRead(options: RunSharedReadOptions): Promise<SharedReadResult> {
  const window = sharedReadWindow(options);
  const scope = options.scope ?? deriveScope(options.story, options.state.activeCheckpointId, options.state.blackboard, options.extraGateSources ?? []);
  const hinted = scope.filter((entry) => entry.quality.read_as && entry.quality.source === "extractor");
  // V18: a judge that threw used to leave no trace, so its audit read exactly like one where the
  // judge was never asked. The read still falls back to the LLM; the audit says why.
  const failure: { message?: string } = {};
  const judged: JudgedTypedRead | null = options.judgeTyped && hinted.length
    ? await options.judgeTyped({ story: options.story, state: options.state, qualities: hinted.map((entry) => entry.quality), window }).catch((error: unknown) => { failure.message = error instanceof Error ? error.message : String(error); return null; })
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
  const ask = (): Promise<ExtractionReply> => (scope.length ? callExtractionReply(prompt, options.client) : Promise.resolve({ text: "NO_DELTA", finish: "stop" }));
  let reply = await ask();
  let parsed = parseSharedReadResponse(reply.text, options.story);
  if (refusal(reply, parsed, options.client.maxTokens)) {
    reply = await ask();
    parsed = parseSharedReadResponse(reply.text, options.story);
  }
  const rawResponse = reply.text;
  const refused = refusal(reply, parsed, options.client.maxTokens);
  const screened = refused ? { accepted: [], rejected: [{ line: rawResponse.slice(0, 500), reason: refused }] } : screenDeltas(parsed, new Set(residual.map((entry) => entry.key)), answered, window);
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
    acceptedDeltas: [...(judged?.deltas ?? []), ...screened.accepted],
    rejected: [...parsed.rejected, ...screened.rejected],
    ...(parsed.sceneBreak ? { sceneBreak: parsed.sceneBreak } : {}),
    ...(judged ? { judged: { keys: judged.answered, model: judged.model, confidences: judged.confidences, ...(judged.fallback ? { fallback: judged.fallback } : {}) } } : {}),
    ...(failure.message !== undefined ? { judged: { keys: [], model: null, confidences: {}, fallback: "error", error: failure.message } } : {}),
  };
  // A refused response is refused whole: the lines that survived a truncation are not more
  // trustworthy than the ones that did not, and the fact/memory/arc lines have no bound of their own.
  if (refused) return { audit, facts: [], memory: [], arcs: [], epistemic: [], ledger: [] };
  return { audit, facts: parsed.facts, memory: parsed.memory, arcs: parsed.arcs, epistemic: parsed.epistemic, ledger: parsed.ledger };
}
