import { callExtractionModel, type ExtractionClientOptions } from "@extraction/index";
import type { NormalizedStoryV2 } from "@engine/index";
import { runCodeChecks, runCritic } from "./critic";
import { parseGeneratedBeats } from "./parse";
import { renderGenerationPrompt } from "./prompts";
import type { GeneratedBeat, PlannedExpansionInput } from "./types";

export async function generateBeats(story: NormalizedStoryV2, input: PlannedExpansionInput, client: ExtractionClientOptions): Promise<{ beats: GeneratedBeat[]; raw: string; issues: string[] }> {
  const prompt = renderGenerationPrompt(story, input);
  const raw = await callExtractionModel(prompt, { ...client, maxTokens: 2048 });
  const parsed = parseGeneratedBeats(raw, story);
  if (!parsed.issues.length) return { beats: parsed.beats, raw, issues: [] };
  const repairRaw = await callExtractionModel(`${prompt}\n\nPrevious response was invalid: ${parsed.issues.join("; ")}\nReturn corrected exact JSON only.`, { ...client, maxTokens: 2048 });
  const repaired = parseGeneratedBeats(repairRaw, story);
  return { beats: repaired.beats, raw: repairRaw, issues: repaired.issues };
}

export async function generateReviewedBeats(story: NormalizedStoryV2, input: PlannedExpansionInput, client: ExtractionClientOptions) {
  const generated = await generateBeats(story, input, client);
  if (generated.issues.length) return { ...generated, codeCheck: null, verdict: { pass: false, issues: generated.issues, raw: generated.raw }, needsReview: true };
  if (client.debugResponse !== undefined && client.debugResponse !== null) {
    const codeCheck = runCodeChecks(story, input, generated.beats);
    return { ...generated, codeCheck, verdict: { pass: codeCheck.ok, issues: codeCheck.issues, raw: "DEBUG" }, needsReview: !codeCheck.ok };
  }
  const initialCheck = runCodeChecks(story, input, generated.beats);
  if (!initialCheck.ok) {
    const repairRaw = await callExtractionModel(`${renderGenerationPrompt(story, input)}\n\nPrevious JSON failed hard code checks: ${initialCheck.issues.join("; ")}\nReturn corrected exact JSON only.`, { ...client, maxTokens: 2048 });
    const repaired = parseGeneratedBeats(repairRaw, story);
    if (!repaired.issues.length) {
      const repairedCheck = runCodeChecks(story, input, repaired.beats);
      if (repairedCheck.ok) {
        const reviewed = await runCritic(story, input, repaired.beats, client);
        return { beats: repaired.beats, raw: repairRaw, issues: [], ...reviewed };
      }
      return { beats: repaired.beats, raw: repairRaw, issues: [], codeCheck: repairedCheck, verdict: { pass: false, issues: repairedCheck.issues, raw: "CODE_CHECK" }, needsReview: true };
    }
  }
  const reviewed = await runCritic(story, input, generated.beats, client);
  return { ...generated, ...reviewed };
}
