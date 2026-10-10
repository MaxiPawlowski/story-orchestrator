import { gateLeaves, type NormalizedStoryV2 } from "@engine/index";
import { choice, choiceAnswer, type JudgeAnswer, type JudgeRequest } from "@judge/index";
import { isRecord } from "@utils/guards";
import { LIVING_BRANCH_PREFIX, LIVING_STUB_SUFFIX, type DivergenceReading, type DivergenceState } from "./types";

export const DIVERGENCE_NONE_P = 0.6;
export const DIVERGENCE_SURE_P = 0.9;
export const DIVERGENCE_STREAK = 2;
export const DIVERGENCE_WINDOW = 6;
export const DIVERGENCE_NONE = "none";

export interface DivergenceStep {
  state: DivergenceState;
  diverged: boolean;
  reason: string | null;
}

export function stepDivergence(previous: DivergenceState, checkpointId: string, reading: DivergenceReading): DivergenceStep {
  const fresh = previous.checkpointId === checkpointId ? previous : { ...previous, checkpointId, streak: 0 };
  const base = { ...fresh, lastBoundary: reading.boundary, last: reading };
  if (fresh.branchedFrom.includes(checkpointId)) return { state: { ...base, streak: 0 }, diverged: false, reason: null };
  if (reading.source === "refusal") return { state: { ...base, streak: 0 }, diverged: true, reason: "the player refused every prepared way out of this checkpoint" };
  const p = reading.p ?? 0;
  if (!reading.none || p < DIVERGENCE_NONE_P) return { state: { ...base, streak: 0 }, diverged: false, reason: null };
  if (p >= DIVERGENCE_SURE_P) return { state: { ...base, streak: 0 }, diverged: true, reason: `the player's last action fits none of this checkpoint's exits (p ${p.toFixed(2)})` };
  const streak = fresh.streak + 1;
  if (streak >= DIVERGENCE_STREAK) return { state: { ...base, streak: 0 }, diverged: true, reason: `${streak} readings in a row fit none of this checkpoint's exits` };
  return { state: { ...base, streak }, diverged: false, reason: null };
}

export const markBranched = (state: DivergenceState, checkpointId: string): DivergenceState =>
  ({ ...state, streak: 0, branchedFrom: [...state.branchedFrom.filter((id) => id !== checkpointId), checkpointId].slice(-32) });

export const unmarkBranched = (state: DivergenceState, checkpointIds: readonly string[]): DivergenceState =>
  ({ ...state, branchedFrom: state.branchedFrom.filter((id) => !checkpointIds.includes(id)) });

export interface ExitDescription {
  id: string;
  text: string;
}

export function exitDescriptions(story: NormalizedStoryV2, activeId: string): ExitDescription[] {
  return (story.outgoingByCheckpoint[activeId] ?? []).map((transition, index) => {
    const rubrics = [...new Set(gateLeaves(transition.gate).map((leaf) => story.qualityByKey[leaf.q]?.rubric).filter((rubric): rubric is string => Boolean(rubric)))];
    const target = story.checkpointById[transition.to];
    const what = target ? `${target.name}: ${target.objective}` : transition.to;
    return { id: `exit_${index + 1}`, text: rubrics.length ? `${what} (opens when: ${rubrics.join("; ")})` : what };
  });
}

export interface DivergenceWindowLine {
  speaker: string;
  text: string;
  player: boolean;
}

export const DIVERGENCE_TIMEOUT_MS = 4000;
const LINE_CHARS = 600;

export function windowLines(rows: readonly unknown[], size = DIVERGENCE_WINDOW): DivergenceWindowLine[] {
  return rows.flatMap((row) => {
    if (!isRecord(row) || row.is_system === true || typeof row.mes !== "string" || !row.mes.trim()) return [];
    return [{ speaker: typeof row.name === "string" ? row.name : "", text: row.mes.trim().slice(0, LINE_CHARS), player: row.is_user === true }];
  }).slice(-size);
}

export const windowText = (lines: readonly DivergenceWindowLine[]): string[] => lines.map((line) => `${line.speaker || (line.player ? "Player" : "Narrator")}: ${line.text}`);

export function buildDivergenceRequest(exits: readonly ExitDescription[], window: readonly DivergenceWindowLine[], playerName: string): JudgeRequest {
  const criteria: Record<string, string> = Object.fromEntries(exits.map((exit) => [exit.id, exit.text]));
  criteria[DIVERGENCE_NONE] = `What ${playerName} is doing pursues none of the ways above: they went somewhere else or are doing something else`;
  return {
    state: {
      player: playerName,
      recent: window.map((line) => ({ speaker: line.speaker, player: line.player, text: line.text })),
    },
    questions: {
      fit: choice(`Read ${playerName}'s latest messages. Which of these ways forward does what ${playerName} is actually doing pursue?`, criteria),
    },
  };
}

export function readDivergence(answers: Record<string, JudgeAnswer> | null | undefined): { none: boolean; p: number } | null {
  const answer = answers ? choiceAnswer(answers, "fit") : null;
  if (!answer) return null;
  const p = answer.probabilities[DIVERGENCE_NONE] ?? (answer.choice === DIVERGENCE_NONE ? answer.confidence : 0);
  return { none: answer.choice === DIVERGENCE_NONE, p };
}

export function branchTarget(story: NormalizedStoryV2, activeId: string): string | null {
  const queue = [...(story.outgoingByCheckpoint[activeId] ?? []).map((transition) => transition.to)];
  const seen = new Set<string>([activeId]);
  while (queue.length) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    if (story.checkpointById[next]?.type === "anchor") return next;
    queue.push(...(story.outgoingByCheckpoint[next] ?? []).map((transition) => transition.to));
  }
  return null;
}

export const isBranchStub = (id: string): boolean => id.startsWith(LIVING_BRANCH_PREFIX) && id.endsWith(LIVING_STUB_SUFFIX);

export const hasLiveBranch = (story: NormalizedStoryV2, activeId: string): boolean =>
  (story.outgoingByCheckpoint[activeId] ?? []).some((transition) => isBranchStub(transition.to));

export const nextBranchId = (story: NormalizedStoryV2): string => {
  const numbers = story.checkpoints.map((checkpoint) => new RegExp(`^${LIVING_BRANCH_PREFIX}(\\d+)${LIVING_STUB_SUFFIX}$`).exec(checkpoint.id)?.[1]).filter(Boolean).map(Number);
  return `${LIVING_BRANCH_PREFIX}${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
};
