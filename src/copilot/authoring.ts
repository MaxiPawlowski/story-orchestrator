import type { StoryV2 } from "@engine/index";
import { callExtractionModel, stripChannelNoise, type ExtractionClientOptions } from "@extraction/index";
import { parseProposal, parseSuggestions } from "./parse";
import { renderReportPrompt, renderStagePrompt, renderSuggestPrompt } from "./prompts";
import { validateProposal } from "./validate";
import type { CopilotAudit, CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "./types";

const STAGE_MAX_TOKENS = 2048;
const DRIVER_MAX_TOKENS = 1024;

export interface AuthoringStageInput {
  draft: StoryV2;
  stage: CopilotStage;
  message: string;
  history: CopilotMessage[];
}

export async function runAuthoringStage(input: AuthoringStageInput, client: ExtractionClientOptions): Promise<ProposalResult> {
  const prompt = renderStagePrompt(input.stage, input.draft, input.message, input.history);
  const rawResponse = await callExtractionModel(prompt, { ...client, maxTokens: STAGE_MAX_TOKENS });
  const audit: CopilotAudit = { prompt, rawResponse };

  let parsed = parseProposal(rawResponse);
  let validation = validateProposal(input.draft, parsed.proposal.ops);
  const firstProblems = [...parsed.issues, ...validation.blocking];

  if (firstProblems.length) {
    const repairPrompt = `${prompt}\n\nPrevious response was invalid:\n${firstProblems.join("\n")}\nReturn corrected exact JSON only.`;
    const repairResponse = await callExtractionModel(repairPrompt, { ...client, maxTokens: STAGE_MAX_TOKENS });
    audit.repairPrompt = repairPrompt;
    audit.repairResponse = repairResponse;
    parsed = parseProposal(repairResponse);
    validation = validateProposal(input.draft, parsed.proposal.ops);
  }

  const issues = [...parsed.issues, ...validation.blocking];
  return {
    stage: input.stage,
    proposal: parsed.proposal,
    preview: { errors: validation.errors, diagnostics: validation.diagnostics },
    status: issues.length ? "failed" : "ok",
    issues,
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
