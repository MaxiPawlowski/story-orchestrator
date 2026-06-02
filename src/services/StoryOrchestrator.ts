import { ARBITER_ROLE_KEY, type Role } from "@utils/story-schema";
import {
  type NormalizedCheckpoint,
  type NormalizedStory,
  type NormalizedTransition,
  isNormalizedStubCheckpoint,
} from "@utils/story-validator";
import { StoryGeneratorService, type CheckpointSummary, type ExpansionResult } from "./StoryGeneratorService";
import { PresetService } from "./PresetService";
import { TalkControlService } from "./TalkControlService";
import CheckpointArbiterService, {
  type ArbiterReason,
  type CheckpointArbiterApi,
} from "./CheckpointArbiterService";
import { createRequirementsController } from "@controllers/requirementsController";
import { createPersistenceController } from "@controllers/persistenceController";
import { applyCharacterAN, clearCharacterAN } from "@services/stHost/authorNotes";
import {
  clampCheckpointIndex,
  sanitizeRuntime,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  CheckpointStatus,
  computeStatusMapForIndex,
} from "@utils/story-state";
import { normalizeName } from "@utils/string";
import { storySessionStore } from "@store/storySessionStore";
import { registerStoryExtensionCommands } from "@utils/slash-commands";
import {
  ARBITER_RESPONSE_LENGTH,
  ARBITER_SNAPSHOT_LIMIT,
  STORY_ORCHESTRATOR_LOG_SAMPLE_LIMIT,
} from "@constants/defaults";
import type { ArbiterFrequency, ArbiterPrompt } from "@utils/arbiter";
import { updateStoryMacroSnapshot, resetStoryMacroSnapshot, refreshRoleMacros } from "@utils/story-macros";
import {
  getChatSessionBridgeSnapshot,
  type ChatSessionContextSnapshot,
} from "@controllers/chatSessionBridge";
import {
  resolveCheckpointActivationPolicy,
  type CheckpointActivationReason,
  type CheckpointActivationSource,
  type CheckpointRequirementsState,
} from "@services/runtime/checkpointActivationPolicy";
import {
  StoryEvaluationCoordinator,
  type StoryEvaluationEvent,
  type StoryTransitionSelection,
} from "@services/runtime/StoryEvaluationCoordinator";
import { createEmptyStoryPromptContext } from "@services/runtime/storyPromptContext";
import { CheckpointExpansionCoordinator } from "@services/runtime/CheckpointExpansionCoordinator";
import { CheckpointEffectsApplier } from "@services/runtime/CheckpointEffectsApplier";
import { subscribeWithRetainedChatSessionBridge } from "@services/runtime/chatSessionSubscription";
import ContinuityKeeperService from "@services/ContinuityKeeperService";
import { buildNarrativeContext } from "@utils/narrative-context";

