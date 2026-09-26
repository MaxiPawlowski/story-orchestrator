jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
}));

import { buildMemoryInjection, buildMemoryInjectionBlocks, memoryExtensionKey, type InjectionOptions } from "./inject";
import type { MemoryEntry, MemoryTier } from "./types";

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

const bigBudget: Record<MemoryTier, number> = { facts: 100000, session_details: 100000, short_term: 100000, scene_history: 100000 };
const opts = (tokenBudgets: Record<MemoryTier, number> = bigBudget): InjectionOptions => ({
  tokenBudgets,
  scoreContext: { boundary: 0, turnText: "", turnEntities: [] },
});

describe("buildMemoryInjectionBlocks", () => {
  it("includes shared (no characterId) facts regardless of active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Shared fact.", characterId: undefined, createdAt: 1 })], "mara", opts());
    expect(blocks.facts).toBe("Shared fact.");
  });

  it("includes the active speaker's own facts", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Mara-specific fact.", characterId: "mara", createdAt: 1 })], "mara", opts());
    expect(blocks.facts).toBe("Mara-specific fact.");
  });

  it("excludes another character's facts when they are not the active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Kael-specific fact.", characterId: "kael", createdAt: 1 })], "mara", opts());
    expect(blocks.facts).toBe("");
  });

  it("excludes all per-character facts when there is no active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([
      entry({ text: "Shared fact.", characterId: undefined, createdAt: 1 }),
      entry({ text: "Kael-specific fact.", characterId: "kael", createdAt: 2 }),
    ], null, opts());
    expect(blocks.facts).toBe("Shared fact.");
  });

  it("does not apply characterId filtering to non-facts tiers", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ tier: "session_details", type: "scene", text: "A scene detail.", characterId: "kael", createdAt: 1 })], "mara", opts());
    expect(blocks.session_details).toBe("A scene detail.");
  });

  it("orders entries within a tier by createdAt", () => {
    const blocks = buildMemoryInjectionBlocks([
      entry({ text: "second", createdAt: 5 }),
      entry({ text: "first", createdAt: 1 }),
    ], null, opts());
    expect(blocks.facts).toBe("first\nsecond");
  });

  it("produces an empty string for a tier with no entries", () => {
    const blocks = buildMemoryInjectionBlocks([], null, opts());
    expect(blocks.scene_history).toBe("");
  });

  it("excludes superseded and folded entries", () => {
    const blocks = buildMemoryInjectionBlocks([
      entry({ text: "live", createdAt: 1 }),
      entry({ text: "old", createdAt: 2, supersededBy: "x" }),
      entry({ text: "merged", createdAt: 3, foldedInto: "y" }),
    ], null, opts());
    expect(blocks.facts).toBe("live");
  });

  it("trims a tier to its token budget, keeping pinned and higher-scored entries", () => {
    const entries = [
      entry({ id: "a", text: "aaaa", tokens: 10, importance: 1, createdAt: 1 }),
      entry({ id: "b", text: "bbbb", tokens: 10, importance: 3, createdAt: 2 }),
      entry({ id: "p", text: "pppp", tokens: 10, importance: 1, pinned: true, createdAt: 3 }),
    ];
    const blocks = buildMemoryInjectionBlocks(entries, null, {
      tokenBudgets: { ...bigBudget, facts: 24 },
      scoreContext: { boundary: 5, turnText: "", turnEntities: [] },
    });
    expect(blocks.facts).toContain("pppp");
    expect(blocks.facts).toContain("bbbb");
    expect(blocks.facts).not.toContain("aaaa");
  });

  // v2.3 plan 05 (M7). The block's own formatting counts, so the budget is spent on what the model
  // actually reads, and a pinned row that cannot fit is counted rather than dropped in silence.
  it("reports pinned entries the budget could not fit", () => {
    const entries = [entry({ id: "p1", text: "pppp", tokens: 10, pinned: true, createdAt: 1 }), entry({ id: "p2", text: "qqqq", tokens: 10, pinned: true, createdAt: 2 })];
    const { blocks, pinnedOverflow } = buildMemoryInjection(entries, null, {
      tokenBudgets: { ...bigBudget, facts: 12 },
      scoreContext: { boundary: 5, turnText: "", turnEntities: [] },
    });
    expect(pinnedOverflow).toBe(1);
    expect(blocks.facts).toBe("pppp");
  });
});

describe("memoryExtensionKey", () => {
  it("prefixes each tier with the shared injection key namespace", () => {
    expect(memoryExtensionKey("facts")).toBe("story_orchestrator_memory_facts");
    expect(memoryExtensionKey("scene_history")).toBe("story_orchestrator_memory_scene_history");
  });
});
