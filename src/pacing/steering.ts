import type { TensionLevel } from "@engine/index";
import { DEFAULT_PACING_DRIFT_THRESHOLD } from "@constants/defaults";
import { numericToLevel } from "./tension";

export type SteeringDirection = "escalate" | "hold" | "ease";

export interface SteeringHint {
  direction: SteeringDirection;
  text: string;
}

export interface GenerationBias {
  direction: SteeringDirection;
  magnitude: number;
}

const STRONG_DRIFT_THRESHOLD = 0.5;

const hintText = (direction: SteeringDirection, strong: boolean, level: TensionLevel): string => {
  if (direction === "hold") return `Pacing: hold the tension near ${level} — sustain the mood without spiking or releasing it.`;
  if (direction === "escalate") {
    return strong
      ? `Pacing: escalate sharply toward ${level} — force a confrontation, reveal, or hard consequence now.`
      : `Pacing: raise the tension toward ${level} — sharpen stakes, press the conflict forward.`;
  }
  return strong
    ? `Pacing: wind down decisively toward ${level} — release the pressure and let the scene recover.`
    : `Pacing: ease the tension toward ${level} — let the scene breathe and settle before the next beat.`;
};

export const getSteeringHint = (
  smoothed: number | null,
  expected: number | null,
  threshold: number = DEFAULT_PACING_DRIFT_THRESHOLD,
): SteeringHint | null => {
  if (smoothed === null || expected === null) return null;
  const drift = expected - smoothed;
  const direction: SteeringDirection = drift > threshold ? "escalate" : drift < -threshold ? "ease" : "hold";
  return { direction, text: hintText(direction, Math.abs(drift) > STRONG_DRIFT_THRESHOLD, numericToLevel(expected)) };
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
