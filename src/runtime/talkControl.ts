import { TALK_CHAIN_MAX_CAP, TALK_CHAIN_MAX_DEFAULT, type RosterMember, type TalkControl, type TalkControlChain } from "@engine/index";
import type { JudgeDirectorDecision, JudgeDirectorInput } from "@judge/index";
import {
  addressedMembers, asksPlayer, buildCandidates, directlyAddressed, chooseByRules, directorEnabled, findCandidate, latestPlayerLine, narrowByMention,
  withAddressed, type DirectorWindowMessage, type TalkCandidate, type TalkDecisionSource,
} from "@talk/index";
import { runDirectorDecision, runJudgeDecision, type Decision } from "./talkDirector";
import type { PlanContext, TalkPacingHost, VoicePlan } from "./talkPacing";
import { IDLE_PACING, type TalkPacingApi } from "./talkPacingIdle";
import type { SpeechReservation } from "./speechLedger";
import { beginRun, type MessageWindow, type RunGuard, type RunOwnership } from "./runToken";
import type { TalkDecisionAudit } from "./types";
import type { TalkDecisionKind } from "./talkStagecraftTypes";
import type { SourceRevision } from "@memory/audience";
import { WITHHOLDING_TYPES } from "./generationLifecycle";
import { log } from "@utils/log";
import type { WriteResult } from "@utils/writeResult";

const revisionKey = (revision: SourceRevision | null): string => (revision ? `${revision.swipeId ?? ""}/${revision.hash}` : "");

export { DIRECTOR_TIMEOUT_MS } from "./talkDirector";
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
  yieldOnQuestion: boolean;
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
    yieldOnQuestion: chain.yield_on_question !== false,
  };
};

export interface TalkControlHost extends TalkPacingHost {
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
  triggerMember(name: string): Promise<WriteResult | void>;
  recordDecision(audit: TalkDecisionAudit): void;
  getLastMessageRevision?(): SourceRevision | null;
  random?(): (() => number) | null;
  /** Install-wide chain defaults, read at each turn. */
  getChainConfig?(): { enabled: boolean; max: number; stopOnTransition: boolean; holdExtraction: boolean };
  /** Hold cadence extraction while a chain is running (a checkpoint asked for it). */
  setExtractionHold?(hold: boolean): void;
  ownership: RunOwnership;
}

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
  offScript: number;
  expected: string | null;
  reservation: SpeechReservation | null;
  plan: VoicePlan | null;
  release: (() => void) | null;
  endAfter: boolean;
}

export class TalkController {
  private cached: CachedDecision | null = null;
  private pending: PendingDecision | null = null;
  private forcedChid: number | null = null;
  private pass: PassState | null = null;
  private reconciled: { key: string; run: RunGuard | null } | null = null;
  private chain: ChainState | null = null;
  private inFlight = 0;
  private pacing: TalkPacingApi = IDLE_PACING;
  readonly ready: Promise<void>;

  constructor(private readonly host: TalkControlHost, importer: () => Promise<typeof import("./talkPacing")> = () => import("./talkPacing")) {
    this.ready = importer().then(({ TalkPacing }) => { this.pacing = new TalkPacing(host); }, (error: unknown) => log.warn("talk pacing could not load", error));
  }

  chainPending(): boolean {
    return this.inFlight > 0;
  }

  private track(work: Promise<void>): Promise<void> {
    this.inFlight += 1;
    return work.finally(() => { this.inFlight -= 1; });
  }

  private trigger(name: string, chain: ChainState | null = null): void {
    const started = this.host.triggerMember(name).then((result) => {
      if (!result || result.ok) return;
      log.info(`speaker direction: ${name} was not started: ${result.reason}`);
      if (chain && this.chain === chain) this.endChain();
    }).catch((error: unknown) => {
      if (chain && this.chain === chain) this.endChain();
      throw error;
    });
    void this.track(started).catch((error) => log.warn("speaker direction: the chosen voice could not be triggered", error));
  }

  onGenerationStarted(params: Record<string, unknown> | undefined, type: string | null = null) {
    this.forcedChid = params && typeof params.force_chid === "number" ? params.force_chid : null;
    if (this.forcedChid !== null && this.pass) this.pass.forced = true;
    if (type === LOUD_INTERCEPT_TYPE && this.forcedChid === null && !this.pass) this.yieldToPlayer();
  }

