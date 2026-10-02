import type { StoryV2 } from "@engine/index";
import { askReply, askText, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { personaRequirementProblem, planProvisioning, type ProvisioningEnvironment } from "@wizard/index";
import { parseProposal, parseSuggestions } from "./parse";
import { renderReportPrompt, renderStagePrompt, renderSuggestPrompt } from "./prompts";
import { validateProposal } from "./validate";
import { isProvisioningOp } from "./proposal";
import type { CopilotAudit, CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "./types";

export const STAGE_MAX_TOKENS: Record<CopilotStage, number> = {
  qualities: 6144,
  checkpoints: 6144,
  transitions: 4096,
  effects: 6144,
  provisioning: 8192,
};
const DRIVER_MAX_TOKENS = 1024;

export const STAGE_TRUNCATED_ISSUE =
  "The proposal was too long for the model's reply limit and was cut off twice. Ask for less in this step (for example \"at most 4 qualities, 3 short levels each\"), then run it again.";

export const STAGE_UNREADABLE_ISSUE = "The model's reply was not a readable proposal, twice. Run the step again; if it keeps failing, check the memory model's connection profile.";

const TIGHTER_REQUEST =
  "Your previous reply was cut off at the reply length limit before its JSON closed. Return a tighter proposal: fewer ops, one short sentence per rubric, objective " +
  "or description, short level lists. Return complete exact JSON only.";

const unterminatedJson = (text: string): boolean => {
  const start = text.search(/[{[]/);
  if (start < 0) return false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of text.slice(start)) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
  }
  return inString || depth > 0;
};

const wasCut = (reply: { text: string; finish?: string }): boolean => reply.finish === "length" || unterminatedJson(reply.text);

export interface AuthoringStageInput {
  draft: StoryV2;
  stage: CopilotStage;
  message: string;
  history: CopilotMessage[];
  environment?: ProvisioningEnvironment;
}

// Create-only is enforced here as well as in the UI: a proposal naming an existing asset never
// reaches a review card as if it were applicable (spec addendum §Story wizard).
const provisioningIssues = (input: AuthoringStageInput, ops: ReturnType<typeof parseProposal>["proposal"]["ops"]): string[] => {
  const provisioning = ops.filter(isProvisioningOp);
  if (!provisioning.length || !input.environment) return [];
  return planProvisioning(provisioning, input.environment).items
    .filter((item) => !item.validation.ok)
    .map((item) => `ops.${item.index}: ${item.validation.message}`);
};

const personaIssues = (input: AuthoringStageInput, ops: ReturnType<typeof parseProposal>["proposal"]["ops"]): string[] => {
  if (!input.environment) return [];
  const environment = input.environment;
  return ops.flatMap((op, index) => {
    if (op.kind !== "setRequirements") return [];
    const problem = personaRequirementProblem(op.requirements.personas, environment);
    return problem ? [`ops.${index}: ${problem}`] : [];
  });
};

const authorIssues = (issues: string[], parsed: ReturnType<typeof parseProposal>, cut: boolean): string[] => {
  if (cut) return [STAGE_TRUNCATED_ISSUE];
  return parsed.unreadable ? [STAGE_UNREADABLE_ISSUE] : issues;
};

const qualityKeyLines = (input: AuthoringStageInput, ops: ReturnType<typeof parseProposal>["proposal"]["ops"]): string[] => {
  if (input.stage === "qualities" || input.stage === "provisioning") return [];
  const declared = input.draft.qualities.map((quality) => quality.key);
  const refused = [...new Set(ops.flatMap((op) => (op.kind === "addQuality" && !declared.includes(op.quality.key) ? [op.quality.key] : [])))];
  return [
    `Declared quality keys: ${declared.join(", ") || "(none)"}. A snapshot or gate in this stage may use only these.`,
    ...(refused.length ? [`Not declared, so no op in the ${input.stage} stage may use it: ${refused.join(", ")}`] : []),
  ];
};

export async function runAuthoringStage(input: AuthoringStageInput, model: ModelCall, ask: ModelAsk): Promise<ProposalResult> {
  const prompt = renderStagePrompt(input.stage, input.draft, input.message, input.history, input.environment);
  const maxTokens = STAGE_MAX_TOKENS[input.stage];
  const first = await askReply(model, prompt, { ...ask, maxTokens });
  const rawResponse = first.text;
  const audit: CopilotAudit = { prompt, rawResponse, finish: first.finish };

  let fellBack = first.fellBack;
  let cut = wasCut(first);
  let parsed = parseProposal(rawResponse);
  let validation = validateProposal(input.draft, parsed.proposal.ops, input.stage);
  const problemsOf = () => [...parsed.issues, ...(input.stage === "provisioning" ? validation.stageIssues : validation.blocking),
    ...provisioningIssues(input, parsed.proposal.ops), ...personaIssues(input, parsed.proposal.ops)];
  const firstProblems = parsed.questions.length && !cut ? [] : problemsOf();

  if (cut || firstProblems.length) {
    const repairPrompt = cut
      ? `${prompt}\n\n${TIGHTER_REQUEST}`
      : `${prompt}\n\nPrevious response was invalid:\n${[...firstProblems, ...qualityKeyLines(input, parsed.proposal.ops)].join("\n")}\nReturn corrected exact JSON only.`;
    const repair = await askReply(model, repairPrompt, { ...ask, maxTokens });
    const repairResponse = repair.text;
    audit.repairPrompt = repairPrompt;
    audit.repairResponse = repairResponse;
    audit.repairFinish = repair.finish;
    fellBack = repair.fellBack ?? fellBack;
    cut = wasCut(repair);
    parsed = parseProposal(repairResponse);
    validation = validateProposal(input.draft, parsed.proposal.ops, input.stage);
  }

  const asked = parsed.questions.length > 0 && !cut;
  const issues = asked ? [] : problemsOf();
  const shown = authorIssues(issues, parsed, cut && issues.length > 0);
  return {
    stage: input.stage,
    proposal: parsed.proposal,
    preview: { errors: validation.errors, diagnostics: validation.diagnostics },
    status: asked ? "questions" : shown.length ? "failed" : "ok",
    issues: shown,
    ...(!asked && validation.deferred.length ? { deferred: validation.deferred } : {}),
    questions: parsed.questions,
    audit,
    ...(fellBack ? { fellBack } : {}),
  };
}

export async function runDriverSuggest(context: DriverContext, model: ModelCall, ask: ModelAsk): Promise<Suggestion[]> {
  const raw = await askText(model, renderSuggestPrompt(context), { ...ask, maxTokens: DRIVER_MAX_TOKENS });
  return parseSuggestions(raw);
}

export async function runDriverReport(context: DriverContext, model: ModelCall, ask: ModelAsk): Promise<string> {
  return stripChannelNoise(await askText(model, renderReportPrompt(context), { ...ask, maxTokens: DRIVER_MAX_TOKENS }));
}
