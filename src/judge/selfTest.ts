import { buildDirectorRequest, decideDirector, DIRECTOR_NOBODY } from "./director";
import { buildPairRequest, buildVerifyRequest, pairDecision, readPair, readVerify, verifyVerdict, type JudgePairRelation } from "./memory";
import { JUDGE_SELF_TEST_CASES, type JudgeSelfTestCase } from "./selfTestCases";
import type { JudgeFallback, JudgeRequest, JudgeResult } from "./types";

export interface JudgeSelfTestRow {
  id: string;
  right: boolean;
  picked: string | null;
  latencyMs: number;
  fallback?: JudgeFallback;
  detail?: string | null;
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

export interface MemoryVerifyCase {
  id: string;
  case: string;
  lang: string;
  storyTitle: string;
  cast: string[];
  transcript: Array<{ id: string; speaker: string; text: string }>;
  line: string;
  supported: boolean;
}

export interface MemoryPairCase {
  id: string;
  lang: string;
  label: JudgePairRelation;
  older: string;
  newer: string;
}

const pairAction = (relation: JudgePairRelation) => (relation === "duplicate" ? "drop" : relation === "update" ? "supersede" : "keep");

const summarize = (rows: Array<JudgeSelfTestRow & { model: string | null }>): JudgeSelfTestReport => ({
  ranAt: new Date().toISOString(),
  model: rows.find((row) => row.model)?.model ?? null,
  total: rows.length,
  right: rows.filter((row) => row.right).length,
  p50LatencyMs: median(rows.filter((row) => !row.fallback).map((row) => row.latencyMs)),
  rows: rows.map(({ model: _model, ...row }) => row),
});

// One call per window, as production verifies one read's lines together. Right = an unsupported
// line is dropped, a supported one is not.
export async function runMemoryVerifyCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: MemoryVerifyCase[]): Promise<JudgeSelfTestReport> {
  const groups = new Map<string, MemoryVerifyCase[]>();
  cases.forEach((entry) => groups.set(`${entry.case}:${entry.lang}`, [...(groups.get(`${entry.case}:${entry.lang}`) ?? []), entry]));
  const rows = (await Promise.all([...groups.values()].map(async (group) => {
    const result = await ask(buildVerifyRequest({ storyTitle: group[0].storyTitle, cast: group[0].cast, transcript: group[0].transcript, lines: group.map((entry) => entry.line) }));
    const scores = result.answers ? readVerify(result.answers, group.length) : group.map(() => null);
    return group.map((entry, index) => {
      const dropped = verifyVerdict(scores[index]).action === "drop";
      return { id: entry.id, right: entry.supported ? !dropped : dropped, picked: scores[index] === null ? null : `p=${scores[index]}`, latencyMs: result.latencyMs, model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
    });
  }))).flat();
  return summarize(rows);
}

// One call per pair. Right = the decided relation implies the labelled action; a pair the policy
// leaves undecided (low confidence) counts as not right, since the heuristic takes it.
export async function runMemoryPairsCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: MemoryPairCase[]): Promise<JudgeSelfTestReport> {
  const rows = await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildPairRequest(entry.older, entry.newer));
    const read = result.answers ? readPair(result.answers) : null;
    const decision = pairDecision(read);
    return { id: entry.id, right: decision !== null && pairAction(decision) === pairAction(entry.label), picked: decision ?? (read ? `undecided ${read.relation}@${read.confidence}` : null), detail: read ? `${read.relation}@${read.confidence} same=${read.sameThing}` : null, latencyMs: result.latencyMs, model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
  }));
  return summarize(rows);
}
