import { progressQualityForAnchor, thresholdFor, type NormalizedStoryV2, type PrimitiveValue, type ScaffoldingDelta } from "@engine/index";
import { callExtractionModel, type ExtractionClientOptions } from "@extraction/index";
import { renderCriticPrompt } from "./prompts";
import { parseCriticVerdict } from "./parse";
import type { CodeCheckResult, CriticVerdict, GeneratedBeat, PlannedExpansionInput } from "./types";

const valuesEqual = (left: PrimitiveValue | undefined, right: PrimitiveValue) => left === right;

const applyDeltas = (values: Record<string, PrimitiveValue>, deltas: ScaffoldingDelta[] | undefined) => {
  const next = { ...values };
  deltas?.forEach((delta) => { next[delta.q] = delta.v; });
  return next;
};

export function runCodeChecks(story: NormalizedStoryV2, input: PlannedExpansionInput, beats: GeneratedBeat[]): CodeCheckResult {
  const issues: string[] = [];
  const target = story.checkpointById[input.candidate.targetAnchorId];
  let values = Object.fromEntries(input.deltas.map((delta) => [delta.q, delta.current]).filter((entry): entry is [string, PrimitiveValue] => entry[1] !== undefined));
  let progressTotal = 0;
  beats.forEach((beat, index) => {
    const outcome = beat.outcomes[0];
    values = applyDeltas(values, outcome?.deltas);
    if (index < beats.length - 1) progressTotal += outcome?.progress?.amount ?? 0;
    if (index === beats.length - 1 && outcome?.progress) issues.push("final anchor-entry transition must not carry progress increment");
  });
  Object.entries(target.state_snapshot ?? {}).forEach(([key, targetValue]) => {
    if (!valuesEqual(values[key], targetValue)) issues.push(`${key} does not bridge to target snapshot`);
  });
  const threshold = thresholdFor(target);
  if (progressTotal < threshold) issues.push(`${progressQualityForAnchor(target.id)} increments ${progressTotal} < threshold ${threshold}`);
  if (beats.length < 2) issues.push("generated chain needs at least two beats so progress can apply before anchor entry");
  return { ok: issues.length === 0, issues, progressTotal };
}

export async function runCritic(
  story: NormalizedStoryV2,
  input: PlannedExpansionInput,
  beats: GeneratedBeat[],
  client: ExtractionClientOptions,
): Promise<{ codeCheck: CodeCheckResult; verdict: CriticVerdict; needsReview: boolean }> {
  const codeCheck = runCodeChecks(story, input, beats);
  if (!codeCheck.ok) return { codeCheck, verdict: { pass: false, issues: codeCheck.issues, raw: "CODE_CHECK" }, needsReview: true };
  const raw = await callExtractionModel(renderCriticPrompt(story, input, beats, codeCheck.issues), { ...client, maxTokens: 512 });
  const verdict = parseCriticVerdict(raw);
  return { codeCheck, verdict, needsReview: !verdict.pass };
}
