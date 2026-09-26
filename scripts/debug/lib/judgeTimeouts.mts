// v2.5 plan 06 J2: the warden and scene timeout tables, read offline from archived journey records and
// journal-follow streams (a record's cleanup ring holds only the last chat; the follow stream holds every
// chat). The close rules are the plan's predeclared ones and are not tuned here.

export const WARDEN_TIMEOUT_MS = 4000;
export const SCENE_TIMEOUT_MS = 2500;
export const WARDEN_MIN_CALLS = 100;
export const WARDEN_CALLS_PER_TIMEOUT = 50;
export const SCENE_CALLS_PER_TIMEOUT = 20;
export const P99_MIN_SUCCESSFUL = 100;

const NEVER_SENT = new Set(['unavailable', 'invalid', 'disabled', 'no-roles', 'no-seam']);
const BANDS: Array<{ band: string; below: number }> = [
  { band: '0-4k', below: 4_000 },
  { band: '4-8k', below: 8_000 },
  { band: '8-12k', below: 12_000 },
  { band: '>12k', below: Number.POSITIVE_INFINITY },
];

export interface TimeoutEvent {
  at: string;
  chatId: string | null;
  messageId: number;
  use: string;
  stateChars: number;
  questions: number;
  latencyMs: number;
  fallback: string | null;
  cached: boolean;
  wardenLore?: boolean;
}

const toEvent = (raw, chatFallback: string | null): TimeoutEvent | null => {
  if (!raw || (raw.kind ?? 'judge') !== 'judge' || !raw.detail?.use || typeof raw.at !== 'string') return null;
  const detail = raw.detail;
  return {
    at: raw.at,
    chatId: typeof raw.chatId === 'string' ? raw.chatId : chatFallback,
    messageId: typeof raw.messageId === 'number' ? raw.messageId : -1,
    use: detail.use,
    stateChars: typeof detail.stateChars === 'number' ? detail.stateChars : 0,
    questions: typeof detail.questions === 'number' ? detail.questions : 0,
    latencyMs: typeof detail.latencyMs === 'number' ? detail.latencyMs : 0,
    fallback: typeof detail.fallback === 'string' ? detail.fallback : null,
    cached: detail.cached === true,
    wardenLore: detail.wardenLore === true || detail.p?.wardenLore === true,
  };
};

const identity = (event: TimeoutEvent) => [event.chatId, event.at, event.messageId, event.use, event.stateChars, event.latencyMs, event.fallback].join('|');

export function dedupe(events: TimeoutEvent[]): TimeoutEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = identity(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function eventsFromJsonl(text: string): TimeoutEvent[] {
  const events = text.split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
    try {
      const event = toEvent(JSON.parse(line), null);
      return event ? [event] : [];
    } catch {
      return [];
    }
  });
  return dedupe(events);
}

export function eventsFromRecord(record): TimeoutEvent[] {
  const chat = record?.cleanup?.chat?.sandboxChatId ?? null;
  return dedupe((record?.cleanup?.judgeCalls?.events ?? []).map((raw) => toEvent(raw, chat)).filter((event): event is TimeoutEvent => event !== null));
}

const sent = (event: TimeoutEvent) => !event.cached && !(event.fallback && NEVER_SENT.has(event.fallback));
const window = (event: TimeoutEvent) => {
  const end = Date.parse(event.at);
  return { start: end - event.latencyMs, end };
};
const overlaps = (left: TimeoutEvent, right: TimeoutEvent) => {
  const a = window(left);
  const b = window(right);
  return a.start < b.end && b.start < a.end;
};
const sameMessage = (left: TimeoutEvent, right: TimeoutEvent) => left.chatId === right.chatId && left.messageId === right.messageId;
const sameShape = (left: TimeoutEvent, right: TimeoutEvent) => sameMessage(left, right) && left.stateChars === right.stateChars && left.questions === right.questions;

const percentile = (values: number[], share: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
};

export function stateBands(events: TimeoutEvent[]) {
  return BANDS.map(({ band, below }, index) => {
    const floor = index ? BANDS[index - 1].below : 0;
    const own = events.filter((event) => event.stateChars >= floor && event.stateChars < below);
    const ok = own.filter((event) => !event.fallback).map((event) => event.latencyMs);
    return { band, calls: own.length, timeouts: own.filter((event) => event.fallback === 'timeout').length, p50: percentile(ok, 0.5), p90: percentile(ok, 0.9) };
  });
}

