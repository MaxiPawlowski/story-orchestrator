import type { DerivedRecord } from "./derived";
import { buildMemoryInjection } from "./inject";
import { IN_WINDOW_MARGIN, recapInWindow, recapSpanStart } from "./inWindow";
import type { MemoryEntry, MemoryTier } from "./types";

const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: "x", tier: "session_details", text: "text", type: "detail", importance: 2, expiration: "session", entities: [], confidence: 1,
  activationTriggers: [], evidence: "e", createdAt: 0, recallCount: 0,
  provenance: { source: "extractor", messageId: 0, boundary: 0, pass: "shared-read", validity: "live" }, ...overrides,
});

const record = (kind: DerivedRecord["kind"], outputId: string, from: number, to: number, inputs: string[] = []): DerivedRecord =>
  ({ id: `r-${outputId}`, kind, boundary: 0, messageId: to, inputs, outputId, range: { from, to } });

describe("43 C: recap rows whose messages are still in the prompt", () => {
  const derived = [
    record("short_term", "st1", 0, 9),
    record("short_term", "st2", 10, 19, ["st1"]),
    record("scene_summary", "scene", 30, 40),
  ];

  it("a rolling short-term summary starts where its oldest predecessor started", () => {
    expect(recapSpanStart(entry({ id: "st2", tier: "short_term" }), derived)).toBe(0);
    expect(recapSpanStart(entry({ id: "scene", tier: "scene_history" }), derived)).toBe(30);
    expect(recapSpanStart(entry({ id: "d", tier: "session_details", messageId: 22 }), derived)).toBe(22);
    expect(recapSpanStart(entry({ id: "orphan", tier: "short_term" }), [record("short_term", "orphan", 10, 19, ["gone"])])).toBeNull();
  });

  it("drops only recap rows that start at or after the window plus the margin; facts, pinned and decided rows stay", () => {
    const rows = [
      entry({ id: "st2", tier: "short_term" }),
      entry({ id: "scene", tier: "scene_history" }),
      entry({ id: "early", messageId: 2 }),
      entry({ id: "late", messageId: 25 }),
      entry({ id: "pinned", messageId: 25, pinned: true }),
      entry({ id: "decided", messageId: 25, locked: true }),
      entry({ id: "fact", tier: "facts", type: "fact", messageId: 25 }),
    ];
    expect([...recapInWindow(rows, derived, 0)].sort()).toEqual(["late", "scene"]);
    expect([...recapInWindow(rows, derived, 25 - IN_WINDOW_MARGIN)].sort()).toEqual(["late", "scene"]);
    expect([...recapInWindow(rows, derived, 26 - IN_WINDOW_MARGIN)].sort()).toEqual(["scene"]);
    expect(recapInWindow(rows, derived, null).size).toBe(0);
  });

  it("an in-window row gets its own fate and leaves the block", () => {
    const rows = [entry({ id: "late", text: "The bell rang twice.", messageId: 25 }), entry({ id: "early", text: "The road was wet.", messageId: 1 })];
    const budgets: Record<MemoryTier, number> = { facts: 1000, session_details: 1000, short_term: 1000, scene_history: 1000 };
    const built = buildMemoryInjection(rows, null, { tokenBudgets: budgets, scoreContext: { boundary: 0, turnText: "", turnEntities: [] }, inWindow: recapInWindow(rows, [], 0) });
    expect(built.fates).toEqual({ late: "in-window", early: "injected" });
    expect(built.blocks.session_details).toBe("The road was wet.");
  });
});
