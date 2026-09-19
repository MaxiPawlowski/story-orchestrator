import type { RosterMember, TalkControl } from "@engine/index";
import type { JudgeDirectorDecision, JudgeDirectorInput } from "@judge/index";
import { buildCandidates, chooseByRules, directorEnabled, directorInstruction, findCandidate, narrowByMention, parseDirectorResponse, renderDirectorPrompt, type DirectorWindowMessage, type TalkCandidate, type TalkDecisionSource } from "@talk/index";
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
  callDirector(prompt: string): Promise<string>;
  judgeDirector?(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  getPlayerName?(): string;
  triggerMember(name: string): Promise<void>;
  recordDecision(audit: TalkDecisionAudit): void;
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

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("director timeout")), ms);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

export class TalkController {
  private cached: { key: string; decision: Decision } | null = null;
  private pending: { key: string; promise: Promise<Decision> } | null = null;
  private forcedChid: number | null = null;
  private pass: PassState | null = null;
  private reconciledKey: string | null = null;

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
    if (this.reconciledKey === key) return;
    this.reconciledKey = key;
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

  private async ensureDecision(control: TalkControl, key: string): Promise<Decision> {
    if (this.cached?.key === key) return this.cached.decision;
    if (this.pending?.key === key) return this.pending.promise;
    const startedAt = Date.now();
    const promise = this.computeDecision(control);
    this.pending = { key, promise };
    const decision = await promise;
    if (this.pending?.key === key) this.pending = null;
    this.cached = { key, decision };
    if (decision.kind !== "pass") {
      this.host.recordDecision({
        at: new Date().toISOString(),
        messageId: this.host.getLastMessageId(),
        checkpointId: this.host.getCheckpointInfo()?.id ?? "",
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
    try {
      const raw = await withTimeout(this.host.callDirector(prompt), DIRECTOR_TIMEOUT_MS);
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
