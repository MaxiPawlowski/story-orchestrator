import { parseStoryV2, progressQualityForAnchor, thresholdFor, type GateNode, type NormalizedStoryV2, type StoryV2, type Transition } from "@engine/index";
import type { ExpansionCacheEntry } from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const allGate = (left: GateNode, right: GateNode): GateNode => ({ all: [left, right] });

const generatedId = (entry: ExpansionCacheEntry, index: number) => `gen_${entry.stubId}_${index + 1}`;

export function mergeExpansions(rawStory: unknown, entries: Record<string, ExpansionCacheEntry>): NormalizedStoryV2 {
  const raw = clone(rawStory) as StoryV2;
  const checkpoints = [...raw.checkpoints];
  const transitions = [...raw.transitions];
  Object.values(entries).filter((entry) => ["cached", "needs_review", "inserted"].includes(entry.status) && entry.beats.length).forEach((entry) => {
    const sourceTransition = transitions.find((transition) => transition.from === entry.sourceCheckpointId && transition.to === entry.stubId);
    if (!sourceTransition) return;
    const target = raw.checkpoints.find((checkpoint) => checkpoint.id === entry.targetAnchorId);
    if (!target) return;
    for (let index = transitions.length - 1; index >= 0; index -= 1) {
      if (transitions[index].from === entry.sourceCheckpointId && transitions[index].to === entry.stubId) transitions.splice(index, 1);
    }
    entry.beats.forEach((beat, index) => {
      checkpoints.push({
        id: generatedId(entry, index),
        name: beat.objective,
        objective: beat.objective,
        type: "intermediate",
        guidance: beat.guidance,
        tension_target: beat.tension_target,
        ...(beat.state_snapshot ? { state_snapshot: beat.state_snapshot } : {}),
      });
    });
    transitions.push({ ...sourceTransition, to: generatedId(entry, 0), priority: sourceTransition.priority + 0.001 });
    entry.beats.forEach((beat, index) => {
      const outcome = beat.outcomes[0];
      if (!outcome) return;
      const from = generatedId(entry, index);
      const isFinal = index === entry.beats.length - 1;
      const transition: Transition = {
        from,
        to: isFinal ? entry.targetAnchorId : generatedId(entry, index + 1),
        priority: 1,
        gate: isFinal ? allGate(outcome.gate, { q: progressQualityForAnchor(entry.targetAnchorId), op: ">=", v: thresholdFor(target) }) : outcome.gate,
      };
      if (!isFinal && outcome.progress) transition.effects = { progress: outcome.progress };
      transitions.push(transition);
    });
  });
  const parsed = parseStoryV2({ ...raw, checkpoints, transitions });
  if (Array.isArray(parsed)) throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed;
}

export function insertedCheckpointIds(entry: ExpansionCacheEntry): string[] {
  return entry.beats.map((_, index) => generatedId(entry, index));
}
