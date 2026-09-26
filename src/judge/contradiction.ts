import { buildPairRequest, pairDecision, readPair } from "./memory";
import { PAIR_MIN_CONFIDENCE } from "./policy";
import { choice, choiceAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";

export type ContradictionRelation = "agrees" | "contradicts" | "update" | "distinct";
export type ContradictionLabel = ContradictionRelation;
export type ReleaseWording = "a" | "b";

export const RELEASE_WORDINGS: readonly ReleaseWording[] = ["a", "b"];

export const CONTRADICTION_CRITERIA: Record<ContradictionRelation, string> = {
  agrees: "The new note is consistent with the settled fact: it restates it, rewords it, adds detail, or shows the same fact from another side, so both can be kept as true",
  contradicts: "The new note says the settled fact is false, or describes a state of the same person, object or place that cannot be true at the same time as the settled fact",
  update: "The new note reports a change that happened after the settled fact: it was true, and something since has made it no longer so",
  distinct: "The notes concern a different person, object or property, so both can be true whatever each says",
};

export const CONTRADICTION_RELEASE_FLOORS = { releaseErr: 0.05, releaseErrEs: 0, paraphraseRelease: 0.6 } as const;

export function buildContradictionRequest(settled: string, claim: string): JudgeRequest {
  return {
    state: { settled_note: settled, new_note: claim },
    questions: {
      relation: choice(
        "`settled_note` is a fact the story has settled. `new_note` is a new note from the same story's memory. What does `new_note` do to `settled_note`?",
        { ...CONTRADICTION_CRITERIA },
      ),
    },
  };
}

export interface ContradictionRead {
  relation: ContradictionRelation;
  confidence: number;
}

export function readContradiction(answers: Record<string, JudgeAnswer>): ContradictionRead | null {
  const answer = choiceAnswer(answers, "relation");
  if (!answer || !(answer.choice in CONTRADICTION_CRITERIA)) return null;
  return { relation: answer.choice as ContradictionRelation, confidence: answer.confidence };
}

export const releaseByContradiction = (read: ContradictionRead | null): boolean => Boolean(read && read.relation === "agrees" && read.confidence >= PAIR_MIN_CONFIDENCE);

export function releaseByPairQuestion(answers: Record<string, JudgeAnswer>): boolean {
  const decision = pairDecision(readPair(answers));
  return decision === "duplicate" || decision === "distinct" || decision === "unrelated";
}

export const releaseRequest = (wording: ReleaseWording, settled: string, claim: string): JudgeRequest =>
  wording === "a" ? buildPairRequest(settled, claim) : buildContradictionRequest(settled, claim);

export function releaseDecision(wording: ReleaseWording, result: Pick<JudgeResult, "answers" | "fallback">): boolean {
  if (result.fallback || !result.answers) return false;
  return wording === "a" ? releaseByPairQuestion(result.answers) : releaseByContradiction(readContradiction(result.answers));
}

export interface ContradictionReleaseCase {
  id: string;
  lang: string;
  label: ContradictionLabel;
  established: string;
  claim: string;
}

const shouldRelease = (label: ContradictionLabel) => label === "agrees" || label === "distinct";

export async function runContradictionReleaseCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: ContradictionReleaseCase[]): Promise<JudgeSelfTestReport> {
  const rows = await Promise.all(cases.flatMap((entry) => RELEASE_WORDINGS.map(async (wording): Promise<JudgeSelfTestRow & { model: string | null }> => {
    const result = await ask(releaseRequest(wording, entry.established, entry.claim));
    const released = releaseDecision(wording, result);
    return {
      id: `${entry.id}.${wording}`,
      right: released === shouldRelease(entry.label),
      picked: released ? "release" : "hold",
      detail: result.answers ? JSON.stringify(result.answers.relation ?? null) : null,
      latencyMs: result.latencyMs,
      model: result.model,
      ...(result.fallback ? { fallback: result.fallback } : {}),
    };
  })));
  const timed = rows.filter((row) => !row.fallback).map((row) => row.latencyMs).sort((left, right) => left - right);
  return {
    ranAt: new Date().toISOString(),
    model: rows.find((row) => row.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: timed.length ? timed[Math.floor((timed.length - 1) / 2)] : null,
    rows: rows.map(({ model: _model, ...row }) => row),
  };
}

export interface ReleaseArmScore {
  wording: ReleaseWording;
  releaseErr: { hit: number; total: number };
  releaseErrEs: { hit: number; total: number };
  paraphraseRelease: { hit: number; total: number };
  ok: boolean;
}

export function scoreReleaseArm(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], wording: ReleaseWording, inBand: ReadonlySet<string>): ReleaseArmScore {
  const released = new Set(report.rows.filter((row) => row.id.endsWith(`.${wording}`) && row.picked === "release").map((row) => row.id.slice(0, -2)));
  const count = (rows: ContradictionReleaseCase[]) => ({ hit: rows.filter((row) => released.has(row.id)).length, total: rows.length });
  const scoped = cases.filter((row) => inBand.has(row.id));
  const releaseErr = count(scoped.filter((row) => row.label === "contradicts"));
  const releaseErrEs = count(scoped.filter((row) => row.label === "contradicts" && row.lang === "es"));
  const paraphraseRelease = count(scoped.filter((row) => row.label === "agrees"));
  const rate = (value: { hit: number; total: number }) => (value.total ? value.hit / value.total : 0);
  const ok = releaseErr.total > 0 && paraphraseRelease.total > 0
    && rate(releaseErr) <= CONTRADICTION_RELEASE_FLOORS.releaseErr
    && releaseErrEs.hit <= CONTRADICTION_RELEASE_FLOORS.releaseErrEs
    && rate(paraphraseRelease) >= CONTRADICTION_RELEASE_FLOORS.paraphraseRelease;
  return { wording, releaseErr, releaseErrEs, paraphraseRelease, ok };
}

export interface ReleaseModeScore {
  mode: string;
  measured: boolean;
  arms: ReleaseArmScore[];
}

export interface ReleasePhaseAVerdict {
  modes: ReleaseModeScore[];
  passing: ReleaseWording[];
  ok: boolean;
}

export function scoreReleasePhaseA(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], modes: Record<string, readonly string[] | null>): ReleasePhaseAVerdict {
  const scored = Object.entries(modes).map(([mode, ids]): ReleaseModeScore => (ids
    ? { mode, measured: true, arms: RELEASE_WORDINGS.map((wording) => scoreReleaseArm(report, cases, wording, new Set(ids))) }
    : { mode, measured: false, arms: [] }));
  const passing = scored.length ? RELEASE_WORDINGS.filter((wording) => scored.every((mode) => mode.arms.some((arm) => arm.wording === wording && arm.ok))) : [];
  return { modes: scored, passing, ok: passing.length > 0 };
}
