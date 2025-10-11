import type { Role } from "@utils/story-schema";
import type { NormalizedCheckpoint, NormalizedStory, NormalizedTransition } from "@utils/story-validator";
import { matchTrigger as matchTriggerUtil } from "@utils/story-state";
import { PresetService } from "./PresetService";
import CheckpointArbiterService, {
  type ArbiterReason,
  type ArbiterTransitionOption,
  type CheckpointArbiterApi,
  type EvaluationOutcome,
  DEFAULT_ARBITER_PROMPT,
} from "./CheckpointArbiterService";
import { createRequirementsController } from "@controllers/requirementsController";
import { createPersistenceController } from "@controllers/persistenceController";
import {
  applyCharacterAN,
  clearCharacterAN,
  eventSource,
  event_types,
  enableWIEntry,
  disableWIEntry,
  getContext,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  clampCheckpointIndex,
  sanitizeTurnsSinceEval,
  clampText,
  DEFAULT_INTERVAL_TURNS,
  type RuntimeStoryState,
  type CheckpointStatus,
  computeStatusMapForIndex,
} from "@utils/story-state";
import { normalizeName } from "@utils/story-validator";
import { storySessionStore } from "@store/storySessionStore";
import { registerStoryExtensionCommands } from "@utils/slashCommands";

interface TransitionSelection {
  id: string;
  outcome: 'win' | 'fail';
  targetId: string;
  targetIndex: number;
}

interface EvaluatedEvent {
  outcome: EvaluationOutcome;
  reason: ArbiterReason;
  turn: number;
  matched?: string;
  cpIndex: number;
  transition?: TransitionSelection;
}

export type StoryTransitionSelection = TransitionSelection;
export type StoryEvaluationEvent = EvaluatedEvent;

