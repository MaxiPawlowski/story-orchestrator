import { TENSION_CURRENT_KEY, type BlackboardSnapshot, type GateNode, type NormalizedStoryV2, type Quality } from "@engine/index";
import type { ExtraGateSource, ScopePull, ScopedQuality, ScopedQualityExplained } from "./types";

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

export function deriveScopeExplained(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
): ScopedQualityExplained[] {
  const checkpointIds = new Set([activeCheckpointId, ...(story.reachableByCheckpoint[activeCheckpointId] ?? [])]);
  const keys = new Set<string>();
  const hints = new Map<string, Set<string>>();
  const pulls = new Map<string, ScopePull[]>();
  const addPull = (key: string, pull: ScopePull) => {
    const list = pulls.get(key) ?? [];
    list.push(pull);
    pulls.set(key, list);
  };
  const addHint = (key: string, hint: string) => {
    const list = hints.get(key) ?? new Set<string>();
    list.add(hint);
    hints.set(key, list);
  };

  if (story.qualityByKey[TENSION_CURRENT_KEY]) {
    keys.add(TENSION_CURRENT_KEY);
    addPull(TENSION_CURRENT_KEY, { kind: "builtin", checkpointId: activeCheckpointId, detail: "built-in tension quality" });
  }

  checkpointIds.forEach((checkpointId) => {
    const checkpoint = story.checkpointById[checkpointId];
    Object.keys(checkpoint?.state_snapshot ?? {}).forEach((key) => {
      keys.add(key);
      addPull(key, { kind: "snapshot", checkpointId, detail: `${checkpoint?.name ?? checkpointId} snapshot` });
    });
    for (const transition of story.outgoingByCheckpoint[checkpointId] ?? []) {
      const gateKeys = new Set<string>();
      collectGateKeys(transition.gate, gateKeys);
      gateKeys.forEach((key) => {
        keys.add(key);
        addPull(key, { kind: "gate", checkpointId, detail: `${transition.from} → ${transition.to} gate` });
        if (transition.extraction_hint) addHint(key, transition.extraction_hint);
      });
    }
  });

  extraGateSources.forEach((source) => {
    if (!checkpointIds.has(source.checkpointId)) return;
    const gateKeys = new Set<string>();
    collectGateKeys(source.gate, gateKeys);
    gateKeys.forEach((key) => {
      keys.add(key);
      addPull(key, { kind: "gate", checkpointId: source.checkpointId, detail: "reachable gate source" });
      if (source.extractionHint) addHint(key, source.extractionHint);
    });
  });

  return [...keys]
    .map((key) => story.qualityByKey[key])
    .filter((quality): quality is Quality => Boolean(quality))
    .filter((quality) => quality.source === "extractor")
    .filter((quality) => !blackboard.latched[quality.key])
    .filter((quality) => hintApplies(quality, activeCheckpointId, story))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((quality) => ({ key: quality.key, quality, hints: [...(hints.get(quality.key) ?? [])], pulledBy: pulls.get(quality.key) ?? [] }));
}

export function deriveScope(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
): ScopedQuality[] {
  return deriveScopeExplained(story, activeCheckpointId, blackboard, extraGateSources)
    .map(({ key, quality, hints }) => ({ key, quality, hints }));
}

export function deriveFullScope(story: NormalizedStoryV2, blackboard: BlackboardSnapshot): ScopedQuality[] {
  return Object.values(story.qualityByKey)
    .filter((quality) => quality.source === "extractor")
    .filter((quality) => !blackboard.latched[quality.key])
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((quality) => ({ key: quality.key, quality, hints: [] }));
}
