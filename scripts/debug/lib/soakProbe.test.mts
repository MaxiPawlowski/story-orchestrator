import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOAK_BUDGETS, SOAK_GLOBAL, armSoakProbe, disarmSoakProbe, parseBudgets, parseSoakJsonl, sampleSoak, soakVerdict, type SoakSample } from './soakProbe.mts';
import { runSamples } from '../so-soak-probe.mts';

type Entry = { startTime: number; duration: number; name: string };

function fakeBrowser({ heap = [100_000_000], supported = ['longtask', 'event'], nodes = [500] } = {}) {
  const g = globalThis as any;
  const saved = { PerformanceObserver: g.PerformanceObserver, document: g.document, probe: g[SOAK_GLOBAL] };
  const observers: Array<{ type: string; callback: (list: { getEntries: () => Entry[] }) => void; connected: boolean }> = [];
  class FakeObserver {
    static supportedEntryTypes = supported;
    callback: (list: { getEntries: () => Entry[] }) => void;
    constructor(callback: (list: { getEntries: () => Entry[] }) => void) { this.callback = callback; }
    observe({ type }: { type: string }) { observers.push({ type, callback: this.callback, connected: true }); }
    disconnect() { for (const entry of observers) if (entry.callback === this.callback) entry.connected = false; }
  }
  let heapAt = 0;
  let nodesAt = 0;
  g.PerformanceObserver = FakeObserver;
  g.document = { getElementsByTagName: () => ({ length: nodes[Math.min(nodesAt++, nodes.length - 1)] }) };
  delete g[SOAK_GLOBAL];
  const sent: string[] = [];
  const cdp = {
    send: async (method: string, params?: { expression?: string }) => {
      sent.push(method);
      if (method === 'Runtime.evaluate') return { result: { value: (0, eval)(params?.expression ?? 'undefined') } };
      if (method === 'Runtime.getHeapUsage') { const used = heap[Math.min(heapAt++, heap.length - 1)]; return { usedSize: used, totalSize: used * 2 }; }
      if (method === 'Performance.getMetrics') return { metrics: [{ name: 'JSEventListeners', value: 42 }] };
      return {};
    },
  };
  const emit = (type: string, entries: Entry[]) => { for (const observer of observers) if (observer.type === type && observer.connected) observer.callback({ getEntries: () => entries }); };
  const restore = () => { g.PerformanceObserver = saved.PerformanceObserver; g.document = saved.document; if (saved.probe === undefined) delete g[SOAK_GLOBAL]; else g[SOAK_GLOBAL] = saved.probe; };
  return { cdp, sent, emit, observers, restore };
}

const sample = (seq: number, over: Partial<SoakSample> = {}): SoakSample => ({ seq, at: `2026-10-01T00:00:${String(seq).padStart(2, '0')}.000Z`, heapUsed: 100_000_000, heapTotal: 200_000_000, nodes: 500, listeners: 40, longTasks: [], events: [], dropped: 0, armed: true, ...over });
const steady = (n = 6) => Array.from({ length: n }, (_, seq) => sample(seq, { heapUsed: 100_000_000 + (seq % 2) * 3_000_000 }));

test('arming installs a longtask and an event-timing observer once', async () => {
  const browser = fakeBrowser();
  try {
    assert.deepEqual(await armSoakProbe(browser.cdp), { armed: true, already: false, supported: ['longtask', 'event'] });
    assert.deepEqual(await armSoakProbe(browser.cdp), { armed: true, already: true, supported: ['longtask', 'event'] });
    assert.equal(browser.observers.length, 2);
    assert.deepEqual(await disarmSoakProbe(browser.cdp), { disarmed: true });
    assert.ok(browser.observers.every((observer) => !observer.connected));
  } finally {
    browser.restore();
  }
});

test('a sample forces GC before reading the heap, and drains what the observers saw since the last one', async () => {
  const browser = fakeBrowser({ heap: [120_000_000], nodes: [640] });
  try {
    await armSoakProbe(browser.cdp);
    browser.emit('longtask', [{ startTime: 10, duration: 180, name: 'self' }]);
    browser.emit('event', [{ startTime: 12, duration: 96, name: 'click' }]);
    const first = await sampleSoak(browser.cdp, 0, { now: () => new Date('2026-10-01T00:00:00Z') });
    assert.ok(browser.sent.indexOf('HeapProfiler.collectGarbage') < browser.sent.indexOf('Runtime.getHeapUsage'));
    assert.deepEqual([first.heapUsed, first.nodes, first.listeners, first.armed], [120_000_000, 640, 42, true]);
    assert.deepEqual(first.longTasks, [{ start: 10, duration: 180, name: 'self' }]);
    assert.deepEqual(first.events, [{ start: 12, duration: 96, name: 'click' }]);
    const second = await sampleSoak(browser.cdp, 1);
    assert.deepEqual([second.longTasks, second.events], [[], []], 'entries are drained, never counted twice');
  } finally {
    browser.restore();
  }
});

