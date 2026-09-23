import { chainThresholdFor, parseStoryV2, progressQualityForAnchor, type GateNode, type NormalizedStoryV2, type StoryV2, type Transition } from "@engine/index";
import type { ExtraGateSource } from "@extraction/types";
import type { ExpansionCacheEntry } from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const allGate = (left: GateNode, right: GateNode): GateNode => ({ all: [left, right] });

const generatedId = (entry: ExpansionCacheEntry, index: number) => `gen_${entry.stubId}_${index + 1}`;

export function mergeExpansions(rawStory: unknown, entries: Record<string, ExpansionCacheEntry>): NormalizedStoryV2 {
  const raw = clone(rawStory) as StoryV2;
  const checkpoints = [...raw.checkpoints];
  const transitions = [...raw.transitions];
  Object.values(entries).filter((entry) => ["cached", "needs_review", "validated", "inserted"].includes(entry.status) && entry.beats.length).forEach((entry) => {
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
    // v2.3 plan 07 (R9). The threshold is what the WORST route through this chain can accumulate: a
    // player who takes an outcome carrying less progress must still be able to enter the anchor, or
    // the omitted route stalls, which is the defect. Taking outcome[0]'s amount made the threshold
    // whatever the first outcome happened to carry.
    const worstPerBeat = entry.beats.slice(0, -1).map((beat) => Math.min(...beat.outcomes.map((outcome) => outcome.progress?.amount ?? 0)));
    const threshold = chainThresholdFor(target, worstPerBeat.reduce((sum, amount) => sum + amount, 0));
    // V13: a worst route that carries no progress makes the threshold 0, and `progress >= 0` is NOT
    // vacuous — an unset progress quality compares false (gates.ts), so that route stalled at its
    // final beat for good. The critic already marks such a chain needs-review; merged anyway, its
    // zero route enters on its own outcome gate.
    entry.beats.forEach((beat, index) => {
      const from = generatedId(entry, index);
      const isFinal = index === entry.beats.length - 1;
      // One transition per outcome, priority = declaration order. The engine sorts outgoing
      // transitions by priority DESCENDING and takes the first whose gate holds, so the FIRST
      // declared outcome has to carry the HIGHEST number or declaration order would be reversed.
      // The deterministic tie rule is declaration order and then the outcome id, which is the index.
      const declared = beat.outcomes.length;
      beat.outcomes.forEach((outcome, outcomeIndex) => {
        const transition: Transition = {
          from,
          to: isFinal ? entry.targetAnchorId : generatedId(entry, index + 1),
          priority: declared - outcomeIndex,
          gate: isFinal && threshold > 0 ? allGate(outcome.gate, { q: progressQualityForAnchor(entry.targetAnchorId), op: ">=", v: threshold }) : outcome.gate,
        };
        if (!isFinal && outcome.progress) transition.effects = { progress: outcome.progress };
        transitions.push(transition);
      });
    });
  });
  const parsed = parseStoryV2({ ...raw, checkpoints, transitions });
  if (Array.isArray(parsed)) throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed;
}

export function insertedCheckpointIds(entry: ExpansionCacheEntry): string[] {
  return entry.beats.map((_, index) => generatedId(entry, index));
}

export function collectExpansionGateSources(entries: Record<string, ExpansionCacheEntry>): ExtraGateSource[] {
  const sources: ExtraGateSource[] = [];
  Object.values(entries).forEach((entry) => {
    // `validated` is merged (above) exactly like `inserted`, so its gates are already in the played
    // graph and are not extra sources. The list matches the pre-plan-07 one.
    if (!["cached", "needs_review"].includes(entry.status)) return;
    entry.beats.forEach((beat) => {
      beat.outcomes.forEach((outcome) => {
        sources.push({ checkpointId: entry.sourceCheckpointId, gate: outcome.gate });
      });
    });
  });
  return sources;
}
