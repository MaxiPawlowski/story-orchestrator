import type { PrimitiveValue, Quality } from "@engine/index";
import { buildStallRequest, buildTypedPlan, readTypedDeltas, stallDirectValue, type StallLeaf, type TypedStoryContext, type TypedWindowMessage } from "./extraction";
import { STALL_GENUINE_P } from "./policy";
import { noulAnswer } from "./questions";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";
import type { JudgeRequest, JudgeResult } from "./types";
import { median } from "./stats";

export interface TypedCase {
  id: string;
  lang: string;
  story: TypedStoryContext;
  qualities: Quality[];
  window: TypedWindowMessage[];
  prior: Record<string, PrimitiveValue>;
  acceptable: Record<string, PrimitiveValue[] | null>;
}

export interface StallCase {
  id: string;
  lang: string;
  window: TypedWindowMessage[];
  leaves: Array<StallLeaf & { shown: boolean }>;
}

const toReport = (perCase: Array<{ rows: JudgeSelfTestRow[]; model: string | null; latencyMs: number }>): JudgeSelfTestReport => {
  const rows = perCase.flatMap((entry) => entry.rows);
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: median(perCase.map((entry) => entry.latencyMs)),
    rows,
  };
};

// The spike's scoring (lib/story.mts valueMatches): a bool is false until shown true, floats match
// within 0.051, strings ignore case, and "no change expected" is the prior.
export function typedValueMatches(quality: Pick<Quality, "type">, predicted: PrimitiveValue | undefined, acceptable: PrimitiveValue[] | null): boolean {
  const normalized = quality.type === "bool" ? predicted === true : predicted;
  if (acceptable === null) return normalized === undefined || (quality.type === "bool" && normalized === false);
  if (normalized === undefined) return false;
  return acceptable.some((value) => {
    if (typeof value === "number" && typeof normalized === "number") return Math.abs(value - normalized) <= (quality.type === "float" ? 0.051 : 0);
    if (typeof value === "string" && typeof normalized === "string") return value.toLowerCase() === normalized.toLowerCase();
    return value === normalized;
  });
}

// Rows `<case>.answered:<key>` (the judge answered over the floor: is the value the chain would hold
// right?) and `<case>.coverage:<key>` (did it answer at all? the rest stays with the LLM read).
export async function runTypedCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: TypedCase[]): Promise<JudgeSelfTestReport> {
  return toReport(await Promise.all(cases.map(async (entry) => {
    const plan = buildTypedPlan(entry.qualities, entry.window, entry.story);
    if (!plan) return { rows: [], model: null, latencyMs: 0 };
    const result = await ask(plan.request);
    const read = result.answers ? readTypedDeltas(result.answers, plan, entry.qualities, entry.window) : { deltas: [], answered: [] };
    const base = { latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) };
    const rows: JudgeSelfTestRow[] = plan.decoders.flatMap(({ key }) => {
      const quality = entry.qualities.find((item) => item.key === key)!;
      const delta = read.deltas.find((item) => item.q === key);
      const answered = read.answered.includes(key);
      const value = delta ? delta.v : entry.prior[key];
      const coverage = { id: `${entry.id}.coverage:${key}`, right: answered, picked: delta ? `${JSON.stringify(delta.v)}@${delta.confidence}` : answered ? "not shown" : "under floor", ...base };
      return answered ? [
        coverage,
        {
          id: `${entry.id}.answered:${key}`,
          right: typedValueMatches(quality, value, entry.acceptable[key] ?? null),
          picked: JSON.stringify(value ?? null),
          detail: JSON.stringify(entry.acceptable[key]),
          ...base
        },
      ] : [coverage];
    });
    return { rows, model: result.model, latencyMs: result.latencyMs };
  })));
}

// Rows `<case>.direct:<i>` for every leaf the pre-check would write directly (was it shown?) and
// `<case>.kept:<i>` for every shown leaf (was the stall never mistaken for a genuine one?).
export async function runStallCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: StallCase[]): Promise<JudgeSelfTestReport> {
  return toReport(await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildStallRequest(entry.leaves, entry.window));
    const answers = result.answers;
    const base = { latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) };
    const rows: JudgeSelfTestRow[] = entry.leaves.flatMap((leaf, index) => {
      const p = answers ? noulAnswer(answers, `leaf:${index}`) : null;
      const direct = p !== null && stallDirectValue(leaf, p) !== null;
      const picked = p === null ? null : `p=${p}`;
      return [
        ...(direct ? [{ id: `${entry.id}.direct:${index}`, right: leaf.shown, picked, detail: `${leaf.q} ${leaf.op} ${JSON.stringify(leaf.v)}`, ...base }] : []),
        ...(leaf.shown ? [{ id: `${entry.id}.kept:${index}`, right: p !== null && p >= STALL_GENUINE_P, picked, detail: `${leaf.q} ${leaf.op} ${JSON.stringify(leaf.v)}`, ...base }] : []),
      ];
    });
    return { rows, model: result.model, latencyMs: result.latencyMs };
  })));
}
