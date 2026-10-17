import { stepTurns, WINDOW_HIGH, WINDOW_LOW } from './historyWindow.mts';

export type TrimArm = 'front-trim' | 'fits';
export type TrimPattern = 'same' | 'alternating';

export interface TrimTiming {
  prompt_n?: number;
  cache_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_per_second?: number;
}

export interface TrimRequest {
  tag: string | null;
  startedAt: number;
  firstByteAt: number | null;
  firstTextAt: number | null;
  doneAt: number | null;
  status: number;
  stream: boolean;
  timings: TrimTiming | null;
  truncated: boolean | null;
}

export interface TrimTurn {
  arm: TrimArm;
  pattern: TrimPattern;
  run: string;
  turn: number;
  speaker: string;
  cold: boolean;
  ms: number;
  chatLength: number;
  historyTokens: number;
  maxContext: number;
  amountGen: number;
  requests: TrimRequest[];
  replyChars: number;
}

export interface TrimRow {
  arm: TrimArm;
  pattern: TrimPattern;
  run: string;
  turn: number;
  cold: boolean;
  sent: number | null;
  reuse: number | null;
  prefillMs: number | null;
  firstTokenMs: number | null;
  decodeTps: number | null;
  historyTokens: number;
  budget: number;
}

export const TRIM_ARMS: Record<TrimArm, { maxContext: number; keep: number | null; note: string }> = {
  'front-trim': { maxContext: 24576, keep: null, note: 'the full saga at ST max_context 24576, so ST trims the oldest rows every turn (late lore on)' },
  fits: { maxContext: 32768, keep: 60, note: 'the saga cut to its first 60 rows at ST max_context 32768, so nothing trims across the run (the R2 baseline shape)' },
};

export function installTrimRecorder(): { armed: boolean; n: number } {
  const root = globalThis as any;
  if (!root.__trimRec) {
    root.__trimRec = [];
    const original = root.fetch;
    root.fetch = async function (input: any, init: any) {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (!url.includes('/api/backends/text-completions/generate') && !url.includes('/api/backends/chat-completions/generate')) return original.apply(this, arguments);
      let stream = false;
      try { stream = Boolean(JSON.parse(init?.body ?? '{}').stream); } catch { stream = false; }
      const entry: any = { tag: root.__trimTag ?? null, startedAt: Date.now(), firstByteAt: null, firstTextAt: null, doneAt: null, status: 0, stream, timings: null, truncated: null };
      root.__trimRec.push(entry);
      const response = await original.apply(this, arguments);
      entry.status = response.status;
      if (!response.body) return response;
      const [mine, theirs] = response.body.tee();
      (async () => {
        const reader = mine.getReader();
        const decoder = new TextDecoder();
        let text = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (entry.firstByteAt === null) entry.firstByteAt = Date.now();
          const chunk = decoder.decode(value, { stream: true });
          text += chunk;
          if (entry.firstTextAt === null && /"(?:text|content)"\s*:\s*"(?:[^"\\]|\\.)+"/.test(chunk)) entry.firstTextAt = Date.now();
        }
        entry.doneAt = Date.now();
        const all = [...text.matchAll(/"timings"\s*:\s*(\{[^}]*\})/g)];
        if (all.length) { try { entry.timings = JSON.parse(all[all.length - 1][1]); } catch { entry.timings = null; } }
        const truncated = text.match(/"truncated"\s*:\s*(true|false)/);
        if (truncated) entry.truncated = truncated[1] === 'true';
      })().catch(() => { entry.doneAt = Date.now(); });
      return new Response(theirs, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
  }
  return { armed: true, n: root.__trimRec.length };
}

export function speakerFor(pattern: TrimPattern, members: readonly string[], turn: number): string {
  if (!members.length) throw new Error('no members to draft');
  return pattern === 'same' ? members[0] : members[turn % members.length];
}

const q = (values: readonly number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))];
};
const r3 = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);

export function rowsOf(turns: readonly TrimTurn[], overhead: number): TrimRow[] {
  return turns.map((turn) => {
    const loud = turn.requests.filter((request) => request.stream && request.tag === `turn-${turn.turn}`);
    const request = loud[loud.length - 1] ?? null;
    const t = request?.timings ?? null;
    const sent = t && typeof t.prompt_n === 'number' ? t.prompt_n + (t.cache_n ?? 0) : null;
    return {
      arm: turn.arm, pattern: turn.pattern, run: turn.run, turn: turn.turn, cold: turn.cold,
      sent,
      reuse: t && sent ? (t.cache_n ?? 0) / sent : null,
      prefillMs: t?.prompt_ms ?? null,
      firstTokenMs: !request ? null : request.firstTextAt !== null ? request.firstTextAt - request.startedAt : request.firstByteAt !== null ? request.firstByteAt - request.startedAt : null,
      decodeTps: t?.predicted_per_second ?? null,
      historyTokens: turn.historyTokens,
      budget: Math.max(0, turn.maxContext - turn.amountGen - overhead),
    };
  });
}