class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;
  private talkControlService: TalkControlService;

  private activeTransitions: NormalizedTransition[] = [];
  private intervalTurns: ArbiterFrequency;
  private arbiterPrompt: ArbiterPrompt;
  private readonly defaultIntervalTurns: ArbiterFrequency;
  private readonly defaultArbiterPrompt: ArbiterPrompt;
  private roleNameMap = new Map<string, Role>();
  private checkpointPrimed = false;

  private onEvaluated?: (ev: StoryEvaluationEvent) => void;
  private shouldApplyRole?: (role: Role) => boolean;
  private onRoleApplied?: (role: Role, cpName: string) => void;
  private onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  private onActivateIndex?: (index: number) => void;

  private requirements = createRequirementsController();
  private persistence = createPersistenceController();
  private chatUnsubscribe?: () => void;
  private requirementsUnsubscribe?: () => void;
  private lastChatId: string | null = null;
  private lastGroupSelected = false;
  private generatorService = new StoryGeneratorService();
  private keeper?: ContinuityKeeperService;
  private evaluationCoordinator: StoryEvaluationCoordinator;
  private expansionCoordinator: CheckpointExpansionCoordinator;
  private effectsApplier: CheckpointEffectsApplier;

  constructor(opts: {
    story: NormalizedStory;
    intervalTurns: ArbiterFrequency;
    arbiterPrompt: ArbiterPrompt;
    keeper?: ContinuityKeeperService;
    fallbackPreset?: string | null;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (handler: (ev: StoryEvaluationEvent) => void) => void }) => void;
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onActivateIndex?: (index: number) => void;
  }) {
    this.story = opts.story;
    this.defaultIntervalTurns = opts.intervalTurns;
    this.intervalTurns = opts.intervalTurns;

    this.defaultArbiterPrompt = opts.arbiterPrompt;
    this.arbiterPrompt = opts.arbiterPrompt;
    this.keeper = opts.keeper;

    this.checkpointArbiter = new CheckpointArbiterService({
      promptTemplate: this.arbiterPrompt,
      snapshotLimit: ARBITER_SNAPSHOT_LIMIT,
      responseLength: ARBITER_RESPONSE_LENGTH,
    });
    this.presetService = new PresetService({
      base: { source: "current" },
      storyId: this.story.title,
      storyTitle: this.story.title,
      fallbackPreset: opts.fallbackPreset,
    });
    this.talkControlService = new TalkControlService({
      story: this.story,
    });
    this.evaluationCoordinator = new StoryEvaluationCoordinator({
      story: this.story,
      checkpointArbiter: this.checkpointArbiter,
      setTurnsSinceEval: (value) => this.persistence.setTurnsSinceEval(value, { persist: true }),
      applyArbiterPreset: (checkpoint) => { this.applyArbiterPreset(checkpoint); },
      notifyArbiterPhase: (phase) => { this.talkControlService.notifyArbiterPhase(phase); },
      updateStoryMacros: (context) => { this.updateStoryMacrosFromContext(context); },
      onTurnTick: opts.onTurnTick,
    });
    this.expansionCoordinator = new CheckpointExpansionCoordinator({
      story: this.story,
      generatorService: this.generatorService,
      buildPastCheckpoints: () => this.buildExpansionCheckpointSummaries(),
      getRoadmap: () => String(storySessionStore.getState().roadmap ?? ""),
    });
    this.effectsApplier = new CheckpointEffectsApplier({
      story: this.story,
      presetService: this.presetService,
      isRequirementsReady: () => this.requirementsReady,
      getActivationContextKey: () => this.getActivationContextKey(),
    });
    registerStoryExtensionCommands();
    this.onRoleApplied = opts.onRoleApplied;
    this.shouldApplyRole = opts.shouldApplyRole;
    opts.setEvalHooks?.({ onEvaluated: (handler) => { this.onEvaluated = handler; } });
    this.onTurnTick = opts.onTurnTick;
    this.onActivateIndex = opts.onActivateIndex;
    this.evaluationCoordinator.setOnEvaluated((event) => {
      this.onEvaluated?.(event);
    });

  }

  private get runtime(): RuntimeStoryState {
    return storySessionStore.getState().runtime;
  }

  private get currentCheckpoint(): NormalizedCheckpoint | undefined {
    return this.story.checkpoints[this.index];
  }

  private get requirementsReady(): boolean {
    const state = storySessionStore.getState();
    return state.requirements.requirementsReady ?? false;
  }

  private updateStoryMacrosFromContext(context: ReturnType<typeof createEmptyStoryPromptContext>) {
    updateStoryMacroSnapshot({
      storyDescription: context.storyDescription,
      currentCheckpoint: context.currentCheckpointSummary,
      pastCheckpoints: context.pastCheckpointsSummary,
      possibleTriggers: context.transitionSummary,
      storyTitle: context.storyTitle,
    });
  }

  private get turn(): number {
    return storySessionStore.getState().turn;
  }

  private setTurn(value: number) {
    const normalized = storySessionStore.getState().setTurn(value);
    this.talkControlService.updateTurn(normalized);
  }

  private flushRequirementsSatisfied() {
    if (!this.requirementsReady) return;
    void this.effectsApplier.flush(this.currentCheckpoint);
  }

  private syncRequirementsForChatChange() {
    try {
      this.requirements.handleChatContextChanged();
      this.flushRequirementsSatisfied();
    } catch (err) {
      console.warn("[StoryOrch] requirements chat sync failed", err);
    }
  }

  private ensureRequirementsSubscription() {
    if (this.requirementsUnsubscribe) return;
    this.requirementsUnsubscribe = storySessionStore.subscribe(() => {
      this.flushRequirementsSatisfied();
    });
  }

  private ensureChatSubscription() {
    if (this.chatUnsubscribe) return;
    this.chatUnsubscribe = subscribeWithRetainedChatSessionBridge((event) => {
      if (event.type !== "chat") return;
      this.handleChatChanged({ reason: "event", chat: event.chat });
    }, "[StoryOrch]");
  }

  private getActivationContextKey() {
    return `${this.lastChatId ?? ""}::${this.lastGroupSelected ? "group" : "solo"}`;
  }

  private resolveActivationSource(opts: { reason?: CheckpointActivationReason; source?: "stored" | "default" }): CheckpointActivationSource {
    if (opts.reason === "hydrate") {
      return opts.source ?? "default";
    }
    return "runtime";
  }

  private resolveRequirementsState(source: CheckpointActivationSource): CheckpointRequirementsState {
    if (source === "stored") return "pending";
    return this.requirementsReady ? "ready" : "blocked";
  }


  get index() {
    const idx = this.runtime?.checkpointIndex;
    return Number.isFinite(idx) ? idx : 0;
  }

  setIntervalTurns(n: ArbiterFrequency) {
    this.intervalTurns = n;
  }

  setArbiterPrompt(prompt: ArbiterPrompt) {
    this.arbiterPrompt = prompt;
    this.checkpointArbiter.updateOptions({ promptTemplate: this.arbiterPrompt });
  }

  async init() {
    const store = storySessionStore;
    this.persistence.setStory(this.story);
    this.persistence.resetRuntime();
    store.getState().resetRequirements();

    refreshRoleMacros(this.story);

    this.seedRoleMap();
    await this.presetService.initForStory();

    this.requirements.setStory(this.story);
    this.requirements.start();
    this.requirements.handleChatContextChanged();

    this.talkControlService.start();

    this.ensureRequirementsSubscription();
    this.ensureChatSubscription();

    this.handleChatChanged({ reason: "start", force: true, chat: getChatSessionBridgeSnapshot().chat });
  }

  activateIndex(i: number, context?: { reason?: "advance" | "merge"; observedEvents?: string[] }) {
    this.applyCheckpoint(i, {
      persist: true,
      resetSinceEval: true,
      reason: context?.reason ?? "manual",
      observedEvents: context?.observedEvents,
    });
  }

  activateRelative(delta: number): boolean {
    if (!Number.isFinite(delta) || !delta) return false;
    const normalized = delta > 0 ? Math.ceil(delta) : Math.floor(delta);
    const target = clampCheckpointIndex(this.index + normalized, this.story);
    if (target === this.index) return false;
    this.activateIndex(target);
    return true;
  }

  resetStory(): boolean {
    const checkpoints = this.story.checkpoints ?? [];
    if (!checkpoints.length) return false;
    const startId = this.story.startId;
    let target = typeof startId === "string"
      ? checkpoints.findIndex((cp) => cp.id === startId)
      : -1;
    if (target < 0) target = 0;
    this.applyCheckpoint(target, { persist: true, resetSinceEval: true, reason: "reset" });
    return true;
  }

  evaluateNow(reason: ArbiterReason = "manual"): boolean {
    if (!this.evaluationCoordinator.hasRegexTransitions(this.activeTransitions)) return false;
    this.evaluationCoordinator.queueEvaluation({
      reason,
      latestText: "(manual review)",
      matches: [],
      activeTransitions: this.activeTransitions,
      turn: this.turn,
      intervalTurns: this.intervalTurns,
      checkpointIndex: this.index,
    });
    return true;
  }

  requestPersist(): boolean {
    try {
      if (!this.persistence.canPersist()) return false;
      this.persistence.writeRuntime(this.runtime, { persist: true, hydrated: true });
      return true;
    } catch (err) {
      console.warn("[StoryOrch] persist request failed", err);
      return false;
    }
  }

  canPersist(): boolean {
    return this.persistence.canPersist();
  }

  isHydrated(): boolean {
    return this.persistence.isHydrated();
  }

  getIntervalTurns(): number {
    return this.intervalTurns;
  }

  setActiveRole(roleOrDisplayName: string) {
    if (!this.requirementsReady) {
      return;
    }

    const raw = String(roleOrDisplayName ?? "");
    const norm = normalizeName(raw);
    const role = this.roleNameMap.get(norm);
    if (!role) return;
    if (this.shouldApplyRole && !this.shouldApplyRole(role)) return;

    const cp = this.story.checkpoints[this.index];
    if (!cp) return;

    const overrides = cp.preset_overrides?.[role];
    const roleNote = cp.authors_note?.[role];
    const characterName = this.story.roles?.[role as keyof typeof this.story.roles];

    if (characterName && roleNote) {
      applyCharacterAN(roleNote.text, {
        position: roleNote.position,
        interval: roleNote.interval,
        depth: roleNote.depth,
        role: roleNote.role,
      });
      console.log("[StoryOrch] applied per-character AN", { role, characterName, cp: cp.name });
    } else {
      clearCharacterAN();
      console.log("[StoryOrch] cleared AN (no per-character AN)", { role, characterName, cp: cp.name });
    }

    this.presetService.applyForRole(role, overrides, cp.name);
    this.onRoleApplied?.(role, cp.name);
  }

  getTalkControlInterceptor() {
    return this.talkControlService.getInterceptor();
  }

  handleUserText(raw: string) {
    const text = (raw ?? "").trim();
    const currentTurn = this.turn;
    const currentRuntime = this.runtime;
    const currentSinceEval = currentRuntime.turnsSinceEval;
    const nextTurn = currentTurn + 1;
    const nextSinceEval = currentSinceEval + 1;
    const sample = raw.length > STORY_ORCHESTRATOR_LOG_SAMPLE_LIMIT ? raw.slice(0, STORY_ORCHESTRATOR_LOG_SAMPLE_LIMIT) + "..." : raw;
    console.log("[StoryOrch] userText", { turn: nextTurn, sinceEval: nextSinceEval, sample });
    if (!text) return;

    this.setTurn(nextTurn);
    const updatedRuntime = this.persistence.writeRuntime({
      ...currentRuntime,
      turnsSinceEval: nextSinceEval,
      checkpointTurnCount: (currentRuntime.checkpointTurnCount ?? 0) + 1,
    }, { persist: true });
    this.onTurnTick?.({ turn: nextTurn, sinceEval: updatedRuntime.turnsSinceEval });

    if (!this.activeTransitions.length) return;

    const timedMatch = this.evaluationCoordinator.findTriggeredTimedTransition(this.activeTransitions, updatedRuntime.checkpointTurnCount ?? 0);
    if (timedMatch) {
      this.evaluationCoordinator.emitTimedEvaluation(timedMatch, nextTurn, updatedRuntime.checkpointIndex);
      return;
    }

    if (!this.evaluationCoordinator.hasRegexTransitions(this.activeTransitions)) return;

    const regexMatches = this.evaluationCoordinator.findRegexMatches(text, this.activeTransitions);

    if (regexMatches.length) {
      this.evaluationCoordinator.queueEvaluation({
        reason: "trigger",
        latestText: text,
        matches: regexMatches,
        activeTransitions: this.activeTransitions,
        turn: nextTurn,
        intervalTurns: this.intervalTurns,
        checkpointIndex: updatedRuntime.checkpointIndex,
      });
    } else if (updatedRuntime.turnsSinceEval >= this.intervalTurns) {
      this.evaluationCoordinator.queueEvaluation({
        reason: "interval",
        latestText: text,
        matches: [],
        activeTransitions: this.activeTransitions,
        turn: nextTurn,
        intervalTurns: this.intervalTurns,
        checkpointIndex: updatedRuntime.checkpointIndex,
      });
    }
  }

  reloadPersona() {
    return this.requirements.reloadPersona();
  }

  updateCheckpointStatus(index: number, status: CheckpointStatus) {
    this.persistence.updateCheckpointStatus(index, status, { persist: true });
  }

  setOnActivateCheckpoint(cb?: (index: number) => void) {
    this.onActivateIndex = cb;
    if (cb && this.checkpointPrimed) {
      try { cb(this.index); } catch (err) { console.warn("[StoryOrch] onActivate callback failed", err); }
    }
  }

  setExpandCallback(cb: (result: ExpansionResult, fromCheckpointId: string) => Promise<void>) {
    this.expansionCoordinator.setMergeCallback(cb);
  }

  private buildExpansionCheckpointSummaries(): CheckpointSummary[] {
    const { story, runtime } = this;
    const checkpoints = story.checkpoints ?? [];
    const currentIndex = runtime.checkpointIndex ?? 0;
    const result: CheckpointSummary[] = [];
    for (let i = 0; i < currentIndex && i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (!cp || isNormalizedStubCheckpoint(cp)) continue;
      result.push({ name: cp.name, objective: cp.objective, status: "complete" });
    }
    const current = checkpoints[currentIndex];
    if (current && !isNormalizedStubCheckpoint(current)) {
      result.push({ name: current.name, objective: current.objective, status: "current" });
    }
    return result;
  }

  private handleChatChanged({ reason, force = false, chat }: { reason: string; force?: boolean; chat?: ChatSessionContextSnapshot }) {
    const session = chat ?? getChatSessionBridgeSnapshot().chat;
    const chatId = session.chatId;
    const groupSelected = session.groupChatSelected;

    const sameContext = !force && this.lastChatId === chatId && this.lastGroupSelected === groupSelected;
    if (sameContext) return;
    this.lastChatId = chatId;
    this.lastGroupSelected = groupSelected;
    this.checkpointPrimed = false;
    this.effectsApplier.clearPending();

    this.persistence.setChatContext({ chatId, groupChatSelected: groupSelected });

    if (!groupSelected) {
      const runtime = this.persistence.resetRuntime();
      console.log("[StoryOrch] handleChatChanged: not group selected, resetting", { reason });
      this.syncRequirementsForChatChange();
      this.reconcileWithRuntime(runtime, { source: "default" });
      return;
    }

    const { runtime: storedState, source: hydrateSource } = this.persistence.hydrate();

    console.log("[StoryOrch] handleChatChanged: hydrating", {
      reason,
      source: hydrateSource,
      checkpointIndex: storedState.checkpointIndex,
      activeKey: storedState.activeCheckpointKey,
    });

    if (hydrateSource === "stored") {
      console.log("[StoryOrch] handleChatChanged: applying stored checkpoint before requirements check");
      this.reconcileWithRuntime(storedState, { source: hydrateSource });
      this.syncRequirementsForChatChange();
    } else {
      this.syncRequirementsForChatChange();
      this.reconcileWithRuntime(storedState, { source: hydrateSource });
    }
  }

  private computeCheckpointRuntimeState(
    checkpointIndex: number,
    prevRuntime: RuntimeStoryState,
    currentTurn: number,
    opts: { resetSinceEval?: boolean; sinceEvalOverride?: number },
  ) {
    const baseSince = opts.resetSinceEval
      ? 0
      : typeof opts.sinceEvalOverride === "number"
        ? sanitizeTurnsSinceEval(opts.sinceEvalOverride)
        : prevRuntime.turnsSinceEval;
    const checkpointTurns = opts.resetSinceEval || checkpointIndex !== prevRuntime.checkpointIndex
      ? 0
      : prevRuntime.checkpointTurnCount ?? 0;
    const turn = opts.resetSinceEval
      ? 0
      : typeof opts.sinceEvalOverride === "number"
        ? Math.max(0, baseSince)
        : Math.max(currentTurn, baseSince);

    return {
      since: opts.resetSinceEval ? 0 : baseSince,
      checkpointTurns,
      turn,
    };
  }

  private commitRuntimeState(
    runtimePayload: RuntimeStoryState,
    nextTurn: number,
    opts: { persistRequested: boolean; hydratedFlag?: boolean },
  ) {
    const sanitized = this.persistence.writeRuntime(runtimePayload, {
      persist: opts.persistRequested,
      hydrated: opts.hydratedFlag,
    });
    this.setTurn(nextTurn);
    this.onTurnTick?.({ turn: nextTurn, sinceEval: sanitized.turnsSinceEval });
    return sanitized;
  }

  private reconcileWithRuntime(runtime?: RuntimeStoryState, options?: { source?: "stored" | "default" }) {
    if (!runtime) return;
    const sanitizedRuntime = sanitizeRuntime(runtime, this.story);
    const targetIndex = sanitizedRuntime.checkpointIndex;
    const sanitizedSince = sanitizeTurnsSinceEval(sanitizedRuntime.turnsSinceEval);

    if (!this.checkpointPrimed || targetIndex !== this.index) {
      this.applyCheckpoint(targetIndex, {
        persist: options?.source === "default",
        resetSinceEval: false,
        sinceEvalOverride: sanitizedSince,
        reason: "hydrate",
        source: options?.source,
      });
    } else {
      const updatedRuntime = this.persistence.setTurnsSinceEval(sanitizedSince, { persist: false });
      this.setTurn(sanitizedSince);
      this.onTurnTick?.({ turn: sanitizedSince, sinceEval: updatedRuntime.turnsSinceEval });

      const cp = this.story.checkpoints[targetIndex];
      if (cp && options?.source === "default") {
        const activationSource = this.resolveActivationSource({ reason: "hydrate", source: options.source });
        const policy = resolveCheckpointActivationPolicy({
          reason: "hydrate",
          source: activationSource,
          requirementsState: this.resolveRequirementsState(activationSource),
        });
        void this.effectsApplier.applyActivationEffects(cp, policy);
      }
    }
  }

  private applyCheckpoint(index: number, opts: {
    persist?: boolean;
    resetSinceEval?: boolean;
    sinceEvalOverride?: number;
    reason?: CheckpointActivationReason;
    observedEvents?: string[];
    source?: "stored" | "default";
  } = {}) {
    const checkpoints = this.story.checkpoints;
    const storeSnapshot = storySessionStore.getState();
    const prevRuntime = storeSnapshot.runtime;
    const currentTurn = storeSnapshot.turn;
    const persistRequested = opts.persist !== false;
    const checkpointIndex = clampCheckpointIndex(index, this.story);

    const hydratedFlag = opts.reason === "hydrate" ? true : (persistRequested ? true : undefined);
    const activationReason = opts.reason ?? "manual";
    const activationSource = this.resolveActivationSource({ reason: activationReason, source: opts.source });
    const activationPolicy = resolveCheckpointActivationPolicy({
      reason: activationReason,
      source: activationSource,
      requirementsState: this.resolveRequirementsState(activationSource),
    });
    const nextRuntimeState = this.computeCheckpointRuntimeState(checkpointIndex, prevRuntime, currentTurn, opts);

    if (!checkpoints.length) {
      this.checkpointPrimed = true;
      this.activeTransitions = [];
      this.checkpointArbiter.clear();
      const emptyRuntime: RuntimeStoryState = {
        checkpointIndex: 0,
        activeCheckpointKey: null,
        turnsSinceEval: nextRuntimeState.since,
        checkpointTurnCount: 0,
        checkpointStatusMap: { ...prevRuntime.checkpointStatusMap },
        memory: prevRuntime.memory,
      };
      const sanitized = this.commitRuntimeState(emptyRuntime, nextRuntimeState.turn, { persistRequested, hydratedFlag });
      this.updateStoryMacrosFromContext(createEmptyStoryPromptContext(this.story));
      this.talkControlService.setCheckpoint(null, { emitEnter: false });
      if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
      return;
    }

    const cp = checkpoints[checkpointIndex] ?? checkpoints[0];
    const activeKey = cp?.id ?? null;

    if (cp && isNormalizedStubCheckpoint(cp) && activationReason === "manual") {
      const transitionTaken = this.activeTransitions.find(t => t.to === cp.id);
      this.expansionCoordinator.expandStub(checkpointIndex, transitionTaken).then(() => {
        const expanded = this.story.checkpoints[checkpointIndex];
        if (expanded && !isNormalizedStubCheckpoint(expanded)) {
          this.applyCheckpoint(checkpointIndex, { ...opts, reason: "merge" });
        }
      }).catch(err => console.warn("[StoryOrch] expandStub failed", err));
      return;
    }

    this.checkpointPrimed = true;
    // Compute transitions from this checkpoint on-the-fly
    this.activeTransitions = cp ? this.story.transitions.filter(t => t.from === cp.id) : [];
    this.checkpointArbiter.clear();

    const statusMap = computeStatusMapForIndex(this.story, checkpointIndex, prevRuntime.checkpointStatusMap);
    const runtimePayload: RuntimeStoryState = {
      checkpointIndex,
      activeCheckpointKey: activeKey,
      turnsSinceEval: nextRuntimeState.since,
      checkpointTurnCount: nextRuntimeState.checkpointTurns,
      checkpointStatusMap: statusMap,
      memory: prevRuntime.memory,
    };
    const sanitized = this.commitRuntimeState(runtimePayload, nextRuntimeState.turn, { persistRequested, hydratedFlag });
    this.updateStoryMacrosFromContext(this.evaluationCoordinator.buildPromptContext(sanitized, this.activeTransitions));

    this.talkControlService.setCheckpoint(activeKey, { emitEnter: activationPolicy.emitEnter });
    void this.effectsApplier.applyActivationEffects(cp, activationPolicy);

    if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
    this.processKeeperActivation(cp, sanitized, activationReason, opts.observedEvents);
  }

  private applyArbiterPreset(cp?: NormalizedCheckpoint) {
    if (!cp) return;
    try {
      const overrides = cp.arbiter_preset;
      this.presetService.applyForRole(ARBITER_ROLE_KEY, overrides, cp.name);
      console.log("[StoryOrch] applied arbiter preset", { checkpoint: cp.name, overrideKeys: overrides ? Object.keys(overrides) : [] });
    } catch (err) {
      console.warn("[StoryOrch] failed to apply arbiter preset", err);
    }
  }

  private processKeeperActivation(
    checkpoint: NormalizedCheckpoint,
    runtime: RuntimeStoryState,
    reason: CheckpointActivationReason,
    observedEvents?: string[],
  ) {
    if (reason === "hydrate" || reason === "reset") return;
    if (!this.keeper) return;
    const type = reason === "manual"
      ? "activation"
      : reason === "advance"
        ? "advance"
        : "merge";
    const context = buildNarrativeContext({
      story: this.story,
      runtime,
    });
    void this.keeper.processEvent({
      type,
      checkpointId: checkpoint.id,
      checkpointName: checkpoint.name,
      observedEvents,
      context,
    }).catch((err) => {
      console.warn("[StoryOrch] keeper event failed", err);
    });
  }

  private seedRoleMap() {
    const roles = (this.story?.roles ?? {}) as Partial<Record<Role, string>>;
    Object.entries(roles).forEach(([role, displayName]) => {
      const n = normalizeName(displayName);
      if (n) this.roleNameMap.set(n, role as Role);
    });
  }

  private emitActivate(index: number) {
    try {
      this.onActivateIndex?.(index);
    } catch (err) {
      console.warn("[StoryOrch] onActivate handler failed", err);
    }
  }

  dispose() {
    this.chatUnsubscribe?.();
    this.chatUnsubscribe = undefined;

    const safe = (fn: () => void) => { try { fn(); } catch { /* swallow */ } };
    safe(() => this.requirementsUnsubscribe?.());
    this.requirementsUnsubscribe = undefined;
    safe(() => this.requirements.dispose());
    safe(() => this.persistence.dispose());
    safe(() => {
      storySessionStore.getState().setChatContext({ chatId: null, groupChatSelected: false });
      storySessionStore.getState().setStory(null);
      storySessionStore.getState().resetRequirements();
    });

    this.setTurn(0);
    this.intervalTurns = this.defaultIntervalTurns;
    this.setArbiterPrompt(this.defaultArbiterPrompt);
    this.roleNameMap.clear();
    this.activeTransitions = [];
    this.checkpointPrimed = false;
    this.talkControlService.setCheckpoint(null, { emitEnter: false });
    this.talkControlService.dispose();
    this.lastChatId = null;
    this.lastGroupSelected = false;
    this.effectsApplier.reset();
    this.expansionCoordinator.reset();
    safe(() => (this.keeper as (ContinuityKeeperService & { dispose?: () => void }) | undefined)?.dispose?.());
    this.keeper = undefined;
    this.onActivateIndex = undefined;
    this.onEvaluated = undefined;
    storySessionStore.getState().resetExpansion();
    resetStoryMacroSnapshot();
  }
}

export type { StoryEvaluationEvent, StoryTransitionSelection };
export default StoryOrchestrator;
