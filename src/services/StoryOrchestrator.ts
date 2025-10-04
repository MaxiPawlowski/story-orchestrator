import type { Role } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import { PresetService } from "./PresetService";
import CheckpointArbiterService, {
  type ArbiterReason,
  type CheckpointArbiterApi,
  type EvaluationOutcome,
} from "./CheckpointArbiterService";
import { createRequirementsController } from "@controllers/requirementsController";
import { createPersistenceController } from "@controllers/persistenceController";
import {
  applyCharacterAN,
  clearCharacterAN,
  eventSource,
  event_types,
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
} from "@utils/story-state";
import { storySessionStore } from "@store/storySessionStore";

class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;

  private idx = 0;
  private winRes: RegExp[] = [];
  private failRes: RegExp[] = [];
  private turn = 0;
  private sinceEval = 0;
  private intervalTurns = DEFAULT_INTERVAL_TURNS;
  private roleNameMap = new Map<string, Role>();
  private checkpointPrimed = false;

  private onEvaluated?: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string; cpIndex: number }) => void;
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

  }

  index() { return this.idx; }

  setIntervalTurns(n: number) {
    this.intervalTurns = Math.max(1, n | 0);
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
    const norm = this.norm(raw);
    const role = this.roleNameMap.get(norm);
    if (!role) return;
    if (this.shouldApplyRole && !this.shouldApplyRole(role)) return;

    const cp = this.story.checkpoints[this.idx];
    if (!cp) return;

    const overrides = cp.onActivate?.preset_overrides?.[role];
    const roleNote = cp.onActivate?.authors_note?.[role];
    const characterName =
      role === "dm" ? this.story.roles?.dm
        : role === "companion" ? this.story.roles?.companion
          : undefined;

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
    console.log("[StoryOrch] userText", { turn: this.turn + 1, sinceEval: this.sinceEval + 1, sample: clampText(raw, 80) });
    if (!text) return;

    this.turn += 1;
    this.sinceEval += 1;
    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
    this.persistence.setTurnsSinceEval(this.sinceEval, { persist: true });

    const match = this.matchTrigger(text);
    if (match) this.enqueueEval(match.reason, text, match.pattern);
    else if (this.sinceEval >= this.intervalTurns) this.enqueueEval("interval", text);
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
      try { cb(this.idx); } catch (err) { console.warn("[StoryOrch] onActivate callback failed", err); }
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

    if (!this.checkpointPrimed || sanitizedIndex !== this.idx) {
      this.applyCheckpoint(sanitizedIndex, {
        persist: false,
        resetSinceEval: false,
        sinceEvalOverride: sanitizedSince,
        reason: "hydrate",
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
    reason?: "activate" | "hydrate";
  } = {}) {
    const checkpoints = Array.isArray(this.story.checkpoints) ? this.story.checkpoints : [];
    const store = storySessionStore;

    if (!checkpoints.length) {
      this.idx = 0;
      this.checkpointPrimed = true;
      this.winRes = [];
      this.failRes = [];

      const override = opts.sinceEvalOverride;
      const nextSinceEval = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? sanitizeTurnsSinceEval(override)
          : this.sinceEval;

      this.sinceEval = nextSinceEval;
      this.turn = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? nextSinceEval
          : Math.max(this.turn, nextSinceEval);

      this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
      this.persistence.writeRuntime({
        checkpointIndex: 0,
        checkpointStatuses: [],
        turnsSinceEval: opts.resetSinceEval ? 0 : nextSinceEval,
      }, { persist: false, hydrated: this.persistence.isHydrated() });

      if (opts.reason) this.emitActivate(this.idx);
      return;
    }

    const sanitizedIndex = clampCheckpointIndex(index, this.story);
    const cp = checkpoints[sanitizedIndex] ?? checkpoints[0];

    this.idx = sanitizedIndex;
    this.checkpointPrimed = true;
    this.winRes = Array.isArray(cp.winTriggers) ? cp.winTriggers : [];
    this.failRes = Array.isArray(cp.failTriggers) ? cp.failTriggers : [];
    this.checkpointArbiter.clear();

    const previousRuntime = store.getState().runtime;
    const override = opts.sinceEvalOverride;
    const nextSinceEval = opts.resetSinceEval
      ? 0
      : typeof override === "number"
        ? sanitizeTurnsSinceEval(override)
        : previousRuntime.turnsSinceEval;

    this.sinceEval = nextSinceEval;
    this.turn = opts.resetSinceEval
      ? 0
      : typeof override === "number"
        ? nextSinceEval
        : Math.max(this.turn, nextSinceEval);

    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });

    const nextStatuses = this.buildStatuses(sanitizedIndex, previousRuntime.checkpointStatuses);
    const runtimePayload: RuntimeStoryState = {
      checkpointIndex: sanitizedIndex,
      checkpointStatuses: nextStatuses,
      turnsSinceEval: opts.resetSinceEval ? 0 : nextSinceEval,
    };

    this.persistence.writeRuntime(runtimePayload, { persist: opts.persist !== false });

    const logReason = opts.reason ?? (opts.persist === false ? "hydrate" : "activate");
    console.log("[StoryOrch] activate", {
      idx: this.idx,
      id: cp?.id,
      name: cp?.name,
      win: this.winRes.map(String),
      fail: this.failRes.map(String),
      reason: logReason,
    });

    if (opts.reason) this.emitActivate(this.idx);
  }

  private matchTrigger(text: string) {
    for (const re of this.failRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: "fail" as const, pattern: re.toString() };
    }
    for (const re of this.winRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: "win" as const, pattern: re.toString() };
    }
    return null;
  }

  private enqueueEval(reason: ArbiterReason, text: string, matched?: string) {
    this.sinceEval = 0;
    this.onTurnTick?.({ turn: this.turn, sinceEval: this.sinceEval });
    this.persistence.setTurnsSinceEval(this.sinceEval, { persist: true });

    const turnSnapshot = this.turn;
    const checkpointIndex = this.idx;
    const cp = this.story.checkpoints[checkpointIndex];
    console.log("[StoryOrch] eval-queued", { reason, turn: turnSnapshot, matched });

    void this.checkpointArbiter.evaluate({
      cpName: cp?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      objective: cp?.objective ?? "",
      latestText: text,
      reason,
      matched,
      turn: turnSnapshot,
      intervalTurns: this.intervalTurns,
    }).then((payload) => {
      const outcome = payload?.outcome ?? "continue";
      this.onEvaluated?.({ outcome, reason, turn: turnSnapshot, matched, cpIndex: checkpointIndex });
    }).catch((err) => {
      console.warn("[StoryOrch] arbiter error", err);
    });
  }

  private seedRoleMap() {
    const roles = (this.story?.roles ?? {}) as Partial<Record<Role, string>>;
    (["dm", "companion", "chat"] as Role[]).forEach((r) => {
      const n = this.norm(roles[r]);
      if (n) this.roleNameMap.set(n, r);
    });
  }

  private norm(s?: string | null) { return (s ?? "").normalize("NFKC").trim().toLowerCase(); }

  private buildStatuses(activeIndex: number, previous: CheckpointStatus[]): CheckpointStatus[] {
    const checkpoints = this.story?.checkpoints ?? [];
    if (!checkpoints.length) return [];

    const total = checkpoints.length;
    const result: CheckpointStatus[] = new Array(total);
    for (let idx = 0; idx < total; idx++) {
      if (idx < activeIndex) {
        result[idx] = "complete";
      } else if (idx === activeIndex) {
        result[idx] = previous[idx] === "failed" ? "failed" : "current";
      } else {
        result[idx] = previous[idx] ?? "pending";
      }
    }
    return result;
  }

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

    this.idx = 0;
    this.turn = 0;
    this.sinceEval = 0;
    this.intervalTurns = DEFAULT_INTERVAL_TURNS;
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