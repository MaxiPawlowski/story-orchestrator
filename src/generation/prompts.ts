import { thresholdFor, type NormalizedStoryV2 } from "@engine/index";
import type { GeneratedBeat, PlannedExpansionInput } from "./types";

export function renderGenerationPrompt(story: NormalizedStoryV2, input: PlannedExpansionInput): string {
  const target = story.checkpointById[input.candidate.targetAnchorId];
  const threshold = target ? thresholdFor(target) : 1;
  const qualities = Object.values(story.qualityByKey).map((quality) => {
    const values = quality.values?.length ? ` values=${quality.values.join("|")}` : "";
    return `${quality.key}: type=${quality.type} source=${quality.source}${values}`;
  }).join("\n");
  return [
    `Story: ${story.title}`,
    `Generate scaffolding only. Do not write prose scenes.`,
    `Source checkpoint: ${input.candidate.sourceCheckpointId}`,
    `Stub: ${input.candidate.stubId}`,
    `Target anchor: ${input.candidate.targetAnchorId}`,
    `Beat count: ${input.beats}`,
    `State delta: ${JSON.stringify(input.deltas)}`,
    `Tension trajectory: ${JSON.stringify(input.tensionTrajectory)}`,
    `Generation bias: ${JSON.stringify(input.generationBias)}`,
    `Qualities:\n${qualities}`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Gate grammar is mandatory. A gate leaf is exactly {"q":"quality_key","op":"==|!=|>=|<=|>|<|in","v":literal}. Combinators are exactly {"all":[gate,...]}, {"any":[gate,...]}, or {"not":gate}. Do not use condition, logic, type, threshold, check, expression, or prose gate fields.`,
    `Valid gate examples: {"q":"key_found","op":"==","v":true}; {"q":"approach","op":"==","v":"safe"}; {"all":[{"q":"key_found","op":"==","v":true},{"q":"approach","op":"==","v":"safe"}]}.`,
    `Progress threshold for ${input.candidate.targetAnchorId}: ${threshold}. Progress increments may appear before the final anchor-entry beat only. The final beat outcome must not include progress. Earlier progress amounts must sum to at least ${threshold}. If there are 2 beats, the first beat progress amount must be ${threshold} and the second beat must omit progress.`,
    `Return exact JSON only: {"beats":[{"objective":"...","guidance":"...","tension_target":"calm|stirring|tense|critical|peak","outcomes":[{"label":"success","gate":{"q":"key_found","op":"==","v":true},"deltas":[{"q":"key_found","v":true}],"progress":{"anchor":"${input.candidate.targetAnchorId}","amount":1}}]}]}`,
  ].join("\n");
}

export function renderCriticPrompt(story: NormalizedStoryV2, input: PlannedExpansionInput, beats: GeneratedBeat[], issues: string[]): string {
  return [
    `Story: ${story.title}`,
    `Review generated scaffolding only.`,
    `Target anchor: ${input.candidate.targetAnchorId}`,
    `Required state delta: ${JSON.stringify(input.deltas)}`,
    `Code issues: ${issues.join(" | ") || "none"}`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Beats JSON:\n${JSON.stringify({ beats })}`,
    `Return exact JSON: {"pass":true|false,"issues":["..."]}`,
  ].join("\n");
}
