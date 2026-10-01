export interface CdpLike {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
}

export interface SoakEntry {
  start: number;
  duration: number;
  name?: string;
}

export interface SoakSample {
  seq: number;
  at: string;
  heapUsed: number;
  heapTotal: number;
  nodes: number | null;
  listeners: number | null;
  longTasks: SoakEntry[];
  events: SoakEntry[];
  dropped: number;
  armed: boolean;
}

export interface SoakBudgets {
  maxHeapGrowthBytes: number;
  maxHeapGrowthRatio: number;
  maxNodeGrowth: number;
  maxLongTaskMs: number;
  maxLongTaskTotalMsPerSample: number;
  maxEventDurationMs: number;
  minSamples: number;
}

export const DEFAULT_SOAK_BUDGETS: SoakBudgets = {
  maxHeapGrowthBytes: 64 * 1024 * 1024,
  maxHeapGrowthRatio: 0.5,
  maxNodeGrowth: 20000,
  maxLongTaskMs: 1000,
  maxLongTaskTotalMsPerSample: 5000,
  maxEventDurationMs: 500,
  minSamples: 3,
};

export const SOAK_GLOBAL = '__soSoakProbe';

export const ARM_EXPRESSION = `(() => {
  const key = ${JSON.stringify(SOAK_GLOBAL)};
  const existing = globalThis[key];
  if (existing && existing.armed) return { armed: true, already: true, supported: existing.supported };
  const state = { armed: true, longTasks: [], events: [], dropped: 0, cap: 2000, supported: [], observers: [] };
  const push = (list, entry) => { if (list.length >= state.cap) { list.shift(); state.dropped += 1; } list.push(entry); };
  const types = typeof PerformanceObserver === 'function' ? (PerformanceObserver.supportedEntryTypes || []) : [];
  if (types.includes('longtask')) {
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) push(state.longTasks, { start: entry.startTime, duration: entry.duration, name: entry.name }); });
    observer.observe({ type: 'longtask', buffered: true });
    state.observers.push(observer);
    state.supported.push('longtask');
  }
  if (types.includes('event')) {
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) push(state.events, { start: entry.startTime, duration: entry.duration, name: entry.name }); });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
    state.observers.push(observer);
    state.supported.push('event');
  }
  globalThis[key] = state;
  return { armed: true, already: false, supported: state.supported };
})()`;

export const DRAIN_EXPRESSION = `(() => {
  const state = globalThis[${JSON.stringify(SOAK_GLOBAL)}];
  const nodes = typeof document === 'object' ? document.getElementsByTagName('*').length : null;
  if (!state) return { armed: false, longTasks: [], events: [], dropped: 0, nodes };
  const out = { armed: true, longTasks: state.longTasks.splice(0), events: state.events.splice(0), dropped: state.dropped, nodes };
  state.dropped = 0;
  return out;
})()`;

export const DISARM_EXPRESSION = `(() => {
  const key = ${JSON.stringify(SOAK_GLOBAL)};
  const state = globalThis[key];
  if (!state) return { disarmed: false };
  for (const observer of state.observers) observer.disconnect();
  delete globalThis[key];
  return { disarmed: true };
})()`;

const valueOf = (result: any) => {
  if (result?.exceptionDetails) throw new Error(`Runtime.evaluate threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'unknown'}`);
  return result?.result?.value;
};

export async function armSoakProbe(cdp: CdpLike) {
  return valueOf(await cdp.send('Runtime.evaluate', { expression: ARM_EXPRESSION, returnByValue: true })) as { armed: boolean; already: boolean; supported: string[] };
}

export async function disarmSoakProbe(cdp: CdpLike) {
  return valueOf(await cdp.send('Runtime.evaluate', { expression: DISARM_EXPRESSION, returnByValue: true })) as { disarmed: boolean };
}

export async function sampleSoak(cdp: CdpLike, seq: number, { gc = true, now = () => new Date() }: { gc?: boolean; now?: () => Date } = {}): Promise<SoakSample> {
  if (gc) await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  const drained = valueOf(await cdp.send('Runtime.evaluate', { expression: DRAIN_EXPRESSION, returnByValue: true })) ?? {};
  let listeners: number | null = null;
  try {
    const metrics = await cdp.send('Performance.getMetrics');
    const row = (metrics?.metrics ?? []).find((metric: { name: string }) => metric.name === 'JSEventListeners');
    listeners = typeof row?.value === 'number' ? row.value : null;
  } catch {}
  return {
    seq,
    at: now().toISOString(),
    heapUsed: Number(heap?.usedSize ?? NaN),
    heapTotal: Number(heap?.totalSize ?? NaN),
    nodes: typeof drained.nodes === 'number' ? drained.nodes : null,
    listeners,
    longTasks: Array.isArray(drained.longTasks) ? drained.longTasks : [],
    events: Array.isArray(drained.events) ? drained.events : [],
    dropped: Number(drained.dropped ?? 0),
    armed: drained.armed === true,
  };
}

const minOf = (values: number[]) => Math.min(...values);

