import { isValidationErrorList, parseStoryV2, type StoryV2, type ValidationError } from "@engine/index";
import { runDiagnostics, type Diagnostic } from "../studio/diagnostics";
import { applyOpsChecked } from "./proposal";
import type { ProposalOp } from "./types";

export interface ProposalValidation {
  next: StoryV2;
  errors: ValidationError[];
  diagnostics: Diagnostic[];
  blocking: string[];
}

export const validateProposal = (draft: StoryV2, ops: ProposalOp[]): ProposalValidation => {
  const { next, issues } = applyOpsChecked(draft, ops);
  const parsed = parseStoryV2(next);
  const errors = isValidationErrorList(parsed) ? parsed : [];
  const diagnostics = runDiagnostics(next);
  const blocking = [
    ...issues,
    ...errors.map((error) => `${error.path}: ${error.message}`),
    ...diagnostics.filter((diagnostic) => diagnostic.severity === "blocking").map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`),
  ];
  return { next, errors, diagnostics, blocking };
};
