import { buildLoreRequests, loreKey, pickLore, readLore, type LoreEntry, type LoreScene, type LoreScope } from "./lore";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";
import type { JudgeRequest, JudgeResult } from "./types";

export interface LoreCalibrationCase {
  id: string;
  lang: string;
  pool: string;
  scene: LoreScene;
  needed: string[];
  scope?: Pick<LoreScope, "topK" | "minP">;
  candidates?: LoreEntry[];
}

export interface LoreCalibrationFixture {
  pools: Record<string, LoreEntry[]>;
  rows: LoreCalibrationCase[];
}

// Pools keep one copy of each book in the fixture; a case carries only its pool's name.
export const resolveLoreCases = (fixture: LoreCalibrationFixture): LoreCalibrationCase[] =>
  fixture.rows.map((row) => ({ ...row, candidates: row.candidates ?? fixture.pools[row.pool] ?? [] }));

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

// Rows: `<case>.recall:<key>` per needed entry (was it forced?) and `<case>.precision:<key>` per
// forced entry (was it needed?), so a report reads per family against the plan's floors.
export async function runLoreCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: LoreCalibrationCase[]): Promise<JudgeSelfTestReport> {
  const perCase = await Promise.all(cases.map(async (entry) => {
    const chunks = buildLoreRequests(entry.candidates ?? [], entry.scene);
    const results = await Promise.all(chunks.map(async (chunk) => ({ chunk, result: await ask(chunk.request) })));
    const scored = results.flatMap(({ chunk, result }) => (result.answers ? readLore(result.answers, chunk.entries) : []));
    const picked = pickLore(scored, entry.scope ?? {});
    const pickedKeys = new Set(picked.map((pick) => loreKey(pick.entry)));
    const needed = new Set(entry.needed);
    const latencyMs = Math.max(0, ...results.map(({ result }) => result.latencyMs));
    const fallback = results.find(({ result }) => result.fallback)?.result.fallback;
    const base = { latencyMs, ...(fallback ? { fallback } : {}) };
    const pOf = (key: string) => scored.find((pick) => loreKey(pick.entry) === key)?.p ?? null;
    const rows: JudgeSelfTestRow[] = [
      ...entry.needed.map((key) => ({ id: `${entry.id}.recall:${key}`, right: pickedKeys.has(key), picked: pOf(key) === null ? null : `p=${pOf(key)}`, ...base })),
      ...picked.map((pick) => ({ id: `${entry.id}.precision:${loreKey(pick.entry)}`, right: needed.has(loreKey(pick.entry)), picked: `p=${pick.p}`, detail: pick.entry.comment, ...base })),
    ];
    return { rows, model: results.find(({ result }) => result.model)?.result.model ?? null, latencyMs };
  }));
  const rows = perCase.flatMap((entry) => entry.rows);
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: median(perCase.map((entry) => entry.latencyMs)),
    rows,
  };
}
