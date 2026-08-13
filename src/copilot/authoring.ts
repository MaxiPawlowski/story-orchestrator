import type { StoryV2 } from "@engine/index";
import { callExtractionModel, stripChannelNoise, type ExtractionClientOptions } from "@extraction/index";
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

export async function runAuthoringStage(input: AuthoringStageInput, client: ExtractionClientOptions): Promise<ProposalResult> {
  const prompt = renderStagePrompt(input.stage, input.draft, input.message, input.history, input.environment);
  const rawResponse = await callExtractionModel(prompt, { ...client, maxTokens: STAGE_MAX_TOKENS });
  const audit: CopilotAudit = { prompt, rawResponse };

  let parsed = parseProposal(rawResponse);
  let validation = validateProposal(input.draft, parsed.proposal.ops);
  let provisioning = provisioningIssues(input, parsed.proposal.ops);
  const firstProblems = parsed.questions.length ? [] : [...parsed.issues, ...(input.stage === "provisioning" ? [] : validation.blocking), ...provisioning];

  if (firstProblems.length) {
    const repairPrompt = `${prompt}\n\nPrevious response was invalid:\n${firstProblems.join("\n")}\nReturn corrected exact JSON only.`;
    const repairResponse = await callExtractionModel(repairPrompt, { ...client, maxTokens: STAGE_MAX_TOKENS });
    audit.repairPrompt = repairPrompt;
    audit.repairResponse = repairResponse;
    parsed = parseProposal(repairResponse);
    validation = validateProposal(input.draft, parsed.proposal.ops);
    provisioning = provisioningIssues(input, parsed.proposal.ops);
  }

  const issues = parsed.questions.length ? [] : [...parsed.issues, ...(input.stage === "provisioning" ? [] : validation.blocking), ...provisioning];
  return {
    stage: input.stage,
    proposal: parsed.proposal,
    preview: { errors: validation.errors, diagnostics: validation.diagnostics },
    status: parsed.questions.length ? "questions" : issues.length ? "failed" : "ok",
    issues,
    questions: parsed.questions,
    audit,
  };
}

export async function runDriverSuggest(context: DriverContext, client: ExtractionClientOptions): Promise<Suggestion[]> {
  const raw = await callExtractionModel(renderSuggestPrompt(context), { ...client, maxTokens: DRIVER_MAX_TOKENS });
  return parseSuggestions(raw);
}

export async function runDriverReport(context: DriverContext, client: ExtractionClientOptions): Promise<string> {
  return stripChannelNoise(await callExtractionModel(renderReportPrompt(context), { ...client, maxTokens: DRIVER_MAX_TOKENS }));
}
