import type { Story } from "@engine/index";
import { patternTexts, PATTERN_CAUSE_WORDS, stepConditions, isPatternVar, type PatternStep } from "@engine/patternSchema";
import { unknownEntityNames } from "./labelDiagnostics";
import { mentions } from "./codexDiagnostics";

type PatternCode = "pattern-label-names-unknown-entity" | "pattern-label-claims-cause" | "pattern-never-completes";

export const PATTERN_CONSEQUENCES: Record<PatternCode, string> = {
  "pattern-label-names-unknown-entity": "The callback is withheld while it names someone or somewhere the player has not met, so it may never show.",
  "pattern-label-claims-cause": "A pattern sees an order of events, not why they happened, so this line can tell the player a cause the story never established.",
  "pattern-never-completes": "This pattern waits for an event the story can never produce, so its callback never shows.",
};

export interface PatternRun {
  draft: Story;
  reachableFrom: (start: string) => Set<string>;
  startId: string;
  push: (code: PatternCode, severity: "warning", path: string, message: string) => void;
}

const impossible = (draft: Story, step: PatternStep, reachable: Set<string>): string | null => {
  const conditions = stepConditions(step);
  const literal = (key: string) => (conditions[key] !== undefined && !isPatternVar(conditions[key]) ? conditions[key] : null);
  if (step.kind === "transition") {
    const to = literal("to");
    if (to && !reachable.has(to)) return `checkpoint '${to}' is never reached from the start`;
    const from = literal("from");
    if (from && !reachable.has(from)) return `checkpoint '${from}' is never reached from the start`;
  }
  if (step.kind === "quest") {
    const quest = (draft.quests ?? []).find((entry) => entry.id === literal("id"));
    const to = literal("to");
    if (quest && to === "failed" && !quest.failed_when) return `quest '${quest.id}' has no failed_when, so it never fails`;
    if (quest && to === "offered" && !quest.offered_when) return `quest '${quest.id}' has no offered_when, so it is never offered`;
  }
  return null;
};

export const checkPatternDiagnostics = ({ draft, reachableFrom, startId, push }: PatternRun) => {
  if (!draft.patterns?.length) return;
  const names = unknownEntityNames(draft);
  const reachable = new Set([startId, ...reachableFrom(startId)]);
  draft.patterns.forEach((pattern, index) => {
    const path = `patterns.${index}`;
    patternTexts(pattern).forEach(({ field, text }) => {
      const where = field === "label" ? `${path}.label.text` : `${path}.${field}`;
      const hit = names.find((name) => mentions(text, name));
      if (hit) push("pattern-label-names-unknown-entity", "warning", where, `pattern '${pattern.id}' ${field} names '${hit}', who may not be known when it completes`);
      if (PATTERN_CAUSE_WORDS.test(text)) push("pattern-label-claims-cause", "warning", where, `pattern '${pattern.id}' ${field} states a cause; say what happened, in order, instead`);
    });
    pattern.steps.forEach((step, at) => {
      const blocker = impossible(draft, step, reachable);
      if (blocker) push("pattern-never-completes", "warning", `${path}.steps.${at}`, `pattern '${pattern.id}' step ${at + 1}: ${blocker}`);
    });
  });
};
