import type { NormalizedStoryV2 } from "@engine/index";
import { estimateTokens } from "@extraction/callBudget";
import { generateReviewedBeats, type ExpansionJudge } from "@generation/generate";
import { renderGenerationPrompt } from "@generation/prompts";
import type { GeneratedBeat, PlannedExpansionInput } from "@generation/types";
import { buildChainRequest, judgeVerdict, readChain } from "@judge/expansion";
import { CRITIC_TIMEOUT_MS } from "@judge/policy";
import { numericToLevel } from "@pacing/index";
import type { JudgeRuntime } from "./judge";

export function expansionJudge(judge: JudgeRuntime | null, story: NormalizedStoryV2, input: PlannedExpansionInput, playerName: () => string): ExpansionJudge {
  const target = story.checkpointById[input.candidate.targetAnchorId];
  if (!judge || !target) return {};
  const cast = [...new Set([...story.roster.map((member) => member.name ?? member.id), playerName()].filter(Boolean))];
  const read = async (beats: GeneratedBeat[]) => {
    const request = buildChainRequest({ facts: input.facts, target: { name: target.name, objective: target.objective }, cast,
      trajectory: input.tensionTrajectory.map(numericToLevel), beats: beats.map((beat) => ({ objective: beat.objective, guidance: beat.guidance })) });
    const result = await judge.ask("critic", request, { timeoutMs: CRITIC_TIMEOUT_MS,
      summarize: (answers) => (answers ? Object.fromEntries(Object.entries(readChain(answers) ?? {}).map(([key, value]) => [key, value ?? "none"])) : {}) });
    return result.answers ? readChain(result.answers) : null;
  };
  const variants = judge.expansionSettings();
  return {
    ...(judge.active("expansionCritic") ? { critic: async (beats: GeneratedBeat[]) => {
      const chain = await read(beats);
      return chain ? { ...judgeVerdict(chain), raw: "JUDGE", judge: chain } : null;
    } } : {}),
    ...(variants && variants.variants > 1 ? { variants: { n: variants.variants, temperature: variants.temperature, pick: variants.pick, read } } : {}),
  };
}

export const generationRequestTokens = (story: NormalizedStoryV2, input: PlannedExpansionInput): number => estimateTokens(renderGenerationPrompt(story, input));

export { generateReviewedBeats };
