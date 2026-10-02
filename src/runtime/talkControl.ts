import { TALK_CHAIN_MAX_CAP, TALK_CHAIN_MAX_DEFAULT, type RosterMember, type TalkControl, type TalkControlChain } from "@engine/index";
import type { JudgeDirectorDecision, JudgeDirectorInput } from "@judge/index";
import {
  addressedMembers, buildCandidates, chooseByRules, directorEnabled, directorInstruction, findCandidate, latestPlayerLine, narrowByMention,
  parseDirectorResponse, withAddressed, renderDirectorPrompt, type DirectorWindowMessage, type TalkCandidate, type TalkDecisionSource,
} from "@talk/index";
import { timeoutAbortReason } from "@utils/signals";
import { beginRun, type MessageWindow, type RunGuard, type RunOwnership } from "./runToken";
import type { TalkDecisionAudit } from "./types";
import { WITHHOLDING_TYPES } from "./generationLifecycle";
import { log } from "@utils/log";

export const DIRECTOR_TIMEOUT_MS = 20000;
export const DIRECTOR_MAX_TOKENS = 96;
export const DIRECTOR_WINDOW_MESSAGES = 8;

const LOUD_INTERCEPT_TYPE = "normal";
const QUIET_WRAPPER_TYPES = new Set([...WITHHOLDING_TYPES, "swipe", "continue"]);

export interface TalkCheckpointInfo {
  id: string;
  name: string;
  objective: string;
  storyTitle: string;
}

/** The resolved chain config: the checkpoint's `talk_control.chain` over the install-wide defaults. */
export interface TalkChainConfig {
  enabled: boolean;
  mode: "director" | "scripted";
  max: number;
  sequence: string[];
  stopOnTransition: boolean;
  holdExtraction: boolean;
  stopOnPlayer: boolean;
}

export const resolveChainConfig = (
  control: TalkControl,
  system: { enabled: boolean; max: number; stopOnTransition: boolean; holdExtraction: boolean },
): TalkChainConfig | null => {
  if (control.chain === false) return null;
  const chain: TalkControlChain = control.chain ?? {};
  const mode = chain.mode ?? "director";
  const max = Math.min(TALK_CHAIN_MAX_CAP, Math.max(1, chain.max ?? system.max ?? TALK_CHAIN_MAX_DEFAULT));
  return {
    enabled: system.enabled,
    mode,
    max,
    sequence: chain.sequence ?? [],
    stopOnTransition: chain.stop_on_transition ?? system.stopOnTransition,
    holdExtraction: chain.hold_extraction ?? system.holdExtraction,
    stopOnPlayer: chain.stop_on_player !== false,
  };
};

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
  getPendingCheckpointId?(): string | null;
  postsOpener?(checkpointId: string): boolean;
  callDirector(prompt: string, signal: AbortSignal): Promise<string>;
  breakerOpen?(): boolean;
  judgeDirector?(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  getPlayerName?(): string;
  triggerMember(name: string): Promise<void>;
  recordDecision(audit: TalkDecisionAudit): void;
  random?(): (() => number) | null;
  /** Install-wide chain defaults, read at each turn. */
  getChainConfig?(): { enabled: boolean; max: number; stopOnTransition: boolean; holdExtraction: boolean };
  /** Hold cadence extraction while a chain is running (a checkpoint asked for it). */
  setExtractionHold?(hold: boolean): void;
  ownership: RunOwnership;
}

type JudgeNote = { confidence: number; via: "choice" | "composite" };

type Decision =
  | { kind: "pass" }
  | { kind: "silence"; source: TalkDecisionSource; judge?: JudgeNote }
  | { kind: "player"; source: TalkDecisionSource; judge?: JudgeNote }
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

// One player turn's chain: how many voices have answered, which checkpoint it began in, and
// whether it should stop. `aborted` is set by a player STOP; `hold` remembers whether extraction
// was parked so it is lifted exactly once.
interface ChainState {
  key: string;
  checkpointId: string;
  spokeCount: number;
  aborted: boolean;
  hold: boolean;
  speakers: string[];
}

export class TalkController {
  private cached: CachedDecision | null = null;
  private pending: PendingDecision | null = null;
  private forcedChid: number | null = null;
  private pass: PassState | null = null;
  private reconciled: { key: string; run: RunGuard | null } | null = null;
  private chain: ChainState | null = null;
  private inFlight = 0;

