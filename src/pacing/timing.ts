import {
  gateKeys, parseStoryOrThrow, PLAYER_TURNS_KEY, playerTurnsBetween, StoryEngine,
  type BlackboardDelta, type BoundaryLogEntry, type DerivedQualityView, type NormalizedStory, type PrimitiveValue,
} from "@engine/index";

export type TimingSource = "shared-read" | "typed-judge" | "stall-judge" | "mechanical" | "other";

export const TIMING_SOURCES: readonly TimingSource[] = ["shared-read", "typed-judge", "stall-judge", "mechanical", "other"];

export const timingSource = (origin: string | undefined, source: string): TimingSource => {
  if (origin?.startsWith("judge:typed")) return "typed-judge";
  if (origin?.startsWith("judge:stall")) return "stall-judge";
  if (source === "mechanical") return "mechanical";
  return source === "extractor" ? "shared-read" : "other";
};

export const exitId = (from: string, to: string): string => `${from}->${to}`;

export interface FiredExit {
  exit: string;
  messageId: number;
  source: TimingSource | null;
}

const decidingSource = (log: readonly BoundaryLogEntry[], index: number, keys: ReadonlySet<string>): TimingSource => {
  for (let at = index; at >= 0; at -= 1) {
    const applied = [...log[at].queue.applied].reverse().find((entry) => entry.deltas.some((delta) => keys.has(delta.q)));
    if (applied) return timingSource(applied.origin, applied.source);
    if (at < index && log[at].fired) break;
  }
  return "mechanical";
};

export function firedExits(log: readonly BoundaryLogEntry[]): FiredExit[] {
  return log.flatMap((entry, index) => {
    const fired = entry.fired;
    if (!fired) return [];
    return [{ exit: exitId(fired.from, fired.to), messageId: entry.context.lastMessageId, source: decidingSource(log, index, new Set(gateKeys(fired.gate))) }];
  });
}

export type TimingVerdict = "on-time" | "late" | "early" | "missed" | "spurious" | "quiet";

export interface TimingRow {
  exit: string;
  gold: number | null;
  fired: number | null;
  verdict: TimingVerdict;
  lag: number | null;
  source: TimingSource | null;
}

export function scoreTiming(gold: Readonly<Record<string, number | null>>, fired: readonly FiredExit[], playerTurnIds: readonly number[]): TimingRow[] {
  return Object.entries(gold).map(([exit, at]) => {
    const first = fired.find((row) => row.exit === exit) ?? null;
    const base = { exit, gold: at, fired: first?.messageId ?? null, source: first?.source ?? null };
    if (at === null) return { ...base, verdict: first ? "spurious" : "quiet", lag: null };
    if (!first) return { ...base, verdict: "missed", lag: null };
    if (first.messageId < at) return { ...base, verdict: "early", lag: -playerTurnsBetween(playerTurnIds, first.messageId, at) };
    const lag = playerTurnsBetween(playerTurnIds, at, first.messageId);
    return { ...base, verdict: lag === 0 ? "on-time" : "late", lag };
  });
}

export interface TimingSummary {
  exits: number;
  early: number;
  missed: number;
  spurious: number;
  onTime: number;
  late: number;
  medianLag: number | null;
  maxLag: number | null;
  bySource: Record<TimingSource, Record<TimingVerdict, number>>;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const emptyVerdicts = (): Record<TimingVerdict, number> => ({ "on-time": 0, late: 0, early: 0, missed: 0, spurious: 0, quiet: 0 });

export function summarizeTiming(rows: readonly TimingRow[]): TimingSummary {
  const count = (verdict: TimingVerdict) => rows.filter((row) => row.verdict === verdict).length;
  const lags = rows.filter((row) => row.verdict === "on-time" || row.verdict === "late").map((row) => row.lag ?? 0);
  const bySource = Object.fromEntries(TIMING_SOURCES.map((source) => [source, emptyVerdicts()])) as TimingSummary["bySource"];
  for (const row of rows) if (row.source) bySource[row.source][row.verdict] += 1;
  return {
    exits: rows.length, early: count("early"), missed: count("missed"), spurious: count("spurious"), onTime: count("on-time"), late: count("late"),
    medianLag: median(lags), maxLag: lags.length ? Math.max(...lags) : null, bySource,
  };
}

export interface TimingMessage {
  id: number;
  speaker: string;
  user: boolean;
  text: string;
}

export interface TimingRead {
  after: number;
  origin: string;
  deltas: Array<{ q: string; v: PrimitiveValue; evidenceAt?: number }>;
}

export interface TimingFixture {
  id: string;
  story: Record<string, unknown>;
  transcript: TimingMessage[];
  reads: TimingRead[];
  gold: Record<string, number | null>;
}

const playerTurnsDerive = (story: NormalizedStory, userIds: readonly number[]) => (view: DerivedQualityView) =>
  (story.qualityByKey[PLAYER_TURNS_KEY]?.source === "code"
    ? [{ q: PLAYER_TURNS_KEY, v: playerTurnsBetween(userIds, view.checkpointStartedMessageId, view.lastMessageId) }]
    : []);

export function replayTiming(fixture: TimingFixture): { log: BoundaryLogEntry[]; playerTurnIds: number[]; rows: TimingRow[] } {
  const story = parseStoryOrThrow(fixture.story);
  const userIds = fixture.transcript.filter((message) => message.user).map((message) => message.id);
  const engine = new StoryEngine({ now: () => 0, derive: playerTurnsDerive(story, userIds) });
  engine.loadStory(story);
  let lastPlayer: number | undefined;
  for (const message of fixture.transcript) {
    if (message.user) {
      lastPlayer = message.id;
      continue;
    }
    engine.commitBoundary({ lastMessageId: message.id, chatLength: message.id + 1, ...(lastPlayer === undefined ? {} : { lastPlayerMessageId: lastPlayer }) });
    for (const read of fixture.reads.filter((entry) => entry.after === message.id)) {
      const deltas: BlackboardDelta[] = read.deltas.map((delta) => ({ q: delta.q, v: delta.v, source: "extractor", ...(delta.evidenceAt === undefined ? {} : { evidenceAt: delta.evidenceAt }) }));
      engine.enqueue({ source: "extractor", origin: read.origin, blackboardVersionSum: 0, turnRange: { from: 0, to: read.after }, deltas });
    }
  }
  const log = engine.serializeHistory().log;
  return { log, playerTurnIds: userIds, rows: scoreTiming(fixture.gold, firedExits(log), userIds) };
}
