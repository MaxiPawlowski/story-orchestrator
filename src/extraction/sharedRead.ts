import { TENSION_CURRENT_KEY, type EngineState, type NormalizedStoryV2, type NormalizedTransition } from "@engine/index";
import { fnv1a, stableStringify } from "@runtime/hash";
import type { ExtractionReply, ModelAsk, ModelCall } from "./modelRoute";
import { getCanonLite } from "./canonLite";
import { hashContract, PLAYER_MARK, readContext, renderSharedReadPrompt } from "./contract";
import type { ParsedMemoryLine } from "@memory/index";
import { detectDegenerate } from "./degenerate";
import { evidenceSources } from "./evidence";
import { parseSharedReadResponse } from "./parse";
import { inputBudget, tailFit, type TokenCounter } from "./inputBudget";
import { maxTokensCap } from "./callBudget";
import { deriveScope } from "./scope";
import type { RequestBudget } from "./tokenMeter";
import type {
  ChatMessageWindowEntry, ChatWindowReader, ExtraGateSource, JudgedTypedRead, ParsedDelta, ParsedFact, ParsedSharedRead, ReadBudgetRecord, ScopedQuality,
  SharedReadAudit, SharedReadContract, SharedReadResult, SharedReadWindow, TypedJudge,
} from "./types";

// A response is a bounded answer to a bounded question. Past either bound the
// whole read is refused rather than partly believed: the lines that survived a truncation are not
// more trustworthy than the ones that did not.
export const MAX_DELTAS_PER_READ = 24;

const CHARS_PER_TOKEN = 4;
const DEFAULT_RESPONSE_TOKENS = maxTokensCap("sharedRead");

export const PLAYER_ONLY_EVIDENCE = "evidence only in the player's line";

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
const screenDeltas = (parsed: ParsedSharedRead, residual: readonly ScopedQuality[], answered: Set<string>, window: SharedReadWindow) => {
  const byKey = new Map(residual.map((entry) => [entry.key, entry.quality]));
  const accepted: ParsedDelta[] = [];
  const rejected: Array<{ line: string; reason: string }> = [];
  for (const entry of parsed.deltas) {
    if (answered.has(entry.delta.q)) continue;
    const line = entry.line ?? describeDelta(entry);
    const quality = byKey.get(entry.delta.q);
    if (!quality) {
      rejected.push({ line, reason: "outside requested scope" });
      continue;
    }
    const sources = evidenceSources(entry.evidence, window.messages);
    if (!sources.length) {
      rejected.push({ line, reason: "evidence not in window" });
      continue;
    }
    const worldSources = sources.filter((id) => window.messages.some((message) => message.messageId === id && !message.isUser));
    if (quality.evidence_from === "world" && !worldSources.length) {
      rejected.push({ line, reason: PLAYER_ONLY_EVIDENCE });
      continue;
    }
    const attributable = quality.evidence_from === "world" ? worldSources : sources;
    accepted.push({ ...entry, messageId: entry.delta.q === TENSION_CURRENT_KEY ? attributable[attributable.length - 1] : attributable[0] });
  }
  return { accepted, rejected };
};

const attributed = <T extends { evidence: string; messageId?: number }>(line: T, window: SharedReadWindow): T => {
  const [first] = evidenceSources(line.evidence, window.messages);
  return first === undefined ? line : { ...line, messageId: first };
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
  deltasOnly?: boolean;
  model: ModelCall;
  ask: ModelAsk;
  readWindow?: ChatWindowReader;
}

const createId = (parts: unknown) => fnv1a(stableStringify(parts));

const noReader: ChatWindowReader = () => { throw new Error("a shared read needs a window or a chat reader"); };

export function sharedReadWindow(options: Pick<RunSharedReadOptions, "state" | "priority" | "window" | "stabilityLag" | "readWindow">): SharedReadWindow {
  const latestMessageId = options.state.lastMessageId - (options.priority === 1 ? Math.max(0, options.stabilityLag ?? 1) : 0);
  return options.window ?? (options.readWindow ?? noReader)(Math.max(0, latestMessageId - 7), latestMessageId);
}

const scopeOf = (options: RunSharedReadOptions): ScopedQuality[] =>
  options.scope ?? deriveScope(options.story, options.state.activeCheckpointId, options.state.blackboard, options.extraGateSources ?? []);

const readContract = (options: RunSharedReadOptions, window: SharedReadWindow, qualities: ScopedQuality[]): SharedReadContract => ({
  storyTitle: options.story.title,
  activeCheckpointId: options.state.activeCheckpointId,
  qualities,
  window,
  canon: getCanonLite(options.story, options.state.visitedAnchors, options.firedTransitions ?? [], options.facts ?? []),
  openArcs: options.openArcs ?? [],
  epistemicLedgerCapable: options.epistemicLedgerCapable ?? false,
  entities: options.entities ?? [],
  ...readContext(options.story, options.state.activeCheckpointId),
  ...(options.deltasOnly ? { deltasOnly: true } : {}),
});

export function rosterCharacterId(roster: NormalizedStoryV2["roster"], raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  return (roster.find((member) => member.id.toLowerCase() === value) ?? roster.find((member) => member.name?.trim().toLowerCase() === value))?.id;
}

const castMemory = (line: ParsedMemoryLine, roster: NormalizedStoryV2["roster"]): ParsedMemoryLine => {
  const { characterId, ...rest } = line;
  const id = rosterCharacterId(roster, characterId);
  return id ? { ...rest, characterId: id } : rest;
};