  constructor(private readonly host: TalkControlHost) {}

  chainPending(): boolean {
    return this.inFlight > 0;
  }

  private track(work: Promise<void>): Promise<void> {
    this.inFlight += 1;
    return work.finally(() => { this.inFlight -= 1; });
  }

  private trigger(name: string): void {
    void this.track(this.host.triggerMember(name)).catch((error) => log.warn("speaker direction: the chosen voice could not be triggered", error));
  }

  onGenerationStarted(params: Record<string, unknown> | undefined) {
    this.forcedChid = params && typeof params.force_chid === "number" ? params.force_chid : null;
    if (this.forcedChid !== null && this.pass) this.pass.forced = true;
  }

  onGenerationEnded() {
    this.forcedChid = null;
  }

  onWrapperStarted(payload: Record<string, unknown> | undefined) {
    const type = typeof payload?.type === "string" ? payload.type : "";
    const loud = !QUIET_WRAPPER_TYPES.has(type);
    this.pass = { loud, forced: false, spoke: false, key: null };
    // A quiet/swipe/continue wrapper ends any chain: only a loud user turn opens one, and it does
    // so in `intercept` (a forced wrapper, i.e. a lone `/trigger`, must never start a chain).
    if (!loud) this.endChain();
  }

  // The player pressed STOP: no further voice this turn.
  onGenerationStopped() {
    if (this.chain) this.chain.aborted = true;
    this.endChain();
  }

  async intercept(abort: (immediate: boolean) => void, type: string): Promise<void> {
    if (type !== LOUD_INTERCEPT_TYPE) return;
    if (this.forcedChid !== null) return;
    if (!this.host.isGroupChat()) return;
    const control = this.host.getActiveTalkControl();
    if (!control) return;
    // The first intercept of a loud, non-forced group pass opens this turn's chain.
    if (!this.chain) {
      this.chain = { key: this.passKey(), checkpointId: this.host.getCheckpointInfo()?.id ?? "", spokeCount: 0, aborted: false, hold: false, speakers: [] };
    }
    const decision = await this.ensureDecision(control, this.passKey());
    if (decision.kind === "pass") return;
    if (decision.kind === "silence" || decision.kind === "player") {
      abort(false);
      return;
    }
    if (this.host.getDraftedRosterId() === decision.rosterId) {
      if (this.pass) this.pass.spoke = true;
      return;
    }
    abort(false);
  }

  onWrapperFinished(): Promise<void> {
    return this.track(this.finishWrapper());
  }

  private async finishWrapper(): Promise<void> {
    const pass = this.pass;
    this.pass = null;
    if (!pass || !pass.loud) return;
    if (!this.host.isGroupChat()) return;
    const control = this.host.getActiveTalkControl();
    if (!control) return;
    if (pass.spoke || pass.forced) {
      await this.advanceChain(control);
      return;
    }
    // Nobody spoke this pass: the reconcile triggers the chosen speaker, whose own wrapper then
    // continues the chain (advanceChain counts voices, and the first was never a voice).
    const key = pass.key ?? this.decisionKey();
    const decision = await this.ensureDecision(control, key);
    if (decision.kind !== "member") return;
    if (this.reconciled?.key === key && this.reconciled.run?.stillOwns() !== false) return;
    this.reconciled = { key, run: this.cached?.key === key ? this.cached.run : null };
    this.trigger(decision.name);
  }

  private endChain(): void {
    if (this.chain?.hold) this.host.setExtractionHold?.(false);
    this.chain = null;
  }

  private chainConfig(control: TalkControl): TalkChainConfig | null {
    const system = this.host.getChainConfig?.();
    return system ? resolveChainConfig(control, system) : null;
  }

