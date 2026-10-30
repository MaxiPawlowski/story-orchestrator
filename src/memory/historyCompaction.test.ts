import { compactionBand, compactionCut, planCompaction, type CompactionBand } from "./historyCompaction";

const band: CompactionBand = { high: 100, low: 50, keep: 2 };
const entries = (costs: number[]) => costs.map((cost, id) => ({ id, cost }));

describe("chunked history compaction (v3.0 40 A3)", () => {
  it("drops nothing until the history passes the high mark, then drops down to the low mark at once", () => {
    expect(compactionCut(Array(10).fill(10), band)).toBe(0);
    expect(compactionCut(Array(11).fill(10), band)).toBe(6);
  });

  it("holds the cut for several turns after a drop (hysteresis)", () => {
    const cuts = Array.from({ length: 30 }, (_, length) => compactionCut(Array(length + 1).fill(10), band));
    const moves = cuts.filter((cut, index) => index > 0 && cut !== cuts[index - 1]).length;
    expect(moves).toBe(4);
    expect(new Set(cuts.slice(11, 16))).toEqual(new Set([6]));
  });

  it("is a replay of the chat's growth: the cut for any prefix is the cut that chat had at that length", () => {
    const costs = Array.from({ length: 80 }, (_, index) => 5 + ((index * 37) % 23));
    const online: number[] = [];
    let cut = 0;
    let held = 0;
    costs.forEach((cost, index) => {
      held += cost;
      if (held > band.high) while (cut < index + 1 - band.keep && held > band.low) { held -= costs[cut]; cut += 1; }
      online.push(cut);
    });
    costs.forEach((_, index) => expect(compactionCut(costs.slice(0, index + 1), band)).toBe(online[index]));
  });

  it("always keeps the newest messages, even when one message alone passes the mark", () => {
    expect(compactionCut([10, 10, 500], band)).toBe(1);
    expect(compactionCut([500, 500], band)).toBe(0);
  });

  it("never drops a message past the ceiling (the last read window and the short-term summary)", () => {
    const rows = entries(Array(11).fill(10));
    expect(planCompaction(rows, band, 99)).toEqual({ cutId: 6, dropped: 6, tokens: 60, clamped: false });
    expect(planCompaction(rows, band, 3)).toEqual({ cutId: 4, dropped: 4, tokens: 40, clamped: true });
    expect(planCompaction(rows, band, -1)).toBeNull();
    expect(planCompaction(entries(Array(5).fill(10)), band, 99)).toBeNull();
  });

  it("sizes the band from the prompt budget and refuses a missing one", () => {
    expect(compactionBand(32000)).toEqual({ high: 24000, low: 16000, keep: 12 });
    expect(compactionBand(0)).toBeNull();
    expect(compactionBand(Number.NaN)).toBeNull();
  });
});
