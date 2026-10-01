import { agencyClauses, agencyForCheckpoint, renderAgencyPolicy, thresholdFor, type NormalizedStoryV2 } from "@engine/index";
import { gatePins } from "./paths";
import type { GeneratedBeat, PlannedExpansionInput } from "./types";

const PREMISE_CHARS = 600;

const checkpointLine = (story: NormalizedStoryV2, id: string): string => {
  const checkpoint = story.checkpointById[id];
  return checkpoint ? `${id} "${checkpoint.name}" — ${checkpoint.objective}` : id;
};

const storyContext = (story: NormalizedStoryV2): string[] => {
  const premise = story.description.trim();
  const cast = story.roster.map((member) => `${member.name ?? member.id}${member.role ? ` (${member.role})` : ""}`);
  return [
    ...(premise ? [`Premise: ${premise.length > PREMISE_CHARS ? `${premise.slice(0, PREMISE_CHARS)}…` : premise}`] : []),
    ...(cast.length ? [`Cast: ${cast.join("; ")}`] : []),
  ];
};

export function renderGenerationPrompt(story: NormalizedStoryV2, input: PlannedExpansionInput): string {
  const target = story.checkpointById[input.candidate.targetAnchorId];
  const threshold = target ? thresholdFor(target) : 1;
  const qualities = Object.values(story.qualityByKey).map((quality) => {
    const values = quality.values?.length ? ` values=${quality.values.join("|")}` : "";
    return `${quality.key}: type=${quality.type} source=${quality.source}${values}`;
  }).join("\n");
  return [
    `Story: ${story.title}`,
    ...storyContext(story),
    `Generate scaffolding only. Do not write prose scenes.`,
    `Source checkpoint: ${checkpointLine(story, input.candidate.sourceCheckpointId)}`,
    `Stub: ${input.candidate.stubId}`,
    `Target anchor: ${checkpointLine(story, input.candidate.targetAnchorId)}`,
    `Write beats that carry the story from the source checkpoint to the target anchor's situation. Each beat's objective and guidance set up a situation ` +
      `for the cast to play; name only the cast above or people the facts already establish.`,
    `Each beat's title is a short scene name of two to five words, like a chapter heading, shown to the player: it names the place or situation and never ` +
      `says what happens there. The objective says what the beat is for.`,
    `Beat count: ${input.beats}`,
    `State delta: ${JSON.stringify(input.deltas)}`,
    `Already true when the chain starts: ${JSON.stringify({ ...input.latched, ...gatePins(input.candidate.transition.gate) })}. A beat is passed as soon as one of its ` +
      `outcome gates holds, so gate each outcome on what that beat's own play changes: never on a value listed here, and never on a value an earlier beat's ` +
      `outcome already gates on or writes.`,
    `Tension trajectory: ${JSON.stringify(input.tensionTrajectory)}`,
    `Generation bias: ${JSON.stringify(input.generationBias)}`,
    `Qualities:\n${qualities}`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Gate grammar is mandatory. A gate leaf is exactly {"q":"quality_key","op":"==|!=|>=|<=|>|<|in","v":literal}. Combinators are exactly {"all":[gate,...]}, ` +
      `{"any":[gate,...]}, or {"not":gate}. Do not use condition, logic, type, threshold, check, expression, or prose gate fields.`,
    `Valid gate examples: {"q":"key_found","op":"==","v":true}; {"q":"approach","op":"==","v":"safe"}; {"all":[{"q":"key_found","op":"==","v":true},{"q":"approach","op":"==","v":"safe"}]}.`,
    `Agency policy for the beats you write:\n${renderAgencyPolicy(agencyForCheckpoint(story, input.candidate.targetAnchorId))}`,
    `Progress threshold for ${input.candidate.targetAnchorId}: ${threshold}. Progress increments may appear before the final anchor-entry beat only. The final beat outcome ` +
      `must not include progress. Earlier progress amounts must sum to at least ${threshold}. If there are 2 beats, the first beat progress amount must be ${threshold} and the ` +
        `second beat must omit progress.`,
    `A beat may have several outcomes. Each outcome is its own route: the player may take any of them, so EVERY route must work on its own.`,
    `On every route, each quality in the state delta must reach its target by the time the final beat's outcome fires: write it in that route's deltas, or gate that route's ` +
      `final outcome on it with "==". A route that can enter ${input.candidate.targetAnchorId} with a quality short of its target is invalid.`,
    `The first outcome whose gate holds is the one that fires, so outcomes of the same beat must have gates that tell them apart: gate each outcome on the condition that leads ` +
      `to it, not on the state before the beat. Two outcomes with the same gate are one route.`,
    `Progress counts the SMALLEST amount among a beat's outcomes, so give every outcome of a non-final beat a progress amount; an outcome without one makes that beat count 0.`,
    `Return exact JSON only: ` +
      `{"beats":[{"title":"...","objective":"...","guidance":"...","tension_target":"calm|stirring|tense|critical|peak",` +
      `"outcomes":[{"label":"success","gate":{"q":"key_found","op":"==","v":true},"deltas":[{"q":"key_found","v":true}],` +
      `"progress":{"anchor":"${input.candidate.targetAnchorId}","amount":1}}]}]}`,
  ].join("\n");
}

export function renderCriticPrompt(story: NormalizedStoryV2, input: PlannedExpansionInput, beats: GeneratedBeat[], issues: string[]): string {
  return [
    `Story: ${story.title}`,
    ...storyContext(story),
    `Review generated scaffolding only.`,
    `Target anchor: ${checkpointLine(story, input.candidate.targetAnchorId)}`,
    `Required state delta: ${JSON.stringify(input.deltas)}`,
    `Code issues: ${issues.join(" | ") || "none"}`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Beats JSON:\n${JSON.stringify({ beats })}`,
    `Review the beats against this policy:\n${agencyClauses(agencyForCheckpoint(story, input.candidate.targetAnchorId)).map((clause) => `- ${clause}`).join("\n")}`,
    `Fail a beat whose guidance narrates the player's own act — accepting, agreeing, refusing, or going somewhere — instead of setting the situation up for the player.`,
    `Return exact JSON: {"pass":true|false,"issues":["..."]}`,
  ].join("\n");
}
