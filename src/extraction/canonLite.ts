import type { NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import type { ParsedFact } from "./types";

export function getCanonLite(story: NormalizedStoryV2, visitedAnchors: string[], firedTransitions: NormalizedTransition[], facts: ParsedFact[] = []): string {
  const anchors = visitedAnchors.map((id) => story.checkpointById[id]).filter(Boolean).map((checkpoint) => {
    return `Anchor ${checkpoint.id}: ${checkpoint.objective}`;
  });
  const gates = firedTransitions.map((transition) => `Gate ${transition.from} -> ${transition.to}`);
  const topFacts = [...facts].sort((left, right) => right.importance - left.importance).slice(0, 8).map((fact) => `Fact(${fact.importance}): ${fact.text}`);
  return [...anchors, ...gates, ...topFacts].join("\n");
}
