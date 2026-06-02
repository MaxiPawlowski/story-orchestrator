import type {
  ArbiterReason,
  ArbiterTransitionOption,
  CheckpointArbiterApi,
  EvaluationOutcome,
} from "@services/CheckpointArbiterService";
import type { RuntimeStoryState, TransitionTriggerMatch } from "@utils/story-state";
import { evaluateTransitionTriggers } from "@utils/story-state";
import type { NormalizedCheckpoint, NormalizedStory, NormalizedTransition } from "@utils/story-validator";
import { createStoryPromptContext, type StoryPromptContextSnapshot } from "./storyPromptContext";

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
  observedEvents?: string[];
}

interface StoryEvaluationCoordinatorOptions {
  story: NormalizedStory;
  checkpointArbiter: CheckpointArbiterApi;
  setTurnsSinceEval: (value: number) => RuntimeStoryState;
  applyArbiterPreset: (checkpoint?: NormalizedCheckpoint) => void;
  notifyArbiterPhase: (phase: "before" | "after") => void;
  updateStoryMacros: (context: StoryPromptContextSnapshot) => void;
  onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  onEvaluated?: (event: EvaluatedEvent) => void;
}

export type StoryTransitionSelection = TransitionSelection;
export type StoryEvaluationEvent = EvaluatedEvent;

export class StoryEvaluationCoordinator {
  private readonly story: NormalizedStory;
  private readonly checkpointArbiter: CheckpointArbiterApi;
  private readonly setTurnsSinceEval: (value: number) => RuntimeStoryState;
  private readonly applyArbiterPreset: (checkpoint?: NormalizedCheckpoint) => void;
  private readonly notifyArbiterPhase: (phase: "before" | "after") => void;
  private readonly updateStoryMacros: (context: StoryPromptContextSnapshot) => void;
  private onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
  private onEvaluated?: (event: EvaluatedEvent) => void;

  constructor(options: StoryEvaluationCoordinatorOptions) {
    this.story = options.story;
    this.checkpointArbiter = options.checkpointArbiter;
    this.setTurnsSinceEval = options.setTurnsSinceEval;
    this.applyArbiterPreset = options.applyArbiterPreset;
    this.notifyArbiterPhase = options.notifyArbiterPhase;
    this.updateStoryMacros = options.updateStoryMacros;
    this.onTurnTick = options.onTurnTick;
    this.onEvaluated = options.onEvaluated;
  }

  setOnEvaluated(handler?: (event: EvaluatedEvent) => void) {
    this.onEvaluated = handler;
  }

  setOnTurnTick(handler?: (next: { turn: number; sinceEval: number }) => void) {
    this.onTurnTick = handler;
  }

  private resolveTargetIndex(edge: NormalizedTransition): number {
    return this.story.checkpoints.findIndex((cp) => cp.id === edge.to);
  }

  private toTransitionSelection(edge: NormalizedTransition, match?: TransitionTriggerMatch): TransitionSelection | undefined {
    const targetIndex = this.resolveTargetIndex(edge);
    if (targetIndex < 0) return undefined;
    const target = this.story.checkpoints[targetIndex];
    const triggerInfo = match?.trigger
      ? {
        type: match.trigger.type,
        pattern: match.pattern,
        label: match.trigger.raw?.id ?? edge.label ?? edge.id,
      }
      : undefined;
    return {
      id: edge.id,
      targetIndex,
      targetId: target?.id ?? edge.to,
      ...(triggerInfo ? { trigger: triggerInfo } : {}),
    };
  }

