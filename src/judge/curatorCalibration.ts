import {
  backgroundCandidates, backgroundDecision, BACKGROUND_NONE, buildBackgroundRequest, buildContinuityRequest,
  continuityNote, readBackground, sceneDescription, type SceneDescriptionInput,
} from "./curators";
import { CONTINUITY_P } from "./policy";
import { noulAnswer } from "./questions";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";
import type { JudgeFallback, JudgeRequest, JudgeResult } from "./types";
import { median } from "./stats";

export interface ContinuityCase {
  id: string;
  lang: string;
  established: string[];
  reply: { speaker: string; text: string };
  contradicts: number[];
}

export interface BackgroundCase {
  id: string;
  lang: string;
  scene?: string;
  compose?: SceneDescriptionInput;
  current?: string | null;
  acceptable: string[];
}

const report = (perCase: Array<{ rows: JudgeSelfTestRow[]; model: string | null; latencyMs: number }>): JudgeSelfTestReport => {
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

// Rows: `<case>.reply` (a note appears exactly when the reply broke a fact), `<case>.broken:<i>`
// per contradicted fact (flagged?) and `<case>.consistent:<i>` per consistent fact (false alarm?).
type FactCase = Pick<ContinuityCase, "id" | "established" | "contradicts">;

export const continuityFactRows = (entry: FactCase, pOf: (index: number) => number | null, base: { latencyMs: number; fallback?: JudgeFallback }): JudgeSelfTestRow[] =>
  entry.established.map((fact, index) => {
    const p = pOf(index);
    const flagged = p !== null && p >= CONTINUITY_P;
    return entry.contradicts.includes(index)
      ? { id: `${entry.id}.broken:${index}`, right: flagged, picked: p === null ? null : `p=${p}`, detail: fact, ...base }
      : { id: `${entry.id}.consistent:${index}`, right: !flagged, picked: p === null ? null : `p=${p}`, detail: fact, ...base };
  });

export async function runContinuityCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: ContinuityCase[]): Promise<JudgeSelfTestReport> {
  return report(await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildContinuityRequest(entry.reply, entry.established));
    const answers = result.answers;
    const note = answers ? continuityNote(answers, entry.established) : null;
    const base = { latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) };
    const pOf = (index: number) => (answers ? noulAnswer(answers, `fact:${index}`) : null);
    const rows: JudgeSelfTestRow[] = [
      { id: `${entry.id}.reply`, right: Boolean(note) === entry.contradicts.length > 0, picked: note ? note.facts.join(" | ") : "no note", ...base },
      ...continuityFactRows(entry, pOf, base),
    ];
    return { rows, model: result.model, latencyMs: result.latencyMs };
  })));
}

export interface RescoreRow {
  id: string;
  arm: string;
  established: string[];
  reply: { speaker: string; text: string };
}

export interface RescoreResult {
  id: string;
  arm: string;
  /** null: the judge did not answer, so the reply is not counted either way. */
  flagged: boolean | null;
  broken: string[];
  latencyMs: number;
  model: string | null;
  score?: number;
  fallback?: string;
}

// v2.4 plan 07 (X12): the judge-off control column. The calibrated continuity question re-asked over
// each arm's captured replies, so both arms are scored by one instrument. A reply with no facts to
// hold it to is not asked (the warden would not have asked either).
export async function runContinuityRescore(ask: (request: JudgeRequest) => Promise<JudgeResult>, rows: RescoreRow[]): Promise<RescoreResult[]> {
  return Promise.all(rows.filter((row) => row.established.length > 0).map(async (row) => {
    const result = await ask(buildContinuityRequest(row.reply, row.established));
    const note = result.answers ? continuityNote(result.answers, row.established) : null;
    return {
      id: row.id,
      arm: row.arm,
      flagged: result.answers ? Boolean(note) : null,
      broken: note?.facts ?? [],
      latencyMs: result.latencyMs,
      model: result.model,
      ...(result.fallback ? { fallback: result.fallback } : {}),
    };
  }));
}

// Rows: `<case>.pick` for a scene with a fitting file (the change lands on an acceptable one) and
// `<case>.none` for a scene nothing fits (no change at all).
export async function runBackgroundCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: BackgroundCase[], installed: string[]): Promise<JudgeSelfTestReport> {
  return report(await Promise.all(cases.map(async (entry) => {
    const description = entry.scene ?? (entry.compose ? sceneDescription(entry.compose) : "");
    const names = backgroundCandidates(installed, description);
    const result = await ask(buildBackgroundRequest(names, description));
    const read = result.answers ? readBackground(result.answers, names) : null;
    const decision = backgroundDecision(read, entry.current ?? null);
    const none = entry.acceptable.includes(BACKGROUND_NONE);
    const right = none ? decision === null : decision !== null && entry.acceptable.includes(decision);
    const rows: JudgeSelfTestRow[] = [{
      id: `${entry.id}.${none ? "none" : "pick"}`,
      right,
      picked: read ? `${read.name}@${read.confidence}` : null,
      detail: entry.acceptable.join(" | "),
      latencyMs: result.latencyMs,
      ...(result.fallback ? { fallback: result.fallback } : {})
    }];
    return { rows, model: result.model, latencyMs: result.latencyMs };
  })));
}