  // A loud wrapper just produced a voice (or a forced trigger did). Decide who answers next, or end.
  private async advanceChain(control: TalkControl): Promise<void> {
    const chain = this.chain;
    if (!chain || chain.aborted) { this.endChain(); return; }
    const config = this.chainConfig(control);
    if (!config || !config.enabled) { this.endChain(); return; }
    chain.spokeCount += 1;
    const lastSpeaker = this.host.getLastSpeakerRosterId();
    if (lastSpeaker) chain.speakers.push(lastSpeaker);
    if (chain.spokeCount >= config.max) { this.endChain(); return; }
    if (this.sceneMoves(chain, config)) { this.endChain(); return; }
    const run = beginRun(this.host.ownership, this.window());
    const next = config.mode === "scripted"
      ? this.scriptedSpeaker(config, chain.spokeCount)
      : await this.decideChainSpeaker(control, config, chain);
    if (!next || !run.stillOwns() || this.sceneMoves(chain, config)) { this.endChain(); return; }
    if (!chain.hold && config.holdExtraction) {
      chain.hold = true;
      this.host.setExtractionHold?.(true);
    }
    this.trigger(next);
  }

  private sceneMoves(chain: ChainState, config: TalkChainConfig): boolean {
    const current = this.host.getCheckpointInfo()?.id ?? "";
    const entered = [current === chain.checkpointId ? null : current, this.host.getPendingCheckpointId?.() ?? null]
      .filter((id): id is string => id !== null);
    return entered.length > 0 && (config.stopOnTransition || entered.some((id) => this.host.postsOpener?.(id) === true));
  }

  private scriptedSpeaker(config: TalkChainConfig, index: number): string | null {
    // index counts voices so far, so the next scripted speaker is the one at that position.
    return config.sequence[index] ?? null;
  }

