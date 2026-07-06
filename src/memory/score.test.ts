import { scoreEntry, type ScoreContext } from "./score";
import type { MemoryEntry } from "./types";

const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: overrides.id ?? `id-${Math.random()}`,
  tier: "facts",
  text: "text",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "evidence",
  createdAt: 0,
  recallCount: 0,
  ...overrides,
});

const ctx = (overrides: Partial<ScoreContext> = {}): ScoreContext => ({
  boundary: 10,
  turnText: "",
  turnEntities: [],
  ...overrides,
});

describe("scoreEntry", () => {
  it("scores higher importance above lower, all else equal", () => {
    const high = scoreEntry(entry({ importance: 3 }), ctx());
    const low = scoreEntry(entry({ importance: 1 }), ctx());
    expect(high).toBeGreaterThan(low);
  });

  it("penalizes contradicted entries", () => {
    const clean = scoreEntry(entry({}), ctx());
    const contradicted = scoreEntry(entry({ contradicted: true }), ctx());
    expect(contradicted).toBeLessThan(clean);
  });

  it("rewards entries overlapping an open arc", () => {
    const arcs = ["The stolen vault key has not yet been recovered by anyone."];
    const relevant = scoreEntry(entry({ text: "The stolen vault key was hidden in the cellar." }), ctx({ openArcs: arcs }));
    const irrelevant = scoreEntry(entry({ text: "The tavern served warm cider tonight." }), ctx({ openArcs: arcs }));
    expect(relevant).toBeGreaterThan(irrelevant);
  });

  it("rewards entity overlap with the current turn", () => {
    const context = ctx({ turnText: "Mara enters the room", turnEntities: ["Mara"] });
    const overlapping = scoreEntry(entry({ entities: ["Mara"] }), context);
    const unrelated = scoreEntry(entry({ entities: ["Kael"] }), context);
    expect(overlapping).toBeGreaterThan(unrelated);
  });

  it("boosts entries whose activation triggers appear in the turn", () => {
    const context = ctx({ turnText: "they discuss the ancient relic" });
    const triggered = scoreEntry(entry({ activationTriggers: ["relic"] }), context);
    const inert = scoreEntry(entry({ activationTriggers: ["dragon"] }), context);
    expect(triggered).toBeGreaterThan(inert);
  });

  it("favors more recent entries", () => {
    const recent = scoreEntry(entry({ createdAt: 10 }), ctx({ boundary: 10 }));
    const old = scoreEntry(entry({ createdAt: 0 }), ctx({ boundary: 10 }));
    expect(recent).toBeGreaterThan(old);
  });
});
