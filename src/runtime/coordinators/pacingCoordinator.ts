import {
  TENSION_CURRENT_KEY, agencyForCheckpoint, guidanceForMember, objectiveLineApplies, offersEncounters, openPhase, openStretch, pullStage, stretchDestination,
  type ArcTemplate, type BoundaryLogEntry, type BoundaryResult,
  type Checkpoint, type EngineState, type NormalizedStory, type TensionLevel,
} from "@engine/index";
import type { ParsedDelta } from "@extraction/index";
import { OPENING_LINE, composeGuidanceBlock, encounterOfferLine, getSteeringHint, pullLine, quietRead, tensionEvidenceFresh, updateEma, type EncounterOffer } from "@pacing/index";
import { PACING_HINT_DEPTH, PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";

const GUIDANCE = INJECTION_REGISTRY.checkpointGuidance;
import { computeExpectedTension } from "../snapshot";
import { appendTensionHistory, defaultTension } from "../tensionState";
import type { ChatHost, PromptHost } from "../hostPorts";
import { playerTurnIds } from "../agencyRecovery";
import { playerTurnsInCheckpoint } from "../stretchTurns";
import type { PacingSettings, TensionRuntimeState } from "../types";

const TENSION_LEVEL_LIMIT = 50;

export interface PacingCoordinatorDeps {
  getStory: () => NormalizedStory | null;
  getState: () => EngineState | null;
  getStateLog: () => BoundaryLogEntry[];
  getEncounters?: (stretchId: string) => EncounterOffer[];
  getTensionTarget: () => string | undefined;
  getTension: () => TensionRuntimeState;
  setTension: (next: TensionRuntimeState) => void;
  getPacing: () => PacingSettings;
  hosts: { prompt: PromptHost; chat?: Pick<ChatHost, "chatRows"> };
  ended?: () => boolean;
  onHoldChange?: () => void;
}

// Tension is written twice: optimistically while extractor deltas are queued (so the smoothed
// value the model sees is the one it will commit), then authoritatively from the applied queue at
// the boundary. Everything between those two writes lives here.
export class PacingCoordinator {
  private pending: TensionRuntimeState | null = null;
  private sampled: { to: number; before: number | null } | null = null;
  private drafted: string | null = null;
  private withheld = false;
  private direction: { rosterId: string; name: string; text: string; scope: "call" | "draft" } | null = null;

  constructor(private readonly deps: PacingCoordinatorDeps) {}

  clearPending() {
    this.pending = null;
  }

  reset() {
    this.pending = null;
    this.sampled = null;
    this.direction = null;
  }

  applyExtractorTension(acceptedDeltas: ParsedDelta[], windowTo: number): { accepted: ParsedDelta[]; levels: TensionLevel[] } {
    const levels: TensionLevel[] = [];
    const accepted = acceptedDeltas.filter((entry) => {
      if (entry.delta.q !== TENSION_CURRENT_KEY || !entry.rawLevel) return true;
      if (!tensionEvidenceFresh(entry.messageId, windowTo) || (this.sampled && windowTo < this.sampled.to)) return false;
      const base = this.pending ?? this.deps.getTension();
      const before = this.sampled?.to === windowTo ? this.sampled.before : base.smoothed;
      this.sampled = { to: windowTo, before };
      const smoothed = updateEma(before, entry.delta.v as number, this.deps.getPacing().alpha);
      this.pending = { ...base, levels: [...base.levels, entry.rawLevel].slice(-TENSION_LEVEL_LIMIT), smoothed };
      levels.push(entry.rawLevel);
      entry.delta.v = smoothed;
      return true;
    });
    return { accepted, levels };
  }

  applyCommitted(result: BoundaryResult) {
    result.queue.applied.forEach((entry) => {
      const levels = entry.tensionLevels ?? [];
      let levelIndex = 0;
      entry.deltas.forEach((delta) => {
        if (delta.q !== TENSION_CURRENT_KEY || typeof delta.v !== "number") return;
        const level = levels[levelIndex];
        levelIndex += 1;
        const current = this.deps.getTension();
        this.deps.setTension({
          levels: level ? [...current.levels, level].slice(-TENSION_LEVEL_LIMIT) : current.levels,
          smoothed: delta.v,
          history: appendTensionHistory(current.history, { messageId: result.context.lastMessageId, level, smoothed: delta.v }),
        });
      });
    });
  }

  // Rollback drops committed boundaries, so the smoothed series is rebuilt from the surviving log
  // rather than unwound.
  replayCommitted() {
    const tension = defaultTension();
    const log = this.deps.getStateLog();
    const floor = log[0]?.context.lastMessageId;
    tension.history = floor === undefined ? [] : this.deps.getTension().history.filter((row) => row.messageId < floor);
    log.forEach((entry) => {
      entry.queue.applied.forEach((applied) => {
        const levels = applied.tensionLevels ?? [];
        let levelIndex = 0;
        applied.deltas.forEach((delta) => {
          if (delta.q !== TENSION_CURRENT_KEY || typeof delta.v !== "number") return;
          const level = levels[levelIndex];
          levelIndex += 1;
          if (level) tension.levels = [...tension.levels, level].slice(-TENSION_LEVEL_LIMIT);
          tension.smoothed = delta.v;
          tension.history = appendTensionHistory(tension.history, { messageId: entry.context.lastMessageId, level, smoothed: delta.v });
        });
      });
    });
    this.deps.setTension(tension);
    this.reset();
  }

  private effectiveShape(): ArcTemplate | null {
    return this.deps.getPacing().shapeOverride ?? this.deps.getStory()?.arc_template ?? null;
  }

  expectedTension(): number | null {
    return computeExpectedTension(this.deps.getStory(), this.deps.getState(), this.deps.getTensionTarget(), this.effectiveShape());
  }

  updateSteering() {
    const story = this.deps.getStory();
    const prompt = this.deps.hosts.prompt;
    if (!story || this.deps.ended?.() || this.withheld) {
      prompt.clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      this.clearGuidance();
      return;
    }
    const activeId = this.deps.getState()?.activeCheckpointId ?? null;
    const policy = agencyForCheckpoint(story, activeId);
    const hint = getSteeringHint(this.deps.getTension().smoothed, this.expectedTension(), undefined, policy);
    if (this.deps.getPacing().hintEnabled && hint) prompt.setStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY, hint.text, PACING_HINT_DEPTH);
    else prompt.clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
    const active = activeId ? story.checkpointById[activeId] : null;
    const rows = this.deps.hosts.chat?.chatRows() ?? [];
    const turns = active?.stretch ? playerTurnsInCheckpoint(this.deps.getState(), rows) : 0;
    const guidance = composeGuidanceBlock(active, policy, objectiveLineApplies(story, active, turns), this.memberLine(story, active), this.stretchLine(story, active, rows, turns),
      this.oneShotLine());
    if (guidance) prompt.setStoryExtensionPrompt(GUIDANCE.key, guidance, GUIDANCE.depth);
    else this.clearGuidance();
  }

  private stretchLine(story: NormalizedStory, active: Checkpoint | null, rows: readonly unknown[], turns: number): string | null {
    const stretch = openStretch(active);
    if (!active) return null;
    if (!stretch) return openPhase(active, turns) ? OPENING_LINE : null;
    const quiet = offersEncounters(active) ? quietRead({ story, state: this.deps.getState(), log: this.deps.getStateLog(), playerTurnIds: playerTurnIds(rows) }) : null;
    const offer = quiet?.holds ? encounterOfferLine(this.deps.getEncounters?.(active.id) ?? []) : "";
    return [pullLine(pullStage(stretch, turns), stretchDestination(story, active.id)), offer].filter(Boolean).join("\n");
  }

  private memberLine(story: NormalizedStory, active: Checkpoint | null) {
    const id = this.withheld ? null : this.drafted;
    const text = guidanceForMember(active?.guidance, id);
    if (!id || !text) return null;
    const member = story.roster.find((entry) => entry.id === id);
    return { name: member?.name ?? id, text };
  }

  private oneShotLine() {
    const direction = this.direction;
    return direction && !this.withheld && this.drafted === direction.rosterId ? { name: direction.name, text: direction.text } : null;
  }

  armDirection(member: string, text: string, scope: "call" | "draft" = "call"): (() => void) | null {
    const ref = member.trim().toLowerCase();
    const entry = this.deps.getStory()?.roster.find((candidate) => [candidate.id, candidate.name ?? ""].some((name) => name.trim().toLowerCase() === ref));
    if (!entry || !text.trim()) return null;
    const direction = { rosterId: entry.id, name: entry.name ?? entry.id, text: text.trim(), scope };
    this.direction = direction;
    this.updateSteering();
    return () => {
      if (this.direction !== direction) return;
      this.direction = null;
      this.updateSteering();
    };
  }

  draftGuidance(rosterId: string | null) {
    this.drafted = rosterId;
    this.updateSteering();
  }

  get holding(): boolean { return this.withheld; }

  releaseDraftGuidance() {
    this.drafted = null;
    if (this.direction?.scope === "draft") this.direction = null;
    this.setHold(false);
    this.updateSteering();
  }

  releaseStaleGuidanceHold() {
    if (!this.withheld) return;
    this.setHold(false);
    this.updateSteering();
  }

  withholdGuidance() {
    this.setHold(true);
    this.deps.hosts.prompt.clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
    this.clearGuidance();
  }

  private setHold(held: boolean) {
    if (this.withheld === held) return;
    this.withheld = held;
    this.deps.onHoldChange?.();
  }

  private clearGuidance() {
    this.deps.hosts.prompt.clearStoryExtensionPrompt(GUIDANCE.key);
  }
}