  // Hand back to the player is only offered when the checkpoint asks for it. With no judge or LLM
  // director there is nothing to say "enough", so the chain stops rather than let the rules loop.
  private async decideChainSpeaker(control: TalkControl, config: TalkChainConfig, chain: ChainState): Promise<string | null> {
    const window = this.host.getWindow();
    const { line, members } = this.addressed(window);
    const fresh = (candidate: TalkCandidate) => !chain.speakers.includes(candidate.rosterId);
    const candidates = withAddressed(buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds()), members).filter(fresh);
    if (!candidates.length) return null;
    const answered = new Set(window.slice(line + 1).map((message) => message.speaker.trim().toLowerCase()));
    const pending = members.filter((member) => fresh(member) && !answered.has(member.name.trim().toLowerCase()));
    const messageId = this.host.getLastMessageId();
    const checkpointId = this.host.getCheckpointInfo()?.id ?? chain.checkpointId;
    if (pending.length === 1) {
      const [next] = pending;
      this.host.recordDecision({
        at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: next.rosterId, chosenName: next.name,
        source: "mention", latencyMs: 0, chainStep: chain.spokeCount,
      });
      return next.name;
    }
    const pool = pending.length ? pending : candidates;
    const handBack = !pending.length && config.stopOnPlayer;
    const run = beginRun(this.host.ownership, this.window());
    const startedAt = Date.now();
    const decision = await this.runJudge(control, pool, window, handBack)
      ?? (directorEnabled(control) ? await this.runDirector(control, pool, window, handBack) : null);
    if (!run.stillOwns() || !decision || decision.kind === "pass") return null;
    if (decision.kind !== "member") {
      this.host.recordDecision({
        at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: null, chosenName: null,
        source: decision.source, latencyMs: Date.now() - startedAt, chainStep: chain.spokeCount,
        ...(decision.judge ? { judge: decision.judge } : {}),
      });
      return null;
    }
    this.host.recordDecision({
      at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: decision.rosterId, chosenName: decision.name,
      source: decision.source, latencyMs: Date.now() - startedAt, chainStep: chain.spokeCount,
      ...(decision.judge ? { judge: decision.judge } : {}),
    });
    return decision.name;
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
    const window = this.host.getWindow();
    const { line, members } = this.addressed(window);
    const candidates = withAddressed(buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds()), line === window.length - 1 ? members : []);
    if (!candidates.length) return { kind: "pass" };
    // A scripted chain fixes the voice order: the first is the first line of the sequence.
    const scripted = control.chain && control.chain.mode === "scripted" ? findCandidate(candidates, control.chain.sequence?.[0]) : null;
    if (scripted) return { kind: "member", rosterId: scripted.rosterId, name: scripted.name, source: "rules" };
    const judged = await this.runJudge(control, candidates, window, false);
    if (judged) return judged;
    const lastText = window.length ? window[window.length - 1].text : "";
    const mentioned = narrowByMention(candidates, lastText);
    if (mentioned.length === 1) return { kind: "member", rosterId: mentioned[0].rosterId, name: mentioned[0].name, source: "mention" };
    const pool = mentioned.length > 1 ? mentioned : candidates;
    if (directorEnabled(control)) {
      if (this.host.breakerOpen?.()) return this.chooseFallback(control, pool, "fallback");
      const directed = await this.runDirector(control, pool, window, false);
      if (directed) return directed;
      return this.chooseFallback(control, pool, "fallback");
    }
    return this.chooseFallback(control, pool, "rules");
  }

  private sceneWork(window: DirectorWindowMessage[]): boolean {
    const last = window.at(-1);
    const player = this.host.getPlayerName?.()?.trim().toLowerCase() ?? "";
    if (!last || !player || last.speaker.trim().toLowerCase() === player) return true;
    return Boolean(this.chain && (this.host.getCheckpointInfo()?.id ?? "") !== this.chain.checkpointId);
  }

  private addressed(window: DirectorWindowMessage[]): { line: number; members: TalkCandidate[] } {
    const line = latestPlayerLine(window, this.host.getPlayerName?.() ?? "");
    return { line, members: line < 0 ? [] : addressedMembers(this.host.getRoster(), this.host.getEnabledRosterIds(), window[line].text) };
  }

  private chooseFallback(control: TalkControl, pool: TalkCandidate[], source: TalkDecisionSource): Decision {
    const chosen = chooseByRules(control, pool, {
      lastSpeakerRosterId: this.host.getLastSpeakerRosterId(), leadEligible: this.sceneWork(this.host.getWindow()), random: this.host.random?.() ?? undefined,
    });
    return chosen ? { kind: "member", rosterId: chosen.rosterId, name: chosen.name, source } : { kind: "pass" };
  }

  private async runJudge(control: TalkControl, candidates: TalkCandidate[], window: DirectorWindowMessage[], handBack: boolean): Promise<Decision | null> {
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
        ...(handBack ? { allowHandBack: true } : {}),
        ...(this.sceneWork(window) ? {} : { sceneWork: false }),
        window,
      });
      if (!verdict) return null;
      const judge = { confidence: verdict.confidence, via: verdict.via };
      if (verdict.kind === "silence") return { kind: "silence", source: "judge", judge };
      if (verdict.kind === "player") return { kind: "player", source: "judge", judge };
      const candidate = candidates.find((entry) => entry.rosterId === verdict.rosterId);
      return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "judge", judge } : null;
    } catch (error) {
      log.warn("speaker direction: the judge failed, so the rules pick stands", error);
      return null;
    }
  }

  private async runDirector(control: TalkControl, pool: TalkCandidate[], window: DirectorWindowMessage[], handBack: boolean): Promise<Decision | null> {
    const info = this.host.getCheckpointInfo();
    if (!info) return null;
    const allowSilence = control.allow_silence === true;
    const prompt = renderDirectorPrompt({
      storyTitle: info.storyTitle,
      checkpointName: info.name,
      objective: info.objective,
      candidates: pool,
      allowSilence,
      ...(handBack ? { handBack: true } : {}),
      playerName: this.host.getPlayerName?.() ?? undefined,
      lead: findCandidate(pool, control.lead)?.name,
      ...(this.sceneWork(window) ? {} : { sceneWork: false }),
      instruction: directorInstruction(control),
      window,
    });
    const controller = new AbortController();
    try {
      const raw = await withTimeout(
        this.host.callDirector(prompt, controller.signal),
        DIRECTOR_TIMEOUT_MS,
        () => controller.abort(timeoutAbortReason(`the director did not answer within ${DIRECTOR_TIMEOUT_MS} ms`)),
      );
      const verdict = parseDirectorResponse(raw, pool, allowSilence, handBack);
      if (!verdict) return null;
      if (verdict.handBack) return { kind: "player", source: "director" };
      if (verdict.rosterId === null) return { kind: "silence", source: "director" };
      const candidate = pool.find((entry) => entry.rosterId === verdict.rosterId);
      return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "director" } : null;
    } catch (error) {
      log.warn("speaker direction: the director failed, so the rules pick stands", error);
      return null;
    }
  }
}
