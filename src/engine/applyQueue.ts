import type { ApplyOutcome, Blackboard, BlackboardDelta } from "./blackboard";
import { TENSION_CURRENT_KEY, type TensionLevel } from "./schema";

export interface TurnRange {
  from: number;
  to: number;
}

export interface ApplyQueueEntry {
  source: "mechanical" | "extractor" | "reconciliation";
  blackboardVersionSum: number;
  turnRange?: TurnRange;
  deltas: BlackboardDelta[];
  tensionLevels?: TensionLevel[];
  /** The read that produced this write (an audit id, or a named judge read), so the journal links read -> applied/discarded by identity. */
  origin?: string;
}

export interface AppliedQueueEntry extends ApplyQueueEntry {
  outcomes: ApplyOutcome[];
}

export interface QueueDrainResult {
  applied: AppliedQueueEntry[];
  discarded: ApplyQueueEntry[];
}

const covers = (newer: TurnRange | undefined, older: TurnRange | undefined): boolean => {
  return Boolean(newer && older && newer.from <= older.from && newer.to >= older.to);
};

const readsLater = (newer: TurnRange | undefined, older: TurnRange | undefined): boolean => Boolean(newer && older && newer.to > older.to);

const withLevels = (entry: ApplyQueueEntry, deltas: BlackboardDelta[]): ApplyQueueEntry => {
  const { tensionLevels, ...rest } = entry;
  const tension = deltas.some((delta) => delta.q === TENSION_CURRENT_KEY);
  return { ...rest, deltas, ...(tension && tensionLevels ? { tensionLevels } : {}) };
};

const splitEntry = (entry: ApplyQueueEntry, keep: (delta: BlackboardDelta) => boolean): [ApplyQueueEntry | null, ApplyQueueEntry | null] => {
  const kept = entry.deltas.filter(keep);
  const dropped = entry.deltas.filter((delta) => !keep(delta));
  if (!dropped.length) return [entry, null];
  if (!kept.length) return [null, entry];
  return [withLevels(entry, kept), withLevels(entry, dropped)];
};

export class ApplyQueue {
  private entries: ApplyQueueEntry[] = [];

  enqueue(entry: ApplyQueueEntry): void {
    this.entries.push({ ...entry, deltas: entry.deltas.map((delta) => ({ ...delta })) });
  }

  discardReadingFrom(messageId: number): ApplyQueueEntry[] {
    const stale = this.entries.filter((entry) => entry.turnRange && entry.turnRange.to >= messageId);
    this.entries = this.entries.filter((entry) => !stale.includes(entry));
    return stale;
  }

  discardUnknown(known: (key: string) => boolean): ApplyQueueEntry[] {
    const discarded: ApplyQueueEntry[] = [];
    this.entries = this.entries.flatMap((entry) => {
      const [kept, dropped] = splitEntry(entry, (delta) => known(delta.q));
      if (dropped) discarded.push(dropped);
      return kept ? [kept] : [];
    });
    return discarded;
  }

  flush(): ApplyQueueEntry[] {
    const pending = this.entries;
    this.entries = [];
    return pending;
  }

  drainAtBoundary(blackboard: Blackboard): QueueDrainResult {
    const pending = this.entries;
    this.entries = [];
    const applied: AppliedQueueEntry[] = [];
    const discarded: ApplyQueueEntry[] = [];

    pending.forEach((entry, index) => {
      const rewrites = [
        ...pending.slice(index + 1).filter((newer) => covers(newer.turnRange, entry.turnRange)),
        ...pending.slice(0, index).filter((earlier) => readsLater(earlier.turnRange, entry.turnRange)),
      ].flatMap((newer) => newer.deltas);
      const [kept, dropped] = splitEntry(entry, (delta) => !rewrites.some((later) => later.q === delta.q && !blackboard.holdsAgainst(delta, later)));
      if (dropped) discarded.push(dropped);
      if (!kept) return;
      const outcomes = kept.deltas.map((delta) => blackboard.applyDelta(delta));
      applied.push({ ...kept, outcomes });
    });

    return { applied, discarded };
  }

  get size(): number {
    return this.entries.length;
  }

  peek(): ApplyQueueEntry[] {
    return this.entries.map((entry) => ({ ...entry, deltas: entry.deltas.map((delta) => ({ ...delta })) }));
  }
}
