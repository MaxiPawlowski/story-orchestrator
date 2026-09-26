import {
  askJudge, modelVerdict, runWardenRescore, WARDEN_RESCORE_USES, type WardenRescoreUse, type WardenRescoreRow,
  runAgencyCalibration, type AgencyCase, runHouseRuleCalibration, type HouseRuleCase, runCombinedContinuityCalibration,
  isCombinedCase, type CombinedContinuityCase, type RescoreResult, buildDirectorRequest, runJudgeDirectorSelfTest,
  runMemoryPairsCalibration, runMemoryVerifyCalibration, runSceneCalibration, type SceneCalibrationCase, runContradictionReleaseCalibration, type ContradictionReleaseCase,
  scoreReleasePhaseA, type ReleasePhaseAVerdict,
  runLoreCalibration, type LoreCalibrationCase, runLoreRelevanceCalibration, type LoreRelevanceReport,
  runCuratorFilterCalibration, type CuratorFilterCase, runContinuityCalibration, type ContinuityCase,
  runBackgroundCalibration, type BackgroundCase, runTypedCalibration, type TypedCase, runStallCalibration,
  type StallCase, runCriticCalibration, type CriticCase, runVariantCalibration, type VariantStub, type MemoryPairCase,
  type MemoryVerifyCase, type JudgeSelfTestCase, type JudgeSelfTestReport, decideDirector, directorJudgeEligible,
  directorRecordP, judgeUseActive, DIRECTOR_TIMEOUT_MS, type JudgeAnswer, type JudgeCallRecord,
  type JudgeDirectorDecision, type JudgeDirectorInput, type JudgeFallback, type JudgeRequest, type JudgeResponse,
  type JudgeResult, type JudgeSettings, type JudgeTransport, type JudgeUseKey,
} from "@judge/index";
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
  // Optional: a caller that supplies none keeps today behaviour.
  ownership: RunOwnership;
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
  private readonly unbilled = new Map<string | null, JudgeCallRecord[]>();
  private availability: { key: string; at: number; ok: boolean } | null = null;

  constructor(private readonly deps: JudgeRuntimeDeps) {}

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
   * The two-arm lore comparison. Its own report shape, because there are two
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
    if (use === "contradiction-release") return runContradictionReleaseCalibration(ask, cases as ContradictionReleaseCase[]);
    if (use === "scene") return runSceneCalibration(ask, cases as SceneCalibrationCase[]);
    if (use === "lore") return runLoreCalibration(ask, cases as LoreCalibrationCase[]);
    if (use === "curator-filter") return runCuratorFilterCalibration(ask, cases as CuratorFilterCase[]);
    if (use === "continuity") return (cases as CombinedContinuityCase[]).some(isCombinedCase) ? runCombinedContinuityCalibration(
      ask,
      cases as CombinedContinuityCase[],
    ) : runContinuityCalibration(ask, cases as ContinuityCase[]);
    if (use === "agency") return runAgencyCalibration(ask, cases as AgencyCase[]);
    if (use === "house-rules") return runHouseRuleCalibration(ask, cases as HouseRuleCase[]);
    if (use === "typed") return runTypedCalibration(ask, cases as TypedCase[]);
    if (use === "stall") return runStallCalibration(ask, cases as StallCase[]);
    if (use === "critic") return runCriticCalibration(ask, cases as CriticCase[]);
    if (use === "variants") return runVariantCalibration(ask, cases as VariantStub[]);
    if (use === "backgrounds") return runBackgroundCalibration(ask, (cases as Array<BackgroundCase & { installed?: string[] }>), (cases as Array<{ installed?: string[] }>)[0]?.installed ?? []);
    return Promise.reject(new Error(`no calibration for judge use '${use}' yet`));
  }

  // So-judge rescore — both arms of a judge-off control scored by one question.
  rescore(use: string, rows: WardenRescoreRow[], model?: string): Promise<RescoreResult[]> {
    if ((WARDEN_RESCORE_USES as readonly string[]).includes(use)) return runWardenRescore((request) => this.probe(request, model), use as WardenRescoreUse, rows);
    return Promise.reject(new Error(`no rescore for judge use '${use}' yet`));
  }

  scoreContradictionRelease(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], modes: Record<string, readonly string[] | null>): ReleasePhaseAVerdict {
    return scoreReleasePhaseA(report, cases, modes);
  }

  // So-judge reads the verdict here, so the harness and the page share one map.
  modelVerdict(requested: string | null | undefined, answered: string | null | undefined) {
    return modelVerdict(requested ?? this.deps.getSettings().model, answered);
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
    // The call belongs to the world it was ASKED in. Both the numbers it is stamped with and
    // the ring it lands in used to be read after the await, so a call started in one chat could be
    // recorded, with the other chat's boundary, in the other chat's ring — and builds its
    // cost and latency report out of these rings.
    const asked = this.deps.context();
    const token = this.deps.ownership.mint();
    if (!(await this.available())) {
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (!owned || owned.ok) this.recordFallback(use, "unavailable", request, asked);
      return {
        answers: null,
        model: null,
        latencyMs: 0,
        stateChars: JSON.stringify(request.state).length,
        questionCount: Object.keys(request.questions).length,
        fallback: "unavailable",
        cached: false,
      };
    }
    const result = await askJudge(this.deps.transport, { ...request, model: settings.model }, {
      timeoutMs: options.timeoutMs ?? settings.timeoutMs,
      cache: this.cache,
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
