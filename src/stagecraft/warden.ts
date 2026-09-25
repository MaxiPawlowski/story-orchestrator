import { WARDEN_NOTE_FAMILIES, type WardenNoteFamily, type WardenNoteOp } from "./types";

export const WARDEN_NOTE_MAX_LINES = 4;

export interface WardenCheckInput {
  reply: { speaker: string; text: string };
  facts: string[];
  agency: { player: string; message: string } | null;
  houseRules: string[];
}

export interface WardenCheckFinding {
  family: WardenNoteFamily;
  text: string;
  facts: string[];
  rules?: string[];
  score?: number;
}

export const wardenFamilyOf = (op: Pick<WardenNoteOp, "family">): WardenNoteFamily => op.family ?? "continuity";

export interface WardenFamiliesActive {
  continuity: boolean;
  agency: boolean;
  houseRules: string[];
}

export const anyWardenFamily = (active: WardenFamiliesActive): boolean => active.continuity || active.agency || active.houseRules.length > 0;

export const wardenFamilyActive = (op: WardenNoteOp, active: WardenFamiliesActive): boolean => {
  const family = wardenFamilyOf(op);
  if (family === "continuity") return active.continuity;
  if (family === "agency") return active.agency;
  return (op.rules ?? []).some((rule) => active.houseRules.includes(rule));
};

export const composeWardenNote = (ops: WardenNoteOp[]): string =>
  [...ops]
    .sort((left, right) => WARDEN_NOTE_FAMILIES.indexOf(wardenFamilyOf(left)) - WARDEN_NOTE_FAMILIES.indexOf(wardenFamilyOf(right)))
    .flatMap((op) => op.text.split("\n").filter((line) => line.trim()))
    .slice(0, WARDEN_NOTE_MAX_LINES)
    .join("\n");

export interface WardenFindingView {
  family: WardenNoteFamily;
  facts: string[];
  rules?: string[];
}

const findingPhrase = (finding: WardenFindingView): string => {
  if (finding.family === "continuity") return `contradicts ${finding.facts.length === 1 ? "an established fact" : `${finding.facts.length} established facts`}`;
  if (finding.family === "agency") return "writes the player's own part";
  const count = finding.rules?.length ?? 0;
  return `breaks ${count === 1 ? "a house rule" : `${count} house rules`}`;
};

export const wardenReason = (findings: WardenFindingView[]): string => findings.map((finding) => finding.family).join("+");

export const wardenSummary = (speaker: string, findings: WardenFindingView[]): string => `${speaker}'s reply ${findings.map(findingPhrase).join("; ")}`;

export const withdrawRemovedRules = (op: WardenNoteOp, rules: string[]): boolean => wardenFamilyOf(op) === "house-rule" && (op.rules ?? []).some((rule) => !rules.includes(rule));
