import { expectedTension, levelToNumeric, updateEma } from "@pacing/index";
import type { ApplyQueueEntry } from "./applyQueue";
import { StoryEngine } from "./engine";
import { TENSION_CURRENT_KEY, type ArcTemplate, type TensionLevel } from "./schema";
import { parseStoryV2OrThrow } from "./validate";

export type ReplayStep =
  | { type: "write"; entry: ApplyQueueEntry }
  | { type: "boundary" }
  | { type: "tension"; level: TensionLevel; alpha?: number }
  | { type: "assert"; activeCheckpointId?: string; blackboard?: Record<string, unknown>; visitedAnchors?: string[] }
  | { type: "assertCurveFit"; template: ArcTemplate; maxMae: number };

export interface ReplayResult {
  engine: StoryEngine;
  assertions: number;
}

export const runReplay = (storyJson: unknown, steps: ReplayStep[]): ReplayResult => {
  const story = parseStoryV2OrThrow(storyJson);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const totalAnchors = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").length;
  let assertions = 0;
  let smoothed: number | null = null;
  const samples: Array<{ smoothed: number; progress: number }> = [];

  steps.forEach((step) => {
    if (step.type === "write") engine.enqueue(step.entry);
    if (step.type === "tension") {
      smoothed = updateEma(smoothed, levelToNumeric(step.level), step.alpha ?? 0.3);
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: smoothed, source: "extractor" }] });
    }
    if (step.type === "boundary") {
      engine.commitBoundary();
      if (smoothed !== null && totalAnchors > 0) {
        samples.push({ smoothed, progress: engine.serialize().visitedAnchors.length / totalAnchors });
      }
    }
    if (step.type === "assert") {
      assertions += 1;
      const state = engine.serialize();
      if (step.activeCheckpointId !== undefined && state.activeCheckpointId !== step.activeCheckpointId) {
        throw new Error(`expected active checkpoint ${step.activeCheckpointId}, got ${state.activeCheckpointId}`);
      }
      Object.entries(step.blackboard ?? {}).forEach(([key, value]) => {
        const actual = state.blackboard.values[key];
        if (actual !== value) throw new Error(`expected blackboard ${key}=${String(value)}, got ${String(actual)}`);
      });
      if (step.visitedAnchors && step.visitedAnchors.join("|") !== state.visitedAnchors.join("|")) {
        throw new Error(`expected anchors ${step.visitedAnchors.join(",")}, got ${state.visitedAnchors.join(",")}`);
      }
    }
    if (step.type === "assertCurveFit") {
      assertions += 1;
      if (!samples.length) throw new Error("curve fit assertion requires recorded tension samples");
      const mae = samples.reduce((sum, sample) => sum + Math.abs(sample.smoothed - expectedTension(step.template, sample.progress)), 0) / samples.length;
      if (mae > step.maxMae) throw new Error(`curve fit MAE ${mae.toFixed(3)} exceeds ${step.maxMae}`);
    }
  });

  return { engine, assertions };
};
