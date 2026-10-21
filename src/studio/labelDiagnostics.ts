import { CODEX_START, gateKeys, type Story } from "@engine/index";
import { codexItems, entityNames, entryCondition } from "@engine/codex";
import { mentions } from "./codexDiagnostics";

type LabelCode = "relationship-label-reads-axis" | "relationship-secret-in-public";

export const LABEL_CONSEQUENCES: Record<LabelCode, string> = {
  "relationship-label-reads-axis": "This secret is learned when the hidden feeling crosses a line, so the player learns that the number moved.",
  "relationship-secret-in-public": "The public label already says the secret, so the player knows it before it is revealed.",
};

export interface LabelRun {
  draft: Story;
  push: (code: LabelCode | "disclosure-names-unknown-entity", severity: "warning", path: string, message: string) => void;
}

export const unknownEntityNames = (draft: Story): string[] => codexItems({ codex: draft.codex }).filter(({ entry }) =>
  entryCondition(entry) !== CODEX_START && !entry.facts.some((fact) => fact.known_when === CODEX_START))
  .flatMap(({ entry }) => entityNames({ codex: draft.codex, roster: draft.roster }, entry));

export const checkLabelDiagnostics = ({ draft, push }: LabelRun) => {
  const names = unknownEntityNames(draft);
  draft.roster.forEach((member, index) => (member.relationships ?? []).forEach((relationship, at) => {
    const path = `roster.${index}.relationships.${at}`;
    const texts = [
      ...(relationship.public ?? []).map((row, rowAt) => [`${path}.public.${rowAt}.label`, row.label]),
      ...(relationship.secret ?? []).map((row, rowAt) => [`${path}.secret.${rowAt}.label`, row.label]),
    ];
    texts.forEach(([where, text]) => {
      const hit = names.find((name) => mentions(text, name));
      if (hit) push("disclosure-names-unknown-entity", "warning", where, `label '${text}' names '${hit}', who may not be known when the label shows`);
    });
    (relationship.secret ?? []).forEach((secret, rowAt) => {
      if (gateKeys(secret.revealed_when).some((key) => key.startsWith("rel_"))) {
        push("relationship-label-reads-axis", "warning", `${path}.secret.${rowAt}.revealed_when`, `secret '${secret.id}' is revealed by a feeling's number`);
      }
      const leak = (relationship.public ?? []).find((row) => row.label.toLowerCase().includes(secret.label.toLowerCase()));
      if (leak) push("relationship-secret-in-public", "warning", `${path}.secret.${rowAt}.label`, `public label '${leak.label}' contains secret '${secret.label}'`);
    });
  }));
};
