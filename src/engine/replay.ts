import type { ApplyQueueEntry } from "./applyQueue";
import { StoryEngine } from "./engine";
import { parseStoryV2OrThrow } from "./validate";

export type ReplayStep =
  | { type: "write"; entry: ApplyQueueEntry }
  | { type: "boundary" }
  | { type: "assert"; activeCheckpointId?: string; blackboard?: Record<string, unknown>; visitedAnchors?: string[] };

export interface ReplayResult {
  engine: StoryEngine;
  assertions: number;
}

export const runReplay = (storyJson: unknown, steps: ReplayStep[]): ReplayResult => {
  const story = parseStoryV2OrThrow(storyJson);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  let assertions = 0;

  steps.forEach((step) => {
    if (step.type === "write") engine.enqueue(step.entry);
    if (step.type === "boundary") engine.commitBoundary();
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
  });

  return { engine, assertions };
};
