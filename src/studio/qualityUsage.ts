import { CODEX_PAGES, CODEX_START, isReached, progressQualityForAnchor, TENSION_CURRENT_KEY, type CodexKnownWhen, type GateNode } from "@engine/index";
import type { StoryDraft } from "./draft";

export interface QualityUsage {
  kind: "gate" | "snapshot" | "card";
  location: string;
}

const gateReferencesQuality = (gate: GateNode, key: string): boolean => {
  if ("q" in gate) return gate.q === key;
  if ("all" in gate) return gate.all.some((entry) => gateReferencesQuality(entry, key));
  if ("any" in gate) return gate.any.some((entry) => gateReferencesQuality(entry, key));
  return gateReferencesQuality(gate.not, key);
};

const gatesQuality = (gates: ReadonlyArray<GateNode | undefined>, key: string): boolean => gates.some((gate) => gate !== undefined && gateReferencesQuality(gate, key));

const knownWhenReads = (when: CodexKnownWhen | undefined, key: string): boolean => !!when && when !== CODEX_START && !isReached(when) && gateReferencesQuality(when, key);

const questUsages = (draft: StoryDraft, key: string): QualityUsage[] => (draft.quests ?? []).flatMap((quest) => [
  ...(gatesQuality([quest.visible_when, quest.offered_when, quest.done_when, quest.failed_when], key) ? [{ kind: "gate" as const, location: `quest ${quest.id}` }] : []),
  ...(quest.steps ?? []).flatMap((step, index) => (gatesQuality([step.visible_when, step.done_when, step.failed_when], key)
    ? [{ kind: "gate" as const, location: `quest ${quest.id} step ${index + 1}` }] : [])),
]);

const codexUsages = (draft: StoryDraft, key: string): QualityUsage[] => CODEX_PAGES.flatMap((page) => (draft.codex?.[page] ?? []).flatMap((entry) => [
  ...(knownWhenReads(entry.known_when, key) ? [{ kind: "gate" as const, location: `codex ${page} ${entry.id}` }] : []),
  ...entry.facts.filter((fact) => knownWhenReads(fact.known_when, key)).map((fact) => ({ kind: "gate" as const, location: `codex ${page} ${entry.id} fact ${fact.id}` })),
]));

export const reservedQualityKeys = (draft: StoryDraft): Set<string> => {
  const keys = new Set<string>([TENSION_CURRENT_KEY]);
  draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").forEach((anchor) => keys.add(progressQualityForAnchor(anchor.id)));
  return keys;
};

export const findQualityUsages = (draft: StoryDraft, key: string): QualityUsage[] => {
  const usages: QualityUsage[] = [];
  draft.transitions.forEach((transition, index) => {
    if (gateReferencesQuality(transition.gate, key)) {
      usages.push({ kind: "gate", location: `${transition.from} → ${transition.to} (transition ${index + 1})` });
    }
  });
  draft.checkpoints.forEach((checkpoint) => {
    if (checkpoint.state_snapshot && Object.prototype.hasOwnProperty.call(checkpoint.state_snapshot, key)) {
      usages.push({ kind: "snapshot", location: `${checkpoint.name} snapshot` });
    }
  });
  const cards = [...draft.roster.map((member) => ({ name: member.name ?? member.id, card: member.card })), { name: "Your character", card: draft.player?.card }];
  for (const { name, card } of cards) for (const [field, binding] of Object.entries(card?.fields ?? {})) {
    if (binding.quality === key) usages.push({ kind: "card", location: `${name}: ${field}` });
  }
  return [...usages, ...questUsages(draft, key), ...codexUsages(draft, key)];
};
