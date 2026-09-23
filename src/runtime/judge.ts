import { askJudge, buildDirectorRequest, runJudgeDirectorSelfTest, runMemoryPairsCalibration, runMemoryVerifyCalibration, runSceneCalibration, type SceneCalibrationCase, runLoreCalibration, type LoreCalibrationCase, runLoreRelevanceCalibration, type LoreRelevanceReport, runCuratorFilterCalibration, type CuratorFilterCase, runContinuityCalibration, type ContinuityCase, runBackgroundCalibration, type BackgroundCase, runTypedCalibration, type TypedCase, runStallCalibration, type StallCase, runCriticCalibration, type CriticCase, runVariantCalibration, type VariantStub, type MemoryPairCase, type MemoryVerifyCase, type JudgeSelfTestCase, type JudgeSelfTestReport, decideDirector, directorJudgeEligible, directorRecordP, judgeUseActive, DIRECTOR_TIMEOUT_MS, type JudgeAnswer, type JudgeCallRecord, type JudgeDirectorDecision, type JudgeDirectorInput, type JudgeFallback, type JudgeRequest, type JudgeResponse, type JudgeResult, type JudgeSettings, type JudgeTransport, type JudgeUseKey } from "@judge/index";
import type { RunOwnership } from "./runToken";

export interface JudgeStatusLike {
  configured: boolean;
}

export interface JudgeRuntimeDeps {
  getSettings(): JudgeSettings;
  transport: JudgeTransport;
  status(): Promise<JudgeStatusLike | null>;
  record(record: JudgeCallRecord): void;
  context(): { boundary: number; messageId: number };
  // v2.3 plan 03 (C1). Optional: a caller that supplies none keeps today behaviour.
  ownership?: RunOwnership;
  now?: () => number;
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
  private availability: { key: string; at: number; ok: boolean } | null = null;

  constructor(private readonly deps: JudgeRuntimeDeps) {}

  enabled(): boolean {
    return this.deps.getSettings().enabled;
  }

  active(use: JudgeUseKey): boolean {
    return judgeUseActive(this.deps.getSettings(), use);
  }

  // v2.2 plan 07: variants are their own opt-in (count > 1), still behind the master switch.
  expansionSettings(): JudgeSettings["expansion"] | null {
    const settings = this.deps.getSettings();
    return settings.enabled ? settings.expansion : null;
  }

  invalidateStatus() {
    this.availability = null;
  }

  private async available(): Promise<boolean> {
    const settings = this.deps.getSettings();
    const key = `${settings.enabled}:${settings.model}`;
    const now = (this.deps.now ?? Date.now)();
    if (this.availability && this.availability.key === key && now - this.availability.at < JUDGE_STATUS_TTL_MS) return this.availability.ok;
    const status = await this.deps.status();
    const ok = Boolean(status?.configured);
    this.availability = { key, at: now, ok };
    return ok;
  }

  // For the settings self-test: works before the judge is switched on, and records nothing in a chat.
  // Calibration may name a model without mutating install settings — the exact run says which model
  // it asked for, and JudgeResult says which model actually answered.
  probe(request: JudgeRequest, model = this.deps.getSettings().model): Promise<JudgeResult> {
    const settings = this.deps.getSettings();
    return askJudge(this.deps.transport, { ...request, model }, { timeoutMs: Math.max(settings.timeoutMs, JUDGE_PROBE_TIMEOUT_MS) });
  }

  /**
   * v2.3 plan 10 (A): the two-arm lore comparison. Its own report shape, because there are two
   * metric sets and a verdict per arm rather than one pass/fail.
   */
  calibrateLoreRelevance(cases: unknown[], model?: string): Promise<LoreRelevanceReport> {
    return runLoreRelevanceCalibration((request) => this.probe(request, model), cases as never);
  }

