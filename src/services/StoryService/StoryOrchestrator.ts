// src\services\StoryService\StoryOrchestrator.ts
import type { Role } from '@services/SchemaService/story-schema';
import { PresetService } from '../PresetService';
import {
  applyCharacterAN,
  clearCharacterAN,
} from '@services/SillyTavernAPI';
import type {
  ArbiterReason,
  CheckpointArbiterApi,
  EvaluationOutcome,
} from './checkpoint-arbiter-types';
import CheckpointArbiterService from './CheckpointArbiterService';
import type { NormalizedStory } from '@services/SchemaService/story-validator';
import StoryRequirementsService, { type StoryRequirementsState } from './StoryRequirementsService';
import StoryStateService from './StoryStateService';
import { clampCheckpointIndex, sanitizeTurnsSinceEval, type RuntimeStoryState, type CheckpointStatus } from './story-state';
import { clampText } from './text-utils';

export interface OrchestratorCompositeState {
  requirements: StoryRequirementsState;
  runtime: RuntimeStoryState;
  hydrated: boolean; // from StoryStateService
  turnsUntilNextCheck: number;
}

class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;

  private idx = 0;
  private winRes: RegExp[] = [];
  private failRes: RegExp[] = [];
  private turn = 0;
  private sinceEval = 0;
  private intervalTurns = 3;
  private roleNameMap = new Map<string, Role>();
  private checkpointPrimed = false;

  private onEvaluated?: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string; cpIndex: number }) => void;
  private shouldApplyRole?: (role: Role) => boolean;
  private onRoleApplied?: (role: Role, cpName: string) => void;
  private onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  private onActivateIndex?: (index: number) => void;

  private requirementsService: StoryRequirementsService;
  private stateService: StoryStateService;
  private requirementsUnsubscribe?: () => void;
  private stateUnsubscribe?: () => void;
  private compositeListeners = new Set<(state: OrchestratorCompositeState) => void>();

  private readonly handleRuntimeUpdate = (runtime: RuntimeStoryState) => {
    this.reconcileWithRuntime(runtime);
    this.broadcastComposite();
  };

  private readonly handleRequirementsUpdate = () => {
    this.broadcastComposite();
  };

  constructor(opts: {
    story: NormalizedStory;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (handler: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string; cpIndex: number }) => void) => void }) => void;
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onActivateIndex?: (index: number) => void;
    onCompositeState?: (state: OrchestratorCompositeState) => void;
  }) {
    this.story = opts.story;
    this.checkpointArbiter = new CheckpointArbiterService();
    this.presetService = new PresetService({
      base: { source: "current" },
      storyId: this.story.title,
      storyTitle: this.story.title,
      roleDefaults: this.story.roleDefaults,
    });
    this.onRoleApplied = opts.onRoleApplied;
    this.shouldApplyRole = opts.shouldApplyRole;
    opts.setEvalHooks?.({ onEvaluated: (handler) => { this.onEvaluated = handler; } });
    this.onTurnTick = opts.onTurnTick;
    this.onActivateIndex = opts.onActivateIndex;
    this.requirementsService = new StoryRequirementsService();
    this.stateService = new StoryStateService();

    if (opts.onCompositeState) this.subscribeComposite(opts.onCompositeState);
  }

  index() { return this.idx; }

  setIntervalTurns(n: number) {
    this.intervalTurns = Math.max(1, n | 0);
    this.broadcastComposite();
  }

  async init() {
    if (!this.stateUnsubscribe) {
      this.stateUnsubscribe = this.stateService.subscribe(this.handleRuntimeUpdate);
    }
    if (!this.requirementsUnsubscribe) {
      this.requirementsUnsubscribe = this.requirementsService.subscribe(this.handleRequirementsUpdate);
    }
    this.seedRoleMap();
    await this.presetService.initForStory();
    this.requirementsService.start();
    this.requirementsService.setStory(this.story);
    this.stateService.start();
    this.stateService.setStory(this.story);
    const runtime = this.stateService.getState();
    this.reconcileWithRuntime(runtime);
    this.broadcastComposite();
  }
  private reconcileWithRuntime(runtime: RuntimeStoryState | null | undefined) {
    if (!runtime) return;
    const sanitizedIndex = clampCheckpointIndex(runtime.checkpointIndex, this.story);
    const sanitizedSince = sanitizeTurnsSinceEval(runtime.turnsSinceEval);
    if (!this.checkpointPrimed || sanitizedIndex !== this.idx) {
      this.applyCheckpoint(sanitizedIndex, {
        persist: false,
        resetSinceEval: false,
        sinceEvalOverride: sanitizedSince,
        reason: 'hydrate',
      });
    } else if (sanitizedSince !== this.sinceEval) {
      this.sinceEval = sanitizedSince;
      this.turn = this.sinceEval;
      this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
    }
  }

  private applyCheckpoint(index: number, opts: {
    persist?: boolean;
    resetSinceEval?: boolean;
    sinceEvalOverride?: number;
    reason?: 'activate' | 'hydrate';
  } = {}) {
    const checkpoints = Array.isArray(this.story.checkpoints) ? this.story.checkpoints : [];
    if (!checkpoints.length) {
      this.idx = 0;
      this.checkpointPrimed = true;
      this.winRes = [];
      this.failRes = [];
      const override = opts.sinceEvalOverride;
      const nextSinceEval = opts.resetSinceEval
        ? 0
        : typeof override === 'number'
          ? sanitizeTurnsSinceEval(override)
          : this.sinceEval;
      this.sinceEval = nextSinceEval;
      this.turn = opts.resetSinceEval
        ? 0
        : typeof override === 'number'
          ? nextSinceEval
          : Math.max(this.turn, nextSinceEval);
      this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
      return;
    }

    const sanitizedIndex = clampCheckpointIndex(index, this.story);
    const cp = checkpoints[sanitizedIndex] ?? checkpoints[0];

    this.idx = sanitizedIndex;
    this.checkpointPrimed = true;
    this.winRes = Array.isArray(cp.winTriggers) ? cp.winTriggers : [];
    this.failRes = Array.isArray(cp.failTriggers) ? cp.failTriggers : [];
    this.checkpointArbiter.clear();

    const override = opts.sinceEvalOverride;
    const nextSinceEval = opts.resetSinceEval
      ? 0
      : typeof override === 'number'
        ? sanitizeTurnsSinceEval(override)
        : this.sinceEval;

    this.sinceEval = nextSinceEval;
    this.turn = opts.resetSinceEval
      ? 0
      : typeof override === 'number'
        ? nextSinceEval
        : Math.max(this.turn, nextSinceEval);

    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });

    if (opts.persist !== false) {
      this.stateService.activateCheckpoint(this.idx);
      this.onActivateIndex?.(this.idx);
    }

    const logReason = opts.reason ?? (opts.persist === false ? 'hydrate' : 'activate');
    console.log('[StoryOrch] activate', {
      idx: this.idx,
      id: cp?.id,
      name: cp?.name,
      win: this.winRes.map(String),
      fail: this.failRes.map(String),
      reason: logReason,
    });
  }

  activateIndex(i: number) {
    this.applyCheckpoint(i, { persist: true, resetSinceEval: true, reason: 'activate' });
  }

  setActiveRole(roleOrDisplayName: string) {
    const raw = String(roleOrDisplayName ?? '');
    const norm = this.norm(raw);
    const role = this.roleNameMap.get(norm);
    if (!role) return;
    if (this.shouldApplyRole && !this.shouldApplyRole(role)) return;

    const cp = this.story.checkpoints[this.idx];
    const overrides = cp.onActivate?.preset_overrides?.[role];

    const roleNote = cp.onActivate?.authors_note?.[role];
    const characterName =
      role === 'dm' ? this.story.roles?.dm :
        role === 'companion' ? this.story.roles?.companion : undefined;

    if (characterName && roleNote) {
      applyCharacterAN(roleNote, {
        position: "chat",
        interval: 1,
        depth: 4,
        role: "system",
      });
      console.log('[StoryOrch] applied per-character AN', { role, characterName, cp: cp.name });
    } else {
      clearCharacterAN();
      console.log('[StoryOrch] cleared AN (no per-character AN)', { role, characterName, cp: cp.name });
    }

    this.presetService.applyForRole(role, overrides, cp.name);
    this.onRoleApplied?.(role, cp.name);
  }

  handleUserText(raw: string) {
    const text = (raw ?? '').trim();
    console.log('[StoryOrch] userText', { turn: this.turn + 1, sinceEval: this.sinceEval + 1, sample: clampText(raw, 80) });
    if (!text) return;
    this.turn += 1;
    this.sinceEval += 1;
    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
    // mirror to state service
    this.stateService.setTurnsSinceEval(this.sinceEval);

    const match = this.matchTrigger(text);
    if (match) this.enqueueEval(match.reason, text, match.pattern);
    else if (this.sinceEval >= this.intervalTurns) this.enqueueEval('interval', text);
  }

  private norm(s?: string | null) { return (s ?? '').normalize('NFKC').trim().toLowerCase(); }
  private seedRoleMap() {
    const roles = (this.story?.roles ?? {}) as Partial<Record<Role, string>>;
    (['dm', 'companion', 'chat'] as Role[]).forEach((r) => {
      const n = this.norm(roles[r]);
      if (n) this.roleNameMap.set(n, r);
    });
  }
  private matchTrigger(text: string) {
    for (const re of this.failRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'fail' as const, pattern: re.toString() };
    }
    for (const re of this.winRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'win' as const, pattern: re.toString() };
    }
    return null;
  }
  private enqueueEval(reason: ArbiterReason, text: string, matched?: string) {
    this.sinceEval = 0;
    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
    this.stateService.setTurnsSinceEval(this.sinceEval);
    const turnSnapshot = this.turn;
    const checkpointIndex = this.idx;
    const cp = this.story.checkpoints[checkpointIndex];
    console.log('[StoryOrch] eval-queued', { reason, turn: turnSnapshot, matched });

    void this.checkpointArbiter.evaluate({
      cpName: cp?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      objective: cp?.objective ?? '',
      latestText: text,
      reason,
      matched,
      turn: turnSnapshot,
      intervalTurns: this.intervalTurns,
    }).then((payload) => {
      const outcome = payload?.outcome ?? 'continue';
      this.onEvaluated?.({ outcome, reason, turn: turnSnapshot, matched, cpIndex: checkpointIndex });
      // Delegate win/advance behavior to session state/consumer
    }).catch((err) => {
      console.warn('[StoryOrch] arbiter error', err);
    });
  }

  reloadPersona() { return this.requirementsService.reloadPersona(); }

  updateCheckpointStatus(index: number, status: CheckpointStatus) { this.stateService.updateCheckpointStatus(index, status); }
  setOnActivateCheckpoint(cb?: (index: number) => void) { this.stateService.setOnActivateCheckpoint(cb); }



  private computeTurnsUntilNextCheck(runtime?: RuntimeStoryState | null) {
    const turnsSinceEval = runtime?.turnsSinceEval ?? 0;
    return Math.max(0, this.intervalTurns - turnsSinceEval);
  }

  private broadcastComposite() {
    const runtime = this.stateService.getState();
    const requirements = this.requirementsService.getSnapshot();
    this.emitComposite({
      requirements,
      runtime,
      hydrated: this.stateService.isHydrated(),
      turnsUntilNextCheck: this.computeTurnsUntilNextCheck(runtime),
    });
  }



  subscribeComposite(listener: (state: OrchestratorCompositeState) => void) {
    this.compositeListeners.add(listener);
    try {
      listener({
        requirements: this.requirementsService.getSnapshot(),
        runtime: this.stateService.getState(),
        hydrated: this.stateService.isHydrated(),
        turnsUntilNextCheck: this.computeTurnsUntilNextCheck(this.stateService.getState()),
      });
    } catch (e) { console.warn('[StoryOrch] initial composite listener dispatch failed', e); }
    return () => { this.compositeListeners.delete(listener); };
  }

  private emitComposite(state: OrchestratorCompositeState) {
    this.compositeListeners.forEach((l) => { try { l(state); } catch (e) { console.warn('[StoryOrch] composite listener failed', e); } });
  }

  dispose() {
    try { this.requirementsUnsubscribe?.(); } catch (e) { /* noop */ }
    try { this.stateUnsubscribe?.(); } catch (e) { /* noop */ }
    this.requirementsUnsubscribe = undefined;
    this.stateUnsubscribe = undefined;
    try { this.requirementsService.dispose(); } catch (e) { /* noop */ }
    try { this.stateService.dispose(); } catch (e) { /* noop */ }
    this.checkpointPrimed = false;
    this.idx = 0;
    this.winRes = [];
    this.failRes = [];
    this.turn = 0;
    this.sinceEval = 0;
    this.compositeListeners.clear();
  }



}


export default StoryOrchestrator;