import { TENSION_CURRENT_KEY, type BlackboardSnapshot, type GateNode, type NormalizedStoryV2, type Quality } from "@engine/index";
import type { ExtraGateSource, ScopePull, ScopedQuality, ScopedQualityExplained } from "./types";
import { readScopeSources, SCOPE_SOURCES, type ScopeSource, type ScopeSourceContext, type ScopeSourceResult } from "./scopeSources";

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

export interface ScopeWithSources {
  scope: ScopedQualityExplained[];
  sources: ScopeSourceResult[];
}

export function deriveScopeExplained(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
  context: ScopeSourceContext = {},
  sources: readonly ScopeSource[] = SCOPE_SOURCES,
): ScopedQualityExplained[] {
  return deriveScopeWithSources(story, activeCheckpointId, blackboard, extraGateSources, context, sources).scope;
}

export function deriveScopeWithSources(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
  context: ScopeSourceContext = {},
  sources: readonly ScopeSource[] = SCOPE_SOURCES,
): ScopeWithSources {
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

  const admits = (key: string) => {
    const quality = story.qualityByKey[key];
    return Boolean(quality) && quality.source === "extractor" && !blackboard.latched[key] && hintApplies(quality, activeCheckpointId, story);
  };
  const reads = readScopeSources(sources, story, blackboard, context, new Set(keys), admits);
  reads.forEach((read, at) => {
    for (const key of read.keys) {
      keys.add(key);
      addPull(key, { kind: read.kind, checkpointId: activeCheckpointId, detail: sources[at].detail });
    }
  });

  const scope = [...keys]
    .map((key) => story.qualityByKey[key])
    .filter((quality): quality is Quality => Boolean(quality))
    .filter((quality) => quality.source === "extractor")
    .filter((quality) => !blackboard.latched[quality.key])
    .filter((quality) => hintApplies(quality, activeCheckpointId, story))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((quality) => ({ key: quality.key, quality, hints: [...(hints.get(quality.key) ?? [])], pulledBy: pulls.get(quality.key) ?? [] }));
  return { scope, sources: reads };
}

export type ScopeOverflow = Array<{ kind: ScopeSourceResult["kind"]; dropped: string[] }>;

export const scopeOverflow = (
  story: NormalizedStoryV2 | null, activeCheckpointId: string | null, blackboard: BlackboardSnapshot | null, context: ScopeSourceContext = {},
): ScopeOverflow => (story && activeCheckpointId && blackboard
  ? deriveScopeWithSources(story, activeCheckpointId, blackboard, [], context).sources.map((read) => ({ kind: read.kind, dropped: read.dropped })).filter((row) => row.dropped.length)
  : []);

export interface ScopeAt { activeCheckpointId: string; blackboard: BlackboardSnapshot; boundary: number }

export const scopeDropped = (story: NormalizedStoryV2, at: ScopeAt, kind: ScopeSourceResult["kind"], context?: ScopeSourceContext): string[] =>
  scopeOverflow(story, at.activeCheckpointId, at.blackboard, context ?? { rotation: at.boundary }).filter((row) => row.kind === kind).flatMap((row) => row.dropped);

export function deriveScope(
  story: NormalizedStoryV2,
  activeCheckpointId: string,
  blackboard: BlackboardSnapshot,
  extraGateSources: ExtraGateSource[] = [],
  context: ScopeSourceContext = {},
): ScopedQuality[] {
  return deriveScopeExplained(story, activeCheckpointId, blackboard, extraGateSources, context)
    .map(({ key, quality, hints }) => ({ key, quality, hints }));
}

export function deriveFullScope(story: NormalizedStoryV2, blackboard: BlackboardSnapshot): ScopedQuality[] {
  return Object.values(story.qualityByKey)
    .filter((quality) => quality.source === "extractor")
    .filter((quality) => !blackboard.latched[quality.key])
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((quality) => ({ key: quality.key, quality, hints: [] }));
}
