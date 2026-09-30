import {
  askJudge, createJudgeGate, modelVerdict, buildDirectorRequest, decideDirector, directorJudgeEligible,
  directorRecordP, judgeRoute, judgeUseActive, DEFAULT_JUDGE_PROVIDER, DIRECTOR_TIMEOUT_MS, type JudgeAnswer, type JudgeCallRecord,
  type JudgeDirectorDecision, type JudgeDirectorInput, type JudgeFallback, type JudgeGate, type JudgeProviderId, type JudgeRequest, type JudgeResponse,
  type JudgeResult, type JudgeSettings, type JudgeTransport, type JudgeUseKey,
} from "@judge/index";
import type { RunOwnership } from "./runToken";

export interface JudgeStatusLike {
  configured: boolean;
  maxInFlight?: number | null;
  providers?: Partial<Record<string, { configured: boolean }>>;
}

export interface JudgeRuntimeDeps {
  getSettings(): JudgeSettings;
  transport: JudgeTransport;
  providers?: Partial<Record<JudgeProviderId, JudgeTransport>>;
  status(): Promise<JudgeStatusLike | null>;
  record(record: JudgeCallRecord): void;
  context(): { boundary: number; messageId: number };
  // Optional: a caller that supplies none keeps today behaviour.
  ownership: RunOwnership;
  now?: () => number;
  gate?: JudgeGate;
}

export interface JudgeAskOptions {
  timeoutMs?: number;
  summarize?: (answers: Record<string, JudgeAnswer> | null) => Record<string, number | string>;
}

export const JUDGE_STATUS_TTL_MS = 60_000;
export const JUDGE_PROBE_TIMEOUT_MS = 5000;

// Owns nothing persisted: the call ring lives in extras.judge and is written through `record`.
// Every call is recorded — a fallback included — so a threshold can be re-tuned from the ring.
export class JudgeRuntime {
  private readonly cache = new Map<string, JudgeResponse>();
  private readonly unbilled = new Map<string | null, JudgeCallRecord[]>();
  private readonly providerCaches = new Map<JudgeProviderId, Map<string, JudgeResponse>>();
  private availability: { key: string; at: number; status: JudgeStatusLike | null } | null = null;
  private readonly gate: JudgeGate;

  constructor(private readonly deps: JudgeRuntimeDeps) {
    this.gate = deps.gate ?? createJudgeGate();
  }

  enabled(): boolean {
    return this.deps.getSettings().enabled;
  }

  active(use: JudgeUseKey): boolean {
    return judgeUseActive(this.deps.getSettings(), use);
  }

  // variants are their own opt-in (count > 1), still behind the master switch.
  expansionSettings(): JudgeSettings["expansion"] | null {
    const settings = this.deps.getSettings();
    return settings.enabled ? settings.expansion : null;
  }

  invalidateStatus() {
    this.availability = null;
  }

  private async currentStatus(): Promise<JudgeStatusLike | null> {
    const settings = this.deps.getSettings();
    const key = `${settings.enabled}:${settings.model}`;
    const now = (this.deps.now ?? Date.now)();
    if (this.availability && this.availability.key === key && now - this.availability.at < JUDGE_STATUS_TTL_MS) return this.availability.status;
    const status = await this.deps.status();
    if (typeof status?.maxInFlight === "number") this.gate.setCapacity(status.maxInFlight);
    this.availability = { key, at: now, status };
    return status;
  }

  private async available(provider: JudgeProviderId): Promise<boolean> {
    const status = await this.currentStatus();
    if (provider === DEFAULT_JUDGE_PROVIDER) return Boolean(status?.configured);
    return Boolean(this.deps.providers?.[provider]) && status?.providers?.[provider]?.configured === true;
  }

  private transportFor(provider: JudgeProviderId): JudgeTransport {
    return provider === DEFAULT_JUDGE_PROVIDER ? this.deps.transport : this.deps.providers?.[provider] ?? this.deps.transport;
  }

  private cacheFor(provider: JudgeProviderId): Map<string, JudgeResponse> {
    if (provider === DEFAULT_JUDGE_PROVIDER) return this.cache;
    const existing = this.providerCaches.get(provider);
    if (existing) return existing;
    const created = new Map<string, JudgeResponse>();
    this.providerCaches.set(provider, created);
    return created;
  }

  // For the settings self-test: works before the judge is switched on, and records nothing in a chat.
  // Calibration may name a model without mutating install settings — the exact run says which model
  // it asked for, and JudgeResult says which model actually answered.
  probe(request: JudgeRequest, model = this.deps.getSettings().model, provider: JudgeProviderId = DEFAULT_JUDGE_PROVIDER): Promise<JudgeResult> {
    const settings = this.deps.getSettings();
    const outgoing = provider === DEFAULT_JUDGE_PROVIDER ? { ...request, model } : request;
    return askJudge(this.transportFor(provider), outgoing, { timeoutMs: Math.max(settings.timeoutMs, JUDGE_PROBE_TIMEOUT_MS), gate: this.gate });
  }

  // So-judge reads the verdict here, so the harness and the page share one map.
  modelVerdict(requested: string | null | undefined, answered: string | null | undefined) {
    return modelVerdict(requested ?? this.deps.getSettings().model, answered);
  }

