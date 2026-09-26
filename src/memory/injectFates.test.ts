jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
}));

import { blockTokens } from "./budget";
import { buildMemoryInjection, type InjectionOptions } from "./inject";
import { MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "./types";

const entry = (overrides: Partial<MemoryEntry>) => ({
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
}) as MemoryEntry;

const budgets = (facts: number): Record<MemoryTier, number> => ({ facts, session_details: 100000, short_term: 100000, scene_history: 100000 });
const opts = (tokenBudgets: Record<MemoryTier, number>): InjectionOptions => ({ tokenBudgets, scoreContext: { boundary: 0, turnText: "", turnEntities: [] } });

const quarantined = (id: string) => entry({ id, text: "The gate is sealed.", provenance: { source: "extractor", messageId: 3, boundary: 1, pass: "shared-read", validity: "conflicted" } });

const corpus = (): MemoryEntry[] => [
  entry({ id: "live", text: "The sun-key opens the sanctum.", createdAt: 1 }),
  quarantined("quarantined"),
  entry({ id: "superseded", text: "The gate is open.", supersededBy: "live", createdAt: 2 }),
  entry({ id: "folded", text: "The key is gold.", foldedInto: "live", createdAt: 3 }),
  entry({ id: "kael-only", text: "Kael owes Mara.", characterId: "kael", createdAt: 4 }),
  entry({ id: "scene", tier: "scene_history", type: "scene", text: "They crossed the dunes.", createdAt: 5 }),
];

describe("memory row fate (v2.4 plan 08 T19c)", () => {
  it("gives every candidate exactly one fate", () => {
    const rows = corpus();
    const injection = buildMemoryInjection(rows, "mara", opts(budgets(100000)));
    expect(Object.keys(injection.fates).sort()).toEqual(rows.map((row) => row.id).sort());
    expect(injection.fates).toEqual({ live: "injected", quarantined: "quarantined", superseded: "superseded", folded: "folded", "kael-only": "other-speaker", scene: "injected" });
  });

  it("marks injected exactly the rows whose text is in the block", () => {
    const rows = corpus();
    const injection = buildMemoryInjection(rows, "mara", opts(budgets(100000)));
    for (const row of rows) {
      const inBlock = injection.blocks[row.tier].split("\n").includes(row.text);
      expect({ id: row.id, inBlock }).toEqual({ id: row.id, inBlock: injection.fates[row.id] === "injected" });
    }
  });

  it("never calls a quarantined row over-budget, even when the budget is zero", () => {
    const injection = buildMemoryInjection([quarantined("q"), entry({ id: "live", text: "x".repeat(400) })], null, opts(budgets(0)));
    expect(injection.fates).toEqual({ q: "quarantined", live: "over-budget" });
  });

  it("counts pinned overflow from the fates, and only pinned rows the budget could not fit", () => {
    const rows = [
      entry({ id: "p1", pinned: true, text: "a".repeat(40), createdAt: 1 }),
      entry({ id: "p2", pinned: true, text: "b".repeat(40), createdAt: 2 }),
      entry({ id: "u1", text: "c".repeat(40), createdAt: 3 }),
    ];
    const injection = buildMemoryInjection(rows, null, opts(budgets(blockTokens(rows[0]))));
    expect(injection.fates).toEqual({ p1: "injected", p2: "pinned-overflow", u1: "over-budget" });
    expect(injection.pinnedOverflow).toBe(Object.values(injection.fates).filter((fate) => fate === "pinned-overflow").length);
  });

  it("reports each tier's candidates, injected rows and tokens used against its budget, in budget units", () => {
    const rows = [
      entry({ id: "a", text: "a".repeat(40), createdAt: 1, tokens: 10 }),
      entry({ id: "b", text: "b".repeat(40), createdAt: 2 }),
      entry({ id: "c", text: "c".repeat(400), createdAt: 3 }),
      quarantined("q"),
    ];
    const injection = buildMemoryInjection(rows, null, opts(budgets(blockTokens(rows[0]) + blockTokens(rows[1]))));
    expect(injection.trim.facts).toEqual({ candidates: 3, injected: 2, dropped: 1, tokensUsed: blockTokens(rows[0]) + blockTokens(rows[1]), budget: blockTokens(rows[0]) + blockTokens(rows[1]), hostCounted: 1, filtered: 1 });
    for (const tier of MEMORY_TIERS) expect(injection.trim[tier]).toBeDefined();
  });
});
