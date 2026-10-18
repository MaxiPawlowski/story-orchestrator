import type { ApplyQueueEntry } from "../applyQueue";
import type { BoundaryLogEntry } from "../engine";
import type { BlackboardDelta } from "../blackboard";
import type { NormalizedStory, PrimitiveValue } from "../schema";

export const SAME_BEAT_BOUNDARIES = 4;
export const SAME_BEAT_REASON = "held: same beat as the last step on this feeling";
export const BEAT_CHARS = 160;
const SHORTEST_CONTAINED = 16;

export interface BeatReading {
  delta: BlackboardDelta;
  evidence: string;
}

export interface HeldBeat {
  key: string;
  value: string;
  evidence: string;
  reason: string;
}

export interface AxisStep {
  boundary: number;
  messageId: number;
  from: number | null;
  to: number;
  evidence: string | null;
}

const normalized = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const sameBeat = (left: string, right: string): boolean => {
  const [a, b] = [normalized(left), normalized(right)];
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= SHORTEST_CONTAINED && long.includes(short);
};

const stepped = (story: Pick<NormalizedStory, "qualityByKey">, key: string): boolean => key.startsWith("rel_") && Boolean(story.qualityByKey[key]?.step_rule);

const appliedDelta = (entry: BoundaryLogEntry, key: string): BlackboardDelta | undefined =>
  entry.queue.applied.flatMap((applied) => applied.deltas).filter((delta) => delta.q === key).at(-1);

const lastStepBeat = (log: readonly BoundaryLogEntry[], boundary: number, key: string): string | null => {
  const step = [...log].reverse().find((entry) => entry.boundary >= boundary - SAME_BEAT_BOUNDARIES && entry.before.blackboard.values[key] !== entry.after.blackboard.values[key]);
  return step ? appliedDelta(step, key)?.beat ?? null : null;
};

export const holdSameBeat = <T extends BeatReading>(
  story: Pick<NormalizedStory, "qualityByKey">, log: readonly BoundaryLogEntry[], pending: readonly ApplyQueueEntry[], boundary: number, readings: readonly T[],
): { accepted: T[]; held: HeldBeat[] } => {
  const accepted: T[] = [];
  const held: HeldBeat[] = [];
  readings.forEach((reading) => {
    const key = reading.delta.q;
    const beat = reading.evidence.trim().slice(0, BEAT_CHARS);
    if (!stepped(story, key) || !beat) {
      accepted.push(reading);
      return;
    }
    const waiting = [...pending.flatMap((entry) => entry.deltas), ...accepted.map((entry) => entry.delta)].filter((delta) => delta.q === key).flatMap((delta) => delta.beat ?? []);
    const recent = [lastStepBeat(log, boundary, key), ...waiting].filter((text): text is string => Boolean(text));
    if (recent.some((text) => sameBeat(text, beat))) held.push({ key, value: String(reading.delta.v), evidence: reading.evidence, reason: SAME_BEAT_REASON });
    else accepted.push({ ...reading, delta: { ...reading.delta, beat } });
  });
  return { accepted, held };
};

const asNumber = (value: PrimitiveValue | undefined): number | null => (typeof value === "number" ? value : null);

export const axisHistory = (story: Pick<NormalizedStory, "qualities">, log: readonly BoundaryLogEntry[]): Record<string, AxisStep[]> => {
  const keys = story.qualities.filter((quality) => quality.key.startsWith("rel_") && quality.step_rule).map((quality) => quality.key);
  return Object.fromEntries(keys.map((key) => [key, log.flatMap((entry): AxisStep[] => {
    const to = asNumber(entry.after.blackboard.values[key]);
    const from = asNumber(entry.before.blackboard.values[key]);
    if (to === null || to === from) return [];
    const delta = appliedDelta(entry, key);
    return [{ boundary: entry.boundary, messageId: delta?.evidenceAt ?? entry.context.lastMessageId, from, to, evidence: delta?.beat ?? null }];
  })]).filter(([, steps]) => steps.length > 0));
};
