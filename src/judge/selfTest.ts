import { buildDirectorRequest, decideDirector, DIRECTOR_NOBODY } from "./director";
import { JUDGE_SELF_TEST_CASES, type JudgeSelfTestCase } from "./selfTestCases";
import type { JudgeFallback, JudgeRequest, JudgeResult } from "./types";

export interface JudgeSelfTestRow {
  id: string;
  right: boolean;
  picked: string | null;
  latencyMs: number;
  fallback?: JudgeFallback;
}

export interface JudgeSelfTestReport {
  ranAt: string;
  model: string | null;
  total: number;
  right: number;
  p50LatencyMs: number | null;
  rows: JudgeSelfTestRow[];
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

export async function runJudgeDirectorSelfTest(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: JudgeSelfTestCase[] = JUDGE_SELF_TEST_CASES): Promise<JudgeSelfTestReport> {
  const rows = await Promise.all(cases.map(async (entry): Promise<JudgeSelfTestRow & { model: string | null }> => {
    const result = await ask(buildDirectorRequest(entry.input));
    const decision = result.answers ? decideDirector(result.answers, entry.input) : null;
    const picked = decision?.kind === "member" ? decision.name : decision?.kind === "silence" ? DIRECTOR_NOBODY : null;
    const right = picked !== null && entry.acceptable.some((name) => (name === "NONE" ? picked === DIRECTOR_NOBODY : name === picked));
    return { id: entry.id, right, picked, latencyMs: result.latencyMs, model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
  }));
  return {
    ranAt: new Date().toISOString(),
    model: rows.find((row) => row.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: median(rows.filter((row) => !row.fallback).map((row) => row.latencyMs)),
    rows: rows.map(({ model: _model, ...row }) => row),
  };
}
