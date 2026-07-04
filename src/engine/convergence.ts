import type { Blackboard } from "./blackboard";
import type { Checkpoint, Transition } from "./schema";

export const progressQualityForAnchor = (anchorId: string): string => `progress_toward_${anchorId}`;

export const thresholdFor = (anchor: Checkpoint): number => anchor.convergence_threshold ?? 1;

export const applyTransitionProgress = (blackboard: Blackboard, transition: Transition) => {
  const progress = transition.effects?.progress;
  if (!progress) return null;
  const key = progressQualityForAnchor(progress.anchor);
  const current = blackboard.get(key);
  const base = typeof current === "number" ? current : 0;
  return blackboard.applyDelta({ q: key, v: base + progress.amount, source: "code" });
};
