export type StagePhase = "enter" | "stay" | "exit";

export interface Placed<T> {
  key: string;
  actor: T;
  index: number;
  left: number;
  width: number;
  phase: StagePhase;
  until?: number;
}

export function spread(count: number, index: number): { left: number; width: number } {
  const width = Math.min(34, 92 / Math.max(count, 1));
  const left = count <= 1 ? 50 : 50 + (index - (count - 1) / 2) * Math.min(width * 0.8, 88 / (count - 1));
  return { left, width };
}

export function stagePhases<T>(previous: ReadonlyArray<Placed<T>>, actors: readonly T[], keyOf: (actor: T) => string, now: number, exitMs: number,
  initial = previous.length === 0): Placed<T>[] {
  const before = new Map(previous.map((entry) => [entry.key, entry]));
  const present = actors.map((actor, index): Placed<T> => {
    const key = keyOf(actor);
    const known = before.get(key);
    const phase: StagePhase = known && known.phase !== "exit" ? known.phase : initial ? "stay" : "enter";
    return { key, actor, index, ...spread(actors.length, index), phase };
  });
  const keys = new Set(present.map((entry) => entry.key));
  const leaving = exitMs <= 0 ? [] : previous.flatMap((entry): Placed<T>[] => {
    if (keys.has(entry.key)) return [];
    const until = entry.phase === "exit" ? entry.until ?? now : now + exitMs;
    return until > now ? [{ ...entry, phase: "exit", until }] : [];
  });
  return [...present, ...leaving];
}

export const nextExpiry = <T>(placed: ReadonlyArray<Placed<T>>): number | null =>
  placed.reduce<number | null>((soonest, entry) => (entry.until === undefined ? soonest : soonest === null ? entry.until : Math.min(soonest, entry.until)), null);
