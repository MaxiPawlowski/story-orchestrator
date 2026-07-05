import { TENSION_CURRENT_KEY, type BlackboardSnapshot, type GateNode, type NormalizedStoryV2, type Quality } from "@engine/index";
import type { ExtraGateSource, ScopedQuality } from "./types";

const collectGateKeys = (gate: GateNode, keys: Set<string>) => {
  if ("q" in gate) {
    keys.add(gate.q);
    return;
  }
  if ("all" in gate) gate.all.forEach((entry) => collectGateKeys(entry, keys));
  if ("any" in gate) gate.any.forEach((entry) => collectGateKeys(entry, keys));
  if ("not" in gate) collectGateKeys(gate.not, keys);
};

const hintApplies = (quality: Quality, activeCheckpointId: string, story: NormalizedStoryV2) => {
  const hint = quality.scope_hint;
  if (!hint) return true;
  if (hint.from && activeCheckpointId !== hint.from && !story.reachableByCheckpoint[hint.from]?.includes(activeCheckpointId)) return false;
  if (hint.until && activeCheckpointId !== hint.until && !story.reachableByCheckpoint[activeCheckpointId]?.includes(hint.until)) return false;
  return true;
};

export function deriveScope(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
): ScopedQuality[] {
  const checkpointIds = new Set([activeCheckpointId, ...(story.reachableByCheckpoint[activeCheckpointId] ?? [])]);
  const keys = new Set<string>();
  const hints = new Map<string, Set<string>>();

  if (story.qualityByKey[TENSION_CURRENT_KEY]) keys.add(TENSION_CURRENT_KEY);

  checkpointIds.forEach((checkpointId) => {
    Object.keys(story.checkpointById[checkpointId]?.state_snapshot ?? {}).forEach((key) => keys.add(key));
    for (const transition of story.outgoingByCheckpoint[checkpointId] ?? []) {
      collectGateKeys(transition.gate, keys);
      if (transition.extraction_hint) {
        const gateKeys = new Set<string>();
        collectGateKeys(transition.gate, gateKeys);
        gateKeys.forEach((key) => {
          const list = hints.get(key) ?? new Set<string>();
          list.add(transition.extraction_hint as string);
          hints.set(key, list);
        });
      }
    }
  });

  extraGateSources.forEach((source) => {
    if (!checkpointIds.has(source.checkpointId)) return;
    const gateKeys = new Set<string>();
    collectGateKeys(source.gate, gateKeys);
    gateKeys.forEach((key) => {
      keys.add(key);
      if (!source.extractionHint) return;
      const list = hints.get(key) ?? new Set<string>();
      list.add(source.extractionHint);
      hints.set(key, list);
    });
  });

  return [...keys]
    .map((key) => story.qualityByKey[key])
    .filter((quality): quality is Quality => Boolean(quality))
    .filter((quality) => quality.source === "extractor")
    .filter((quality) => !blackboard.latched[quality.key])
    .filter((quality) => hintApplies(quality, activeCheckpointId, story))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((quality) => ({ key: quality.key, quality, hints: [...(hints.get(quality.key) ?? [])] }));
}
