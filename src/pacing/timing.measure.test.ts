import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BoundaryLogEntry } from "@engine/index";
import { firedExits, replayTiming, scoreTiming, summarizeTiming, timingSource, type TimingFixture } from "./timing";

const dir = join(__dirname, "../../test/fixtures/timing");
const fixtures: TimingFixture[] = readdirSync(dir).filter((name) => name.endsWith(".timing.json")).sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as TimingFixture);

const fired = (exit: string, messageId: number, origin: string, source: "extractor" | "mechanical" = "extractor"): BoundaryLogEntry[] => {
  const [from, to] = exit.split("->");
  return [{
    at: 0, boundary: 1, before: {} as BoundaryLogEntry["before"], after: {} as BoundaryLogEntry["after"], source: "gate", evaluated: null,
    context: { lastMessageId: messageId, chatLength: messageId + 1 },
    fired: { from, to, priority: 1, declarationIndex: 0, gate: { q: "k", op: "==", v: true } },
    queue: { applied: [{ source, origin, blackboardVersionSum: 0, deltas: [{ q: "k", v: true }], outcomes: [] }], discarded: [] },
  }];
};

describe("v3.0 42a F3: transition timing scorer", () => {
  it("classifies early, late, on time, missed, spurious and quiet against gold", () => {
    const players = [0, 3, 6, 9];
    const rows = scoreTiming(
      { "a->b": 4, "a->c": 4, "a->d": 2, "a->e": 2, "a->f": null, "a->g": null },
      [...firedExits(fired("a->b", 1, "read-1")), ...firedExits(fired("a->c", 10, "judge:typed@3")), ...firedExits(fired("a->d", 2, "judge:stall@1")),
        ...firedExits(fired("a->f", 7, "x", "mechanical"))],
      players,
    );
    expect(rows.map((row) => [row.exit, row.verdict, row.lag, row.source])).toEqual([
      ["a->b", "early", -1, "shared-read"],
      ["a->c", "late", 2, "typed-judge"],
      ["a->d", "on-time", 0, "stall-judge"],
      ["a->e", "missed", null, null],
      ["a->f", "spurious", null, "mechanical"],
      ["a->g", "quiet", null, null],
    ]);
    expect(timingSource(undefined, "reconciliation")).toBe("other");
  });

  it("the corpus is labelled: every gold exit names a declared transition and every read lands on a reply", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    for (const fixture of fixtures) {
      const transitions = new Set((fixture.story.transitions as Array<{ from: string; to: string }>).map((entry) => `${entry.from}->${entry.to}`));
      expect(Object.keys(fixture.gold).filter((exit) => !transitions.has(exit))).toEqual([]);
      const replies = new Set(fixture.transcript.filter((message) => !message.user).map((message) => message.id));
      expect(fixture.reads.filter((read) => !replies.has(read.after))).toEqual([]);
    }
  });

  it("F3 baseline (informational): structural arm over the labelled corpus, recorded reads, one-boundary read lag", () => {
    const rows = fixtures.flatMap((fixture) => replayTiming(fixture).rows.map((row) => ({ ...row, fixture: fixture.id })));
    const summary = summarizeTiming(rows);
    process.stdout.write(`${JSON.stringify({ fixtures: fixtures.length, ...summary })}\n`);
    expect(summary.exits).toBeGreaterThanOrEqual(40);
    expect(replayTiming(fixtures[0]).rows).toEqual(replayTiming(fixtures[0]).rows);
  });
});
