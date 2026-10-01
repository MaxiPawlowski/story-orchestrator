import { RELEASE_WORDINGS, releaseDecision, releaseRequest, type ContradictionLabel, type ReleaseWording } from "./contradiction";
import type { JudgeRequest, JudgeResult } from "./types";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";

export const CONTRADICTION_RELEASE_FLOORS = { releaseErr: 0.05, paraphraseRelease: 0.6 } as const;

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
  paraphraseRelease: { hit: number; total: number };
  ok: boolean;
}

export function scoreReleaseArm(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], wording: ReleaseWording, inBand: ReadonlySet<string>): ReleaseArmScore {
  const released = new Set(report.rows.filter((row) => row.id.endsWith(`.${wording}`) && row.picked === "release").map((row) => row.id.slice(0, -2)));
  const count = (rows: ContradictionReleaseCase[]) => ({ hit: rows.filter((row) => released.has(row.id)).length, total: rows.length });
  const scoped = cases.filter((row) => inBand.has(row.id));
  const releaseErr = count(scoped.filter((row) => row.label === "contradicts"));
  const paraphraseRelease = count(scoped.filter((row) => row.label === "agrees"));
  const rate = (value: { hit: number; total: number }) => (value.total ? value.hit / value.total : 0);
  const ok = releaseErr.total > 0 && paraphraseRelease.total > 0
    && rate(releaseErr) <= CONTRADICTION_RELEASE_FLOORS.releaseErr
    && rate(paraphraseRelease) >= CONTRADICTION_RELEASE_FLOORS.paraphraseRelease;
  return { wording, releaseErr, paraphraseRelease, ok };
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
