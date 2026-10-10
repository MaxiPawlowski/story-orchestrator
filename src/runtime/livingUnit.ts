import { LIVING_OPENING_ID, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { livingChapterSize } from "@engine/validate/living";
import type { ModelCall } from "@extraction/modelRoute";
import { runBranch, runDirector, type BranchOutcome, type DirectorOutcome } from "@generation/living/direct";
import { exitDescriptions } from "@generation/living/divergence";
import { livingChapters, planChapter, suggestedTension, usesLivingChapters } from "@generation/living/plan";
import type { DirectorInput } from "@generation/living/prompt";
import type { LivingInputs } from "./livingInputs";

export { livingExportId, projectLivingExport } from "@generation/living/export";

export interface DirectNextInput {
  story: NormalizedStoryV2;
  raw: Record<string, unknown>;
  frontierId: string;
  state: EngineState;
  sealsOn: boolean;
  inputs: LivingInputs;
  model: ModelCall;
  signal?: AbortSignal;
  debugResponse: string | null;
}

const MAX_PLANS = 8;

export function directorInput(input: DirectNextInput): DirectorInput {
  const { story, state, inputs, frontierId } = input;
  const living = story.living;
  const frontier = story.checkpointById[frontierId];
  const cast = (living?.cast?.length ? story.roster.filter((member) => living.cast?.includes(member.id)) : story.roster)
    .map((member) => ({ name: member.name ?? member.id, ...(member.role ? { role: member.role } : {}), ...(member.drive ? { drive: member.drive } : {}) }));
  const plans = story.roster.flatMap((member) => (member.agenda ?? []).map((agenda) => `${member.name ?? member.id}: ${agenda.goal}`)).slice(0, MAX_PLANS);
  const plan = planChapter(story, frontierId, { sealsOn: input.sealsOn, final: false, newChapter: false });
  const size = living ? livingChapterSize(living) : [3, 5] as [number, number];
  const chapterNumber = usesLivingChapters(story) ? Math.max(1, livingChapters(story).length) : 1;
  const latched = state.blackboard.latched ?? {};
  const qualities = story.qualities
    .filter((quality) => quality.source === "extractor" && quality.key !== "tension_current")
    .map((quality) => ({
      key: quality.key, type: quality.type, rubric: quality.rubric, ...(quality.values ? { values: quality.values } : {}),
      ...(state.blackboard.values[quality.key] !== undefined ? { value: state.blackboard.values[quality.key] } : {}),
      ...(latched[quality.key] ? { latched: true } : {}),
    }));
  const path = state.visitedPath.filter((id) => story.checkpointById[id]?.type === "anchor" || id === LIVING_OPENING_ID).map((id) => story.checkpointById[id]?.name ?? id);
  return {
    title: story.title,
    premise: living?.premise ?? story.description,
    ...(living?.tone ? { tone: living.tone } : {}),
    ...(story.player?.role ? { playerRole: story.player.role } : {}),
    cast,
    path,
    frontier: { id: frontierId, name: frontier?.name ?? frontierId, objective: frontier?.objective ?? "" },
    canon: inputs.canon,
    openThreads: inputs.openThreads,
    resolvedThreads: inputs.resolvedThreads,
    plans: [...plans, ...inputs.plans].slice(0, MAX_PLANS),
    refused: inputs.refused,
    qualities,
    tension: { suggested: suggestedTension(story, plan.anchorsInChapter), current: inputs.tension },
    chapter: { number: chapterNumber, anchorsIn: plan.anchorsInChapter, size, mayClose: plan.anchorsInChapter >= size[0] && usesLivingChapters(story) },
    ending: { finalAllowed: false, finalRequired: false },
  };
}

export async function directNext(input: DirectNextInput): Promise<DirectorOutcome> {
  return runDirector({
    story: input.story, raw: input.raw, frontierId: input.frontierId, values: input.state.blackboard.values, latched: input.state.blackboard.latched ?? {},
    sealsOn: input.sealsOn, input: directorInput(input), guard: { playerNames: input.inputs.playerNames, restatesSecret: input.inputs.restatesSecret }, critic: true,
  }, input.model, { role: "authoring", pass: "living", ...(input.signal ? { signal: input.signal } : {}), debugResponse: input.debugResponse, refuseIncomplete: true });
}

export interface BranchNextInput {
  story: NormalizedStoryV2;
  raw: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  branchId: string;
  state: EngineState;
  why: string;
  recent: string[];
  inputs: LivingInputs;
  model: ModelCall;
  signal?: AbortSignal;
  debugResponse: string | null;
}

export async function branchNext(input: BranchNextInput): Promise<BranchOutcome> {
  const { story, state, sourceId, targetId } = input;
  const director = directorInput({ story, raw: input.raw, frontierId: sourceId, state, sealsOn: true, inputs: input.inputs, model: input.model, debugResponse: input.debugResponse });
  const target = story.checkpointById[targetId];
  const context = {
    recent: input.recent, why: input.why, exits: exitDescriptions(story, sourceId).map((exit) => exit.text),
    convergeTo: { name: target?.name ?? targetId, objective: target?.objective ?? "" },
  };
  return runBranch({
    story, raw: input.raw, frontierId: sourceId, targetId, branchId: input.branchId, context, values: state.blackboard.values, latched: state.blackboard.latched ?? {},
    input: director, guard: { playerNames: input.inputs.playerNames, restatesSecret: input.inputs.restatesSecret }, critic: true,
  }, input.model, { role: "authoring", pass: "living", ...(input.signal ? { signal: input.signal } : {}), debugResponse: input.debugResponse, refuseIncomplete: true });
}
