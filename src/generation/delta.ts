import type { BlackboardSnapshot, NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import type { QualityDeltaPlan } from "./types";

const distanceBetween = (current: PrimitiveValue | undefined, target: PrimitiveValue): number | null => {
  if (typeof current === "number" && typeof target === "number") return Math.abs(target - current);
  return current === target ? 0 : null;
};

export function computeStateDelta(
  blackboard: BlackboardSnapshot,
  anchorSnapshot: Record<string, PrimitiveValue> | undefined,
  story: Pick<NormalizedStoryV2, "qualityByKey">,
): QualityDeltaPlan[] {
  return Object.entries(anchorSnapshot ?? {})
    .filter(([key]) => Boolean(story.qualityByKey[key]))
    .map(([q, target]) => {
      const current = blackboard.values[q];
      return { q, current, target, distance: distanceBetween(current, target) };
    })
    .filter((entry) => entry.current !== entry.target);
}