class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;

  private winRes: RegExp[] = [];
  private failRes: RegExp[] = [];
  private intervalTurns = DEFAULT_INTERVAL_TURNS;
  private arbiterPrompt = DEFAULT_ARBITER_PROMPT;
  private roleNameMap = new Map<string, Role>();
  private checkpointPrimed = false;

  private onEvaluated?: (ev: EvaluatedEvent) => void;
  private shouldApplyRole?: (role: Role) => boolean;
  private onRoleApplied?: (role: Role, cpName: string) => void;
  private onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  private onActivateIndex?: (index: number) => void;

  private requirements = createRequirementsController();
  private persistence = createPersistenceController();
  private chatUnsubscribe?: () => void;
  private lastChatId: string | null = null;
  private lastGroupSelected = false;

  constructor(opts: {
    story: NormalizedStory;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (handler: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string; cpIndex: number }) => void) => void }) => void;
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onActivateIndex?: (index: number) => void;
  }) {
    console.log("[StoryOrch] initializing for story", { title: opts.story.title });
    this.story = opts.story;
    this.checkpointArbiter = new CheckpointArbiterService({ promptTemplate: DEFAULT_ARBITER_PROMPT });
    this.presetService = new PresetService({
      base: { source: "current" },
      storyId: this.story.title,
      storyTitle: this.story.title,
      roleDefaults: this.story.roleDefaults,
    });
    registerStoryExtensionCommands();
    this.onRoleApplied = opts.onRoleApplied;
    this.shouldApplyRole = opts.shouldApplyRole;
    opts.setEvalHooks?.({ onEvaluated: (handler) => { this.onEvaluated = handler; } });
    this.onTurnTick = opts.onTurnTick;
    this.onActivateIndex = opts.onActivateIndex;

  }

  private get runtime(): RuntimeStoryState {
    return storySessionStore.getState().runtime;
  }

  private get currentCheckpoint(): NormalizedCheckpoint | undefined {
    return this.story.checkpoints[this.index];
  }

  private getTransitionsForOutcome(outcome: 'win' | 'fail', from?: NormalizedCheckpoint | null): NormalizedTransition[] {
    const source = from ?? this.currentCheckpoint;
    if (!source) return [];
    const transitions = this.story.transitionsByFrom.get(source.id) ?? [];
    return transitions.filter((edge) => edge.outcome === outcome);
  }

  private resolveTargetIndex(edge: NormalizedTransition): number {
    const target = this.story.checkpointById.get(edge.to);
    if (!target) return -1;
    const idx = this.story.checkpoints.findIndex((cp) => cp.id === target.id);
    return idx;
  }

  private toTransitionSelection(outcome: 'win' | 'fail', edge: NormalizedTransition): TransitionSelection | undefined {
    const targetIndex = this.resolveTargetIndex(edge);
    if (targetIndex < 0) return undefined;
    const target = this.story.checkpoints[targetIndex];
    return {
      id: edge.id,
      outcome,
      targetIndex,
      targetId: target?.id ?? edge.to,
    };
  }

  private chooseTransitionForOutcome(outcome: EvaluationOutcome, requestedEdgeId: string | null | undefined, from: NormalizedCheckpoint | undefined): TransitionSelection | undefined {
    if (outcome !== 'win' && outcome !== 'fail') return undefined;
    const candidates = this.getTransitionsForOutcome(outcome, from);
    if (!candidates.length) return undefined;

    let selected: NormalizedTransition | undefined;

    if (requestedEdgeId) {
      selected = candidates.find((edge) => edge.id === requestedEdgeId);
    }

    if (!selected && candidates.length === 1) {
      selected = candidates[0];
    }

    if (!selected) {
      selected = candidates[0];
      console.log('[StoryOrch] transition fallback', { outcome, requestedEdgeId, selected: selected?.id });
    }

    return selected ? this.toTransitionSelection(outcome, selected) : undefined;
  }

  private setRuntime(next: RuntimeStoryState, options?: { hydrated?: boolean }) {
    return storySessionStore.getState().setRuntime(next, options);
  }

  private get turn(): number {
    return storySessionStore.getState().turn;
  }

  private setTurn(value: number) {
    storySessionStore.getState().setTurn(value);
  }

  get index() {
    const idx = this.runtime?.checkpointIndex;
    return Number.isFinite(idx) ? idx : 0;
  }

  setIntervalTurns(n: number) {
    this.intervalTurns = Math.max(1, n | 0);
  }

  setArbiterPrompt(prompt: string) {
    const normalized = typeof prompt === "string" ? prompt.replace(/\r/g, "").trim() : "";
    this.arbiterPrompt = normalized ? normalized : DEFAULT_ARBITER_PROMPT;
    this.checkpointArbiter.updateOptions({ promptTemplate: this.arbiterPrompt });
  }

  async init() {
    const store = storySessionStore;
    this.persistence.setStory(this.story);
    this.persistence.resetRuntime();
    store.getState().resetRequirements();

    this.seedRoleMap();
    await this.presetService.initForStory();

    this.requirements.setStory(this.story);
    this.requirements.start();
    this.requirements.handleChatContextChanged();

    if (!this.chatUnsubscribe) {
      this.chatUnsubscribe = subscribeToEventSource({
        source: eventSource,
        eventName: event_types.CHAT_CHANGED,
        handler: () => this.handleChatChanged({ reason: "event" }),
      });
    }

    this.handleChatChanged({ reason: "start", force: true });
  }

  activateIndex(i: number) {
    this.applyCheckpoint(i, { persist: true, resetSinceEval: true, reason: "activate" });
  }

  setActiveRole(roleOrDisplayName: string) {
    const raw = String(roleOrDisplayName ?? "");
    const norm = normalizeName(raw);
    const role = this.roleNameMap.get(norm);
    if (!role) return;
    if (this.shouldApplyRole && !this.shouldApplyRole(role)) return;

    const cp = this.story.checkpoints[this.index];
    if (!cp) return;

    const overrides = cp.onActivate?.preset_overrides?.[role];
    const roleNote = cp.onActivate?.authors_note?.[role];
    const characterName = this.story.roles?.[role as keyof typeof this.story.roles];

    if (characterName && roleNote) {
      applyCharacterAN(roleNote, {
        position: "chat",
        interval: 1,
        depth: 4,
        role: "system",
      });
      console.log("[StoryOrch] applied per-character AN", { role, characterName, cp: cp.name });
    } else {
      clearCharacterAN();
      console.log("[StoryOrch] cleared AN (no per-character AN)", { role, characterName, cp: cp.name });
    }

    this.presetService.applyForRole(role, overrides, cp.name);
    this.onRoleApplied?.(role, cp.name);
  }

  handleUserText(raw: string) {
    const text = (raw ?? "").trim();
    const currentTurn = this.turn;
    const currentSinceEval = this.runtime.turnsSinceEval;
    const nextTurn = currentTurn + 1;
    const nextSinceEval = currentSinceEval + 1;
    console.log("[StoryOrch] userText", { turn: nextTurn, sinceEval: nextSinceEval, sample: clampText(raw, 80) });
    if (!text) return;

    this.setTurn(nextTurn);
    const runtime = this.persistence.setTurnsSinceEval(nextSinceEval, { persist: true });
    this.onTurnTick?.({ turn: nextTurn, sinceEval: runtime.turnsSinceEval });

    const match = matchTriggerUtil(text, this.winRes, this.failRes);
    if (match) this.enqueueEval(match.reason, text, match.pattern);
    else if (runtime.turnsSinceEval >= this.intervalTurns) this.enqueueEval("interval", text);
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


  private async applyWorldInfoForCheckpoint(cp: NormalizedCheckpoint | undefined, metadata?: { index: number; reason: string }) {
    const lorebook = this.story.global_lorebook;
    if (!cp || !lorebook) return;

    const worldInfo = cp.onActivate?.world_info;
    if (!worldInfo) return;

    if (!Array.isArray(worldInfo.activate) && !Array.isArray(worldInfo.deactivate)) return;

    console.log("[StoryOrch] world info apply", {
      lorebook,
      cp: cp.name,
      index: metadata?.index,
      reason: metadata?.reason,
      activate: worldInfo.activate,
      deactivate: worldInfo.deactivate,
    });

    for (const comment of worldInfo.activate) {
      await enableWIEntry(lorebook, comment);
    }
    for (const comment of worldInfo.deactivate) {
      await disableWIEntry(lorebook, comment);
    }
  }


  private handleChatChanged({ reason, force = false }: { reason: string; force?: boolean }) {
    let chatId: string | null = null;
    let groupSelected = false;

    try {
      const ctx = getContext() || {};
      const rawChat = (ctx as any)?.chatId;
      const groupId = (ctx as any)?.groupId;
      chatId = rawChat == null ? null : (String(rawChat).trim() || null);
      groupSelected = Boolean(groupId);
    } catch (err) {
      console.warn("[StoryOrch] failed to read context", err);
      chatId = null;
      groupSelected = false;
    }

    const sameContext = !force && this.lastChatId === chatId && this.lastGroupSelected === groupSelected;
    if (sameContext) return;

    this.lastChatId = chatId;
    this.lastGroupSelected = groupSelected;

    this.persistence.setChatContext({ chatId, groupChatSelected: groupSelected });

    try {
      this.requirements.handleChatContextChanged();
    } catch (err) {
      console.warn("[StoryOrch] requirements chat sync failed", err);
    }

    if (!groupSelected) {
      const runtime = this.persistence.resetRuntime();
      this.reconcileWithRuntime(runtime);
      console.log("[StoryOrch] chat sync reset", { reason });
      return;
    }

    const hydrateResult = this.persistence.hydrate();
    console.log("[StoryOrch] chat sync hydrate", { reason, source: hydrateResult.source });
    this.reconcileWithRuntime(hydrateResult.runtime);
  }

  private reconcileWithRuntime(runtime: RuntimeStoryState | null | undefined) {
    if (!runtime) return;
    const sanitizedIndex = clampCheckpointIndex(runtime.checkpointIndex, this.story);
    const sanitizedSince = sanitizeTurnsSinceEval(runtime.turnsSinceEval);
    const activeKey = runtime.activeCheckpointKey
      ?? this.story.checkpoints[sanitizedIndex]?.id
      ?? this.story.startId
      ?? null;
    const resolvedIndex = activeKey
      ? this.story.checkpoints.findIndex((cp) => cp.id === activeKey)
      : sanitizedIndex;
    const targetIndex = resolvedIndex >= 0 ? resolvedIndex : sanitizedIndex;

    if (!this.checkpointPrimed || targetIndex !== this.index) {
      this.applyCheckpoint(targetIndex, {
        persist: false,
        resetSinceEval: false,
        sinceEvalOverride: sanitizedSince,
        reason: "hydrate",
      });
    } else {
      const updatedRuntime = this.persistence.setTurnsSinceEval(sanitizedSince, { persist: false });
      this.setTurn(sanitizedSince);
      this.onTurnTick?.({ turn: sanitizedSince, sinceEval: updatedRuntime.turnsSinceEval });
    }
  }

  private applyCheckpoint(index: number, opts: {
    persist?: boolean;
    resetSinceEval?: boolean;
    sinceEvalOverride?: number;
    reason?: "activate" | "hydrate";
  } = {}) {
    const checkpoints = Array.isArray(this.story.checkpoints) ? this.story.checkpoints : [];
    const storeSnapshot = storySessionStore.getState();
    const prevRuntime = storeSnapshot.runtime;
    const currentTurn = storeSnapshot.turn;
    const persistRequested = opts.persist !== false;

    const hydratedFlag = opts.reason === "hydrate" ? true : (persistRequested ? true : undefined);

    const computeTurns = (override?: number) => {
      const baseSince = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? sanitizeTurnsSinceEval(override)
          : prevRuntime.turnsSinceEval;
      const turn = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? Math.max(0, baseSince)
          : Math.max(currentTurn, baseSince);
      return { since: opts.resetSinceEval ? 0 : baseSince, turn };
    };

    const applyRuntime = (runtimePayload: RuntimeStoryState, nextTurn: number) => {
      const sanitized = this.setRuntime(runtimePayload, { hydrated: hydratedFlag });
      this.setTurn(nextTurn);
      this.onTurnTick?.({ turn: nextTurn, sinceEval: sanitized.turnsSinceEval });
      this.persistence.writeRuntime(sanitized, { persist: persistRequested, skipStore: true, hydrated: hydratedFlag });
      return sanitized;
    };

    // No checkpoints: just prime empty runtime
    if (!checkpoints.length) {
      this.checkpointPrimed = true;
      this.winRes = this.failRes = [];
      this.checkpointArbiter.clear();
      const { since, turn } = computeTurns(opts.sinceEvalOverride);
      const emptyRuntime: RuntimeStoryState = {
        checkpointIndex: 0,
        activeCheckpointKey: null,
        turnsSinceEval: since,
        checkpointStatusMap: { ...prevRuntime.checkpointStatusMap },
      };
      const sanitized = applyRuntime(emptyRuntime, turn);
      if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
      return;
    }

    const checkpointIndex = clampCheckpointIndex(index, this.story);
    const cp = checkpoints[checkpointIndex] ?? checkpoints[0];
    const activeKey = cp?.id ?? null;

    this.checkpointPrimed = true;
    this.winRes = Array.isArray(cp.winTriggers) ? cp.winTriggers : [];
    this.failRes = Array.isArray(cp.failTriggers) ? cp.failTriggers : [];
    this.checkpointArbiter.clear();

    const { since, turn } = computeTurns(opts.sinceEvalOverride);
    const statusMap = computeStatusMapForIndex(this.story, checkpointIndex, prevRuntime.checkpointStatusMap);
    const runtimePayload: RuntimeStoryState = {
      checkpointIndex,
      activeCheckpointKey: activeKey,
      turnsSinceEval: since,
      checkpointStatusMap: statusMap,
    };
    const sanitized = applyRuntime(runtimePayload, turn);

    const logReason = opts.reason ?? (persistRequested ? "activate" : "hydrate");
    console.log("[StoryOrch] activate", { idx: sanitized.checkpointIndex, id: cp?.id, name: cp?.name, win: this.winRes.map(String), fail: this.failRes.map(String), reason: logReason });
    this.applyWorldInfoForCheckpoint(cp, { index: sanitized.checkpointIndex, reason: logReason });
    if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
  }


  private enqueueEval(reason: ArbiterReason, text: string, matched?: string) {
    const turnSnapshot = this.turn;
    const runtime = this.persistence.setTurnsSinceEval(0, { persist: true });
    this.onTurnTick?.({ turn: turnSnapshot, sinceEval: runtime.turnsSinceEval });

    const checkpointIndex = runtime.checkpointIndex;
    const cp = this.story.checkpoints[checkpointIndex];
    const transitionsForPrompt: ArbiterTransitionOption[] = [];
    if (cp) {
      const outgoing = this.story.transitionsByFrom.get(cp.id) ?? [];
      outgoing.forEach((edge) => {
        const target = this.story.checkpointById.get(edge.to);
        transitionsForPrompt.push({
          id: edge.id,
          outcome: edge.outcome,
          label: edge.label,
          description: edge.description,
          targetName: target?.name,
          targetObjective: target?.objective,
        });
      });
    }
    console.log("[StoryOrch] eval-queued", { reason, turn: turnSnapshot, matched });

    void this.checkpointArbiter.evaluate({
      cpName: cp?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      objective: cp?.objective ?? "",
      latestText: text,
      reason,
      matched,
      turn: turnSnapshot,
      intervalTurns: this.intervalTurns,
      transitions: transitionsForPrompt,
    }).then((payload) => {
      const outcome = payload?.outcome ?? "continue";
      const transition = this.chooseTransitionForOutcome(outcome, payload?.nextEdgeId ?? payload?.parsed?.nextEdgeId, cp);
      this.onEvaluated?.({ outcome, reason, turn: turnSnapshot, matched, cpIndex: checkpointIndex, transition });
    }).catch((err) => {
      console.warn("[StoryOrch] arbiter error", err);
    });
  }

  private seedRoleMap() {
    const roles = (this.story?.roles ?? {}) as Partial<Record<Role, string>>;
    Object.entries(roles).forEach(([role, displayName]) => {
      const n = normalizeName(displayName);
      if (n) this.roleNameMap.set(n, role as Role);
    });
  }

  // removed thin wrappers: call helpers directly to reduce indirection

  private emitActivate(index: number) {
    try {
      this.onActivateIndex?.(index);
    } catch (err) {
      console.warn("[StoryOrch] onActivate handler failed", err);
    }
  }

  dispose() {
    try {
      this.chatUnsubscribe?.();
    } catch (err) {
      console.warn("[StoryOrch] failed to unsubscribe chat handler", err);
    }
    this.chatUnsubscribe = undefined;

    try {
      this.requirements.dispose();
    } catch (err) {
      console.warn("[StoryOrch] requirements dispose failed", err);
    }

    try {
      this.persistence.dispose();
    } catch (err) {
      console.warn("[StoryOrch] persistence dispose failed", err);
    }

    try {
      storySessionStore.getState().setChatContext({ chatId: null, groupChatSelected: false });
      storySessionStore.getState().setStory(null);
      storySessionStore.getState().resetRequirements();
    } catch (err) {
      console.warn("[StoryOrch] failed to reset store during dispose", err);
    }

    this.setTurn(0);
    this.intervalTurns = DEFAULT_INTERVAL_TURNS;
    this.setArbiterPrompt(DEFAULT_ARBITER_PROMPT);
    this.roleNameMap.clear();
    this.winRes = [];
    this.failRes = [];
    this.checkpointPrimed = false;
    this.lastChatId = null;
    this.lastGroupSelected = false;
    this.onActivateIndex = undefined;
    this.onEvaluated = undefined;
  }
}

export default StoryOrchestrator;
