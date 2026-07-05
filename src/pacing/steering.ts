import { DEFAULT_PACING_DRIFT_THRESHOLD } from "@constants/defaults";

export type SteeringDirection = "escalate" | "hold" | "ease";

export interface SteeringHint {
  direction: SteeringDirection;
  text: string;
}

export interface GenerationBias {
  direction: SteeringDirection;
  magnitude: number;
}

const HINT_TEXT: Record<SteeringDirection, string> = {
  escalate: "Pacing: raise the tension now — sharpen stakes, press the conflict forward.",
  hold: "Pacing: hold the current tension — sustain the mood without spiking or releasing it.",
  ease: "Pacing: ease the tension — let the scene breathe and settle before the next beat.",
};

export const getSteeringHint = (
  smoothed: number | null,
  expected: number | null,
  threshold: number = DEFAULT_PACING_DRIFT_THRESHOLD,
): SteeringHint | null => {
  if (smoothed === null || expected === null) return null;
  const direction: SteeringDirection = smoothed < expected - threshold ? "escalate" : smoothed > expected + threshold ? "ease" : "hold";
  return { direction, text: HINT_TEXT[direction] };
};

export const getGenerationBias = (smoothed: number | null, expected: number | null): GenerationBias | null => {
  if (smoothed === null || expected === null) return null;
  const drift = expected - smoothed;
  const direction: SteeringDirection = drift > 0 ? "escalate" : drift < 0 ? "ease" : "hold";
  return { direction, magnitude: Math.abs(drift) };
};

export const getTensionTrajectory = (fromTension: number, toTarget: number, steps: number): number[] => {
  if (steps <= 0) return [];
  if (steps === 1) return [toTarget];
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    return fromTension + ratio * (toTarget - fromTension);
  });
};
