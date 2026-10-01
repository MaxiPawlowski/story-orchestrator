import { WARDEN_NOTE_FAMILIES, type CuratorOpRecord, type CuratorProposalRecord, type StagecraftAcceptMode, type WardenFactSource, type WardenNoteFamily, type WardenNoteOp } from "./types";

export const WARDEN_NOTE_MAX_LINES = 4;

export interface WardenCheckInput {
  reply: { speaker: string; text: string };
  facts: string[];
  agency: { player: string; message: string } | null;
  houseRules: string[];
  lore?: Array<{ comment: string; text: string }>;
}

export interface WardenCheckFinding {
  family: WardenNoteFamily;
  text: string;
  facts: string[];
  rules?: string[];
  lore?: string[];
  score?: number;
}

export const wardenFamilyOf = (op: Pick<WardenNoteOp, "family">): WardenNoteFamily => op.family ?? "continuity";

export interface WardenFamiliesActive {
  continuity: boolean;
  agency: boolean;
  houseRules: string[];
  lore?: boolean;
}

export const anyWardenFamily = (active: WardenFamiliesActive): boolean => active.continuity || active.agency || active.houseRules.length > 0;

export const wardenFamilyActive = (op: WardenNoteOp, active: WardenFamiliesActive): boolean => {
  const family = wardenFamilyOf(op);
  if (family === "continuity") return active.continuity;
  if (family === "agency") return active.agency;
  if (family === "lore") return active.lore === true;
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
  lore?: string[];
}

const findingPhrase = (finding: WardenFindingView): string => {
  if (finding.family === "continuity") return `contradicts ${finding.facts.length === 1 ? "an established fact" : `${finding.facts.length} established facts`}`;
  if (finding.family === "agency") return "writes the player's own part";
  if (finding.family === "lore") return `contradicts ${finding.lore?.length === 1 ? "a lore entry" : `${finding.lore?.length ?? 0} lore entries`}`;
  const count = finding.rules?.length ?? 0;
  return `breaks ${count === 1 ? "a house rule" : `${count} house rules`}`;
};

export const wardenReason = (findings: WardenFindingView[]): string => findings.map((finding) => finding.family).join("+");

export const wardenSummary = (speaker: string, findings: WardenFindingView[]): string => `${speaker}'s reply ${findings.map(findingPhrase).join("; ")}`;

export const withdrawRemovedRules = (op: WardenNoteOp, rules: string[]): boolean => wardenFamilyOf(op) === "house-rule" && (op.rules ?? []).some((rule) => !rules.includes(rule));

export const wardenNoteOps = (findings: WardenCheckFinding[], established: WardenFactSource[], replyMessageId: number, mode: StagecraftAcceptMode): CuratorOpRecord[] => findings.map((finding) => ({
  op: {
    kind: "note" as const,
    text: finding.text,
    facts: finding.facts,
    replyMessageId,
    ...(finding.family === "continuity" ? { sources: established.filter((fact) => finding.facts.includes(fact.text)) } : { family: finding.family }),
    ...(finding.rules ? { rules: finding.rules } : {}),
    ...(finding.lore ? { lore: finding.lore } : {}),
    ...(finding.score !== undefined ? { score: finding.score } : {}),
  },
  status: mode === "auto" ? "accepted" as const : "pending" as const,
}));

const continuityOnly = (families: WardenNoteFamily[]) => families.every((family) => family === "continuity");

export const wardenFlagJournal = (speaker: string, findings: WardenCheckFinding[]): [string, string] => [
  continuityOnly(findings.map((finding) => finding.family)) ? `Continuity warden flagged ${speaker}'s reply` : `Warden flagged ${speaker}'s reply (${wardenReason(findings)})`,
  findings.flatMap((finding) => finding.rules ?? finding.lore ?? (finding.family === "agency" ? [`agency ${finding.score ?? ""}`.trim()] : finding.facts)).join(" | "),
];

export const wardenNoteJournal = (ops: WardenNoteOp[]): [string, string] => [
  continuityOnly(ops.map(wardenFamilyOf)) ? "Continuity note added to this reply's prompt" : "Warden note added to this reply's prompt",
  ops.flatMap((op) => op.rules ?? op.lore ?? (op.facts.length ? op.facts : [wardenFamilyOf(op)])).join(" | "),
];

export const newestCarriedNote = (proposals: CuratorProposalRecord[], active: WardenFamiliesActive): { record: CuratorProposalRecord; indices: number[] } | undefined => proposals
  .filter((record) => record.curator === "warden")
  .map((record) => ({ record, indices: record.ops.flatMap((entry, index) => (entry.status === "accepted" && entry.op.kind === "note" && wardenFamilyActive(entry.op, active) ? [index] : [])) }))
  .filter((candidate) => candidate.indices.length)
  .sort((left, right) => right.record.messageId - left.record.messageId)[0];