export const sharedReadOverhead = (options: RunSharedReadOptions): string =>
  renderSharedReadPrompt(readContract(options, { from: 0, to: -1, messages: [] }, scopeOf(options)));

export const transcriptPrefixCost = (messages: readonly ChatMessageWindowEntry[], count: TokenCounter): number =>
  messages.reduce((top, message) => Math.max(top, count(`[${message.index}] ${message.speaker}${message.isUser ? PLAYER_MARK : ""}: \n`)), 0);

interface FittedRead {
  window: SharedReadWindow;
  record: ReadBudgetRecord | null;
  trimmedFrom: number | null;
  truncated: number[];
}

// A DELTA read is never split: a window over budget keeps its newest messages and
// says where it was cut, so a delta quoting a trimmed message is refused as "evidence not in window".
export async function fitReadWindow(window: SharedReadWindow, overheadPrompt: string, budget: RequestBudget | undefined, maxTokens: number): Promise<FittedRead> {
  if (!budget) return { window, record: null, trimmedFrom: null, truncated: [] };
  const limits = inputBudget(budget.contextLimit, maxTokens);
  const { meter } = budget;
  await meter.prime([overheadPrompt, ...window.messages.map((message) => message.text)]);
  const promptOverhead = meter.count(overheadPrompt);
  const perMessage = transcriptPrefixCost(window.messages, meter.count);
  const fit = tailFit(window, { budget: limits.input, promptOverhead, count: meter.count, perMessage });
  const base = { contextLimit: budget.contextLimit, inputBudget: limits.input, maxTokens: limits.maxTokens };
  if (!fit.ok) {
    const tokens = window.messages.reduce((sum, message) => sum + meter.count(message.text) + perMessage, promptOverhead);
    return { window, record: { ...base, tokens, overBudget: fit.reason }, trimmedFrom: null, truncated: [] };
  }
  return {
    window: { from: fit.from, to: fit.to, messages: fit.messages, ...(window.form ? { form: window.form } : {}) },
    record: { ...base, tokens: promptOverhead + fit.tokens },
    trimmedFrom: fit.trimmedFrom,
    truncated: fit.truncated,
  };
}

export async function runSharedRead(options: RunSharedReadOptions): Promise<SharedReadResult> {
  const scope = scopeOf(options);
  const fitted = await fitReadWindow(sharedReadWindow(options), sharedReadOverhead(options), options.ask.budget, options.ask.maxTokens ?? DEFAULT_RESPONSE_TOKENS);
  const { window } = fitted;
  const hinted = scope.filter((entry) => entry.quality.read_as && entry.quality.source === "extractor");
  // A judge that threw used to leave no trace, so its audit read exactly like one where the
  // judge was never asked. The read still falls back to the LLM; the audit says why.
  const failure: { message?: string } = {};
  const judged: JudgedTypedRead | null = options.judgeTyped && hinted.length
    ? await options.judgeTyped({
      story: options.story,
      state: options.state,
      qualities: hinted.map((entry) => entry.quality),
      window,
    }).catch((error: unknown) => { failure.message = error instanceof Error ? error.message : String(error); return null; })
    : null;
  const answered = new Set(judged?.answered ?? []);
  const residual = scope.filter((entry) => !answered.has(entry.key));
  const contract = readContract(options, window, residual);
  const prompt = renderSharedReadPrompt(contract);
  const ask = (maxTokens: number): Promise<ExtractionReply> => (scope.length
    ? options.model(prompt, { ...options.ask, maxTokens })
    : Promise.resolve({ text: "NO_DELTA", finish: "stop" }));
  let responseTokens = options.ask.maxTokens ?? DEFAULT_RESPONSE_TOKENS;
  let reply = await ask(responseTokens);
  let parsed = parseSharedReadResponse(reply.text, options.story);
  if (refusal(reply, parsed, responseTokens)) {
    const larger = Math.max(responseTokens * 2, 1024);
    const fits = !fitted.record || fitted.record.tokens <= inputBudget(fitted.record.contextLimit, larger).input;
    if (reply.finish === "length" && fits) responseTokens = larger;
    reply = await ask(responseTokens);
    parsed = parseSharedReadResponse(reply.text, options.story);
  }
  const rawResponse = reply.text;
  const refused = refusal(reply, parsed, responseTokens);
  const screened = refused ? { accepted: [], rejected: [{ line: rawResponse.slice(0, 500), reason: refused }] } : screenDeltas(parsed, residual, answered, window);
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
    ...(fitted.record ? { budget: { ...fitted.record, maxTokens: responseTokens } } : {}),
    ...(fitted.trimmedFrom !== null ? { trimmedFrom: fitted.trimmedFrom } : {}),
    ...(fitted.truncated.length ? { truncated: fitted.truncated } : {}),
    ...(window.form ? { windowForm: window.form } : {}),
  };
  // A refused response is refused whole: the lines that survived a truncation are not more
  // trustworthy than the ones that did not, and the fact/memory/arc lines have no bound of their own.
  if (refused) return { audit, facts: [], memory: [], arcs: [], epistemic: [], ledger: [] };
  return {
    audit,
    facts: parsed.facts.map((fact) => attributed(fact, window)),
    memory: parsed.memory.map((line) => attributed(castMemory(line, options.story.roster), window)),
    arcs: parsed.arcs,
    epistemic: parsed.epistemic,
    ledger: parsed.ledger,
  };
}
