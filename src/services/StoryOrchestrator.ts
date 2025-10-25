import { ARBITER_ROLE_KEY, type Role } from "@utils/story-schema";
import type { NormalizedCheckpoint, NormalizedStory, NormalizedTransition } from "@utils/story-validator";
import { PresetService } from "./PresetService";
import CheckpointArbiterService, {
  type ArbiterReason,
  type ArbiterTransitionOption,
  type CheckpointArbiterApi,
  type EvaluationOutcome,
} from "./CheckpointArbiterService";
import { createRequirementsController } from "@controllers/requirementsController";
import { createPersistenceController } from "@controllers/persistenceController";
import {
  applyCharacterAN,
  clearCharacterAN,
  enableWIEntry,
  disableWIEntry,
  getContext,
  executeSlashCommands,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/event-source";
import {
  clampCheckpointIndex,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  CheckpointStatus,
  computeStatusMapForIndex,
  deriveCheckpointStatuses,
  evaluateTransitionTriggers,
  type TransitionTriggerMatch,
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
import { updateStoryMacroSnapshot, resetStoryMacroSnapshot } from "@utils/story-macros";
import {
  setTalkControlCheckpoint,
  notifyTalkControlArbiterPhase,
  updateTalkControlTurn,
} from "@controllers/talkControlManager";

interface TransitionSelection {
  id: string;
  targetId: string;
  targetIndex: number;
  trigger?: {
    type: "regex" | "timed";
    pattern?: string;
    label?: string;
  };
}

interface EvaluatedEvent {
  outcome: EvaluationOutcome;
  reason: ArbiterReason;
  turn: number;
  cpIndex: number;
  matches: TransitionTriggerMatch[];
  selectedTransition?: TransitionSelection;
}

export type StoryTransitionSelection = TransitionSelection;
export type StoryEvaluationEvent = EvaluatedEvent;

interface StoryPromptContextSnapshot {
  storyTitle: string;
  storyDescription: string;
  currentCheckpointSummary: string;
  pastCheckpointsSummary: string;
  transitionSummary: string;
}

class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;

  private activeTransitions: NormalizedTransition[] = [];
  private intervalTurns: ArbiterFrequency;
  private arbiterPrompt: ArbiterPrompt;
  private readonly defaultIntervalTurns: ArbiterFrequency;
  private readonly defaultArbiterPrompt: ArbiterPrompt;
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
    intervalTurns: ArbiterFrequency;
    arbiterPrompt: ArbiterPrompt;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (handler: (ev: EvaluatedEvent) => void) => void }) => void;
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onActivateIndex?: (index: number) => void;
  }) {
    this.story = opts.story;
    this.defaultIntervalTurns = opts.intervalTurns;
    this.intervalTurns = opts.intervalTurns;

    this.defaultArbiterPrompt = opts.arbiterPrompt;
    this.arbiterPrompt = opts.arbiterPrompt;

    this.checkpointArbiter = new CheckpointArbiterService({
      promptTemplate: this.arbiterPrompt,
      snapshotLimit: ARBITER_SNAPSHOT_LIMIT,
      responseLength: ARBITER_RESPONSE_LENGTH,
    });
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

  private resolveTargetIndex(edge: NormalizedTransition): number {
    const target = this.story.checkpointById.get(edge.to);
    if (!target) return -1;
    const idx = this.story.checkpoints.findIndex((cp) => cp.id === target.id);
    return idx;
  }

  private toTransitionSelection(edge: NormalizedTransition, match?: TransitionTriggerMatch): TransitionSelection | undefined {
    const targetIndex = this.resolveTargetIndex(edge);
    if (targetIndex < 0) return undefined;
    const target = this.story.checkpoints[targetIndex];
    const triggerInfo = match?.trigger ? {
      type: match.trigger.type,
      pattern: match.pattern,
      label: match.trigger.raw?.label ?? match.trigger.raw?.id ?? match.trigger.label,
    } : undefined;
    return {
      id: edge.id,
      targetIndex,
      targetId: target?.id ?? edge.to,
      ...(triggerInfo ? { trigger: triggerInfo } : {}),
    };
  }

  private buildArbiterOptions(matches: TransitionTriggerMatch[]): ArbiterTransitionOption[] {
    const matchById = new Map<string, TransitionTriggerMatch>();
    matches.forEach((entry) => { matchById.set(entry.transition.id, entry); });

    return this.activeTransitions
      .filter((edge) => edge.trigger.type === "regex")
      .map((edge) => {
        const match = matchById.get(edge.id);
        const target = this.story.checkpointById.get(edge.to);
        const trigger = match?.trigger ?? edge.trigger;
        const triggerLabel = trigger.raw?.label ?? trigger.raw?.id ?? trigger.label;

        const pattern = match?.pattern
          ?? (trigger.regexes?.[0] ? trigger.regexes[0].toString() : undefined);
        return {
          id: edge.id,
          condition: trigger.condition ?? "",
          label: edge.label,
          description: edge.description,
          targetName: target?.name,
          triggerLabel,
          triggerPattern: pattern,
        };
      });
  }

  private resolveTransitionSelection(nextTransitionId: string | null | undefined, matches: TransitionTriggerMatch[]): TransitionSelection | undefined {
    const transitions = this.activeTransitions ?? [];
    if (!transitions.length) return undefined;

    let chosen: NormalizedTransition | undefined;
    let matched: TransitionTriggerMatch | undefined;

    if (nextTransitionId) {
      matched = matches.find((entry) => entry.transition.id === nextTransitionId);
      chosen = matched?.transition ?? transitions.find((edge) => edge.id === nextTransitionId);
    }

    if (!chosen && matches.length) {
      matched = matches[0];
      chosen = matched.transition;
    }

    if (!chosen && transitions.length === 1) {
      chosen = transitions[0];
    }

    if (!chosen) return undefined;
    if (!matched || matched.transition.id !== chosen.id) {
      matched = matches.find((entry) => entry.transition.id === chosen!.id);
    }

    return this.toTransitionSelection(chosen, matched);
  }

  private summarizeTransitions(options: ArbiterTransitionOption[]): string {
    if (!options || !options.length) {
      return "No transition candidates are currently available.";
    }
    const lines: string[] = ["Evaluate the candidate transitions below. Select at most one to advance."];
    options.forEach((option, idx) => {
      const segments: string[] = [];
      const headerParts: string[] = [];
      if (option.label) headerParts.push(option.label);
      if (option.targetName) headerParts.push(`Next: ${option.targetName}`);
      const headerSuffix = headerParts.length ? ` ${headerParts.join(" | ")}` : "";
      segments.push(`${idx + 1}. [${option.id}]${headerSuffix}`.trim());
      if (option.description) segments.push(`   ${option.description}`);
      if (option.condition) segments.push(`   Condition: ${option.condition}`);
      lines.push(segments.join("\n"));
    });
    lines.push('If none should advance, respond with {"decision": "continue"} and null transition.');
    return lines.join("\n");
  }

  private formatStatusLabel(status: CheckpointStatus): string {
    switch (status) {
      case CheckpointStatus.Complete:
        return "Complete";
      case CheckpointStatus.Failed:
        return "Failed";
      case CheckpointStatus.Current:
        return "Current";
      case CheckpointStatus.Pending:
      default:
        return "Pending";
    }
  }

  private buildStoryDescription(): string {
    const story = this.story;
    if (!story) return "";
    return story.description?.trim() ?? "";
  }

  private buildCurrentCheckpointSummary(cp?: NormalizedCheckpoint): string {
    if (!cp) return "";
    const lines: string[] = [`Name: ${cp.name}`];
    if (cp.objective) lines.push(`Objective: ${cp.objective}`);
    return lines.join("\n");
  }

  private buildPastCheckpointsSummary(statuses: CheckpointStatus[], currentIndex: number): string {
    if (!statuses.length || currentIndex <= 0) {
      return "None completed yet.";
    }

    const checkpoints = this.story.checkpoints ?? [];
    const summaryLines: string[] = [];
    for (let i = currentIndex - 1; i >= 0; i -= 1) {
      const cp = checkpoints[i];
      if (!cp) continue;
      const status = statuses[i];
      if (status !== CheckpointStatus.Complete && status !== CheckpointStatus.Failed) continue;
      summaryLines.push(`- [${this.formatStatusLabel(status)}] ${cp.name} — ${cp.objective}`);
    }

    if (!summaryLines.length) {
      return "None completed yet.";
    }

    return summaryLines.join("\n");
  }

  private buildPromptContext(runtime: RuntimeStoryState, candidates?: ArbiterTransitionOption[]): StoryPromptContextSnapshot {
    const checkpointIndex = clampCheckpointIndex(runtime.checkpointIndex, this.story);
    const checkpoint = this.story.checkpoints[checkpointIndex];
    const statuses = deriveCheckpointStatuses(this.story, runtime);
    const transitionOptions = candidates && candidates.length ? candidates : this.buildArbiterOptions([]);

    return {
      storyTitle: this.story.title ?? "",
      storyDescription: this.buildStoryDescription(),
      currentCheckpointSummary: this.buildCurrentCheckpointSummary(checkpoint),
      pastCheckpointsSummary: this.buildPastCheckpointsSummary(statuses, checkpointIndex),
      transitionSummary: this.summarizeTransitions(transitionOptions),
    };
  }

  private updateStoryMacrosFromContext(context: StoryPromptContextSnapshot) {
    updateStoryMacroSnapshot({
      storyDescription: context.storyDescription,
      currentCheckpoint: context.currentCheckpointSummary,
      pastCheckpoints: context.pastCheckpointsSummary,
      possibleTriggers: context.transitionSummary,
      storyTitle: context.storyTitle,
    });
  }

  private findTriggeredTimedTransition(turnCount: number): TransitionTriggerMatch | undefined {
    if (!this.activeTransitions.length || turnCount <= 0) return undefined;
    const candidates: TransitionTriggerMatch[] = [];
    this.activeTransitions.forEach((transition) => {
      const trigger = transition.trigger;
      if (trigger.type !== "timed") return;
      const threshold = trigger.withinTurns ?? 0;
      if (threshold > 0 && turnCount >= threshold) {
        candidates.push({
          transition,
          trigger,
          pattern: `timed<=${threshold}`,
        });
      }
    });
    if (!candidates.length) return undefined;
    candidates.sort((a, b) => (a.trigger.withinTurns ?? Infinity) - (b.trigger.withinTurns ?? Infinity));
    return candidates[0];
  }

  private setRuntime(next: RuntimeStoryState, options?: { hydrated?: boolean }) {
    return storySessionStore.getState().setRuntime(next, options);
  }

  private get turn(): number {
    return storySessionStore.getState().turn;
  }

  private setTurn(value: number) {
    const normalized = storySessionStore.getState().setTurn(value);
    updateTalkControlTurn(normalized);
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
    const { eventSource, eventTypes } = getContext();
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
      const offs: Array<() => void> = [];
      const handler = () => this.handleChatChanged({ reason: "event" });
      const events = [
        eventTypes.CHAT_CHANGED,
        eventTypes.CHAT_CREATED,
        eventTypes.GROUP_CHAT_CREATED,
        eventTypes.CHAT_DELETED,
        eventTypes.GROUP_CHAT_DELETED,
      ].filter(Boolean);
      for (const ev of events) {
        offs.push(subscribeToEventSource({ source: eventSource, eventName: ev, handler }));
      }
      this.chatUnsubscribe = () => {
        offs.splice(0).forEach((off) => {
          try {
            off?.();
          } catch (err) {
            console.warn("[StoryOrch] Failed to unsubscribe from chat event", err);
          }
        });
      };
    }

    this.handleChatChanged({ reason: "start", force: true });
  }

  activateIndex(i: number) {
    this.applyCheckpoint(i, { persist: true, resetSinceEval: true, reason: "activate" });
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
    this.applyCheckpoint(target, { persist: true, resetSinceEval: true, reason: "activate" });
    return true;
  }

  evaluateNow(reason: ArbiterReason = "manual"): boolean {
    const hasRegexTransitions = this.activeTransitions.some((edge) => edge.trigger.type === "regex");
    if (!hasRegexTransitions) return false;
    this.enqueueEval(reason, "(manual review)", []);
    return true;
  }

  requestPersist(): boolean {
    try {
      if (!this.persistence.canPersist()) return false;
      this.persistence.writeRuntime(this.runtime, { persist: true, hydrated: true, skipStore: true });
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

    const timedMatch = this.findTriggeredTimedTransition(updatedRuntime.checkpointTurnCount ?? 0);
    if (timedMatch) {
      const selection = this.toTransitionSelection(timedMatch.transition, timedMatch);
      if (selection) {
        try {
          this.onEvaluated?.({
            outcome: "advance",
            reason: "timed",
            turn: nextTurn,
            cpIndex: updatedRuntime.checkpointIndex,
            matches: [timedMatch],
            selectedTransition: selection,
          });
        } catch (err) {
          console.warn("[StoryOrch] evaluation handler failed", err);
        }
      }
      return;
    }

    const regexTransitions = this.activeTransitions.filter((edge) => edge.trigger.type === "regex");
    if (!regexTransitions.length) return;

    const regexMatches = evaluateTransitionTriggers({
      text,
      transitions: regexTransitions,
      turnsSinceEval: updatedRuntime.turnsSinceEval,
    });

    if (regexMatches.length) {
      this.enqueueEval("trigger", text, regexMatches);
    } else if (updatedRuntime.turnsSinceEval >= this.intervalTurns) {
      this.enqueueEval("interval", text, []);
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


  private async applyWorldInfoForCheckpoint(cp?: NormalizedCheckpoint) {
    const lorebook = this.story.global_lorebook;
    if (!cp || !lorebook) return;

    const worldInfo = cp.onActivate?.world_info;
    if (!worldInfo) return;

    if (!Array.isArray(worldInfo.activate) && !Array.isArray(worldInfo.deactivate)) return;

    const activateList = Array.isArray(worldInfo.activate) ? worldInfo.activate : [];
    const deactivateList = Array.isArray(worldInfo.deactivate) ? worldInfo.deactivate : [];

    if (activateList.length) {
      await enableWIEntry(lorebook, activateList);
    }

    if (deactivateList.length) {
      await disableWIEntry(lorebook, deactivateList);
    }
  }

  private async applyAutomationsForCheckpoint(cp?: NormalizedCheckpoint) {
    if (!cp) return;

    const automations = cp.onActivate?.automations;
    if (!Array.isArray(automations) || !automations.length) return;

    const commands = automations.map((cmd) => (typeof cmd === "string" ? cmd.trim() : "")).filter(Boolean);
    if (!commands.length) return;

    console.log("[StoryOrch] automations run", {
      cp: cp.name,
      commands,
    });

    try {
      const ok = await executeSlashCommands(commands, { silent: true, delayMs: 150 });
      if (!ok) {
        console.warn("[StoryOrch] automations reported failure", { cp: cp.name, commands });
      }
    } catch (err) {
      console.warn("[StoryOrch] automations failed", { cp: cp.name, err });
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
      this.reconcileWithRuntime(runtime, { source: "default" });
      console.log("[StoryOrch] handleChatChanged chat sync reset", { reason });
      return;
    }

    const hydrateResult = this.persistence.hydrate();
    console.log("[StoryOrch] chat sync hydrate", { reason, source: hydrateResult.source });
    this.reconcileWithRuntime(hydrateResult.runtime, { source: hydrateResult.source });
  }

  private reconcileWithRuntime(runtime?: RuntimeStoryState, options?: { source?: "stored" | "default" }) {
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
        persist: options?.source === "default",
        resetSinceEval: false,
        sinceEvalOverride: sanitizedSince,
        reason: "hydrate",
      });
    } else {
      const updatedRuntime = this.persistence.setTurnsSinceEval(sanitizedSince, { persist: false });
      this.setTurn(sanitizedSince);
      this.onTurnTick?.({ turn: sanitizedSince, sinceEval: updatedRuntime.turnsSinceEval });

      const cp = this.story.checkpoints[targetIndex];
      if (cp && options?.source === "default") {
        this.applyAutomationsForCheckpoint(cp);
      }
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
    const isManualActivation = opts.reason === "activate";

    const computeTurns = (override?: number) => {
      const baseSince = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? sanitizeTurnsSinceEval(override)
          : prevRuntime.turnsSinceEval;
      const preservedCheckpointTurns = opts.resetSinceEval || checkpointIndex !== prevRuntime.checkpointIndex
        ? 0
        : prevRuntime.checkpointTurnCount ?? 0;
      const turn = opts.resetSinceEval
        ? 0
        : typeof override === "number"
          ? Math.max(0, baseSince)
          : Math.max(currentTurn, baseSince);
      return {
        since: opts.resetSinceEval ? 0 : baseSince,
        checkpointTurns: preservedCheckpointTurns,
        turn,
      };
    };

    const applyRuntime = (runtimePayload: RuntimeStoryState, nextTurn: number) => {
      const sanitized = this.setRuntime(runtimePayload, { hydrated: hydratedFlag });
      this.setTurn(nextTurn);
      this.onTurnTick?.({ turn: nextTurn, sinceEval: sanitized.turnsSinceEval });
      this.persistence.writeRuntime(sanitized, { persist: persistRequested, skipStore: true, hydrated: hydratedFlag });
      return sanitized;
    };

    if (!checkpoints.length) {
      this.checkpointPrimed = true;
      this.activeTransitions = [];
      this.checkpointArbiter.clear();
      const { since, turn } = computeTurns(opts.sinceEvalOverride);
      const emptyRuntime: RuntimeStoryState = {
        checkpointIndex: 0,
        activeCheckpointKey: null,
        turnsSinceEval: since,
        checkpointTurnCount: 0,
        checkpointStatusMap: { ...prevRuntime.checkpointStatusMap },
      };
      const sanitized = applyRuntime(emptyRuntime, turn);
      this.updateStoryMacrosFromContext({
        storyTitle: this.story.title ?? "",
        storyDescription: this.buildStoryDescription(),
        currentCheckpointSummary: "",
        pastCheckpointsSummary: "",
        transitionSummary: "No transition candidates are currently available.",
      });
      setTalkControlCheckpoint(null, { emitEnter: false });
      if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
      return;
    }

    const checkpointIndex = clampCheckpointIndex(index, this.story);
    const cp = checkpoints[checkpointIndex] ?? checkpoints[0];
    const activeKey = cp?.id ?? null;

    this.checkpointPrimed = true;
    this.activeTransitions = cp ? (this.story.transitionsByFrom.get(cp.id) ?? []) : [];
    this.checkpointArbiter.clear();

    const { since, checkpointTurns, turn } = computeTurns(opts.sinceEvalOverride);
    const statusMap = computeStatusMapForIndex(this.story, checkpointIndex, prevRuntime.checkpointStatusMap);
    const runtimePayload: RuntimeStoryState = {
      checkpointIndex,
      activeCheckpointKey: activeKey,
      turnsSinceEval: since,
      checkpointTurnCount: checkpointTurns,
      checkpointStatusMap: statusMap,
    };
    const sanitized = applyRuntime(runtimePayload, turn);
    const contextSnapshot = this.buildPromptContext(sanitized, this.buildArbiterOptions([]));
    this.updateStoryMacrosFromContext(contextSnapshot);

    setTalkControlCheckpoint(activeKey, { emitEnter: isManualActivation });

    this.applyWorldInfoForCheckpoint(cp);
    this.applyAutomationsForCheckpoint(cp);
    if (opts.reason) this.emitActivate(sanitized.checkpointIndex);
  }


  private enqueueEval(reason: ArbiterReason, text: string, matches: TransitionTriggerMatch[]) {
    const turnSnapshot = this.turn;
    const runtime = this.persistence.setTurnsSinceEval(0, { persist: true });
    this.onTurnTick?.({ turn: turnSnapshot, sinceEval: runtime.turnsSinceEval });

    const checkpointIndex = runtime.checkpointIndex;
    const cp = this.story.checkpoints[checkpointIndex];
    const options = this.buildArbiterOptions(matches);
    const matchedSummary = matches.map((entry) => `${entry.transition.id}:${entry.pattern}`).join(", ");
    console.log("[StoryOrch] eval-queued", { reason, turn: turnSnapshot, matched: matchedSummary });
    if (!options.length) {
      console.log("[StoryOrch] eval skipped (no transition candidates available)");
      return;
    }

    notifyTalkControlArbiterPhase("before");
    this.applyArbiterPreset(cp);

    const promptContext = this.buildPromptContext(runtime, options);
    this.updateStoryMacrosFromContext(promptContext);

    this.checkpointArbiter.evaluate({
      cpName: cp?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      checkpointObjective: cp?.objective,
      latestText: text,
      reason,
      matched: matchedSummary || undefined,
      turn: turnSnapshot,
      intervalTurns: this.intervalTurns,
      candidates: options,
    }).then((payload) => {
      const outcome = payload?.outcome ?? "continue";
      const nextId = payload?.nextTransitionId ?? payload?.parsed?.nextTransitionId;
      const selection = this.resolveTransitionSelection(nextId, matches);
      try {
        this.onEvaluated?.({
          outcome,
          reason,
          turn: turnSnapshot,
          cpIndex: checkpointIndex,
          matches,
          selectedTransition: selection,
        });
      } catch (err) {
        console.warn("[StoryOrch] evaluation handler failed", err);
      }
    }).catch((err) => {
      console.warn("[StoryOrch] arbiter error", err);
    }).finally(() => {
      notifyTalkControlArbiterPhase("after");
    });
  }

  private applyArbiterPreset(cp: NormalizedCheckpoint) {
    if (!cp) return;
    try {
      const overrides = cp.onActivate?.arbiter_preset;
      this.presetService.applyForRole(ARBITER_ROLE_KEY, overrides, cp.name);
      console.log("[StoryOrch] applied arbiter preset", { checkpoint: cp.name, overrideKeys: overrides ? Object.keys(overrides) : [] });
    } catch (err) {
      console.warn("[StoryOrch] failed to apply arbiter preset", err);
    }
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
    this.intervalTurns = this.defaultIntervalTurns;
    this.setArbiterPrompt(this.defaultArbiterPrompt);
    this.roleNameMap.clear();
    this.activeTransitions = [];
    this.checkpointPrimed = false;
    setTalkControlCheckpoint(null, { emitEnter: false });
    this.lastChatId = null;
    this.lastGroupSelected = false;
    this.onActivateIndex = undefined;
    this.onEvaluated = undefined;
    resetStoryMacroSnapshot();
  }
}

export default StoryOrchestrator;