  buildArbiterOptions(activeTransitions: NormalizedTransition[], matches: TransitionTriggerMatch[]): ArbiterTransitionOption[] {
    const matchById = new Map<string, TransitionTriggerMatch>();
    matches.forEach((entry) => {
      matchById.set(entry.transition.id, entry);
    });

    return activeTransitions
      .filter((edge) => edge.trigger.type === "regex")
      .map((edge) => {
        const match = matchById.get(edge.id);
        const target = this.story.checkpoints.find((cp) => cp.id === edge.to);
        const trigger = match?.trigger ?? edge.trigger;
        const triggerLabel = trigger.raw?.id ?? edge.label ?? edge.id;
        const pattern = match?.pattern ?? (trigger.regexes?.[0] ? trigger.regexes[0].toString() : undefined);
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

  buildPromptContext(runtime: RuntimeStoryState, activeTransitions: NormalizedTransition[], matches: TransitionTriggerMatch[] = []) {
    return createStoryPromptContext(this.story, runtime, this.buildArbiterOptions(activeTransitions, matches));
  }

  hasRegexTransitions(activeTransitions: NormalizedTransition[]): boolean {
    return activeTransitions.some((edge) => edge.trigger.type === "regex");
  }

  findRegexMatches(text: string, activeTransitions: NormalizedTransition[]): TransitionTriggerMatch[] {
    return evaluateTransitionTriggers({
      text,
      transitions: activeTransitions.filter((edge) => edge.trigger.type === "regex"),
    });
  }

  findTriggeredTimedTransition(activeTransitions: NormalizedTransition[], turnCount: number): TransitionTriggerMatch | undefined {
    if (!activeTransitions.length || turnCount <= 0) return undefined;
    const candidates: TransitionTriggerMatch[] = [];
    activeTransitions.forEach((transition) => {
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

  resolveTransitionSelection(
    activeTransitions: NormalizedTransition[],
    nextTransitionId: string | null | undefined,
    matches: TransitionTriggerMatch[],
  ): TransitionSelection | undefined {
    if (!activeTransitions.length) return undefined;

    let chosen: NormalizedTransition | undefined;
    let matched: TransitionTriggerMatch | undefined;

    if (nextTransitionId) {
      matched = matches.find((entry) => entry.transition.id === nextTransitionId);
      chosen = matched?.transition ?? activeTransitions.find((edge) => edge.id === nextTransitionId);
    }

    if (!chosen && matches.length) {
      matched = matches[0];
      chosen = matched.transition;
    }

    if (!chosen && activeTransitions.length === 1) {
      chosen = activeTransitions[0];
    }

    if (!chosen) return undefined;
    if (!matched || matched.transition.id !== chosen.id) {
      matched = matches.find((entry) => entry.transition.id === chosen!.id);
    }

    return this.toTransitionSelection(chosen, matched);
  }

  emitTimedEvaluation(match: TransitionTriggerMatch, turn: number, checkpointIndex: number) {
    const selection = this.toTransitionSelection(match.transition, match);
    if (!selection) return;
    try {
      this.onEvaluated?.({
        outcome: "advance",
        reason: "timed",
        turn,
        cpIndex: checkpointIndex,
        matches: [match],
        selectedTransition: selection,
      });
    } catch (err) {
      console.warn("[StoryOrch] evaluation handler failed", err);
    }
  }

  queueEvaluation(args: {
    reason: ArbiterReason;
    latestText: string;
    matches: TransitionTriggerMatch[];
    activeTransitions: NormalizedTransition[];
    turn: number;
    intervalTurns: number;
    checkpointIndex: number;
  }) {
    const runtime = this.setTurnsSinceEval(0);
    this.onTurnTick?.({ turn: args.turn, sinceEval: runtime.turnsSinceEval });

    const checkpointIndex = runtime.checkpointIndex;
    const checkpoint = this.story.checkpoints[checkpointIndex];
    const options = this.buildArbiterOptions(args.activeTransitions, args.matches);
    const matchedSummary = args.matches.map((entry) => `${entry.transition.id}:${entry.pattern}`).join(", ");
    console.log("[StoryOrch] eval-queued", { reason: args.reason, turn: args.turn, matched: matchedSummary });
    if (!options.length) {
      console.log("[StoryOrch] eval skipped (no transition candidates available)");
      return;
    }

    this.notifyArbiterPhase("before");
    this.applyArbiterPreset(checkpoint);
    this.updateStoryMacros(this.buildPromptContext(runtime, args.activeTransitions, args.matches));

    this.checkpointArbiter.evaluate({
      cpName: checkpoint?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      checkpointObjective: checkpoint?.objective,
      latestText: args.latestText,
      reason: args.reason,
      matched: matchedSummary || undefined,
      turn: args.turn,
      intervalTurns: args.intervalTurns,
      candidates: options,
    }).then((payload) => {
      const outcome = payload?.outcome ?? "continue";
      const nextId = payload?.nextTransitionId ?? payload?.parsed?.nextTransitionId;
      const selection = this.resolveTransitionSelection(args.activeTransitions, nextId, args.matches);
      try {
        this.onEvaluated?.({
          outcome,
          reason: args.reason,
          turn: args.turn,
          cpIndex: checkpointIndex,
          matches: args.matches,
          selectedTransition: selection,
          observedEvents: payload?.observedEvents,
        });
      } catch (err) {
        console.warn("[StoryOrch] evaluation handler failed", err);
      }
    }).catch((err) => {
      console.warn("[StoryOrch] arbiter error", err);
    }).finally(() => {
      this.notifyArbiterPhase("after");
    });
  }
}
