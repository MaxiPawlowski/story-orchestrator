export const JUDGE_ROUTE = '/api/plugins/story-orchestrator-judge';

type RequestLike = { url(): string };
type Handler = (request: RequestLike) => void;

export interface RequestEvents {
  on(event: 'request' | 'requestfinished' | 'requestfailed', handler: Handler): unknown;
  off(event: 'request' | 'requestfinished' | 'requestfailed', handler: Handler): unknown;
}

export interface SettleOptions {
  quietMs?: number;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SettleReport {
  settled: boolean;
  waitedMs: number;
  inFlight: number;
  seen: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A journey's judge meter is read at cleanup. An off-path judge call (the warden reading the last
// reply) can still be on the wire then, and its cost lands after the record took the meter. Tracking
// the plugin's own requests from the start of the run tells "nothing in flight" from "nothing
// recorded yet".
export function trackJudgeRequests(page: RequestEvents, now: () => number = Date.now) {
  const inFlight = new Set<RequestLike>();
  let seen = 0;
  let lastChange = now();
  const onRequest: Handler = (request) => {
    if (!request.url().includes(JUDGE_ROUTE)) return;
    inFlight.add(request);
    seen += 1;
    lastChange = now();
  };
  const onDone: Handler = (request) => {
    if (inFlight.delete(request)) lastChange = now();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  return {
    inFlight: () => inFlight.size,
    async settle({ quietMs = 3000, timeoutMs = 60000, pollMs = 250, now: clock = now, sleep = realSleep }: SettleOptions = {}): Promise<SettleReport> {
      const started = clock();
      for (;;) {
        const quiet = inFlight.size === 0 && clock() - lastChange >= quietMs;
        const waited = clock() - started;
        if (quiet || waited >= timeoutMs) return { settled: quiet, waitedMs: waited, inFlight: inFlight.size, seen };
        await sleep(pollMs);
      }
    },
    dispose() {
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
}