export function parseBudgets(spec: string | null | undefined, base: SoakBudgets = DEFAULT_SOAK_BUDGETS): { budgets: SoakBudgets; errors: string[] } {
  const budgets = { ...base };
  const errors: string[] = [];
  for (const raw of (spec ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const [key, value] = raw.split('=');
    if (!(key in budgets)) { errors.push(`unknown budget "${key}" (known: ${Object.keys(base).join(', ')})`); continue; }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) { errors.push(`budget "${key}" needs a non-negative number, got "${value}"`); continue; }
    (budgets as Record<string, number>)[key] = number;
  }
  return { budgets, errors };
}

export interface SoakVerdict {
  ok: boolean;
  problems: string[];
  measured: {
    samples: number;
    heapStart: number | null;
    heapEnd: number | null;
    heapGrowthBytes: number | null;
    heapGrowthRatio: number | null;
    nodeGrowth: number | null;
    longTasks: number;
    maxLongTaskMs: number;
    maxLongTaskTotalMsPerSample: number;
    events: number;
    maxEventDurationMs: number;
    dropped: number;
  };
}

export function soakVerdict(samples: SoakSample[], budgets: SoakBudgets = DEFAULT_SOAK_BUDGETS): SoakVerdict {
  const problems: string[] = [];
  const usable = samples.filter((sample) => Number.isFinite(sample.heapUsed));
  if (usable.length < budgets.minSamples) problems.push(`${usable.length} usable sample(s), fewer than the ${budgets.minSamples} a verdict needs`);
  if (samples.some((sample) => !sample.armed)) problems.push(`${samples.filter((sample) => !sample.armed).length} sample(s) were taken with no observer armed (a reload drops it): their long tasks and events are unknown, not zero`);
  const window = Math.max(1, Math.min(3, Math.floor(usable.length / 2)));
  const heapStart = usable.length ? minOf(usable.slice(0, window).map((sample) => sample.heapUsed)) : null;
  const heapEnd = usable.length ? minOf(usable.slice(-window).map((sample) => sample.heapUsed)) : null;
  const heapGrowthBytes = heapStart !== null && heapEnd !== null ? heapEnd - heapStart : null;
  const heapGrowthRatio = heapGrowthBytes !== null && heapStart ? heapGrowthBytes / heapStart : null;
  if (heapGrowthBytes !== null && heapGrowthBytes > budgets.maxHeapGrowthBytes) problems.push(`heap after GC grew ${heapGrowthBytes} B (${heapStart} -> ${heapEnd}), over the ${budgets.maxHeapGrowthBytes} B budget`);
  if (heapGrowthRatio !== null && heapGrowthRatio > budgets.maxHeapGrowthRatio) problems.push(`heap after GC grew ${(heapGrowthRatio * 100).toFixed(1)}%, over the ${(budgets.maxHeapGrowthRatio * 100).toFixed(1)}% budget`);
  const nodeSamples = samples.filter((sample) => typeof sample.nodes === 'number').map((sample) => sample.nodes as number);
  const nodeGrowth = nodeSamples.length >= 2 ? minOf(nodeSamples.slice(-window)) - minOf(nodeSamples.slice(0, window)) : null;
  if (nodeGrowth !== null && nodeGrowth > budgets.maxNodeGrowth) problems.push(`DOM grew ${nodeGrowth} nodes, over the ${budgets.maxNodeGrowth} budget`);
  const longTasks = samples.flatMap((sample) => sample.longTasks);
  const maxLongTaskMs = longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0);
  if (maxLongTaskMs > budgets.maxLongTaskMs) problems.push(`a long task ran ${Math.round(maxLongTaskMs)} ms, over the ${budgets.maxLongTaskMs} ms budget`);
  const maxLongTaskTotalMsPerSample = samples.reduce((max, sample) => Math.max(max, sample.longTasks.reduce((sum, entry) => sum + entry.duration, 0)), 0);
  if (maxLongTaskTotalMsPerSample > budgets.maxLongTaskTotalMsPerSample) problems.push(`one sample interval spent ${Math.round(maxLongTaskTotalMsPerSample)} ms in long tasks, over the ${budgets.maxLongTaskTotalMsPerSample} ms budget`);
  const events = samples.flatMap((sample) => sample.events);
  const maxEventDurationMs = events.reduce((max, entry) => Math.max(max, entry.duration), 0);
  if (maxEventDurationMs > budgets.maxEventDurationMs) problems.push(`an input event took ${Math.round(maxEventDurationMs)} ms to paint, over the ${budgets.maxEventDurationMs} ms budget`);
  const dropped = samples.reduce((sum, sample) => sum + sample.dropped, 0);
  if (dropped > 0) problems.push(`${dropped} observer entr(y/ies) dropped between samples: sample more often`);
  return {
    ok: problems.length === 0,
    problems,
    measured: { samples: samples.length, heapStart, heapEnd, heapGrowthBytes, heapGrowthRatio, nodeGrowth, longTasks: longTasks.length, maxLongTaskMs, maxLongTaskTotalMsPerSample, events: events.length, maxEventDurationMs, dropped },
  };
}

export function parseSoakJsonl(text: string): SoakSample[] {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line) as SoakSample;
    } catch {
      throw new Error(`line ${index + 1} is not JSON`);
    }
  });
}