  onPlayerMessage() {
    this.yieldToPlayer();
  }

  private yieldToPlayer() {
    if (!this.chain) return;
    this.chain.aborted = true;
    this.endChain();
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
      this.chain = {
        key: this.passKey(), checkpointId: this.host.getCheckpointInfo()?.id ?? "", spokeCount: 0, aborted: false, hold: false, speakers: [], offScript: 0, expected: null,
        reservation: null, plan: null, release: null, endAfter: false,
      };
    }
    const chain = this.chain;
    const decision = await this.ensureDecision(control, this.passKey());
    if (this.chain !== chain || chain.aborted) return;
    if (decision.kind === "pass") return;
    if (decision.kind === "member" && this.chain.spokeCount === 0) {
      this.chain.expected = decision.rosterId;
      this.chain.offScript = control.chain && control.chain.mode === "scripted" && decision.source === "mention" ? 1 : 0;
      if (this.host.getDraftedRosterId() === decision.rosterId && !this.chain.reservation) this.rideFirstVoice(control, this.chain, decision);
    }
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
    const chain = this.chain;
    if (chain?.hold) this.host.setExtractionHold?.(false);
    if (chain) {
      this.pacing.settle(chain.reservation, null, null);
      chain.release?.();
    }
    this.chain = null;
  }

  private planContext(control: TalkControl, chain: ChainState, lastSpeaker: string | null): PlanContext {
    const candidates = withAddressed(buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds()), this.addressed(this.host.getWindow()).members);
    return { control, candidates, spoken: chain.speakers, lastSpeaker };
  }

  private rideFirstVoice(control: TalkControl, chain: ChainState, decision: { rosterId: string; name: string }) {
    const plan = this.pacing.address(this.pacing.plain(decision), this.planContext(control, chain, null));
    if (plan.origin !== "address") return;
    const { reservation } = this.pacing.reserve(plan);
    if (!reservation) return;
    Object.assign(chain, { reservation, plan, endAfter: true, release: this.pacing.arm(plan) });
  }

  private settleVoice(chain: ChainState, lastSpeaker: string | null) {
    const rendered = chain.expected && lastSpeaker === chain.expected ? this.host.getLastMessageId() : null;
    this.pacing.settle(chain.reservation, rendered, chain.plan);
    chain.release?.();
    Object.assign(chain, { reservation: null, plan: null, release: null });
  }

  private launch(plan: VoicePlan, chain: ChainState, config: TalkChainConfig) {
    if (plan.source) this.recordPlan(plan, chain);
    const { reservation, refused } = this.pacing.reserve(plan);
    if (refused) { this.endChain(); return; }
    Object.assign(chain, { expected: plan.rosterId, reservation, plan, endAfter: plan.yieldAfter, release: this.pacing.arm(plan) });
    if (!chain.hold && config.holdExtraction) {
      chain.hold = true;
      this.host.setExtractionHold?.(true);
    }
    this.trigger(plan.name, chain);
  }

  private recordPlan(plan: VoicePlan, chain: ChainState) {
    this.host.recordDecision({
      at: new Date().toISOString(), messageId: this.host.getLastMessageId(), checkpointId: this.host.getCheckpointInfo()?.id ?? chain.checkpointId,
      chosenRosterId: plan.rosterId, chosenName: plan.name, source: plan.source ?? "rules", latencyMs: 0, chainStep: chain.spokeCount, ...this.stamp("member"),
    });
  }

  private chainConfig(control: TalkControl): TalkChainConfig | null {
    const system = this.host.getChainConfig?.();
    return system ? resolveChainConfig(control, system) : null;
  }

  // A loud wrapper just produced a voice (or a forced trigger did). Decide who answers next, or end.
  private async advanceChain(control: TalkControl): Promise<void> {
    const chain = this.chain;
    if (!chain || chain.aborted) { this.endChain(); return; }
    const lastSpeaker = this.host.getLastSpeakerRosterId() ?? chain.expected;
    this.settleVoice(chain, lastSpeaker);
    const config = this.chainConfig(control);
    if (!config || !config.enabled) { this.endChain(); return; }
    chain.spokeCount += 1;
    if (lastSpeaker) chain.speakers.push(lastSpeaker);
    chain.expected = null;
    if (chain.endAfter || this.pacing.yielded() || (config.yieldOnQuestion && this.voiceAsksPlayer())) { this.recordYield(chain); this.endChain(); return; }
    if (chain.spokeCount >= config.max) { this.endChain(); return; }
    if (this.sceneMoves(chain, config)) { this.endChain(); return; }
    const run = beginRun(this.host.ownership, this.window());
    const context = this.planContext(control, chain, lastSpeaker);
    const reaction = config.mode === "director" ? this.pacing.reaction(context) : null;
    const scripted = config.mode === "scripted" ? this.scriptedSpeaker(config, chain.spokeCount - chain.offScript) : null;
    const next = reaction ?? (scripted ? { name: scripted, source: null } : config.mode === "scripted" ? null : await this.decideChainSpeaker(control, config, chain));
    if (this.chain !== chain || chain.aborted) return;
    if (!next || !run.stillOwns() || this.sceneMoves(chain, config)) { this.endChain(); return; }
    const candidate = findCandidate(context.candidates, next.name);
    if (!candidate || (control.no_repeat !== false && chain.speakers.includes(candidate.rosterId))) { this.endChain(); return; }
    const voice = reaction ?? (config.mode === "director" ? this.pacing.spotlight(candidate, next.source, context) : this.pacing.plain(candidate));
    this.launch(this.pacing.address(voice, context), chain, config);
  }

  private handedTo(window: DirectorWindowMessage[], candidates: TalkCandidate[]): TalkCandidate | null {
    const last = window.at(-1);
    if (!last || last.isUser) return null;
    const speaker = last.speaker.trim().toLowerCase();
    const roster = this.host.getRoster().filter((member) => (member.name ?? member.id).trim().toLowerCase() !== speaker);
    const id = directlyAddressed(roster, last.text);
    return candidates.find((candidate) => candidate.rosterId === id) ?? null;
  }

  private voiceAsksPlayer(): boolean {
    const last = this.host.getWindow().at(-1);
    const player = this.host.getPlayerName?.()?.trim() ?? "";
    const speaker = last?.speaker.trim().toLowerCase() ?? "";
    if (!last || last.isUser || !player || speaker === player.toLowerCase()) return false;
    const others = this.host.getRoster().filter((member) => (member.name ?? member.id).trim().toLowerCase() !== speaker)
      .flatMap((member) => [member.name ?? member.id, ...(member.aliases ?? [])]);
    return asksPlayer(last.text, { player: [player], others });
  }

  private recordYield(chain: ChainState): void {
    this.host.recordDecision({
      at: new Date().toISOString(), messageId: this.host.getLastMessageId(), checkpointId: this.host.getCheckpointInfo()?.id ?? chain.checkpointId,
      chosenRosterId: null, chosenName: null, source: "rules", latencyMs: 0, chainStep: chain.spokeCount, ...this.stamp("player"),
    });
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
  private async decideChainSpeaker(control: TalkControl, config: TalkChainConfig, chain: ChainState): Promise<{ name: string; source: TalkDecisionSource } | null> {
    const window = this.host.getWindow();
    const { line, members } = this.addressed(window);
    const fresh = (candidate: TalkCandidate) => control.no_repeat === false || !chain.speakers.includes(candidate.rosterId);
    const candidates = withAddressed(buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds()), members).filter(fresh);
    if (!candidates.length) return null;
    const answered = new Set(window.slice(line + 1).map((message) => message.speaker.trim().toLowerCase()));
    const pending = members.filter((member) => fresh(member) && !answered.has(member.name.trim().toLowerCase()));
    const messageId = this.host.getLastMessageId();
    const checkpointId = this.host.getCheckpointInfo()?.id ?? chain.checkpointId;
    const revision = this.host.getLastMessageRevision?.() ?? null;
    const handed = pending.length ? null : this.handedTo(window, candidates);
    if (pending.length === 1 || handed) {
      const next = handed ?? pending[0];
      this.host.recordDecision({
        at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: next.rosterId, chosenName: next.name,
        source: "mention", latencyMs: 0, chainStep: chain.spokeCount, ...this.stamp("member"),
      });
      return { name: next.name, source: "mention" };
    }
    const pool = pending.length ? pending : candidates;
    const handBack = !pending.length && config.stopOnPlayer;
    const run = beginRun(this.host.ownership, this.window());
    const startedAt = Date.now();
    const ask = { control, candidates: pool, window, handBack, sceneWork: this.sceneWork(window), leadPreferred: this.pacing.leadPreferred() };
    const decision = await runJudgeDecision(this.host, ask) ?? (directorEnabled(control) ? await runDirectorDecision(this.host, ask) : null);
    if (!run.stillOwns() || this.chain !== chain || chain.aborted || !decision || decision.kind === "pass") return null;
    if (decision.kind !== "member") {
      this.host.recordDecision({
        at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: null, chosenName: null,
        source: decision.source, latencyMs: Date.now() - startedAt, chainStep: chain.spokeCount,
        ...(decision.judge ? { judge: decision.judge } : {}), ...this.stamp(handBack && decision.kind === "player" ? "player" : "silence", revision),
      });
      return null;
    }
    this.host.recordDecision({
      at: new Date().toISOString(), messageId, checkpointId, chosenRosterId: decision.rosterId, chosenName: decision.name,
      source: decision.source, latencyMs: Date.now() - startedAt, chainStep: chain.spokeCount,
      ...(decision.judge ? { judge: decision.judge } : {}), ...this.stamp("member"),
    });
    return { name: decision.name, source: decision.source };
  }

  private stamp(kind: TalkDecisionKind, revision = this.host.getLastMessageRevision?.() ?? null): { kind: TalkDecisionKind; revision: SourceRevision | null } {
    return { kind, revision };
  }

  private decisionKey(): string {
    const revision = revisionKey(this.host.getLastMessageRevision?.() ?? null);
    return `${this.host.getChatId() ?? "?"}:${this.host.getCheckpointInfo()?.id ?? "?"}:${this.host.getLastMessageId()}:${revision}`;
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
        ...this.stamp(decision.kind === "member" ? "member" : "silence"),
      });
    }
    return decision;
  }

  private async computeDecision(control: TalkControl): Promise<Decision> {
    const window = this.host.getWindow();
    const { line, members } = this.addressed(window);
    const addressedNow = line === window.length - 1 ? members : [];
    const candidates = withAddressed(buildCandidates(control, this.host.getRoster(), this.host.getEnabledRosterIds()), addressedNow);
    if (!candidates.length) return { kind: "pass" };
    // A scripted chain fixes the voice order: the first is the first line of the sequence.
    const scripted = control.chain && control.chain.mode === "scripted" ? findCandidate(candidates, control.chain.sequence?.[0]) : null;
    const [addressee] = addressedNow.length === 1 ? addressedNow : [];
    if (scripted && addressee && addressee.rosterId !== scripted.rosterId) return { kind: "member", rosterId: addressee.rosterId, name: addressee.name, source: "mention" };
    if (scripted) return { kind: "member", rosterId: scripted.rosterId, name: scripted.name, source: "rules" };
    const ask = { control, candidates, window, handBack: false, sceneWork: this.sceneWork(window), leadPreferred: this.pacing.leadPreferred() };
    const judged = await runJudgeDecision(this.host, ask);
    if (judged) return judged;
    const lastText = window.length ? window[window.length - 1].text : "";
    const mentioned = narrowByMention(candidates, lastText);
    if (mentioned.length === 1) return { kind: "member", rosterId: mentioned[0].rosterId, name: mentioned[0].name, source: "mention" };
    const pool = mentioned.length > 1 ? mentioned : candidates;
    if (directorEnabled(control)) {
      if (this.host.breakerOpen?.()) return this.chooseFallback(control, pool, "fallback");
      const directed = await runDirectorDecision(this.host, { ...ask, candidates: pool });
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
      lastSpeakerRosterId: this.host.getLastSpeakerRosterId(), leadEligible: this.sceneWork(this.host.getWindow()) && this.pacing.leadPreferred(), random: this.host.random?.() ?? undefined,
    });
    return chosen ? { kind: "member", rosterId: chosen.rosterId, name: chosen.name, source } : { kind: "pass" };
  }
}
