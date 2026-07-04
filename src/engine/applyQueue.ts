import type { ApplyOutcome, Blackboard, BlackboardDelta } from "./blackboard";

export interface TurnRange {
  from: number;
  to: number;
}

export interface ApplyQueueEntry {
  source: "mechanical" | "extractor" | "reconciliation";
  basisVersion: number;
  turnRange?: TurnRange;
  deltas: BlackboardDelta[];
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

export class ApplyQueue {
  private entries: ApplyQueueEntry[] = [];

  enqueue(entry: ApplyQueueEntry): void {
    this.entries.push({ ...entry, deltas: entry.deltas.map((delta) => ({ ...delta })) });
  }

  drainAtBoundary(blackboard: Blackboard): QueueDrainResult {
    const pending = this.entries;
    this.entries = [];
    const applied: AppliedQueueEntry[] = [];
    const discarded: ApplyQueueEntry[] = [];

    pending.forEach((entry, index) => {
      const superseded = pending.slice(index + 1).some((newer) => covers(newer.turnRange, entry.turnRange));
      if (superseded) {
        discarded.push(entry);
        return;
      }
      const outcomes = entry.deltas.map((delta) => blackboard.applyDelta(delta));
      applied.push({ ...entry, outcomes });
    });

    return { applied, discarded };
  }

  get size(): number {
    return this.entries.length;
  }
}
