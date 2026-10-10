import { evaluateGate, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { askText, isPlanted, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { parseCriticVerdict } from "../parse";
import { guardDraft, type DraftGuardDeps } from "./guard";
import { parseDirectorDraft } from "./parse";
import { buildBranchOps, buildDirectorOps, checkDirectorOps, planChapter } from "./plan";
import { renderBranchPrompt, renderDirectorCriticPrompt, renderDirectorPrompt, type BranchContext, type DirectorInput } from "./prompt";
import type { DirectorDraft, LivingOpPayload } from "./types";

export const DIRECTOR_ATTEMPTS = 2;
export const DIRECTOR_MAX_TOKENS = 1024;
const UNREADABLE_VERDICTS = ["Invalid critic JSON", "Invalid critic verdict"];

export interface DirectorRun {
  story: NormalizedStoryV2;
  raw: Record<string, unknown>;
  frontierId: string;
  values: Record<string, PrimitiveValue>;
  latched: Record<string, boolean>;
  sealsOn: boolean;
  input: DirectorInput;
  guard: DraftGuardDeps;
  critic: boolean;
}

export type DirectorOutcome =
  | { status: "ok"; draft: DirectorDraft; ops: LivingOpPayload[]; anchorId: string; attempts: number; raw: string; criticIssues: string[] }
  | { status: "refused"; issues: string[]; attempts: number; raw: string }
  | { status: "capped"; reason: string };

export const endingFor = (story: NormalizedStoryV2, values: Record<string, PrimitiveValue>): { finalAllowed: boolean; finalRequired: boolean } => {
  const ending = story.living?.ending ?? "open";
  if (typeof ending === "object") {
    const required = evaluateGate(ending.when, { get: (key: string) => values[key] });
    return { finalAllowed: required, finalRequired: required };
  }
  return { finalAllowed: ending === "director-proposes", finalRequired: false };
};

const settleFinal = (draft: DirectorDraft, ending: { finalAllowed: boolean; finalRequired: boolean }): DirectorDraft => ({
  ...draft,
  anchor: { ...draft.anchor, final: ending.finalRequired || (ending.finalAllowed && draft.anchor.final) },
});

export async function runDirector(run: DirectorRun, model: ModelCall, ask: ModelAsk): Promise<DirectorOutcome> {
  const ending = endingFor(run.story, run.values);
  const probe = planChapter(run.story, run.frontierId, { sealsOn: run.sealsOn, final: ending.finalRequired, newChapter: false });
  if (probe.capped) return { status: "capped", reason: "the chapter cap for an install without chapter seals is reached" };
  let retry: string[] = [];
  let raw = "";
  for (let attempt = 1; attempt <= DIRECTOR_ATTEMPTS; attempt += 1) {
    const prompt = renderDirectorPrompt({ ...run.input, ending, ...(retry.length ? { retry } : {}) });
    raw = await askText(model, prompt, { ...ask, maxTokens: DIRECTOR_MAX_TOKENS });
    const parsed = parseDirectorDraft(raw, run.story);
    if (!parsed.ok) {
      retry = parsed.issues;
      continue;
    }
    const draft = settleFinal(parsed.draft, ending);
    const plan = planChapter(run.story, run.frontierId, { sealsOn: run.sealsOn, final: draft.anchor.final, newChapter: draft.newChapter, title: draft.chapterTitle });
    if (plan.capped) return { status: "capped", reason: "the chapter cap for an install without chapter seals is reached" };
    const built = buildDirectorOps(run.story, run.frontierId, draft, plan);
    const checked = checkDirectorOps({ raw: run.raw, story: run.story, frontierId: run.frontierId, ops: built.ops, values: run.values, latched: run.latched });
    const issues = [...built.issues, ...checked.issues, ...guardDraft(draft, run.guard)];
    if (issues.length) {
      retry = issues;
      continue;
    }
    const criticIssues = run.critic && !isPlanted(model, ask) ? await critique(run, draft, model, ask) : [];
    if (criticIssues.length && attempt < DIRECTOR_ATTEMPTS) {
      retry = criticIssues;
      continue;
    }
    if (criticIssues.length) return { status: "refused", issues: criticIssues, attempts: attempt, raw };
    return { status: "ok", draft, ops: built.ops, anchorId: built.anchorId, attempts: attempt, raw, criticIssues };
  }
  return { status: "refused", issues: retry, attempts: DIRECTOR_ATTEMPTS, raw };
}

export interface BranchRun extends Omit<DirectorRun, "sealsOn"> {
  targetId: string;
  branchId: string;
  context: BranchContext;
}

export type BranchOutcome =
  | { status: "ok"; draft: DirectorDraft; ops: LivingOpPayload[]; stubId: string; attempts: number; raw: string }
  | { status: "refused"; issues: string[]; attempts: number; raw: string };

export async function runBranch(run: BranchRun, model: ModelCall, ask: ModelAsk): Promise<BranchOutcome> {
  let retry: string[] = [];
  let raw = "";
  for (let attempt = 1; attempt <= DIRECTOR_ATTEMPTS; attempt += 1) {
    raw = await askText(model, renderBranchPrompt({ ...run.input, ...(retry.length ? { retry } : {}) }, run.context), { ...ask, maxTokens: DIRECTOR_MAX_TOKENS });
    const parsed = parseDirectorDraft(raw, run.story);
    if (!parsed.ok) {
      retry = parsed.issues;
      continue;
    }
    const draft = { ...parsed.draft, anchor: { ...parsed.draft.anchor, final: false, snapshot: {} }, newQualities: [], newChapter: false };
    const built = buildBranchOps(run.story, run.frontierId, run.targetId, run.branchId, draft);
    const checked = checkDirectorOps({ raw: run.raw, story: run.story, frontierId: run.frontierId, ops: built.ops, values: run.values, latched: run.latched, convergeTo: run.targetId });
    const issues = [...built.issues, ...checked.issues, ...guardDraft(draft, run.guard)];
    if (issues.length) {
      retry = issues;
      continue;
    }
    const criticIssues = run.critic && !isPlanted(model, ask) ? await critique(run, draft, model, ask) : [];
    if (criticIssues.length && attempt < DIRECTOR_ATTEMPTS) {
      retry = criticIssues;
      continue;
    }
    if (criticIssues.length) return { status: "refused", issues: criticIssues, attempts: attempt, raw };
    return { status: "ok", draft, ops: built.ops, stubId: built.stubId, attempts: attempt, raw };
  }
  return { status: "refused", issues: retry, attempts: DIRECTOR_ATTEMPTS, raw };
}

async function critique(run: Pick<DirectorRun, "input" | "guard">, draft: DirectorDraft, model: ModelCall, ask: ModelAsk): Promise<string[]> {
  const prompt = renderDirectorCriticPrompt({
    premise: run.input.premise, canon: run.input.canon, frontier: `"${run.input.frontier.name}" — ${run.input.frontier.objective}`,
    name: draft.anchor.name, objective: draft.anchor.objective,
    player: run.guard.playerNames.find((name) => name.trim()) ?? "the player", cast: run.input.cast.map((member) => member.name),
  });
  const verdict = parseCriticVerdict(await askText(model, prompt, { ...ask, pass: "critic", maxTokens: 384 }));
  if (verdict.pass || UNREADABLE_VERDICTS.includes(verdict.issues.join(""))) return [];
  return verdict.issues.length ? verdict.issues : ["the critic refused it"];
}