  private fallbackRecord(use: string, fallback: JudgeFallback, request: JudgeRequest | undefined, context: { boundary: number; messageId: number }): JudgeCallRecord {
    return {
      at: new Date((this.deps.now ?? Date.now)()).toISOString(),
      boundary: context.boundary,
      messageId: context.messageId,
      use,
      model: null,
      latencyMs: 0,
      stateChars: request ? JSON.stringify(request.state).length : 0,
      questionCount: request ? Object.keys(request.questions).length : 0,
      fallback,
    };
  }

  recordFallback(use: string, fallback: JudgeFallback, request?: JudgeRequest, context = this.deps.context()) {
    this.deps.record(this.fallbackRecord(use, fallback, request, context));
  }

  async ask(use: string, request: JudgeRequest, options: JudgeAskOptions = {}): Promise<JudgeResult> {
    const settings = this.deps.getSettings();
    // The call belongs to the world it was ASKED in. Both the numbers it is stamped with and
    // the ring it lands in used to be read after the await, so a call started in one chat could be
    // recorded, with the other chat's boundary, in the other chat's ring — and builds its
    // cost and latency report out of these rings.
    const asked = this.deps.context();
    const route = judgeRoute(settings, use);
    const provider = route.provider;
    const routed = provider === DEFAULT_JUDGE_PROVIDER ? {} : { provider };
    const refuse = (fallback: JudgeFallback): JudgeResult => ({
      answers: null,
      model: null,
      latencyMs: 0,
      stateChars: JSON.stringify(request.state).length,
      questionCount: Object.keys(request.questions).length,
      fallback,
      cached: false,
    });
    if (route.refused) {
      this.deps.record({ ...this.fallbackRecord(use, "uncalibrated", request, asked), ...routed });
      return refuse("uncalibrated");
    }
    const token = this.deps.ownership.mint();
    if (!(await this.available(provider))) {
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (!owned || owned.ok) this.deps.record({ ...this.fallbackRecord(use, "unavailable", request, asked), ...routed });
      return refuse("unavailable");
    }
    const outgoing = provider === DEFAULT_JUDGE_PROVIDER ? { ...request, model: settings.model } : request;
    const result = await askJudge(this.transportFor(provider), outgoing, {
      timeoutMs: options.timeoutMs ?? settings.timeoutMs,
      cache: this.cacheFor(provider),
      gate: this.gate,
      // A story load, restart or chat change cancels this request in flight rather
      // than paying for an answer the token check below will refuse anyway.
      ...(this.deps.ownership.signal ? { signal: this.deps.ownership.signal() } : {}),
      ...(this.deps.now ? { now: this.deps.now } : {}),
    });
    if (result.fallback === "error") this.invalidateStatus();
    const record: JudgeCallRecord = {
      at: new Date((this.deps.now ?? Date.now)()).toISOString(),
      boundary: asked.boundary,
      messageId: asked.messageId,
      use,
      model: result.model,
      latencyMs: result.latencyMs,
      stateChars: result.stateChars,
      questionCount: result.questionCount,
      ...(result.fallback ? { fallback: result.fallback } : {}),
      ...(result.cached ? { cached: true } : {}),
      ...(result.usage?.input_tokens !== undefined ? { inputTokens: result.usage.input_tokens } : {}),
      ...(result.usage?.output_tokens !== undefined ? { outputTokens: result.usage.output_tokens } : {}),
      ...(result.usage?.cost !== undefined ? { cost: result.usage.cost } : {}),
      ...routed,
    };
    // A call whose chat, story or session moved while it ran is not this chat's to record. The
    // answer is still returned — the caller has its own ownership check at ITS write edge, and
    // silently returning null here would look like a judge failure rather than a switch. It was
    // still paid for: the chat that asked is charged, now if it is still open,
    // otherwise on its next recorded call in this page session.
    const owned = token ? this.deps.ownership.check(token) : undefined;
    if (token && owned && owned.ok === false) {
      this.charge({ ...record, discarded: owned.reason }, token.chatId);
      return { ...result, discarded: owned.reason };
    }
    this.settleUnbilled(token?.chatId);
    this.deps.record({ ...record, ...(options.summarize ? { p: options.summarize(result.answers) } : {}) });
    return result;
  }

  private charge(record: JudgeCallRecord, askedIn: string | null) {
    if (this.deps.ownership.mint().chatId === askedIn) {
      this.deps.record(record);
      return;
    }
    this.unbilled.set(askedIn, [...(this.unbilled.get(askedIn) ?? []), record]);
  }

  private settleUnbilled(chatId: string | null | undefined) {
    if (chatId === undefined) return;
    const owed = this.unbilled.get(chatId);
    if (!owed) return;
    this.unbilled.delete(chatId);
    owed.forEach((record) => this.deps.record(record));
  }

  // null means "take today's chain": the flag is off, the pool is not eligible, or the call failed.
  async director(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null> {
    if (!this.active("director")) return null;
    if (input.candidates.length + (input.allowSilence ? 1 : 0) < 2) return null;
    if (!directorJudgeEligible(input.candidates, input.allowSilence)) {
      this.recordFallback("director", "no-roles");
      return null;
    }
    const result = await this.ask("director", buildDirectorRequest(input), {
      timeoutMs: Math.min(this.deps.getSettings().timeoutMs, DIRECTOR_TIMEOUT_MS),
      summarize: (answers) => directorRecordP(answers, answers ? decideDirector(answers, input) : null),
    });
    return result.answers ? decideDirector(result.answers, input) : null;
  }
}
