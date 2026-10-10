import { INTERMEDIATE_UNREACHABLE, isValidationErrorList, parseStoryV2, type StoryV2, type ValidationError } from "@engine/index";
import { runDiagnostics, type Diagnostic } from "../studio/diagnostics";
import { briefingSpoilerNames } from "../studio/briefingDiagnostics";
import { applyOpsChecked } from "./proposal";
import { defersReachability } from "./stages";
import type { CopilotStage, ProposalOp } from "./types";

export const BRIEFING_SPOILER_REFUSAL = "the briefing is player copy read before the first line, so it may hold only what the player knows at the start.";

export interface ProposalValidation {
  next: StoryV2;
  errors: ValidationError[];
  diagnostics: Diagnostic[];
  stageIssues: string[];
  deferred: string[];
  blocking: string[];
}

const addedUnconnected = (draft: StoryV2, next: StoryV2, error: ValidationError): string | null => {
  if (error.message !== INTERMEDIATE_UNREACHABLE) return null;
  const index = /^checkpoints\.(\d+)$/.exec(error.path)?.[1];
  const id = index === undefined ? undefined : next.checkpoints[Number(index)]?.id;
  return id !== undefined && !draft.checkpoints.some((checkpoint) => checkpoint.id === id) ? id : null;
};

export const validateProposal = (draft: StoryV2, ops: ProposalOp[], stage?: CopilotStage): ProposalValidation => {
  const { next, issues, stageIssues } = applyOpsChecked(draft, ops, stage);
  const parsed = parseStoryV2(next);
  const errors = isValidationErrorList(parsed) ? parsed : [];
  const diagnostics = runDiagnostics(next);
  const deferring = defersReachability(stage);
  const deferred: string[] = [];
  const blockingErrors = errors.filter((error) => {
    const id = deferring ? addedUnconnected(draft, next, error) : null;
    if (id === null) return true;
    deferred.push(`${error.path}: intermediate checkpoint '${id}' has no route to an anchor yet; the transitions stage must connect it`);
    return false;
  });
  const spoilers = ops.flatMap((op, index) => {
    if (op.kind !== "setBriefing") return [];
    const named = briefingSpoilerNames(next, op.briefing);
    return named.length ? [`ops.${index}.briefing: ${BRIEFING_SPOILER_REFUSAL} It names ${named.join(", ")}.`] : [];
  });
  const blocking = [
    ...stageIssues,
    ...spoilers,
    ...issues,
    ...blockingErrors.map((error) => `${error.path}: ${error.message}`),
    ...diagnostics.filter((diagnostic) => diagnostic.severity === "blocking").map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`),
  ];
  return { next, errors, diagnostics, stageIssues, deferred, blocking };
};
