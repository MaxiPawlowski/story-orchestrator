import { HEADING_P, PRESENT_P, SCENE_TRIGGER } from "./policy";
import { buildSceneReadRequest, readScene, type SceneReadInput } from "./scene";
import { judgeFamilyScores, type JudgeSelfTestReport, type JudgeSelfTestRow } from "./selfTest";
import type { JudgeRequest, JudgeResult } from "./types";
import { median } from "./stats";

export interface SceneCalibrationCase {
  id: string;
  kind: "window" | "break";
  lang: string;
  input: SceneReadInput;
  labels: { present?: Record<string, boolean>; location?: string; time?: string; heading?: Record<string, boolean>; sceneBreak?: boolean };
}

export type SceneFamilyKey = "present" | "location" | "time" | "heading" | "break" | "nobreak";

// The trigger only adds reads next to the regex's text-pattern hits (union), so a miss costs what it
// costs today and a false trigger costs one GPU read: no false trigger at all, and recall over the
// regex's measured 6 of 12 (Phase A).
export const SCENE_CALIBRATION_FLOORS: Record<SceneFamilyKey, number> = { present: 0.9, location: 0.85, time: 0.8, heading: 0.85, break: 0.5, nobreak: 1 };

export async function runSceneCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: SceneCalibrationCase[]): Promise<JudgeSelfTestReport> {
  const perCase = await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildSceneReadRequest(entry.input));
    const read = result.answers ? readScene(result.answers, entry.input) : {};
    const base = { latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) };
    const rows: JudgeSelfTestRow[] = [];
    if (entry.labels.sceneBreak !== undefined) {
      const p = read.sceneBreak?.p ?? null;
      rows.push({
        id: `${entry.id}.${entry.labels.sceneBreak ? "break" : "nobreak"}`,
        right: p !== null && p >= SCENE_TRIGGER === entry.labels.sceneBreak,
        picked: p === null ? null : `p=${p} ${read.sceneBreak?.type ?? ""}`.trim(),
        ...base
      });
    }
    Object.entries(entry.labels.present ?? {}).forEach(([rosterId, label]) => {
      const p = read.present?.[rosterId] ?? null;
      rows.push({ id: `${entry.id}.present:${rosterId}`, right: p !== null && p >= PRESENT_P === label, picked: p === null ? null : `p=${p}`, ...base });
    });
    if (entry.labels.location !== undefined) rows.push({
      id: `${entry.id}.location`,
      right: read.location?.value === entry.labels.location,
      picked: read.location ? `${read.location.value}@${read.location.confidence}` : null,
      detail: `label ${entry.labels.location}`,
      ...base
    });
    if (entry.labels.time !== undefined) rows.push({
      id: `${entry.id}.time`,
      right: read.time?.value === entry.labels.time,
      picked: read.time ? `${read.time.value}@${read.time.confidence}` : null,
      detail: `label ${entry.labels.time}`,
      ...base
    });
    Object.entries(entry.labels.heading ?? {}).forEach(([checkpointId, label]) => {
      const p = read.headingTo?.[checkpointId] ?? null;
      rows.push({ id: `${entry.id}.heading:${checkpointId}`, right: p !== null && p >= HEADING_P === label, picked: p === null ? null : `p=${p}`, ...base });
    });
    return { rows, model: result.model };
  }));
  const rows = perCase.flatMap((entry) => entry.rows);
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: median(perCase.flatMap((entry) => entry.rows.slice(0, 1)).filter((row) => !row.fallback).map((row) => row.latencyMs)),
    rows,
  };
}

export const sceneFamilyScores = (report: JudgeSelfTestReport) => judgeFamilyScores(report, SCENE_CALIBRATION_FLOORS);