export function overheadFrom(turns: readonly TrimTurn[]): number | null {
  const fits = rowsOf(turns.filter((turn) => turn.arm === 'fits'), 0).filter((row) => row.sent !== null);
  return q(fits.map((row) => (row.sent as number) - row.historyTokens), 0.5);
}

const stats = (rows: readonly TrimRow[]) => ({
  n: rows.length,
  sentP50: q(rows.flatMap((row) => (row.sent === null ? [] : [row.sent])), 0.5),
  reuseP50: r3(q(rows.flatMap((row) => (row.reuse === null ? [] : [row.reuse])), 0.5)),
  prefillMsP50: q(rows.flatMap((row) => (row.prefillMs === null ? [] : [Math.round(row.prefillMs)])), 0.5),
  firstTokenMsP50: q(rows.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs])), 0.5),
  firstTokenMsP95: q(rows.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs])), 0.95),
  decodeTpsP50: r3(q(rows.flatMap((row) => (row.decodeTps === null ? [] : [row.decodeTps])), 0.5)),
  missingTimings: rows.filter((row) => row.sent === null).length,
});

export function trimmedTurns(rows: readonly TrimRow[]): number {
  let count = 0;
  const byRun = new Map<string, TrimRow[]>();
  for (const row of rows) byRun.set(`${row.arm}|${row.pattern}|${row.run}`, [...(byRun.get(`${row.arm}|${row.pattern}|${row.run}`) ?? []), row]);
  for (const list of byRun.values()) {
    const sorted = [...list].sort((a, b) => a.turn - b.turn);
    for (let index = 1; index < sorted.length; index += 1) if ((sorted[index].sent ?? 0) < (sorted[index - 1].sent ?? 0)) count += 1;
  }
  return count;
}

export function scoreTrim(turns: readonly TrimTurn[], { overhead = null as number | null, high = WINDOW_HIGH, low = WINDOW_LOW } = {}) {
  const measured = overhead ?? overheadFrom(turns) ?? 0;
  const rows = rowsOf(turns, measured);
  const cells: Record<string, unknown> = {};
  for (const arm of ['front-trim', 'fits'] as TrimArm[]) {
    for (const pattern of ['same', 'alternating'] as TrimPattern[]) {
      const cell = rows.filter((row) => row.arm === arm && row.pattern === pattern);
      if (!cell.length) continue;
      const frontRuns = [...new Set(cell.map((row) => row.run))];
      const steps = arm === 'front-trim' ? frontRuns.map((run) => {
        const ordered = cell.filter((row) => row.run === run).sort((a, b) => a.turn - b.turn);
        const at = stepTurns(ordered.map((row) => row.historyTokens), ordered[0]?.budget ?? 0, high, low).map((index) => ordered[index].turn);
        return { run, budget: ordered[0]?.budget ?? 0, stepTurns: at, onStep: stats(ordered.filter((row) => at.includes(row.turn) && !row.cold)) };
      }) : null;
      cells[`${arm}/${pattern}`] = { warm: stats(cell.filter((row) => !row.cold)), cold: stats(cell.filter((row) => row.cold)), steps };
    }
  }
  const warm = (arm: TrimArm) => rows.filter((row) => row.arm === arm && !row.cold && row.firstTokenMs !== null).map((row) => row.firstTokenMs as number);
  const front = q(warm('front-trim'), 0.5);
  const fits = q(warm('fits'), 0.5);
  return {
    overhead: measured,
    window: { high, low },
    cells,
    headline: { firstTokenMsP50: { 'front-trim': front, fits }, frontTrimOverFits: front !== null && fits ? r3(front / fits) : null },
    trimmedInFits: trimmedTurns(rows.filter((row) => row.arm === 'fits')),
    stepsSpanned: Object.values(cells).flatMap((cell) => ((cell as { steps: Array<{ stepTurns: number[] }> | null }).steps ?? []).map((step) => step.stepTurns.length)),
  };
}