export function timeoutTable(all: TimeoutEvent[], use: string) {
  const mine = dedupe(all).filter((event) => event.use === use && sent(event));
  const lore = mine.filter((event) => event.wardenLore);
  const calls = mine.filter((event) => !event.wardenLore);
  const successful = calls.filter((event) => !event.fallback);
  const latencies = successful.map((event) => event.latencyMs);
  const timeouts = calls.filter((event) => event.fallback === 'timeout').map((event) => {
    const others = calls.filter((other) => other !== event && sameMessage(event, other) && overlaps(event, other));
    return { at: event.at, chatId: event.chatId, messageId: event.messageId, stateChars: event.stateChars, latencyMs: event.latencyMs, sharedMessageInFlight: others.length > 0, identicalInFlight: others.some((other) => sameShape(event, other)) };
  });
  const bursts = calls.flatMap((event, index) => calls.slice(index + 1).filter((other) => sameShape(event, other) && overlaps(event, other)).map((other) => ({ chatId: event.chatId, messageId: event.messageId, stateChars: event.stateChars, at: [event.at, other.at] })));
  return {
    use,
    calls: calls.length,
    successful: successful.length,
    timeouts,
    bursts,
    wardenLoreCalls: lore.length,
    wardenLoreTimeouts: lore.filter((event) => event.fallback === 'timeout').length,
    latencyMs: { p50: percentile(latencies, 0.5), p90: percentile(latencies, 0.9), max: latencies.length ? Math.max(...latencies) : null },
    successP99: latencies.length >= P99_MIN_SUCCESSFUL ? percentile(latencies, 0.99) : null,
    bands: stateBands(calls),
    requestIdentity: 'chat + messageId + stateChars + questionCount (the ring carries no request key)',
  };
}

export type TimeoutTable = ReturnType<typeof timeoutTable>;

export function closeWarden(table: TimeoutTable) {
  const raiseTimeout = table.successP99 !== null && table.successP99 > WARDEN_TIMEOUT_MS;
  if (table.calls < WARDEN_MIN_CALLS) {
    return { status: 'unmeasured' as const, label: `unmeasured (n = ${table.calls})`, closed: false, raiseTimeout, rule: `>= ${WARDEN_MIN_CALLS} warden calls` };
  }
  const ok = table.timeouts.length * WARDEN_CALLS_PER_TIMEOUT <= table.calls;
  return {
    status: ok ? ('closed' as const) : ('open' as const),
    label: `${table.timeouts.length} timeout(s) over ${table.calls} warden calls (bar: <= 1 per ${WARDEN_CALLS_PER_TIMEOUT})`,
    closed: ok,
    raiseTimeout,
    rule: `<= 1 timeout per ${WARDEN_CALLS_PER_TIMEOUT} calls over >= ${WARDEN_MIN_CALLS}`,
  };
}

export function closeScene(table: TimeoutTable, { j1125Passes }: { j1125Passes: number }) {
  const reasons = [
    ...(table.bursts.length ? [`${table.bursts.length} burst(s)`] : []),
    ...(table.timeouts.length * SCENE_CALLS_PER_TIMEOUT > table.calls ? [`${table.timeouts.length} timeout(s) over ${table.calls} scene calls (bar: <= 1 per ${SCENE_CALLS_PER_TIMEOUT})`] : []),
    ...(table.calls === 0 ? ['no scene calls'] : []),
    ...(j1125Passes < 2 ? [`J11.25 green ${j1125Passes} of 2`] : []),
  ];
  return { closed: reasons.length === 0, reasons, rule: `0 bursts, <= 1 timeout per ${SCENE_CALLS_PER_TIMEOUT} scene calls, J11.25 green x2` };
}

export function j1125Passes(records): number {
  return records.filter((record) => (record?.results ?? []).some((result) => result?.id === 'J11.25' && result?.outcome === 'pass')).length;
}

export interface TimeoutSources { files: string[]; events: TimeoutEvent[]; records: unknown[] }

export function timeoutReport(sources: TimeoutSources) {
  const warden = timeoutTable(sources.events, 'warden');
  const scene = timeoutTable(sources.events, 'scene');
  return {
    files: sources.files,
    records: sources.records.length,
    warden: { ...warden, close: closeWarden(warden) },
    scene: { ...scene, close: closeScene(scene, { j1125Passes: j1125Passes(sources.records) }) },
  };
}
