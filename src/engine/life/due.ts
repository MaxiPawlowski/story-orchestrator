export type Due = { boundary: number } | { day: number } | { part: number };

export const span = (range: readonly [number, number], unit: number): number => range[0] + Math.min(range[1] - range[0], Math.floor(unit * (range[1] - range[0] + 1)));

export const dueRank = (due: Due): number => ("boundary" in due ? due.boundary : "day" in due ? due.day : due.part);

export const dueNow = (due: Due, boundary: number, clock: number | null): boolean =>
  ("boundary" in due ? due.boundary <= boundary : clock !== null && dueRank(due) <= clock);

export const byDue = <T extends { due: Due; occurrenceId: string }>(left: T, right: T): number =>
  dueRank(left.due) - dueRank(right.due) || left.occurrenceId.localeCompare(right.occurrenceId);
