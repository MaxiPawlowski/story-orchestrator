import {
  PLAYER_REF, agencyForCheckpoint, checkAttempted, checkRolledAt, checksAt, valueReader, type BoundaryLogEntry, type NormalizedStory, type PrimitiveValue, type StoryCheck,
} from "@engine/index";
import { isRecord } from "@utils/guards";
import { withholds, type GenerationIntent } from "../generationLifecycle";

export const CLOCK_KEY = "story_orchestrator_clock_pressure";
export const CLOCK_DEPTH = 5;
export const DEFAULT_CLOCK_SIZE = 4;
export const CLOCK_SIZE_MAX = 12;
export const CLOCK_LINE_MAX = 200;
export const CLOCK_TICK_ON = ["miss", "weak"] as const;

export type ClockTickOn = (typeof CLOCK_TICK_ON)[number];

export interface ClockTickRule {
  check: string;
  on: ClockTickOn;
  ticks: number;
}

export interface StoryClock {
  id: string;
  size: number;
  ticksOn: ClockTickRule[];
  near: { at: number; line: string } | null;
  fullLine: string | null;
  checkpoints: string[] | null;
}

export interface ClockTick {
  clockId: string;
  checkId: string;
  boundary: number;
  visit: number;
  outcome: ClockTickOn;
  ticks: number;
}

export interface ClockState {
  id: string;
  size: number;
  filled: number;
  near: boolean;
  full: boolean;
  line: string | null;
}

export interface ClockInput {
  story: NormalizedStory;
  clocks: StoryClock[];
  log: readonly BoundaryLogEntry[];
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, CLOCK_LINE_MAX) : null);

const positiveInt = (value: unknown, fallback: number, max: number): number =>
  (typeof value === "number" && Number.isInteger(value) && value >= 1 ? Math.min(value, max) : fallback);

const readRule = (value: unknown): ClockTickRule | null => {
  if (!isRecord(value) || typeof value.check !== "string" || !value.check.trim()) return null;
  const on = CLOCK_TICK_ON.find((word) => word === value.on);
  return on ? { check: value.check.trim(), on, ticks: positiveInt(value.ticks, 1, CLOCK_SIZE_MAX) } : null;
};

const readClock = (value: unknown): StoryClock | null => {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  const ticksOn = Array.isArray(value.ticks_on) ? value.ticks_on.map(readRule).filter((rule): rule is ClockTickRule => rule !== null) : [];
  if (!ticksOn.length) return null;
  const size = positiveInt(value.size, DEFAULT_CLOCK_SIZE, CLOCK_SIZE_MAX);
  const nearLine = isRecord(value.near) ? text(value.near.line) : null;
  const near = nearLine && isRecord(value.near) ? { at: positiveInt(value.near.at, Math.max(1, size - 1), size), line: nearLine } : null;
  const checkpoints = Array.isArray(value.checkpoints) ? value.checkpoints.filter((id): id is string => typeof id === "string" && id.trim() !== "") : null;
  return { id: value.id.trim(), size, ticksOn, near, fullLine: text(value.full_line), checkpoints: checkpoints?.length ? checkpoints : null };
};

export const readStoryClocks = (raw: unknown): StoryClock[] => {
  if (!isRecord(raw) || !Array.isArray(raw.clocks)) return [];
  const seen = new Set<string>();
  return raw.clocks.map(readClock).filter((clock): clock is StoryClock => {
    if (!clock || seen.has(clock.id)) return false;
    seen.add(clock.id);
    return true;
  });
};

const outcomeOf = (check: StoryCheck, values: Readonly<Record<string, PrimitiveValue>>): ClockTickOn | null => {
  const degree = check.outcome ? values[check.outcome.quality] : undefined;
  if (degree === "miss" || degree === "weak") return degree;
  if (degree === "strong") return null;
  return values[check.quality] === false ? "miss" : null;
};

export const deriveClockTicks = ({ story, clocks, log }: ClockInput): ClockTick[] => {
  const ticks: ClockTick[] = [];
  const counted = new Set<string>();
  for (const entry of log) {
    const values = entry.evaluated;
    if (!values) continue;
    const visit = entry.before.checkpointStartedBoundary;
    for (const active of checksAt(story, entry.before.activeCheckpointId)) {
      if (!checkAttempted(active, valueReader(values)) || !checkRolledAt(active.check, values, entry.boundary)) continue;
      const outcome = outcomeOf(active.check, values);
      if (!outcome) continue;
      for (const clock of clocks) {
        for (const rule of clock.ticksOn) {
          if (rule.check !== active.check.id || rule.on !== outcome) continue;
          const key = `${clock.id}:${rule.check}:${visit}:${outcome}`;
          if (counted.has(key)) continue;
          counted.add(key);
          ticks.push({ clockId: clock.id, checkId: rule.check, boundary: entry.boundary, visit, outcome, ticks: rule.ticks });
        }
      }
    }
  }
  return ticks;
};

export const clockStates = (input: ClockInput): ClockState[] => {
  const ticks = deriveClockTicks(input);
  const checkpointId = input.log.at(-1)?.after.activeCheckpointId ?? null;
  return input.clocks.map((clock) => {
    const filled = Math.min(clock.size, ticks.filter((tick) => tick.clockId === clock.id).reduce((sum, tick) => sum + tick.ticks, 0));
    const full = filled >= clock.size;
    const near = !full && clock.near !== null && filled >= clock.near.at;
    const inScope = !clock.checkpoints || (checkpointId !== null && clock.checkpoints.includes(checkpointId));
    const line = !inScope ? null : full ? clock.fullLine : near ? clock.near?.line ?? null : null;
    return { id: clock.id, size: clock.size, filled, near, full, line };
  });
};

export const composeClockPressure = (story: NormalizedStory, checkpointId: string, lines: readonly string[]): string | null => {
  if (!lines.length) return null;
  const clause = agencyForCheckpoint(story, checkpointId).never_narrate_player_action ? ` Do not narrate ${PLAYER_REF}'s own words or decisions.` : "";
  return `Pressure building: ${lines.join(" ")} Let it be felt in this reply without resolving it.${clause}`;
};

export const clockPressure = (input: ClockInput): string | null => {
  const checkpointId = input.log.at(-1)?.after.activeCheckpointId;
  if (!checkpointId) return null;
  return composeClockPressure(input.story, checkpointId, clockStates(input).flatMap((state) => (state.line ? [state.line] : [])));
};

export interface ClockPromptPort {
  set(key: string, text: string, depth: number): void;
  clear(key: string): void;
}

export type ClockEvent = { kind: "set"; text: string } | { kind: "clear" };

export const createClockSeam = (read: () => ClockInput | null, prompt: ClockPromptPort, record: (event: ClockEvent) => void = () => undefined) => {
  let held = false;
  const clear = () => {
    if (!held) return;
    prompt.clear(CLOCK_KEY);
    held = false;
    record({ kind: "clear" });
  };
  const set = () => {
    const input = read();
    const pressure = input && input.clocks.length ? clockPressure(input) : null;
    if (!pressure) return clear();
    prompt.set(CLOCK_KEY, pressure, CLOCK_DEPTH);
    held = true;
    record({ kind: "set", text: pressure });
  };
  return (intent: GenerationIntent) => {
    if (intent.kind === "opened") return withholds(intent.type) ? clear() : set();
    if (intent.kind === "nested") return intent.withholds ? clear() : undefined;
    if (intent.kind === "reapply") return set();
    if (intent.kind === "closed") return clear();
  };
};
