import type { RosterMember, TalkControl } from "@engine/index";
import type { JudgeDirectorDecision, JudgeDirectorInput } from "@judge/index";
import { buildCandidates, chooseByRules, directorEnabled, directorInstruction, findCandidate, narrowByMention, parseDirectorResponse, renderDirectorPrompt, type DirectorWindowMessage, type TalkCandidate, type TalkDecisionSource } from "@talk/index";
import { timeoutAbortReason } from "@utils/signals";
import { beginRun, type MessageWindow, type RunGuard, type RunOwnership } from "./runToken";
import type { TalkDecisionAudit } from "./types";

export const DIRECTOR_TIMEOUT_MS = 20000;
export const DIRECTOR_MAX_TOKENS = 96;
export const DIRECTOR_WINDOW_MESSAGES = 8;

const LOUD_INTERCEPT_TYPE = "normal";
const QUIET_WRAPPER_TYPES = new Set(["quiet", "swipe", "continue", "impersonate"]);

export interface TalkCheckpointInfo {
  id: string;
  name: string;
  objective: string;
  storyTitle: string;
}

export interface TalkControlHost {
  isGroupChat(): boolean;
  getChatId(): string | null;
  getActiveTalkControl(): TalkControl | null;
  getRoster(): RosterMember[];
  getEnabledRosterIds(): string[];
  getLastSpeakerRosterId(): string | null;
  getDraftedRosterId(): string | null;
  getLastMessageId(): number;
  getWindow(): DirectorWindowMessage[];
  getCheckpointInfo(): TalkCheckpointInfo | null;
  callDirector(prompt: string, signal: AbortSignal): Promise<string>;
  breakerOpen?(): boolean;
  judgeDirector?(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  getPlayerName?(): string;
  triggerMember(name: string): Promise<void>;
  recordDecision(audit: TalkDecisionAudit): void;
  ownership?: RunOwnership;
}

type JudgeNote = { confidence: number; via: "choice" | "composite" };

type Decision =
  | { kind: "pass" }
  | { kind: "silence"; source: TalkDecisionSource; judge?: JudgeNote }
  | { kind: "member"; rosterId: string; name: string; source: TalkDecisionSource; judge?: JudgeNote };

interface PassState {
  loud: boolean;
  forced: boolean;
  spoke: boolean;
  key: string | null;
}

const PASS: Decision = { kind: "pass" };

interface CachedDecision {
  key: string;
  decision: Decision;
  run: RunGuard;
  messageId: number;
  checkpointId: string;
}

interface PendingDecision {
  key: string;
  promise: Promise<Decision>;
  run: RunGuard;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    onTimeout();
    reject(new Error("director timeout"));
  }, ms);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

export class TalkController {
  private cached: CachedDecision | null = null;
  private pending: PendingDecision | null = null;
  private forcedChid: number | null = null;
  private pass: PassState | null = null;
  private reconciled: { key: string; run: RunGuard | null } | null = null;

  constructor(private readonly host: TalkControlHost) {}

  onGenerationStarted(params: Record<string, unknown> | undefined) {
    this.forcedChid = params && typeof params.force_chid === "number" ? params.force_chid : null;
    if (this.forcedChid !== null && this.pass) this.pass.forced = true;
  }

  onGenerationEnded() {
    this.forcedChid = null;
  }

  onWrapperStarted(payload: Record<string, unknown> | undefined) {
    const type = typeof payload?.type === "string" ? payload.type : "";
    this.pass = { loud: !QUIET_WRAPPER_TYPES.has(type), forced: false, spoke: false, key: null };
  }

  async intercept(abort: (immediate: boolean) => void, type: string): Promise<void> {
    if (type !== LOUD_INTERCEPT_TYPE) return;
    if (this.forcedChid !== null) return;
    if (!this.host.isGroupChat()) return;
    const control = this.host.getActiveTalkControl();
    if (!control) return;
    const decision = await this.ensureDecision(control, this.passKey());
    if (decision.kind === "pass") return;
    if (decision.kind === "silence") {
      abort(false);
      return;
    }
    if (this.host.getDraftedRosterId() === decision.rosterId) {
      if (this.pass) this.pass.spoke = true;
      return;
    }
    abort(false);
  }

  async onWrapperFinished(): Promise<void> {
    const pass = this.pass;
    this.pass = null;
    if (!pass || !pass.loud || pass.forced || pass.spoke) return;
    if (!this.host.isGroupChat()) return;
    const control = this.host.getActiveTalkControl();
    if (!control) return;
    const key = pass.key ?? this.decisionKey();
    const decision = await this.ensureDecision(control, key);
    if (decision.kind !== "member") return;
    if (this.reconciled?.key === key && this.reconciled.run?.stillOwns() !== false) return;
    this.reconciled = { key, run: this.cached?.key === key ? this.cached.run : null };
    void this.host.triggerMember(decision.name);
  }

  private decisionKey(): string {
    return `${this.host.getChatId() ?? "?"}:${this.host.getCheckpointInfo()?.id ?? "?"}:${this.host.getLastMessageId()}`;
  }

  private passKey(): string {
    if (!this.pass) return this.decisionKey();
    if (!this.pass.key) this.pass.key = this.decisionKey();
    return this.pass.key;
  }

