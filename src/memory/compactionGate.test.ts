import { acceptCompaction, CompactionAttempts, compactionKey } from "./compactionGate";

const count = (text: string) => Math.ceil(text.length / 4);
const WINDOW = "Arin: The ferry leaves at dawn.\nMax: Then we sleep at the inn tonight and pay the ferryman in the morning.";
const PREVIOUS = "Max and Arin reached the river.";

describe("v2.8 69 K1: a short-term compaction is accepted only when it is a real summary", () => {
  it("refuses an empty, a longer-than-its-inputs and an over-budget summary, and accepts a valid one", () => {
    expect(acceptCompaction({ summary: "   ", previous: PREVIOUS, window: WINDOW, budgetTokens: 64, count })).toEqual({ ok: false, reason: "empty" });
    expect(acceptCompaction({ summary: `${PREVIOUS} ${WINDOW} And more.`, previous: PREVIOUS, window: WINDOW, budgetTokens: 400, count })).toEqual({ ok: false, reason: "longer-than-inputs" });
    expect(acceptCompaction({ summary: "Max and Arin will sleep at the inn and cross at dawn.", previous: PREVIOUS, window: WINDOW, budgetTokens: 8, count })).toEqual({ ok: false, reason: "over-budget" });
    expect(acceptCompaction({ summary: "Max and Arin will sleep at the inn and cross at dawn.", previous: PREVIOUS, window: WINDOW, budgetTokens: 64, count })).toEqual({ ok: true });
    expect(acceptCompaction({ summary: "They wait for dawn.", previous: null, window: WINDOW, budgetTokens: 64, count })).toEqual({ ok: true });
  });

  it("the same refused input is tried once more at most, then skipped until the window or the previous entry changes", () => {
    const attempts = new CompactionAttempts();
    const key = compactionKey({ from: 4, to: 12 }, "st-1", WINDOW);
    expect(attempts.admits(key)).toBe(true);
    attempts.refused(key);
    expect(attempts.admits(key)).toBe(true);
    attempts.refused(key);
    expect(attempts.admits(key)).toBe(false);
    expect(attempts.admits(compactionKey({ from: 4, to: 13 }, "st-1", WINDOW))).toBe(true);
    expect(attempts.admits(compactionKey({ from: 4, to: 12 }, "st-2", WINDOW))).toBe(true);
    expect(attempts.admits(compactionKey({ from: 4, to: 12 }, "st-1", `${WINDOW} edited`))).toBe(true);
    attempts.accepted(key);
    expect(attempts.admits(key)).toBe(true);
  });
});