test('an unarmed page samples as armed:false, and the verdict refuses to read its silence as zero', async () => {
  const browser = fakeBrowser();
  try {
    const unarmed = await sampleSoak(browser.cdp, 0);
    assert.equal(unarmed.armed, false);
    const verdict = soakVerdict([...steady(3), { ...unarmed, seq: 3 }]);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.problems.some((line) => line.includes('no observer armed')), verdict.problems.join(' | '));
  } finally {
    browser.restore();
  }
});

test('a steady heap, short tasks and quick events are within budget (the positive control)', () => {
  const samples = steady();
  samples[2].longTasks = [{ start: 1, duration: 120 }];
  samples[3].events = [{ start: 2, duration: 80, name: 'keydown' }];
  const verdict = soakVerdict(samples);
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.measured.heapGrowthBytes, 0, 'GC noise between samples is not growth');
});

test('negative control: a planted heap growth after GC fails the verdict', () => {
  const leaking = steady().map((entry, seq) => ({ ...entry, heapUsed: 100_000_000 + seq * 30_000_000 }));
  const verdict = soakVerdict(leaking);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some((line) => line.startsWith('heap after GC grew')), verdict.problems.join(' | '));
  assert.ok((verdict.measured.heapGrowthBytes ?? 0) > DEFAULT_SOAK_BUDGETS.maxHeapGrowthBytes);
});

test('negative control: a planted long task, a long interval, a slow event or DOM growth each fail the verdict', () => {
  const cases: Array<[Partial<SoakSample>, RegExp]> = [
    [{ longTasks: [{ start: 1, duration: 2400 }] }, /a long task ran 2400 ms/],
    [{ longTasks: Array.from({ length: 8 }, (_, i) => ({ start: i, duration: 900 })) }, /spent 7200 ms in long tasks/],
    [{ events: [{ start: 1, duration: 750, name: 'click' }] }, /an input event took 750 ms/],
    [{ dropped: 12 }, /12 observer entr/],
  ];
  for (const [over, needle] of cases) {
    const samples = steady();
    Object.assign(samples[4], over);
    const verdict = soakVerdict(samples);
    assert.equal(verdict.ok, false, String(needle));
    assert.ok(verdict.problems.some((line) => needle.test(line)), `${needle}: ${verdict.problems.join(' | ')}`);
  }
  const growing = steady().map((entry, seq) => ({ ...entry, nodes: 500 + seq * 10_000 }));
  assert.ok(soakVerdict(growing).problems.some((line) => line.startsWith('DOM grew')));
  assert.ok(soakVerdict(steady(2)).problems.some((line) => line.includes('fewer than the 3')));
});

test('budgets are overridable by name, and an unknown or negative budget is an error, not a pass', () => {
  const { budgets, errors } = parseBudgets('maxLongTaskMs=3000, minSamples=2');
  assert.deepEqual(errors, []);
  assert.deepEqual([budgets.maxLongTaskMs, budgets.minSamples], [3000, 2]);
  const samples = steady();
  samples[1].longTasks = [{ start: 1, duration: 2400 }];
  assert.equal(soakVerdict(samples, budgets).ok, true);
  assert.deepEqual(parseBudgets('maxLongTask=1,maxEventDurationMs=-1').errors, ['unknown budget "maxLongTask" (known: maxHeapGrowthBytes, maxHeapGrowthRatio, maxNodeGrowth, maxLongTaskMs, maxLongTaskTotalMsPerSample, maxEventDurationMs, minSamples)', 'budget "maxEventDurationMs" needs a non-negative number, got "-1"']);
});

test('the sample loop writes one JSON line per sample and the file reads back for an offline verdict', async () => {
  const browser = fakeBrowser({ heap: [100_000_000, 101_000_000, 100_500_000, 100_200_000] });
  const lines: string[] = [];
  const waits: number[] = [];
  try {
    const samples = await runSamples(browser.cdp, { count: 4, everyMs: 30_000, out: 'soak.jsonl', sleep: async (ms) => { waits.push(ms); }, append: async (_path, line) => { lines.push(line); } });
    assert.equal(samples.length, 4);
    assert.deepEqual(waits, [30_000, 30_000, 30_000]);
    assert.ok(browser.sent.includes('Performance.enable'));
    const parsed = parseSoakJsonl(lines.join(''));
    assert.deepEqual(parsed.map((entry) => entry.seq), [0, 1, 2, 3]);
    assert.equal(soakVerdict(parsed).ok, true);
    assert.throws(() => parseSoakJsonl('{"seq":0}\nnot json\n'), /line 2 is not JSON/);
  } finally {
    browser.restore();
  }
});
