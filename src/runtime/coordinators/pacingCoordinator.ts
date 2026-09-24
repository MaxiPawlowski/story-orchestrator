import {
  TENSION_CURRENT_KEY, agencyForCheckpoint, type ArcTemplate, type BoundaryLogEntry, type BoundaryResult,
  type EngineState, type NormalizedStoryV2, type TensionLevel,
} from "@engine/index";
import type { ParsedDelta } from "@extraction/index";
import { composeGuidanceBlock, getSteeringHint, updateEma } from "@pacing/index";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { PACING_HINT_DEPTH, PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";

const GUIDANCE = INJECTION_REGISTRY.checkpointGuidance;
import { computeExpectedTension } from "../snapshot";
import { defaultTension } from "../extras";
import type { PacingSettings, TensionRuntimeState } from "../types";

const TENSION_LEVEL_LIMIT = 50;

export interface PacingCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getStateLog: () => BoundaryLogEntry[];
  getTensionTarget: () => string | undefined;
  getTension: () => TensionRuntimeState;
  setTension: (next: TensionRuntimeState) => void;
  getPacing: () => PacingSettings;
}

// Tension is written twice: optimistically while extractor deltas are queued (so the smoothed
// value the model sees is the one it will commit), then authoritatively from the applied queue at
// the boundary. Everything between those two writes lives here.
export class PacingCoordinator {
  private pending: TensionRuntimeState | null = null;

  constructor(private readonly deps: PacingCoordinatorDeps) {}

  clearPending() {
    this.pending = null;
  }

  applyExtractorTension(acceptedDeltas: ParsedDelta[]): TensionLevel[] {
    const levels: TensionLevel[] = [];
    acceptedDeltas.forEach((entry) => {
      if (entry.delta.q !== TENSION_CURRENT_KEY || !entry.rawLevel) return;
      const base = this.pending ?? this.deps.getTension();
      const smoothed = updateEma(base.smoothed, entry.delta.v as number, this.deps.getPacing().alpha);
      this.pending = { levels: [...base.levels, entry.rawLevel].slice(-TENSION_LEVEL_LIMIT), smoothed };
      levels.push(entry.rawLevel);
      entry.delta.v = smoothed;
    });
    return levels;
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
        });
      });
    });
  }

  // Rollback drops committed boundaries, so the smoothed series is rebuilt from the surviving log
  // rather than unwound.
  replayCommitted() {
    const tension = defaultTension();
    this.deps.getStateLog().forEach((entry) => {
      entry.queue.applied.forEach((applied) => {
        const levels = applied.tensionLevels ?? [];
        let levelIndex = 0;
        applied.deltas.forEach((delta) => {
          if (delta.q !== TENSION_CURRENT_KEY || typeof delta.v !== "number") return;
          const level = levels[levelIndex];
          levelIndex += 1;
          if (level) tension.levels = [...tension.levels, level].slice(-TENSION_LEVEL_LIMIT);
          tension.smoothed = delta.v;
        });
      });
    });
    this.deps.setTension(tension);
    this.pending = null;
  }

  private effectiveShape(): ArcTemplate | null {
    return this.deps.getPacing().shapeOverride ?? this.deps.getStory()?.arc_template ?? null;
  }

  expectedTension(): number | null {
    return computeExpectedTension(this.deps.getStory(), this.deps.getState(), this.deps.getTensionTarget(), this.effectiveShape());
  }

  updateSteering() {
    const story = this.deps.getStory();
    if (!story) {
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      this.withholdGuidance();
      return;
    }
    const activeId = this.deps.getState()?.activeCheckpointId ?? null;
    const policy = agencyForCheckpoint(story, activeId);
    const hint = getSteeringHint(this.deps.getTension().smoothed, this.expectedTension(), undefined, policy);
    if (this.deps.getPacing().hintEnabled && hint) setStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY, hint.text, PACING_HINT_DEPTH);
    else clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
    const guidance = composeGuidanceBlock(activeId ? story.checkpointById[activeId] : null, policy);
    if (guidance) setStoryExtensionPrompt(GUIDANCE.key, guidance, GUIDANCE.depth);
    else this.withholdGuidance();
  }

  withholdGuidance() {
    clearStoryExtensionPrompt(GUIDANCE.key);
  }
}
