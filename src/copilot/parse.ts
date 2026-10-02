import { capQuestions, type WizardQuestion } from "@wizard/index";
import type { Proposal, ProposalOp, Suggestion } from "./types";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import { readStringList } from "./parseFields";
import { readOp } from "./parseOps";

const readQuestions = (value: unknown): WizardQuestion[] => {
  if (!Array.isArray(value)) return [];
  const questions = value
    .map((entry, index): WizardQuestion | null => {
      if (typeof entry === "string") return entry.trim() ? { id: `q${index + 1}`, text: entry.trim() } : null;
      if (!isRecord(entry) || typeof entry.text !== "string" || !entry.text.trim()) return null;
      const options = readStringList(entry.options);
      return {
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `q${index + 1}`,
        text: entry.text.trim(),
        ...(typeof entry.why === "string" && entry.why.trim() ? { why: entry.why.trim() } : {}),
        ...(options.length ? { options } : {}),
      };
    })
    .filter((entry): entry is WizardQuestion => Boolean(entry));
  return capQuestions(questions);
};

export const parseProposal = (raw: string): { proposal: Proposal; issues: string[]; questions: WizardQuestion[]; unreadable?: true } => {
  const issues: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch (error) {
    return { proposal: { summary: "", ops: [] }, issues: [error instanceof Error ? error.message : "Invalid JSON"], questions: [], unreadable: true };
  }
  if (!isRecord(parsed)) return { proposal: { summary: "", ops: [] }, issues: ["response must be a JSON object"], questions: [] };
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  // Interview variant: questions instead of ops is a valid answer, not a malformed proposal.
  const questions = readQuestions(parsed.questions);
  if (questions.length && !Array.isArray(parsed.ops)) return { proposal: { summary, ops: [] }, issues, questions };
  if (!Array.isArray(parsed.ops)) {
    issues.push("ops: required array");
    return { proposal: { summary, ops: [] }, issues, questions };
  }
  const ops = parsed.ops.map((entry, index) => readOp(entry, `ops.${index}`, issues)).filter((entry): entry is ProposalOp => Boolean(entry));
  return { proposal: { summary, ops }, issues, questions: ops.length ? [] : questions };
};

export const parseSuggestions = (raw: string): Suggestion[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch {
    return [];
  }
  const source = isRecord(parsed) && Array.isArray(parsed.suggestions) ? parsed.suggestions : Array.isArray(parsed) ? parsed : [];
  return source
    .map((entry) => (isRecord(entry) && typeof entry.title === "string" ? { title: entry.title, rationale: typeof entry.rationale === "string" ? entry.rationale : "" } : null))
    .filter((entry): entry is Suggestion => Boolean(entry));
};