  // so-judge calibrate: the page → plugin → API path over a fixture set, recorded nowhere.
  calibrate(use: string, cases: unknown[], model?: string): Promise<JudgeSelfTestReport> {
    const ask = (request: JudgeRequest) => this.probe(request, model);
    if (use === "director") return runJudgeDirectorSelfTest(ask, cases as JudgeSelfTestCase[]);
    if (use === "memory-verify") return runMemoryVerifyCalibration(ask, cases as MemoryVerifyCase[]);
    if (use === "memory-pairs") return runMemoryPairsCalibration(ask, cases as MemoryPairCase[]);
    if (use === "scene") return runSceneCalibration(ask, cases as SceneCalibrationCase[]);
    if (use === "lore") return runLoreCalibration(ask, cases as LoreCalibrationCase[]);
    if (use === "curator-filter") return runCuratorFilterCalibration(ask, cases as CuratorFilterCase[]);
    if (use === "continuity") return runContinuityCalibration(ask, cases as ContinuityCase[]);
    if (use === "typed") return runTypedCalibration(ask, cases as TypedCase[]);
    if (use === "stall") return runStallCalibration(ask, cases as StallCase[]);
    if (use === "critic") return runCriticCalibration(ask, cases as CriticCase[]);
    if (use === "variants") return runVariantCalibration(ask, cases as VariantStub[]);
    if (use === "backgrounds") return runBackgroundCalibration(ask, (cases as Array<BackgroundCase & { installed?: string[] }>), (cases as Array<{ installed?: string[] }>)[0]?.installed ?? []);
    return Promise.reject(new Error(`no calibration for judge use '${use}' yet`));
  }

  recordFallback(use: string, fallback: JudgeFallback, request?: JudgeRequest, context = this.deps.context()) {
    this.deps.record({
      at: new Date((this.deps.now ?? Date.now)()).toISOString(),
      boundary: context.boundary,
      messageId: context.messageId,
      use,
      model: null,
      latencyMs: 0,
      stateChars: request ? JSON.stringify(request.state).length : 0,
      questionCount: request ? Object.keys(request.questions).length : 0,
      fallback,
    });
  }

  async ask(use: string, request: JudgeRequest, options: JudgeAskOptions = {}): Promise<JudgeResult> {
    const settings = this.deps.getSettings();
    // C1: the call belongs to the world it was ASKED in. Both the numbers it is stamped with and
    // the ring it lands in used to be read after the await, so a call started in one chat could be
    // recorded, with the other chat's boundary, in the other chat's ring — and plan 11 builds its
    // cost and latency report out of these rings.
    const asked = this.deps.context();
    const token = this.deps.ownership?.mint();
    if (!(await this.available())) {
      const owned = token ? this.deps.ownership?.check(token) : undefined;
      if (!owned || owned.ok) this.recordFallback(use, "unavailable", request, asked);
      return { answers: null, model: null, latencyMs: 0, stateChars: JSON.stringify(request.state).length, questionCount: Object.keys(request.questions).length, fallback: "unavailable", cached: false };
    }
    const result = await askJudge(this.deps.transport, { ...request, model: settings.model }, {
      timeoutMs: options.timeoutMs ?? settings.timeoutMs,
      cache: this.cache,
      // v2.3 plan 03: a story load, restart or chat change cancels this request in flight rather
      // than paying for an answer the token check below will refuse anyway.
      ...(this.deps.ownership?.signal ? { signal: this.deps.ownership.signal() } : {}),
      ...(this.deps.now ? { now: this.deps.now } : {}),
    });
    if (result.fallback === "error") this.invalidateStatus();
    // A call whose chat, story or session moved while it ran is not this chat's to record. The
    // answer is still returned — the caller has its own ownership check at ITS write edge, and
    // silently returning null here would look like a judge failure rather than a switch.
    const owned = token ? this.deps.ownership?.check(token) : undefined;
    if (owned && owned.ok === false) return { ...result, discarded: owned.reason };
    this.deps.record({
      at: new Date((this.deps.now ?? Date.now)()).toISOString(),
      boundary: asked.boundary,
      messageId: asked.messageId,
      use,
      model: result.model,
      latencyMs: result.latencyMs,
      stateChars: result.stateChars,
      questionCount: result.questionCount,
      ...(result.fallback ? { fallback: result.fallback } : {}),
      ...(options.summarize ? { p: options.summarize(result.answers) } : {}),
    });
    return result;
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
