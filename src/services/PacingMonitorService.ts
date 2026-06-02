import {
  DEFAULT_PACING_DRIFT_THRESHOLD,
  DEFAULT_TENSION_EMA_ALPHA,
} from "@constants/defaults";
import {
  derivePacingPhase,
  interpolateTensionTarget,
  type PacingPhase,
} from "@utils/arc-templates";
import type { NormalizedStory } from "@utils/story-validator";

export interface PacingState {
  expected_tension: number;
  tension_ema: number;
  drift: number;
  phase: PacingPhase;
  hint: string;
  shouldEscalate: boolean;
}

export interface PacingMonitorServiceOptions {
  story: NormalizedStory;
  emaAlpha?: number;
  driftThreshold?: number;
}

type DriftDirection = "low" | "high" | "aligned";

const clampUnit = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
};

const clampNonNegative = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
};

const resolveCheckpointProgress = (story: NormalizedStory, checkpointIndex: number): number => {
  if (!story.checkpoints.length) return 0;

  const safeIndex = Math.max(0, Math.min(Math.floor(checkpointIndex), story.checkpoints.length - 1));
  const checkpoint = story.checkpoints[safeIndex];
  if (checkpoint && Number.isFinite(checkpoint.progress_override)) {
    return clampUnit(checkpoint.progress_override as number);
  }

  return clampUnit(safeIndex / Math.max(story.checkpoints.length, 1));
};

const resolveDriftDirection = (drift: number): DriftDirection => {
  if (drift <= -0.08) return "low";
  if (drift >= 0.08) return "high";
  return "aligned";
};

const HINTS: Record<PacingPhase, Record<Exclude<DriftDirection, "aligned">, string>> = {
  setup: {
    low: "Tension is too flat for setup; seed a concrete uncertainty or quiet threat.",
    high: "Setup is already too tense; re-ground the scene so stakes can build cleanly.",
  },
  rising: {
    low: "Tension is lagging in the rising phase; escalate conflict or raise the cost of inaction.",
    high: "Rising action is rushing; vary pressure with complications instead of peaking too early.",
  },
  climax: {
    low: "Climax has not peaked yet; force a decisive confrontation or irreversible choice now.",
    high: "Climax is overstaying at full pressure; convert the peak into a turning decision.",
  },
  falling: {
    low: "The falling phase collapsed too fast; keep one meaningful aftershock in play before easing off.",
    high: "The falling phase is not releasing enough; let consequences land and reduce active pressure.",
  },
  denouement: {
    low: "Denouement is already resolved; use a brief reflective beat to close remaining threads.",
    high: "Denouement is still too tense; resolve leftover pressure and move toward closure.",
  },
};

const ALIGNED_HINT = "Pacing is on track; keep the current pressure profile without forcing a course correction.";

export class PacingMonitorService {
  private readonly story: NormalizedStory;
  private readonly emaAlpha: number;
  private readonly driftThreshold: number;
  private tensionEma?: number;

  constructor(options: PacingMonitorServiceOptions) {
    this.story = options.story;
    this.emaAlpha = clampUnit(options.emaAlpha ?? DEFAULT_TENSION_EMA_ALPHA, DEFAULT_TENSION_EMA_ALPHA);
    this.driftThreshold = clampNonNegative(
      options.driftThreshold ?? DEFAULT_PACING_DRIFT_THRESHOLD,
      DEFAULT_PACING_DRIFT_THRESHOLD,
    );
  }

  computeState(tensionReading: number, checkpointIndex: number): PacingState {
    const reading = clampUnit(tensionReading);
    const progress = resolveCheckpointProgress(this.story, checkpointIndex);
    const expected_tension = interpolateTensionTarget(
      this.story.checkpoints,
      checkpointIndex,
      this.story.arc_template,
    );
    const previousEma = this.tensionEma;
    const tension_ema = previousEma === undefined
      ? reading
      : clampUnit((this.emaAlpha * reading) + ((1 - this.emaAlpha) * previousEma));
    const phase = derivePacingPhase(progress, this.story.arc_template);
    const drift = tension_ema - expected_tension;
    const direction = resolveDriftDirection(drift);

    this.tensionEma = tension_ema;

    return {
      expected_tension,
      tension_ema,
      drift,
      phase,
      hint: direction === "aligned" ? ALIGNED_HINT : HINTS[phase][direction],
      shouldEscalate: Math.abs(drift) > this.driftThreshold,
    };
  }

  reset(): void {
    this.tensionEma = undefined;
  }

  hydrateEma(value: number): number | undefined {
    this.tensionEma = Number.isFinite(value) ? clampUnit(value) : undefined;
    return this.tensionEma;
  }
}