  private window(): MessageWindow | null {
    const messages = this.host.getWindow();
    const to = this.host.getLastMessageId();
    if (!messages.length || to < 0) return null;
    return { from: Math.max(0, to - messages.length + 1), to };
  }

  private async ensureDecision(control: TalkControl, key: string): Promise<Decision> {
    const cached = this.cached;
    if (cached?.key === key && cached.run.stillOwns()) return cached.decision;
    this.cached = null;

    const existing = this.pending;
    if (existing?.key === key && existing.run.stillOwns()) {
      const joined = await existing.promise;
      return existing.run.stillOwns() ? joined : PASS;
    }

    const run = beginRun(this.host.ownership, this.window());
    const messageId = this.host.getLastMessageId();
    const checkpointId = this.host.getCheckpointInfo()?.id ?? "";
    const startedAt = Date.now();
    const mine: PendingDecision = { key, promise: this.computeDecision(control), run };
    this.pending = mine;
    const decision = await mine.promise;
    if (this.pending === mine) this.pending = null;
    if (!run.stillOwns()) return PASS;

    this.cached = { key, decision, run, messageId, checkpointId };
    if (decision.kind !== "pass") {
      this.host.recordDecision({
        at: new Date().toISOString(),
        messageId,
        checkpointId,
        chosenRosterId: decision.kind === "member" ? decision.rosterId : null,
        chosenName: decision.kind === "member" ? decision.name : null,
        source: decision.source,
        latencyMs: Date.now() - startedAt,
        ...(decision.judge ? { judge: decision.judge } : {}),
      });
    }
    return decision;
  }

  private async computeDecision(control: TalkControl): Promise<Decision> {
    const candidates = buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds());
    if (!candidates.length) return { kind: "pass" };
    const window = this.host.getWindow();
    const judged = await this.runJudge(control, candidates, window);
    if (judged) return judged;
    const lastText = window.length ? window[window.length - 1].text : "";
    const mentioned = narrowByMention(candidates, lastText);
    if (mentioned.length === 1) return { kind: "member", rosterId: mentioned[0].rosterId, name: mentioned[0].name, source: "mention" };
    const pool = mentioned.length > 1 ? mentioned : candidates;
    if (directorEnabled(control)) {
      if (this.host.breakerOpen?.()) return this.chooseFallback(control, pool, "fallback");
      const directed = await this.runDirector(control, pool, window);
      if (directed) return directed;
      return this.chooseFallback(control, pool, "fallback");
    }
    return this.chooseFallback(control, pool, "rules");
  }

  private chooseFallback(control: TalkControl, pool: TalkCandidate[], source: TalkDecisionSource): Decision {
    const chosen = chooseByRules(control, pool, { lastSpeakerRosterId: this.host.getLastSpeakerRosterId() });
    return chosen ? { kind: "member", rosterId: chosen.rosterId, name: chosen.name, source } : { kind: "pass" };
  }

  private async runJudge(control: TalkControl, candidates: TalkCandidate[], window: DirectorWindowMessage[]): Promise<Decision | null> {
    const info = this.host.getCheckpointInfo();
    if (!this.host.judgeDirector || !info) return null;
    const instruction = directorInstruction(control);
    const lead = findCandidate(candidates, control.lead)?.name;
    try {
      const verdict = await this.host.judgeDirector({
        checkpointName: info.name,
        objective: info.objective,
        ...(instruction ? { instruction } : {}),
        player: this.host.getPlayerName?.() ?? "",
        candidates: candidates.map((candidate) => ({ rosterId: candidate.rosterId, name: candidate.name, ...(candidate.role ? { role: candidate.role } : {}) })),
        ...(lead ? { lead } : {}),
        allowSilence: control.allow_silence === true,
        window,
      });
      if (!verdict) return null;
      const judge = { confidence: verdict.confidence, via: verdict.via };
      if (verdict.kind === "silence") return { kind: "silence", source: "judge", judge };
      const candidate = candidates.find((entry) => entry.rosterId === verdict.rosterId);
      return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "judge", judge } : null;
    } catch {
      return null;
    }
  }

  private async runDirector(control: TalkControl, pool: TalkCandidate[], window: DirectorWindowMessage[]): Promise<Decision | null> {
    const info = this.host.getCheckpointInfo();
    if (!info) return null;
    const allowSilence = control.allow_silence === true;
    const prompt = renderDirectorPrompt({
      storyTitle: info.storyTitle,
      checkpointName: info.name,
      objective: info.objective,
      candidates: pool,
      allowSilence,
      lead: findCandidate(pool, control.lead)?.name,
      instruction: directorInstruction(control),
      window,
    });
    const controller = new AbortController();
    try {
      const raw = await withTimeout(this.host.callDirector(prompt, controller.signal), DIRECTOR_TIMEOUT_MS, () => controller.abort(timeoutAbortReason(`the director did not answer within ${DIRECTOR_TIMEOUT_MS} ms`)));
      const verdict = parseDirectorResponse(raw, pool, allowSilence);
      if (!verdict) return null;
      if (verdict.rosterId === null) return { kind: "silence", source: "director" };
      const candidate = pool.find((entry) => entry.rosterId === verdict.rosterId);
      return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "director" } : null;
    } catch {
      return null;
    }
  }
}
