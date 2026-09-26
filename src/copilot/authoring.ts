import type { StoryV2 } from "@engine/index";
import { askReply, askText, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { planProvisioning, type ProvisioningEnvironment } from "@wizard/index";
import { parseProposal, parseSuggestions } from "./parse";
import { renderReportPrompt, renderStagePrompt, renderSuggestPrompt } from "./prompts";
import { validateProposal } from "./validate";
import { isProvisioningOp } from "./proposal";
import type { CopilotAudit, CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "./types";

const STAGE_MAX_TOKENS = 2048;
const DRIVER_MAX_TOKENS = 1024;

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

export async function runAuthoringStage(input: AuthoringStageInput, model: ModelCall, ask: ModelAsk): Promise<ProposalResult> {
  const prompt = renderStagePrompt(input.stage, input.draft, input.message, input.history, input.environment);
  const first = await askReply(model, prompt, { ...ask, maxTokens: STAGE_MAX_TOKENS });
  const rawResponse = first.text;
  const audit: CopilotAudit = { prompt, rawResponse, finish: first.finish };

  let parsed = parseProposal(rawResponse);
  let validation = validateProposal(input.draft, parsed.proposal.ops, input.stage);
  let provisioning = provisioningIssues(input, parsed.proposal.ops);
  const firstProblems = parsed.questions.length ? [] : [...parsed.issues, ...(input.stage === "provisioning" ? validation.stageIssues : validation.blocking), ...provisioning];

  if (firstProblems.length) {
    const repairPrompt = `${prompt}\n\nPrevious response was invalid:\n${firstProblems.join("\n")}\nReturn corrected exact JSON only.`;
    const repair = await askReply(model, repairPrompt, { ...ask, maxTokens: STAGE_MAX_TOKENS });
    const repairResponse = repair.text;
    audit.repairPrompt = repairPrompt;
    audit.repairResponse = repairResponse;
    audit.repairFinish = repair.finish;
    parsed = parseProposal(repairResponse);
    validation = validateProposal(input.draft, parsed.proposal.ops, input.stage);
    provisioning = provisioningIssues(input, parsed.proposal.ops);
  }

  const issues = parsed.questions.length ? [] : [...parsed.issues, ...(input.stage === "provisioning" ? validation.stageIssues : validation.blocking), ...provisioning];
  return {
    stage: input.stage,
    proposal: parsed.proposal,
    preview: { errors: validation.errors, diagnostics: validation.diagnostics },
    status: parsed.questions.length ? "questions" : issues.length ? "failed" : "ok",
    issues,
    ...(!parsed.questions.length && validation.deferred.length ? { deferred: validation.deferred } : {}),
    questions: parsed.questions,
    audit,
  };
}

export async function runDriverSuggest(context: DriverContext, model: ModelCall, ask: ModelAsk): Promise<Suggestion[]> {
  const raw = await askText(model, renderSuggestPrompt(context), { ...ask, maxTokens: DRIVER_MAX_TOKENS });
  return parseSuggestions(raw);
}

export async function runDriverReport(context: DriverContext, model: ModelCall, ask: ModelAsk): Promise<string> {
  return stripChannelNoise(await askText(model, renderReportPrompt(context), { ...ask, maxTokens: DRIVER_MAX_TOKENS }));
}
