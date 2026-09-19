import { CURATOR_FILTER_MIN_ENTRIES, CURATOR_FILTER_P } from "./policy";
import { noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";

export interface CuratorFilterEntry {
  title: string;
  content: string;
  enabled: boolean;
}

export interface CuratorFilterInput {
  checkpoint: { name: string; objective: string };
  canon: string;
  openThreads: string[];
  entries: CuratorFilterEntry[];
}

export const CURATOR_FILTER_CANON_CHARS = 1200;

// Phase A wording (experiments/curatorFilter.mts): one shared state, one noul per entry.
export function buildCuratorFilterRequest(input: CuratorFilterInput): JudgeRequest {
  return {
    state: {
      checkpoint: input.checkpoint,
      canon: input.canon.length <= CURATOR_FILTER_CANON_CHARS ? input.canon : `${input.canon.slice(0, CURATOR_FILTER_CANON_CHARS).trimEnd()}…`,
      open_threads: input.openThreads,
      entries: input.entries.map((entry) => ({ title: entry.title, switched_on: entry.enabled, content: entry.content })),
    },
    questions: Object.fromEntries(input.entries.map((_, index) => [`entry:${index}`, noul(`Look at \`entries[${index}]\`. Has the story so far (\`canon\`, \`open_threads\`, \`checkpoint\`) made something in it out of date, or, if it is switched off, made it newly needed?`)])),
  };
}

// Which entries the curator still sees. Nothing is narrowed below the size where the prompt is
// already small, every switched-off entry stays (the curator may need to enable it), and an entry
// with no answer stays: a missed stale entry silently loses the curator its only job.
export function curatorFilterKeep(answers: Record<string, JudgeAnswer> | null, entries: CuratorFilterEntry[]): boolean[] {
  if (!answers || entries.length <= CURATOR_FILTER_MIN_ENTRIES) return entries.map(() => true);
  return entries.map((entry, index) => {
    const p = noulAnswer(answers, `entry:${index}`);
    return !entry.enabled || p === null || p >= CURATOR_FILTER_P;
  });
}

export interface CuratorFilterCase {
  id: string;
  lang: string;
  input: CuratorFilterInput;
  attention: boolean[];
}

// Rows `<case>.recall:<i>` per entry that needs attention (did the curator still see it?) and
// `<case>.kept:<i>` per fine switched-on entry (right when the filter dropped it).
export async function runCuratorFilterCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: CuratorFilterCase[]): Promise<JudgeSelfTestReport> {
  const perCase = await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildCuratorFilterRequest(entry.input));
    const answers = result.answers;
    const keep = answers ? entry.input.entries.map((item, index) => !item.enabled || (noulAnswer(answers, `entry:${index}`) ?? 1) >= CURATOR_FILTER_P) : entry.input.entries.map(() => true);
    const base = { latencyMs: result.latencyMs, ...(result.fallback ? { fallback: result.fallback } : {}) };
    const pOf = (index: number) => (answers ? noulAnswer(answers, `entry:${index}`) : null);
    const rows: JudgeSelfTestRow[] = entry.input.entries.flatMap((item, index) => {
      const picked = pOf(index) === null ? null : `p=${pOf(index)}`;
      if (entry.attention[index]) return [{ id: `${entry.id}.recall:${index}`, right: keep[index], picked, detail: item.title, ...base }];
      if (item.enabled) return [{ id: `${entry.id}.narrowed:${index}`, right: !keep[index], picked, detail: item.title, ...base }];
      return [];
    });
    return { rows, model: result.model, latencyMs: result.latencyMs };
  }));
  const rows = perCase.flatMap((entry) => entry.rows);
  const latencies = perCase.map((entry) => entry.latencyMs).sort((left, right) => left - right);
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    rows,
  };
}
